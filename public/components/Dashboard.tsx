"use client";

import { formatAge, getHoursFromSeconds, getMinutesFromSeconds } from '@/lib/utils';
import { getThemeColors } from '@/lib/themeColors';
import LogoutIcon from '@mui/icons-material/Logout';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import { JSX } from 'react';
import { signOut } from '../actions/auth';
import { useThermostat } from '../hooks/useThermostat';
import HeatingBorder from './HeatingBorder';
import HeatingIcon from './HeatingOnIcon';
import StatCard from './StatCard';
import LoadingSpinner from './LoadingSpinner';
import ModeToggle from './ModeToggle';
import ACUnitIcon from './ACUnitIcon';
import RoomCard from './RoomCard';

export default function Dashboard(): JSX.Element {
    const {
        data,
        stats,
        isSaving,
        pendingAcIds,
        pendingRoomIds,
        changeMode,
        togglePower,
        updateAcState,
        updateRoomState,
    } = useThermostat();

    const { heating, cooling, mode, enabled, lastUpdated, airConditioners, rooms } = data;

    const colors = getThemeColors(mode) || { gradient: 'from-gray-700 to-gray-800', shadowColor: 'shadow-gray-900', text: 'text-gray-400' };
    const isActive = (mode === 'heating' && heating) || (mode === 'cooling' && cooling);

    // Discovery leaves a unit unassigned only if its MAC is not in
    // config/climate.php, so this is a setup prompt rather than a normal state.
    const unassigned = airConditioners.filter((ac) => ac.room_id === null);

    if (!lastUpdated) {
        return (
            // Same box as the loaded dashboard, so nothing shifts when the
            // first reading lands. 100dvh rather than 100vh because with
            // viewport-fit=cover the visual viewport moves with the browser
            // chrome and vh does not follow it.
            <div className="flex min-h-[100dvh] w-full items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-3 md:p-8">
                <LoadingSpinner />
            </div>
        );
    }

    return (
        <div className="min-h-[100dvh] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-8">
            <HeatingBorder isOn={isActive} borderRadius={24} mode={mode}>
                <div className="p-3 opacity-95 md:p-6">
                    <header className="mb-4 flex items-center gap-3">
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${colors.gradient} shadow-lg ${colors.shadowColor}/30`}>
                            {mode === 'cooling'
                                ? <ACUnitIcon size={30} isOn={isActive} />
                                : <HeatingIcon size={26} isOn={isActive} />}
                        </div>
                        <div className="min-w-0 flex-1">
                            <h1 className="truncate text-xl font-bold text-white md:text-2xl">Home Climate</h1>
                            <p className="text-sm text-gray-400">Updated {formatAge(lastUpdated.toISOString())}</p>
                        </div>
                        <button
                            onClick={() => signOut()}
                            aria-label="Sign out"
                            className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-700/50 text-blue-400 transition-all hover:bg-gray-600/50"
                        >
                            <LogoutIcon />
                        </button>
                    </header>

                    {/* House-level controls. Heat vs cool is decided once for the
                        whole house so two rooms can never fight each other;
                        everything else now lives on the room that owns it. */}
                    {/* relative z-30: backdrop-blur makes every panel its own
                        stacking context, so without this the mode dropdown is
                        painted under the room cards that follow it in the DOM. */}
                    <div className="relative z-30 mb-3 flex items-center justify-between gap-3 rounded-2xl border border-gray-700/50 bg-gray-800/50 p-4 backdrop-blur">
                        <div className="min-w-0">
                            <span className="text-[10px] uppercase tracking-wide text-gray-500">House</span>
                            <p className={`text-sm font-medium ${enabled ? colors.text : 'text-gray-500'}`}>
                                {enabled ? (mode === 'heating' ? 'Heating' : 'Cooling') : 'Everything off'}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                            <ModeToggle
                                mode={mode}
                                onChangeMode={changeMode}
                                disabled={isSaving}
                                hvacOn={heating || cooling}
                            />
                            <button
                                onClick={togglePower}
                                disabled={isSaving}
                                aria-label={enabled ? 'Switch the house off' : 'Switch the house on'}
                                className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-xl transition-all disabled:opacity-50 ${enabled ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                            >
                                <PowerSettingsNewIcon sx={{ fontSize: 30 }} />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {rooms.map((room) => (
                            <RoomCard
                                key={room.id}
                                room={room}
                                houseMode={mode}
                                houseEnabled={enabled}
                                isPending={pendingRoomIds.includes(room.id)}
                                pendingAcIds={pendingAcIds}
                                onUpdateRoom={updateRoomState}
                                onUpdateAc={updateAcState}
                            />
                        ))}
                    </div>

                    {unassigned.length > 0 && (
                        <div className="mt-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
                            <p className="text-sm font-medium text-amber-300">
                                {unassigned.length} {unassigned.length === 1 ? 'unit is' : 'units are'} not in a room
                            </p>
                            <p className="mt-1 text-xs text-amber-200/70">
                                Add the MAC to <span className="font-mono">config/climate.php</span> and it will be placed on the next scan.
                            </p>
                            <ul className="mt-2 space-y-1">
                                {unassigned.map((ac) => (
                                    <li key={ac.id} className="flex items-center justify-between gap-3 text-xs">
                                        <span className="truncate text-amber-100">{ac.name}</span>
                                        <span className="shrink-0 font-mono text-amber-200/60">{ac.mac}</span>
                                        <select
                                            value=""
                                            onChange={(e) => updateAcState(ac.id, { room_id: Number(e.target.value) })}
                                            disabled={pendingAcIds.includes(ac.id)}
                                            aria-label={`Room for ${ac.name}`}
                                            className="min-h-[2.25rem] shrink-0 rounded-lg border border-amber-500/40 bg-gray-900/60 px-2 text-xs text-white disabled:opacity-50"
                                        >
                                            <option value="" disabled>Place it…</option>
                                            {rooms.map((room) => (
                                                <option key={room.id} value={room.id}>{room.name}</option>
                                            ))}
                                        </select>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="mt-3 rounded-2xl border border-gray-700/50 bg-gray-800/50 p-4 backdrop-blur">
                        <span className="text-sm font-medium uppercase tracking-wide text-gray-400">Last 24 hours</span>
                        <div className="mt-2 grid grid-cols-3 gap-4 md:grid-cols-5">
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
            </HeatingBorder>
        </div>
    );
}
