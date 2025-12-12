import { createEcho } from '@/lib/echo';
import { Stat } from '@/types/types';
import { useState, useEffect, useCallback } from 'react';
import { fetchLatestData, fetchStats, updateState } from '../services/thermostatApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';

interface ThermostatData {
    currentTemp: number;
    targetTemp: number;
    heating: boolean;
    heatingUntil: number;
    lastUpdated: Date | null;
}

export function useThermostat() {
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
            
            await updateState(val, until);
        } catch (error) {
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };

    return { 
        data, 
        stats, 
        isSaving, 
        saveState,
        refreshData 
    };
}