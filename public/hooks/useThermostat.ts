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

/**
 * How long without a touch before the page stops asking for live data.
 *
 * A backgrounded tab already costs nothing -- both timers check
 * visibilityState. What this covers is a tab left *visible* and unattended: a
 * laptop open on the counter, a wall display. That kept re-arming the live
 * window forever, and the real cost of that is not here but on the Pi, which
 * polls both units every fifteen seconds for as long as the window stands and
 * holds gree_lock while it does.
 *
 * Three minutes rather than one. The window exists so you can *watch* -- change
 * a setpoint and wait to see the unit take it -- and that is a minute or more
 * of staring with no input at all. Pausing then would hide the answer somebody
 * was waiting for.
 */
const IDLE_AFTER_MS = 3 * 60 * 1000;

/** What counts as touching the page. Cheap events, all passive. */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

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

    // Live polling stops when nobody has touched the page for a while. Refs
    // rather than state for the ones the interval reads: it is created once and
    // would otherwise close over whatever the values were at that moment.
    const [idle, setIdle] = useState(false);
    const idleRef = useRef(false);
    const lastTouchRef = useRef(Date.now());
    const pendingRef = useRef(false);

    // Whether anything is still resolving, kept where the interval can read it.
    // A command waiting to be confirmed, a compressor counting down, a boost
    // running out: all of them mean somebody may be watching without touching.
    pendingRef.current =
        data.rooms.some((room) => room.is_boosting)
        || data.airConditioners.some((ac) => ac.awaiting || ac.cooling_down_for !== null);

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
            await fetchClient('/proxy/api/rooms/live', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Nothing to say, but say it in JSON: a bodyless POST is the
                // edge case the proxy used to choke on.
                body: '{}',
            });
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

        // Matched to the Pi's live poll, so what the units report reaches the
        // screen about as fast as it is read. Only the units' own readings move
        // on this cadence and they are not broadcast -- the Pi writes them and
        // says nothing, because waking every listener for a temperature nobody
        // is looking at is the cost this window exists to avoid.
        const wake = () => {
            lastTouchRef.current = Date.now();

            if (idleRef.current) {
                idleRef.current = false;
                setIdle(false);
                refreshData();
                requestLiveData();
            }
        };

        ACTIVITY_EVENTS.forEach((event) =>
            window.addEventListener(event, wake, { passive: true }));

        const pollInterval = setInterval(() => {
            // A background tab is nobody watching. The Pi keeps reading the
            // units on its own account either way, so nothing is missed by not
            // asking -- whatever it found is waiting when the tab comes back.
            if (document.visibilityState !== 'visible') return;

            // Nothing is ever paused while something is still resolving. A
            // command waiting to be confirmed, a compressor counting down, a
            // boost running out -- those are the moments somebody is most
            // likely watching without touching anything.
            const untouched = Date.now() - lastTouchRef.current > IDLE_AFTER_MS;

            if (untouched && !pendingRef.current) {
                if (!idleRef.current) {
                    idleRef.current = true;
                    setIdle(true);
                }

                return;
            }

            refreshData();
        }, 15000);

        // Only while the tab is in front and somebody is actually there. The
        // window lapses on its own once we stop re-arming it, and the Pi goes
        // quiet with it.
        const liveInterval = setInterval(() => {
            if (document.visibilityState === 'visible' && !idleRef.current) requestLiveData();
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
            ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, wake));
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

    /**
     * Run a room, or release it.
     *
     * Not a queued write: switching on can also switch the house on and revive
     * parked units, so the server decides the whole outcome and we take what it
     * returns. Optimistically flipping the room here would show it running
     * before we know the rest of the house agreed.
     */
    const runRoom = useCallback(async (roomId: number, on: boolean) => {
        setPendingRoomIds(prev => (prev.includes(roomId) ? prev : [...prev, roomId]));

        try {
            const res = await fetchClient(`${ENDPOINTS.room}/${roomId}/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ on }),
            });
            if (!res.ok) throw new Error('Request rejected');

            const saved = await res.json();

            setData(prev => ({
                ...prev,
                rooms: prev.rooms.map(room => (room.id === roomId ? saved : room)),
                // The house may have come on to satisfy this, and the header
                // has to say so rather than waiting for the next poll.
                enabled: on ? true : prev.enabled,
            }));
        } catch (error) {
            console.error(error);
            showNotification(on ? 'Could not start the room' : 'Could not stop the room', 'error');
            refreshData();
        } finally {
            setPendingRoomIds(prev => prev.filter(pending => pending !== roomId));
        }
    }, [fetchClient, showNotification, refreshData]);

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
        idle,
        resume: () => {
            idleRef.current = false;
            lastTouchRef.current = Date.now();
            setIdle(false);
            refreshData();
            requestLiveData();
        },
        updateAcState,
        updateRoomState,
        runRoom
    };
}