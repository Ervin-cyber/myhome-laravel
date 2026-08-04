import { createEcho } from '@/lib/echo';
import { AirConditioner, FetchLatestDataResponse, LiveReadingEvent, Mode, Stat, SystemStateResponse, TemperatureResponse, ThermostatData } from '@/types/types';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { useNotification } from '@/context/NotificationContext';

export function useThermostat() {
    const { showNotification } = useNotification();
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Debounce timers and coalesced payloads, keyed by AC id.
    const acTimersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());
    const acWritesRef = useRef<Map<number, Partial<AirConditioner>>>(new Map());

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
    });
    const [stats, setStats] = useState<Stat | undefined>();
    const [isSaving, setIsSaving] = useState(false);
    // Per-unit, so adjusting one AC does not freeze the controls of the others.
    const [pendingAcIds, setPendingAcIds] = useState<number[]>([]);

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

    useRefetchOnFocus(refreshData);

    useEffect(() => {
        refreshData();

        const pollInterval = setInterval(() => {
            fetchStats().then(setStats).catch(console.error);
        }, 15000);

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
                            rooms: r.rooms ?? []
                        });
                    }
                });
        }

        const acTimers = acTimersRef.current;

        return () => {
            clearInterval(pollInterval);
            if (echo) echo.leave('live-updates');
            acTimers.forEach(clearTimeout);
            acTimers.clear();
        };
    }, [refreshData, fetchStats]);

    const updateState = useCallback(async (body: Record<string, unknown>) => {
        const res = await fetchClient('/proxy/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to save state');
        return res.json();
    }, [fetchClient]);

    const flushAcState = useCallback(async (acId: number) => {
        const body = acWritesRef.current.get(acId);
        acWritesRef.current.delete(acId);
        acTimersRef.current.delete(acId);

        if (!body) return;

        try {
            const res = await fetchClient(`/proxy/api/air-conditioners/${acId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Failed to update AC');

            const saved: AirConditioner = await res.json();
            setData(prev => ({
                ...prev,
                airConditioners: prev.airConditioners.map(ac => (ac.id === acId ? saved : ac)),
            }));
        } catch (error) {
            console.error(error);
            showNotification('Failed to update AC', 'error');
            // Roll the optimistic change back to whatever the server last told us.
            refreshData();
        } finally {
            setPendingAcIds(prev => prev.filter(id => id !== acId));
        }
    }, [fetchClient, showNotification, refreshData]);

    const updateAcState = useCallback((acId: number, body: Partial<AirConditioner>) => {
        // Optimistic: the stepper must feel instant. The response, and the
        // broadcast that follows it, are the source of truth and overwrite this.
        setData(prev => ({
            ...prev,
            airConditioners: prev.airConditioners.map(ac =>
                ac.id === acId ? { ...ac, ...body } : ac
            ),
        }));

        setPendingAcIds(prev => (prev.includes(acId) ? prev : [...prev, acId]));

        // Coalesce rapid stepper taps into a single write per unit.
        acWritesRef.current.set(acId, { ...acWritesRef.current.get(acId), ...body });

        const existing = acTimersRef.current.get(acId);
        if (existing) clearTimeout(existing);

        acTimersRef.current.set(acId, setTimeout(() => { flushAcState(acId); }, 300));
    }, [flushAcState]);

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
        saveState,
        refreshData,
        changeMode,
        togglePower,
        updateAcState
    };
}