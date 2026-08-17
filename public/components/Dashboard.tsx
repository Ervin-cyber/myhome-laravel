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
    const { data, stats, isSaving, pendingAcIds, saveState, changeMode, togglePower, updateAcState } = useThermostat();

    const { currentTemp, targetTemp, heating, cooling, mode, enabled, hvacUntil, lastUpdated, airConditioners, rooms } = data;
    const colors = getThemeColors(mode) || { gradient: 'from-gray-700 to-gray-800', shadowColor: 'shadow-gray-900', text: 'text-gray-400' };
    const isActive = (mode === 'heating' && heating) || (mode === 'cooling' && cooling);
    const isBoosting = hvacUntil > 0;

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
                                        <HeatingIcon size={28} isOn={isActive} />
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
                                <div className="flex items-center justify-center gap-3">
                                    <ModeToggle 
                                        mode={mode}
                                        onChangeMode={changeMode}
                                        disabled={isSaving}
                                        hvacOn={heating || cooling}
                                    />
                                    <button
                                        onClick={togglePower}
                                        disabled={isSaving}
                                        title={enabled ? "Turn Off" : "Turn On"}
                                        className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-xl ${isSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${enabled ? 'bg-red-500/20 hover:bg-red-500/30 text-red-500' : 'bg-gray-700 hover:bg-gray-600 text-gray-400'}`}
                                    >
                                        <PowerSettingsNewIcon sx={{ fontSize: 32 }} />
                                    </button>
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
                                    : (enabled || isBoosting) ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                    <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-current animate-pulse' : (enabled || isBoosting) ? 'bg-green-400' : 'bg-gray-400'}`} />
                                    {!enabled && !isBoosting
                                        ? 'System Off'
                                        : mode === 'heating'
                                            ? (heating ? '🔥 Heating...' : 'Heating Standby')
                                            : (cooling ? '❄️ Cooling...' : 'Cooling Standby')
                                    }
                                    {isBoosting && <span className="ml-1 text-xs opacity-70">(Boost active)</span>}
                                </div>
                            </div>
                        </div>

                        {/* Target Temperature Card */}
                        <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-3 border border-gray-700/50">
                            <span className="text-gray-400 text-sm font-medium uppercase tracking-wide">Set Target Temperature</span>

                            <div className="flex items-center justify-center gap-4 my-8">
                                <button 
                                    disabled={isSaving || (!enabled && !isBoosting)} 
                                    onClick={() => saveState(Math.max(10, targetTemp - 0.5), hvacUntil)}
                                    className={`w-14 h-14 rounded-xl text-white text-2xl font-light transition-all active:scale-95 ${isSaving || (!enabled && !isBoosting) ? 'bg-gray-700/30 text-gray-500 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600'}`}>
                                    −
                                </button>
                                <div className="w-32 text-center">
                                    <span className={`text-5xl font-light ${(!enabled && !isBoosting) ? 'text-gray-500' : 'text-white'}`}>{targetTemp}</span>
                                    <span className="text-2xl text-gray-400">°C</span>
                                </div>
                                <button 
                                    disabled={isSaving || (!enabled && !isBoosting)} 
                                    onClick={() => saveState(Math.min(30, targetTemp + 0.5), hvacUntil)}
                                    className={`w-14 h-14 rounded-xl text-white text-2xl font-light transition-all active:scale-95 ${isSaving || (!enabled && !isBoosting) ? 'bg-gray-700/30 text-gray-500 cursor-not-allowed' : 'bg-gray-700 hover:bg-gray-600'}`}>
                                    +
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* AC Units Section */}
                    {airConditioners && airConditioners.length > 0 && (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {airConditioners.map((ac) => {
                                const isPending = pendingAcIds.includes(ac.id);
                                const isRunning = mode === 'cooling' && ac.enabled && ac.online && (enabled || isBoosting);
                                const acTemp = ac.reported_temp !== null
                                    ? Number(ac.reported_temp) + Number(ac.calibration_offset ?? 0)
                                    : null;

                                return (
                                    <div key={ac.id} className={`bg-gray-800/50 backdrop-blur rounded-2xl p-4 border flex flex-col gap-4 transition-opacity ${ac.online ? 'border-gray-700/50' : 'border-gray-700/50 opacity-60'}`}>
                                        <div className="flex justify-between items-center gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center shadow-inner">
                                                    <ACUnitIcon size={24} isOn={isRunning} />
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="text-white font-medium truncate">{ac.name}</h3>
                                                    {/* Secondary, low-priority: the unit's own indoor sensor */}
                                                    {acTemp !== null ? (
                                                        <p className="text-xs text-gray-500">
                                                            Unit sensor <span className="font-mono text-gray-400">{acTemp.toFixed(1)}°C</span>
                                                        </p>
                                                    ) : (
                                                        <p className="text-xs text-gray-600 font-mono truncate">{ac.ip}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => updateAcState(ac.id, { enabled: !ac.enabled })}
                                                disabled={isPending || !ac.online}
                                                aria-label={ac.enabled ? `Disable ${ac.name}` : `Enable ${ac.name}`}
                                                className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 ${ac.enabled ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-500'}`}
                                            >
                                                <PowerSettingsNewIcon sx={{ fontSize: 20 }} />
                                            </button>
                                        </div>

                                        {/* Room assignment. Units arrive unassigned from discovery. */}
                                        {rooms.length > 0 && (
                                            <label className="flex items-center justify-between gap-3 text-xs">
                                                <span className={ac.room_id === null ? 'text-amber-400' : 'text-gray-500'}>
                                                    {ac.room_id === null ? 'Unassigned' : 'Room'}
                                                </span>
                                                <select
                                                    value={ac.room_id ?? ''}
                                                    onChange={(e) => updateAcState(ac.id, {
                                                        room_id: e.target.value === '' ? null : Number(e.target.value),
                                                    })}
                                                    disabled={isPending}
                                                    aria-label={`Room for ${ac.name}`}
                                                    className={`min-h-[2.25rem] rounded-lg bg-gray-700/70 px-2 py-1 text-sm text-white border disabled:opacity-50 ${ac.room_id === null ? 'border-amber-500/50' : 'border-gray-600/50'}`}
                                                >
                                                    <option value="">— pick a room —</option>
                                                    {rooms.map((room) => (
                                                        <option key={room.id} value={room.id}>{room.name}</option>
                                                    ))}
                                                </select>
                                            </label>
                                        )}

                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => updateAcState(ac.id, { target_temp: Math.max(16, ac.target_temp - 1) })}
                                                    disabled={isPending || !ac.enabled || !ac.online || ac.target_temp <= 16}
                                                    aria-label={`Lower ${ac.name} target`}
                                                    className="w-11 h-11 rounded-lg bg-gray-700 text-white text-xl flex items-center justify-center transition-all active:scale-95 hover:bg-gray-600 disabled:opacity-50"
                                                >
                                                    −
                                                </button>
                                                <div className="flex flex-col items-center min-w-[3rem]">
                                                    <span className={`text-xl font-mono ${ac.enabled ? 'text-white' : 'text-gray-600'}`}>
                                                        {ac.target_temp}
                                                    </span>
                                                    <span className="text-[10px] text-gray-500 uppercase">Target</span>
                                                </div>
                                                <button
                                                    onClick={() => updateAcState(ac.id, { target_temp: Math.min(30, ac.target_temp + 1) })}
                                                    disabled={isPending || !ac.enabled || !ac.online || ac.target_temp >= 30}
                                                    aria-label={`Raise ${ac.name} target`}
                                                    className="w-11 h-11 rounded-lg bg-gray-700 text-white text-xl flex items-center justify-center transition-all active:scale-95 hover:bg-gray-600 disabled:opacity-50"
                                                >
                                                    +
                                                </button>
                                            </div>

                                            <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${!ac.online ? 'bg-gray-700 text-gray-500' : isRunning ? 'bg-blue-500/20 text-blue-400 animate-pulse' : 'bg-gray-700 text-gray-500'}`}>
                                                {!ac.online ? 'Offline' : isRunning ? 'Cooling' : 'Standby'}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Quick Actions */}
                    {quickTemps.length > 0 && (
                        <div className="mt-3 bg-gray-800/50 backdrop-blur rounded-2xl p-3 border border-gray-700/50">
                        <span className="text-gray-400 text-sm font-medium uppercase tracking-wide">Quick Actions</span>
                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 mt-4">
                            {quickTemps.map((t, i) => (
                                <button key={i} onClick={() => saveState(t, hvacUntil)}
                                    disabled={isSaving || (!enabled && !isBoosting)}
                                    className={`py-3 rounded-xl font-medium transition-all active:scale-95 ${targetTemp === t
                                        ? `bg-gradient-to-r ${colors.gradient} text-white shadow-lg ${colors.shadowColor}/25`
                                        : 'bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 border border-gray-600/50 disabled:opacity-50 disabled:cursor-not-allowed'}`}>
                                    {t}°C
                                </button>
                            ))}
                        </div>
                    </div>
                    )}

                    {/* Boost Timers */}
                    <div className="mt-3 bg-gray-800/50 backdrop-blur rounded-2xl p-3 border border-gray-700/50">
                        <span className="text-gray-400 text-sm font-medium uppercase tracking-wide">Boost HVAC</span>
                        <div className="grid grid-cols-3 gap-3 mt-3">
                            {[15, 30, 60].map((mins) => (
                                <button
                                    key={mins}
                                    onClick={() => saveState(targetTemp, mins)}
                                    disabled={isBoosting}
                                    className={`py-3 rounded-xl font-medium transition-all active:scale-95 flex items-center justify-center gap-2 ${isBoosting
                                        ? 'bg-gray-700/30 text-gray-500 cursor-not-allowed'
                                        : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/50'
                                        }`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {mins} min
                                </button>
                            ))}
                        </div>
                        {isBoosting && (
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