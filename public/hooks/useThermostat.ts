import { createEcho } from '@/lib/echo';
import { Stat } from '@/types/types';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { useNotification } from '@/context/NotificationContext';

interface ThermostatData {
    currentTemp: number;
    targetTemp: number;
    heating: boolean;
    heatingUntil: number;
    lastUpdated: Date | null;
}

export function useThermostat() {
    const { showNotification } = useNotification();
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const [data, setData] = useState<ThermostatData>({
        currentTemp: 0,
        targetTemp: -1,
        heating: false,
        heatingUntil: 0,
        lastUpdated: null,
    });
    const [stats, setStats] = useState<Stat | undefined>();
    const [isSaving, setIsSaving] = useState(false);

    const processUpdate = useCallback((tempData: any, stateData: any) => {
        setData(prev => ({
            ...prev,
            currentTemp: tempData?.value ?? prev.currentTemp,
            lastUpdated: tempData?.timestamp ? new Date(tempData.timestamp) : prev.lastUpdated,
            heating: stateData?.heating_on ?? prev.heating,
            targetTemp: stateData?.target_temp ?? prev.targetTemp,
            heatingUntil: stateData?.heating_until ?? prev.heatingUntil,
        }));
    }, []);

    const refreshData = useCallback(async () => {
        try {
            const newStats = await fetchStats();
            setStats(newStats);

            const { temp, state } = await fetchLatestData();
            processUpdate(temp, state);
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
                .listen('.reading.created', (event: any) => {
                    const r = event?.reading;
                    if (r) {
                        setData({
                            currentTemp: r.temperature,
                            lastUpdated: new Date(r.last_updated),
                            heating: r.heating_on,
                            targetTemp: r.set_temp,
                            heatingUntil: r.heating_until ?? 0
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
        setIsSaving(true);
        try {
            setData(prev => ({ ...prev, targetTemp: val, heatingUntil: until }));

            if (timeoutRef?.current) {
                clearTimeout(timeoutRef.current);
            }

            timeoutRef.current = setTimeout(() => {
                updateState(val, until);
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

    const fetchLatestData = async () => {
        const [tempResult, stateResult] = await Promise.all([
            fetchClient('/proxy/api/temperature-latest'),
            fetchClient('/proxy/api/state')
        ]);

        const temp = tempResult.ok ? await tempResult.json() : null;
        const state = stateResult.ok ? await stateResult.json() : null;

        return { temp, state };
    };

    const updateState = async (targetTemp: number, heatingUntil: number) => {
        const res = await fetchClient('/proxy/api/state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ "target_temp": targetTemp, "heating_until": heatingUntil }),
        });
        if (!res.ok) throw new Error('Failed to save state');
        return res.json();
    };

    return {
        data,
        stats,
        isSaving,
        saveState,
        refreshData
    };
}