"use client";

import LogoutIcon from '@mui/icons-material/Logout';
import { useEffect, useState } from 'react';
import HeatingBorder from './HeatingBorder';
import HeatingIcon from './HeatingOnIcon';
import TempGauge from './TempGauge';
import { Stat, SystemState } from '@/types/types';
import { signOut } from '../actions/auth';
import { createEcho } from '@/lib/echo';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';

const getHoursFromSeconds = (seconds: number) => {
    return Math.floor(seconds / 3600);
}

const getMinutesFromSeconds = (seconds: number) => {
    return Math.floor((seconds % 3600) / 60);
}

export default function Dashboard() {
    const [currentTemp, setCurrentTemp] = useState<number>();
    const [heating, setHeating] = useState<boolean>(false);
    const [tempTimeStamp, setTempTimeStamp] = useState<Date | null>(null);
    const [targetTemp, setTargetTemp] = useState<number>(-1);
    const [heatingUntil, setHeatingUntil] = useState<number>(0);
    const [saving, setSaving] = useState<boolean>(false);
    const [stats, setStats] = useState<Stat>();

    async function getStats() {
        let interval: NodeJS.Timeout;
        const fetchStats = async () => {
            try {
                const response = await fetch('/proxy/api/stats');
                const res = await response.json();
                setStats(res);
            } catch (err) {
                console.error(err);
            }
        }
        await fetchStats();

        interval = setInterval(async () => {
            await fetchStats();
        }, 15000);
    }

    const fetchData = async () => {
        const [tempResult, stateResult] = await Promise.all([
            fetch('/proxy/api/temperature-latest'),
            fetch('/proxy/api/state')
        ]);

        if (tempResult.status == 200) {
            const res = await tempResult.json();
            setCurrentTemp(res?.value);
            setTempTimeStamp(new Date(res?.timestamp))
        } else {
            console.error('Temperature fetch error!');
        }

        if (stateResult.status == 200) {
            const res = await stateResult.json();
            setHeating(res?.heating_on ? true : false);
            setTargetTemp(res?.target_temp);
            setHeatingUntil(res?.heating_until ?? 0);
        } else {
            console.error('SystemState fetch error!');
        }
    }

    useRefetchOnFocus(fetchData);

    useEffect(() => {
        fetchData();
        getStats();

        const echo = createEcho();

        if (echo) {
            echo.channel('live-updates')
                .listen('.reading.created', (eventPayload: any) => {
                    if (eventPayload?.reading) {
                        const payload = eventPayload?.reading;
                        setCurrentTemp(payload?.temperature);
                        setTempTimeStamp(new Date(payload?.last_updated));
                        setHeating(payload?.heating_on ? true : false);
                        setTargetTemp(payload?.target_temp);
                        setHeatingUntil(payload?.heating_until ?? 0);
                    }
                });
        }

        return () => {
            if (echo) echo.leave('live-updates');
        };
    }, []);

    const saveState = async (val: number, heatingUntil: number) => {
        if (val < 10 || heatingUntil < 0) return;
        /*if (isNaN(val)) {
            onError('Invalid number');
            return;
        }*/
        setSaving(true);
        try {
            fetch('/proxy/api/state', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ "target_temp": val, "heating_until": heatingUntil }),
            })

        } catch (e: unknown) {
            /*if (e instanceof Error) onError(e.message);
            else onError('Failed to save');*/
        }
        setSaving(false);
    };

    const quickTemps = [19, 20, 21, 22];

    const handleSignOut = () => {
        signOut();
    }

    return (
        <div className="min-h-screen min-w-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4 md:p-8">
            <HeatingBorder isOn={heating} borderRadius={24}>
                <div className="p-3 md:p-8 opacity-90">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-3">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                                <HeatingIcon size={28} isOn={heating} />
                            </div>
                            <div>
                                <h1 className="text-xl md:text-2xl font-bold text-white">Temperature Monitor</h1>
                                <p className="text-gray-400 text-sm">Realtime data</p>
                            </div>
                            <button className="px-2 py-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 text-blue-400 font-medium transition-all" onClick={() => handleSignOut()}>
                                <LogoutIcon />
                            </button>
                        </div>
                    </div>

                    {/* Main Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {/* Current Temperature Card */}
                        <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-3 border border-gray-700/50">
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-gray-400 text-sm font-medium uppercase tracking-wide">Current</span>
                                <div className="text-right">
                                    <p className="text-2xl font-mono text-white">{tempTimeStamp?.toLocaleTimeString('ro-RO', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit'
                                    })}</p>
                                    <p className="text-gray-500 text-sm">{tempTimeStamp?.toLocaleDateString('ro-RO')}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 mb-6">
                                <HeatingIcon size={48} isOn={heating} />
                                <div className="text-5xl md:text-6xl font-light text-white">
                                    {currentTemp?.toFixed(2)}
                                    <span className="text-3xl text-gray-400">°C</span>
                                </div>
                            </div>

                            {currentTemp ? <TempGauge temp={currentTemp} target={targetTemp} isHeating={heating} /> : ''}

                            <div className="flex justify-between mt-2 text-xs text-gray-500">
                                <span>10°C</span>
                                <span>Target: {targetTemp}°C</span>
                                <span>30°C</span>
                            </div>

                            <div className={`mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${heating ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}`}>
                                <span className={`w-2 h-2 rounded-full ${heating ? 'bg-orange-400 animate-pulse' : 'bg-green-400'}`} />
                                {heating ? 'Heating...' : 'Target Reached'}
                            </div>
                        </div>

                        {/* Target Temperature Card */}
                        <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-3 border border-gray-700/50">
                            <span className="text-gray-400 text-sm font-medium uppercase tracking-wide">Set Target Temperature</span>

                            <div className="flex items-center justify-center gap-4 my-8">
                                <button onClick={() => saveState(Math.max(10, targetTemp - 0.5), heatingUntil)}
                                    className="w-14 h-14 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-2xl font-light transition-all active:scale-95">
                                    −
                                </button>
                                <div className="w-32 text-center">
                                    <span className="text-5xl font-light text-white">{targetTemp}</span>
                                    <span className="text-2xl text-gray-400">°C</span>
                                </div>
                                <button onClick={() => saveState(Math.min(30, targetTemp + 0.5), heatingUntil)}
                                    className="w-14 h-14 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-2xl font-light transition-all active:scale-95">
                                    +
                                </button>
                            </div>

                            <button className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold transition-all shadow-lg shadow-blue-500/25 active:scale-98">
                                Save Target
                            </button>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="mt-3 bg-gray-800/50 backdrop-blur rounded-2xl p-3 border border-gray-700/50">
                        <span className="text-gray-400 text-sm font-medium uppercase tracking-wide">Quick Actions</span>
                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 mt-4">
                            {quickTemps.map((t, i) => (
                                <button key={i} onClick={() => saveState(t, heatingUntil)}
                                    className={`py-3 rounded-xl font-medium transition-all active:scale-95 ${targetTemp === t
                                        ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/25'
                                        : 'bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 border border-gray-600/50'}`}>
                                    {t}°C
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Boost Timers */}
                    <div className="mt-3 bg-gray-800/50 backdrop-blur rounded-2xl p-3 border border-gray-700/50">
                        <span className="text-gray-400 text-sm font-medium uppercase tracking-wide">Boost Heating</span>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                            <button
                                onClick={() => saveState(targetTemp, 15)}
                                disabled={heatingUntil !== 0}
                                className={`py-3 rounded-xl font-medium transition-all active:scale-95 flex items-center justify-center gap-2 ${heatingUntil !== 0
                                    ? 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
                                    : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/50'
                                    }`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                15 min
                            </button>
                            <button
                                onClick={() => saveState(targetTemp, 30)}
                                disabled={heatingUntil !== 0}
                                className={`py-3 rounded-xl font-medium transition-all active:scale-95 flex items-center justify-center gap-2 ${heatingUntil !== 0
                                    ? 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
                                    : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/50'
                                    }`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                30 min
                            </button>
                        </div>
                        {heatingUntil !== 0 && (
                            <button
                                onClick={() => saveState(targetTemp, 0)}
                                className="w-full mt-2 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-sm font-medium transition-all">
                                Cancel Boost
                            </button>
                        )}
                    </div>

                    {/* Footer Stats */}
                    <div className="mt-3 bg-gray-800/50 backdrop-blur rounded-2xl p-3 border border-gray-700/50">
                        <span className="text-gray-400 text-sm font-medium uppercase tracking-wide">Last 24 Hours</span>
                        <div className="grid grid-cols-3 xs:grid-cols-2 sm:xs:grid-cols-2 md:grid-cols-5 gap-4">
                            <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700/30">
                                <p className="text-gray-500 text-xs uppercase tracking-wide">Avg</p>
                                <p className={`text-xl font-semibold text-blue-400`}>{Number(stats?.temp_avg).toFixed(1)}°C</p>
                            </div>
                            <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700/30">
                                <p className="text-gray-500 text-xs uppercase tracking-wide">Max</p>
                                <p className={`text-xl font-semibold text-red-400`}>{Number(stats?.temp_max).toFixed(1)}°C</p>
                            </div>
                            <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700/30">
                                <p className="text-gray-500 text-xs uppercase tracking-wide">Min</p>
                                <p className={`text-xl font-semibold text-cyan-400`}>{Number(stats?.temp_min).toFixed(1)}°C</p>
                            </div>
                            <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700/30">
                                <p className="text-gray-500 text-xs uppercase tracking-wide">Runtime</p>
                                <p className={`text-xl font-semibold text-orange-400`}>{getHoursFromSeconds(stats?.run_time ?? 0)}h {getMinutesFromSeconds(stats?.run_time ?? 0)}m</p>
                            </div>
                            <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700/30">
                                <p className="text-gray-500 text-xs uppercase tracking-wide">Cycles</p>
                                <p className={`text-xl font-semibold text-orange-400`}>{stats?.count_on}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </HeatingBorder >
        </div >
    );
}