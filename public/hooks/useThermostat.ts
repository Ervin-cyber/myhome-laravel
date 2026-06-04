import { createEcho } from '@/lib/echo';
import { FetchLatestDataResponse, LiveReadingEvent, Mode, Stat, SystemStateResponse, TemperatureResponse, ThermostatData } from '@/types/types';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { useNotification } from '@/context/NotificationContext';

export function useThermostat() {
    const { showNotification } = useNotification();
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const [data, setData] = useState<ThermostatData>({
        currentTemp: 0,
        targetTemp: -1,
        heating: false,
        cooling: false,
        mode: 'heating',
        enabled: true,
        hvacUntil: 0,
        lastUpdated: null,
    });
    const [stats, setStats] = useState<Stat | undefined>();
    const [isSaving, setIsSaving] = useState(false);

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
        }));
    }, []);

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
    }, [processUpdate]);

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
                            hvacUntil: r.hvac_until ?? 0
                        });
                    }
                });
        }

        return () => {
            clearInterval(pollInterval);
            if (echo) echo.leave('live-updates');
        };
    }, [refreshData]);

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

    const fetchClient = async (url: string, options: RequestInit = {}) => {
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
    };

    const fetchStats = async (): Promise<Stat> => {
        const res = await fetchClient('/proxy/api/stats');
        if (!res.ok) throw new Error('Failed to fetch stats');
        return res.json();
    };

    const fetchLatestData = async (): Promise<FetchLatestDataResponse> => {
        const [tempResult, stateResult] = await Promise.all([
            fetchClient('/proxy/api/temperature-latest'),
            fetchClient('/proxy/api/state')
        ]);

        const temp = tempResult.ok ? await tempResult.json() : null;
        const state = stateResult.ok ? await stateResult.json() : null;

        return { temp, state };
    };

    const updateState = async (body: any) => {
        const res = await fetchClient('/proxy/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to save state');
        return res.json();
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
        saveState,
        refreshData,
        changeMode,
        togglePower
    };
}