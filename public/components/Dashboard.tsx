"use client";

import { formatDate, formatTime, getHoursFromSeconds, getMinutesFromSeconds } from '@/lib/utils';
import { getThemeColors } from '@/lib/themeColors';
import LogoutIcon from '@mui/icons-material/Logout';
import { JSX } from 'react';
import { signOut } from '../actions/auth';
import { useThermostat } from '../hooks/useThermostat';
import HeatingBorder from './HeatingBorder';
import HeatingIcon from './HeatingOnIcon';
import StatCard from './StatCard';
import TempGauge from './TempGauge';
import LoadingSpinner from './LoadingSpinner';
import ModeToggle from './ModeToggle';
import ACUnitIcon from './ACUnitIcon';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';

export default function Dashboard(): JSX.Element {
    const { data, stats, isSaving, saveState, changeMode } = useThermostat();

    const { currentTemp, targetTemp, heating, cooling, mode, hvacUntil, lastUpdated } = data;
    const colors = getThemeColors(mode) || { gradient: 'from-gray-700 to-gray-800', shadowColor: 'shadow-gray-900', text: 'text-gray-400' };
    const isActive = (mode === 'heating' && heating) || (mode === 'cooling' && cooling);

    const quickTemps = mode === 'heating' ? [19, 20, 21, 22] : (mode === 'cooling' ? [24, 25, 26, 28] : []);

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
            <HeatingBorder isOn={isActive} borderRadius={24} mode={mode}>
                <div className="p-3 md:p-8 opacity-90">
                    <div className="flex justify-between gap-4 mb-3">
                        <div className="relative w-full flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-lg ${colors.shadowColor}/30`}>
                                {
                                    mode === 'cooling' ?
                                        <ACUnitIcon size={32} isOn={isActive} /> :
                                        mode === 'heating' ?
                                            <HeatingIcon size={28} isOn={isActive} /> :
                                            <PowerSettingsNewIcon sx={{ color: 'white', fontSize: 28 }} />
                                }
                            </div>
                            <div>
                                <h1 className={`text-xl md:text-2xl font-bold text-white ${colors.text}`}>Temperature Monitor</h1>
                                <p className="text-gray-400 text-sm">Realtime data</p>
                            </div>

                            <div className="absolute right-0 flex items-center gap-3">
                                <button className="px-2 py-2 rounded-lg bg-gray-700/50 hover:bg-gray-600/50 text-blue-400 font-medium transition-all" onClick={() => signOut()}>
                                    <LogoutIcon />
                                </button>
                            </div>
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
                                <div className="flex items-center justify-center">
                                    <ModeToggle 
                                        mode={mode}
                                        onChangeMode={changeMode}
                                        disabled={isSaving}
                                        hvacOn={heating || cooling}
                                    />
                                </div>
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

                            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${isActive
                                    ? `${colors.text} ${mode === 'heating' ? 'bg-orange-500/20' : 'bg-blue-500/20'}`
                                    : 'bg-green-500/20 text-green-400'}`}>
                                    <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-current animate-pulse' : 'bg-green-400'}`} />
                                    {mode === 'off'
                                        ? 'System Standby'
                                        : mode === 'heating'
                                            ? (heating ? '🔥 Heating...' : 'Heating off')
                                            : (cooling ? '❄️ Cooling...' : 'Cooling off')
                                    }
                                </div>
                            </div>
                        </div>

                        {/* Target Temperature Card */}
                        <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-3 border border-gray-700/50">
                            <span className="text-gray-400 text-sm font-medium uppercase tracking-wide">Set Target Temperature</span>

                            <div className="flex items-center justify-center gap-4 my-8">
                                <button 
                                    disabled={isSaving || mode === 'off'} 
                                    onClick={() => saveState(Math.max(10, targetTemp - 0.5), hvacUntil)}
                                    className={`w-14 h-14 rounded-xl text-white text-2xl font-light transition-all active:scale-95 ${isSaving || mode === 'off' ? 'bg-gray-700/30 text-gray-500 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600'}`}>
                                    −
                                </button>
                                <div className="w-32 text-center">
                                    <span className={`text-5xl font-light ${mode === 'off' ? 'text-gray-500' : 'text-white'}`}>{targetTemp}</span>
                                    <span className="text-2xl text-gray-400">°C</span>
                                </div>
                                <button 
                                    disabled={isSaving || mode === 'off'} 
                                    onClick={() => saveState(Math.min(30, targetTemp + 0.5), hvacUntil)}
                                    className={`w-14 h-14 rounded-xl text-white text-2xl font-light transition-all active:scale-95 ${isSaving || mode === 'off' ? 'bg-gray-700/30 text-gray-500 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600'}`}>
                                    +
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    {quickTemps.length > 0 && (
                        <div className="mt-3 bg-gray-800/50 backdrop-blur rounded-2xl p-3 border border-gray-700/50">
                        <span className="text-gray-400 text-sm font-medium uppercase tracking-wide">Quick Actions</span>
                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 mt-4">
                            {quickTemps.map((t, i) => (
                                <button key={i} onClick={() => saveState(t, hvacUntil)}
                                    disabled={isSaving}
                                    className={`py-3 rounded-xl font-medium transition-all active:scale-95 ${targetTemp === t
                                        ? `bg-gradient-to-r ${colors.gradient} text-white shadow-lg ${colors.shadowColor}/25`
                                        : 'bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 border border-gray-600/50'}`}>
                                    {t}°C
                                </button>
                            ))}
                        </div>
                    </div>
                    )}

                    {/* Boost Timers */}
                    <div className="mt-3 bg-gray-800/50 backdrop-blur rounded-2xl p-3 border border-gray-700/50">
                        <span className="text-gray-400 text-sm font-medium uppercase tracking-wide">Boost HVAC</span>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                            <button
                                onClick={() => saveState(targetTemp, 15)}
                                disabled={hvacUntil !== 0 || mode === 'off'}
                                className={`py-3 rounded-xl font-medium transition-all active:scale-95 flex items-center justify-center gap-2 ${hvacUntil !== 0 || mode === 'off'
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
                                disabled={hvacUntil !== 0 || mode === 'off'}
                                className={`py-3 rounded-xl font-medium transition-all active:scale-95 flex items-center justify-center gap-2 ${hvacUntil !== 0 || mode === 'off'
                                    ? 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
                                    : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/50'
                                    }`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                30 min
                            </button>
                        </div>
                        {hvacUntil !== 0 && (
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