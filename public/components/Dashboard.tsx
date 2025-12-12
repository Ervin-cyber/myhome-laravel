"use client";

import { formatDate, formatTime, getHoursFromSeconds, getMinutesFromSeconds } from '@/lib/utils';
import LogoutIcon from '@mui/icons-material/Logout';
import { JSX } from 'react';
import { signOut } from '../actions/auth';
import { useThermostat } from '../hooks/useThermostat';
import HeatingBorder from './HeatingBorder';
import HeatingIcon from './HeatingOnIcon';
import StatCard from './StatCard';
import TempGauge from './TempGauge';
import LoadingSpinner from './LoadingSpinner';

export default function Dashboard(): JSX.Element {
    const { data, stats, isSaving, saveState } = useThermostat();

    const { currentTemp, targetTemp, heating, heatingUntil, lastUpdated } = data;

    const quickTemps = [19, 20, 21, 22];

    if (!lastUpdated) {
        return (
            <div className="min-h-screen min-w-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4 md:p-8 flex items-center justify-center">
                <div className="w-full h-full flex items-center justify-center">
                    <LoadingSpinner />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen min-w-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4 md:p-8">
            <HeatingBorder isOn={heating} borderRadius={24}>
                <div className="p-3 md:p-8 opacity-90">
                    <div className="flex justify-between gap-4 mb-3">
                        <div className="relative w-full flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/30">
                                <HeatingIcon size={28} isOn={heating} />
                            </div>
                            <div>
                                <h1 className="text-xl md:text-2xl font-bold text-white">Temperature Monitor</h1>
                                <p className="text-gray-400 text-sm">Realtime data</p>
                            </div>
                            <button className="absolute right-0 px-2 py-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 text-blue-400 font-medium transition-all" onClick={() => signOut()}>
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
                                    <p className="text-2xl font-mono text-white">{formatTime(lastUpdated)}</p>
                                    <p className="text-gray-500 text-sm">{formatDate(lastUpdated)}</p>
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
                                <button disabled={isSaving} onClick={() => saveState(Math.max(10, targetTemp - 0.5), heatingUntil)}
                                    className="w-14 h-14 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-2xl font-light transition-all active:scale-95">
                                    −
                                </button>
                                <div className="w-32 text-center">
                                    <span className="text-5xl font-light text-white">{targetTemp}</span>
                                    <span className="text-2xl text-gray-400">°C</span>
                                </div>
                                <button disabled={isSaving} onClick={() => saveState(Math.min(30, targetTemp + 0.5), heatingUntil)}
                                    className="w-14 h-14 rounded-xl bg-gray-700 hover:bg-gray-600 text-white text-2xl font-light transition-all active:scale-95">
                                    +
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="mt-3 bg-gray-800/50 backdrop-blur rounded-2xl p-3 border border-gray-700/50">
                        <span className="text-gray-400 text-sm font-medium uppercase tracking-wide">Quick Actions</span>
                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 mt-4">
                            {quickTemps.map((t, i) => (
                                <button key={i} onClick={() => saveState(t, heatingUntil)}
                                    disabled={isSaving}
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
                            <StatCard label="Avg" value={`${Number(stats?.temp_avg).toFixed(1)}°C`} colorClass="text-blue-400" />
                            <StatCard label="Max" value={`${Number(stats?.temp_max).toFixed(1)}°C`} colorClass="text-red-400" />
                            <StatCard label="Min" value={`${Number(stats?.temp_min).toFixed(1)}°C`} colorClass="text-cyan-400" />
                            <StatCard
                                label="Runtime"
                                value={`${getHoursFromSeconds(stats?.run_time ?? 0)}h ${getMinutesFromSeconds(stats?.run_time ?? 0)}m`}
                                colorClass="text-orange-400"
                            />
                            <StatCard label="Cycles" value={stats?.count_on ?? 0} colorClass="text-orange-400" />
                        </div>
                    </div>
                </div>
            </HeatingBorder >
        </div >
    );
}