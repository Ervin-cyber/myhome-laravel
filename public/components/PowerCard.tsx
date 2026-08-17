"use client";

import { JSX } from 'react';
import { AirConditioner, PlugActivity, Room, SmartPlug } from '@/types/types';
import { formatAge } from '@/lib/utils';
import BoltIcon from '@mui/icons-material/Bolt';

interface Props {
    plugs: SmartPlug[];
    rooms: Room[];
    airConditioners: AirConditioner[];
}

const ACTIVITY: Record<PlugActivity, { label: string; tone: string }> = {
    compressor: { label: 'Compressor running', tone: 'bg-blue-500/20 text-blue-300' },
    fan: { label: 'Fan only', tone: 'bg-teal-500/20 text-teal-300' },
    idle: { label: 'Nothing running', tone: 'bg-gray-700/50 text-gray-400' },
    unknown: { label: 'No recent reading', tone: 'bg-gray-700/50 text-gray-500' },
};

/**
 * Whether what we asked for and what the meter sees actually agree.
 *
 * Everything else in this system reports what we *sent*. A unit that dropped
 * off the LAN mid-command, or that someone killed with the IR remote, still
 * shows as running right up until the draw says otherwise. This is the only
 * place the two are compared.
 */
function disagreement(plug: SmartPlug, expectedRunning: boolean): string | null {
    if (!plug.online || plug.activity === 'unknown') return null;

    if (expectedRunning && plug.activity === 'idle') {
        return 'Asked to run, but nothing is drawing power';
    }

    if (!expectedRunning && plug.activity === 'compressor') {
        return 'Nothing was asked to run, but a compressor is drawing power';
    }

    return null;
}

export default function PowerCard({ plugs, rooms, airConditioners }: Props): JSX.Element | null {
    if (plugs.length === 0) return null;

    const total = plugs
        .filter((plug) => plug.online && plug.watts !== null)
        .reduce((sum, plug) => sum + (plug.watts ?? 0), 0);

    return (
        <div className="mt-3 rounded-2xl border border-gray-700/50 bg-gray-800/50 p-4 backdrop-blur">
            <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium uppercase tracking-wide text-gray-400">Power</span>
                {plugs.length > 1 && (
                    <span className="font-mono text-sm text-gray-400">{Math.round(total)} W total</span>
                )}
            </div>

            <div className="mt-3 flex flex-col gap-3">
                {plugs.map((plug) => {
                    // A plug with no room measures the house, so anything running counts.
                    const covered = plug.room_id === null
                        ? airConditioners
                        : airConditioners.filter((ac) => ac.room_id === plug.room_id);
                    const expectedRunning = covered.some((ac) => ac.power_on);
                    const activity = ACTIVITY[plug.activity];
                    const warning = disagreement(plug, expectedRunning);
                    const room = rooms.find((r) => r.id === plug.room_id);

                    return (
                        <div key={plug.id} className={`rounded-xl border p-3 ${warning ? 'border-amber-500/50 bg-amber-500/10' : 'border-gray-700/50 bg-gray-900/40'}`}>
                            <div className="flex items-end justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm text-gray-300">
                                        {plug.name}
                                        <span className="ml-2 text-xs text-gray-500">
                                            {room ? room.name : 'whole house'}
                                        </span>
                                    </p>
                                    <p className="mt-1 flex items-baseline gap-1 text-3xl font-light text-white">
                                        <BoltIcon sx={{ fontSize: 22 }} className="text-amber-400/80" />
                                        {plug.online && plug.watts !== null ? Math.round(plug.watts) : '--'}
                                        <span className="text-lg text-gray-400">W</span>
                                    </p>
                                </div>

                                <div className="shrink-0 text-right">
                                    <p className="font-mono text-lg text-white">
                                        {plug.energy_today !== null ? plug.energy_today.toFixed(2) : '--'}
                                        <span className="ml-1 text-xs text-gray-400">kWh</span>
                                    </p>
                                    <p className="text-[10px] uppercase tracking-wide text-gray-500">today</p>
                                </div>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${plug.online ? activity.tone : 'bg-gray-700/50 text-gray-500'}`}>
                                    {plug.online ? activity.label : 'Plug offline'}
                                </span>
                                <span className="text-xs text-gray-500">{formatAge(plug.watts_at)}</span>
                            </div>

                            {warning && (
                                <p className="mt-2 text-xs text-amber-300">⚠ {warning}</p>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
