import { createEcho } from '@/lib/echo';
import { AirConditioner, FetchLatestDataResponse, LiveReadingEvent, Mode, Room, Stat, SystemStateResponse, TemperatureResponse, ThermostatData } from '@/types/types';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { useNotification } from '@/context/NotificationContext';

type WriteTarget = 'ac' | 'room';

const ENDPOINTS: Record<WriteTarget, string> = {
    ac: '/proxy/api/air-conditioners',
    room: '/proxy/api/rooms',
};

const writeKey = (target: WriteTarget, id: number) => `${target}:${id}`;

/**
 * Re-arm the live window a little before it lapses, so an open dashboard keeps
 * showing what the units actually report without the Pi polling them forever.
 */
const LIVE_REARM_MS = 4 * 60 * 1000;

export function useThermostat() {
    const { showNotification } = useNotification();
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Debounce timers and coalesced payloads, keyed by "ac:3" / "room:1", so a
    // stepper held down produces one write per entity rather than one per tap.
    const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
    const writesRef = useRef<Map<string, Partial<AirConditioner> | Partial<Room>>>(new Map());

    const [data, setData] = useState<ThermostatData>({
        currentTemp: 0,
        targetTemp: -1,
        heating: false,
        cooling: false,
        mode: 'heating',
        enabled: true,
        hvacUntil: 0,
        lastUpdated: null,
        airConditioners: [],
        rooms: [],
        smartPlugs: [],
    });
    const [stats, setStats] = useState<Stat | undefined>();
    const [isSaving, setIsSaving] = useState(false);
    // Per-entity, so adjusting one card does not freeze the controls of the others.
    const [pendingAcIds, setPendingAcIds] = useState<number[]>([]);
    const [pendingRoomIds, setPendingRoomIds] = useState<number[]>([]);

    const processUpdate = useCallback((tempData: TemperatureResponse, stateData: SystemStateResponse) => {
        setData(prev => ({
            ...prev,
            currentTemp: tempData?.value ?? prev.currentTemp,
            lastUpdated: tempData?.timestamp ? new Date(tempData.timestamp) : prev.lastUpdated,
            heating: stateData?.heating_on ?? prev.heating,
            cooling: stateData?.cooling_on ?? prev.cooling,
            mode: (stateData?.mode as Mode) ?? prev.mode,
            enabled: stateData?.enabled ?? prev.enabled,
            targetTemp: stateData?.target_temp ?? prev.targetTemp,
            hvacUntil: stateData?.hvac_until ?? prev.hvacUntil,
            airConditioners: stateData?.air_conditioners ?? prev.airConditioners,
            rooms: stateData?.rooms ?? prev.rooms,
            smartPlugs: stateData?.smart_plugs ?? prev.smartPlugs,
        }));
    }, []);

    const fetchClient = useCallback(async (url: string, options: RequestInit = {}) => {
        const response = await fetch(url, options);

        if (response.status === 401) {
            showNotification('Session expired! Please login.', 'error');
            setTimeout(() => {
                if (typeof window !== 'undefined') {
                    window.location.href = '/login';
                }
            }, 5000);
            throw new Error('Unauthorized');
        }

        return response;
    }, [showNotification]);

    const fetchStats = useCallback(async (): Promise<Stat> => {
        const res = await fetchClient('/proxy/api/stats');
        if (!res.ok) throw new Error('Failed to fetch stats');
        return res.json();
    }, [fetchClient]);

    const fetchLatestData = useCallback(async (): Promise<FetchLatestDataResponse> => {
        const [tempResult, stateResult] = await Promise.all([
            fetchClient('/proxy/api/temperature-latest'),
            fetchClient('/proxy/api/state')
        ]);

        const temp = tempResult.ok ? await tempResult.json() : null;
        const state = stateResult.ok ? await stateResult.json() : null;

        return { temp, state };
    }, [fetchClient]);

    const refreshData = useCallback(async () => {
        try {
            const newStats = await fetchStats();
            setStats(newStats);

            const { temp, state } = await fetchLatestData();
             if (temp && state) {
                processUpdate(temp, state);
             }
        } catch (error) {
            console.error("Failed to refresh data", error);
        }
    }, [fetchStats, fetchLatestData, processUpdate]);

    /**
     * Ask the Pi to interrogate the units directly for the next few minutes.
     *
     * The window is short and self-expiring, so a closed tab, a crashed browser
     * or a lost connection all stop the polling without having to tell anyone.
     */
    const requestLiveData = useCallback(async () => {
        try {
            await fetchClient('/proxy/api/rooms/live', { method: 'POST' });
        } catch (error) {
            // Live readings are a nicety; the dashboard works without them.
            console.error('Could not open a live window', error);
        }
    }, [fetchClient]);

    useRefetchOnFocus(useCallback(() => {
        refreshData();
        requestLiveData();
    }, [refreshData, requestLiveData]));

    useEffect(() => {
        refreshData();
        requestLiveData();

        const pollInterval = setInterval(() => {
            fetchStats().then(setStats).catch(console.error);
        }, 15000);

        // Only while the tab is actually in front: a dashboard left open on a
        // background tab is nobody watching.
        const liveInterval = setInterval(() => {
            if (document.visibilityState === 'visible') requestLiveData();
        }, LIVE_REARM_MS);

        const echo = createEcho();
        if (echo) {
            echo.channel('live-updates')
                .listen('.reading.created', (event: LiveReadingEvent) => {
                    const r = event?.reading;
                    if (r) {
                        setData({
                            currentTemp: r.temperature,
                            lastUpdated: new Date(r.last_updated),
                            heating: r.heating_on,
                            cooling: r.cooling_on ?? false,
                            mode: r.mode ?? 'heating',
                            enabled: r.enabled ?? true,
                            targetTemp: r.set_temp,
                            hvacUntil: r.hvac_until ?? 0,
                            airConditioners: r.air_conditioners ?? [],
                            rooms: r.rooms ?? [],
                            smartPlugs: r.smart_plugs ?? []
                        });
                    }
                });
        }

        const timers = timersRef.current;

        return () => {
            clearInterval(pollInterval);
            clearInterval(liveInterval);
            if (echo) echo.leave('live-updates');
            timers.forEach(clearTimeout);
            timers.clear();
        };
    }, [refreshData, fetchStats, requestLiveData]);

    const updateState = useCallback(async (body: Record<string, unknown>) => {
        const res = await fetchClient('/proxy/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to save state');
        return res.json();
    }, [fetchClient]);

    const flush = useCallback(async (target: WriteTarget, id: number) => {
        const key = writeKey(target, id);
        const body = writesRef.current.get(key);
        writesRef.current.delete(key);
        timersRef.current.delete(key);

        const setPending = target === 'ac' ? setPendingAcIds : setPendingRoomIds;

        if (!body) {
            setPending(prev => prev.filter(pending => pending !== id));
            return;
        }

        try {
            const res = await fetchClient(`${ENDPOINTS[target]}/${id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Request rejected');

            const saved = await res.json();

            setData(prev => target === 'ac'
                ? { ...prev, airConditioners: prev.airConditioners.map(ac => (ac.id === id ? saved : ac)) }
                : { ...prev, rooms: prev.rooms.map(room => (room.id === id ? saved : room)) });
        } catch (error) {
            console.error(error);
            showNotification(target === 'ac' ? 'Failed to update AC' : 'Failed to update room', 'error');
            // Roll the optimistic change back to whatever the server last told us.
            refreshData();
        } finally {
            setPending(prev => prev.filter(pending => pending !== id));
        }
    }, [fetchClient, showNotification, refreshData]);

    const queueWrite = useCallback((target: WriteTarget, id: number, body: Partial<AirConditioner> | Partial<Room>) => {
        // Optimistic: a stepper must feel instant. The response, and the
        // broadcast that follows it, are the source of truth and overwrite this.
        setData(prev => target === 'ac'
            ? { ...prev, airConditioners: prev.airConditioners.map(ac => (ac.id === id ? { ...ac, ...body } : ac)) }
            : { ...prev, rooms: prev.rooms.map(room => (room.id === id ? { ...room, ...body } : room)) });

        const setPending = target === 'ac' ? setPendingAcIds : setPendingRoomIds;
        setPending(prev => (prev.includes(id) ? prev : [...prev, id]));

        // Coalesce rapid taps into a single write per entity.
        const key = writeKey(target, id);
        writesRef.current.set(key, { ...writesRef.current.get(key), ...body });

        const existing = timersRef.current.get(key);
        if (existing) clearTimeout(existing);

        timersRef.current.set(key, setTimeout(() => { flush(target, id); }, 300));
    }, [flush]);

    const updateAcState = useCallback(
        (acId: number, body: Partial<AirConditioner>) => queueWrite('ac', acId, body),
        [queueWrite]
    );

    const updateRoomState = useCallback(
        (roomId: number, body: Partial<Room>) => queueWrite('room', roomId, body),
        [queueWrite]
    );

    const saveState = async (val: number, until: number) => {
        if (val < 10 || until < 0) return;
        const mode = data.mode;
        const enabled = data.enabled;
        setIsSaving(true);
        try {
            setData(prev => ({ ...prev, targetTemp: val, hvacUntil: until }));

            if (timeoutRef?.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }

            timeoutRef.current = setTimeout(async () => {
                try {
                    await updateState({ target_temp: val, hvac_until: until, mode, enabled });
                } catch (error) {
                    console.error(error);
                } finally {
                    timeoutRef.current = null;
                }
            }, 300);
        } catch (error) {
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };

    const changeMode = async (newMode: Mode) => {

        if (timeoutRef?.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        setIsSaving(true);
        try {
            await updateState({ target_temp: data.targetTemp, hvac_until: data.hvacUntil, mode: newMode, enabled: data.enabled });
            setData(prev => ({
                ...prev,
                mode: newMode,
                heating: newMode === 'heating' ? prev.heating : false,
                cooling: newMode === 'cooling' ? prev.cooling : false,
            }));
        } catch (error) {
            console.error('Failed to toggle mode', error);
        } finally {
            setIsSaving(false);
        }
    };

    const togglePower = async () => {
        const newEnabled = !data.enabled;
        setIsSaving(true);
        try {
            await updateState({ target_temp: data.targetTemp, hvac_until: data.hvacUntil, mode: data.mode, enabled: newEnabled });
            setData(prev => ({
                ...prev,
                enabled: newEnabled,
                heating: newEnabled ? prev.heating : false,
                cooling: newEnabled ? prev.cooling : false,
            }));
        } catch (error) {
            console.error('Failed to toggle power', error);
        } finally {
            setIsSaving(false);
        }
    }

    return {
        data,
        stats,
        isSaving,
        pendingAcIds,
        pendingRoomIds,
        saveState,
        refreshData,
        changeMode,
        togglePower,
        updateAcState,
        updateRoomState
    };
}