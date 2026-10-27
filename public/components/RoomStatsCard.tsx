"use client";

import { Fragment, JSX } from 'react';
import { useRoomStats } from '@/hooks/useRoomStats';
import { formatDate, formatRuntime } from '@/lib/utils';
import { RoomStats, RunSource, StatsRange } from '@/types/types';

const RANGES: { value: StatsRange; label: string }[] = [
    { value: '24h', label: '24 hours' },
    { value: '7d', label: '7 days' },
];

interface Props {
    /** The house display setting. Unit rows go with it, like everywhere else. */
    showAirConditioners: boolean;
}

function SourceRow({ source }: { source: RunSource }): JSX.Element {
    return (
        <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-gray-300">
                {source.running && <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-400 align-middle" />}
                {source.name}
                {/* One relay heats every radiator room, so each shows the
                    whole figure. Said, so nobody adds them up. */}
                {source.shared && <span className="ml-1.5 text-xs text-gray-500">shared</span>}
            </span>
            <span className="shrink-0 font-mono text-gray-200">
                {formatRuntime(source.seconds)}
                <span className="ml-2 text-xs text-gray-500">
                    {source.cycles} {source.cycles === 1 ? 'start' : 'starts'}
                </span>
            </span>
        </div>
    );
}

/**
 * Only what did something in the range. A boiler at 0m all summer, or a unit
 * at 0m all winter, is a row that says nothing.
 */
function visibleSources(room: RoomStats, showAirConditioners: boolean): RunSource[] {
    return room.sources.filter((s) =>
        (s.kind === 'boiler' || showAirConditioners) && (s.seconds > 0 || s.cycles > 0 || s.running));
}

function RoomBlock({ room, showAirConditioners }: { room: RoomStats; showAirConditioners: boolean }): JSX.Element {
    const sources = visibleSources(room, showAirConditioners);

    const units = sources.filter((s) => s.kind === 'ac');
    const unitTotal = units.reduce((sum, s) => sum + s.seconds, 0);

    return (
        <div className="rounded-xl border border-gray-700/50 bg-gray-900/40 p-3">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="truncate text-sm font-medium text-white">{room.name}</h3>
                {room.temperature ? (
                    <span className="shrink-0 font-mono text-xs">
                        <span className="text-cyan-400">{room.temperature.min.toFixed(1)}</span>
                        <span className="text-gray-600"> · </span>
                        <span className="text-blue-300">{room.temperature.avg.toFixed(1)}</span>
                        <span className="text-gray-600"> · </span>
                        <span className="text-red-400">{room.temperature.max.toFixed(1)}°C</span>
                    </span>
                ) : (
                    <span className="shrink-0 text-xs text-gray-600">no readings</span>
                )}
            </div>

            <div className="mt-2 flex flex-col gap-1">
                {sources.length === 0 && <p className="text-sm text-gray-600">Nothing ran</p>}
                {sources.map((s) => (
                    <SourceRow key={`${s.kind}:${s.air_conditioner_id ?? 'boiler'}`} source={s} />
                ))}

                {/* Two units in one room: their sum, with the parts, so "how
                    much did the air conditioning run" has one answer. These are
                    unit-hours -- two units for an hour is two. */}
                {units.length > 1 && (
                    <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-gray-700/50 pt-1 text-sm">
                        <span className="text-gray-400">Units together</span>
                        <span className="shrink-0 font-mono text-gray-200">
                            {formatRuntime(unitTotal)}
                            <span className="ml-2 text-xs text-gray-500">
                                {units.map((s) => formatRuntime(s.seconds)).join(' + ')}
                            </span>
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone: string }): JSX.Element {
    return (
        <div className="min-w-0">
            <p className="truncate text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
            <p className={`font-mono text-xl ${tone}`}>{value}</p>
        </div>
    );
}

/**
 * One room on its own: the full-width tile row the stats used to be, before
 * there were rooms to split them by. Temperatures first, then each source's
 * runtime and starts, labelled by what ran when there is more than one.
 */
function WideRoom({ room, showAirConditioners }: { room: RoomStats; showAirConditioners: boolean }): JSX.Element {
    const sources = visibleSources(room, showAirConditioners);
    const named = sources.length > 1;
    const units = sources.filter((s) => s.kind === 'ac');

    return (
        <div className="mt-3">
            <p className="text-sm font-medium text-white">{room.name}</p>
            <div className="mt-2 grid grid-cols-3 gap-4 md:grid-cols-5">
                <Tile label="Avg" value={room.temperature ? `${room.temperature.avg.toFixed(1)}°C` : '--'} tone="text-blue-400" />
                <Tile label="Max" value={room.temperature ? `${room.temperature.max.toFixed(1)}°C` : '--'} tone="text-red-400" />
                <Tile label="Min" value={room.temperature ? `${room.temperature.min.toFixed(1)}°C` : '--'} tone="text-cyan-400" />
                {sources.map((s) => (
                    <Fragment key={`${s.kind}:${s.air_conditioner_id ?? 'boiler'}`}>
                        <Tile label={named ? `${s.name} runtime` : 'Runtime'} value={formatRuntime(s.seconds)} tone="text-orange-400" />
                        <Tile label={named ? `${s.name} starts` : 'Starts'} value={s.cycles} tone="text-orange-400" />
                    </Fragment>
                ))}
                {/* The same sum the narrow layout shows: unit-hours. */}
                {units.length > 1 && (
                    <Tile label="Units together" value={formatRuntime(units.reduce((sum, s) => sum + s.seconds, 0))} tone="text-orange-300" />
                )}
                {sources.length === 0 && <Tile label="Runtime" value="0m" tone="text-gray-500" />}
            </div>
        </div>
    );
}

export default function RoomStatsCard({ showAirConditioners }: Props): JSX.Element {
    const { range, setRange, stats, failed } = useRoomStats();

    const since = stats?.recording_since ? new Date(stats.recording_since) : null;

    return (
        <section className="mt-3 rounded-2xl border border-gray-700/50 bg-gray-800/50 p-4 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium uppercase tracking-wide text-gray-400">Stats</span>
                <div className="flex rounded-lg bg-gray-900/60 p-0.5" role="group" aria-label="Stats range">
                    {RANGES.map(({ value, label }) => (
                        <button
                            key={value}
                            onClick={() => setRange(value)}
                            aria-pressed={range === value}
                            className={`min-h-[2.25rem] rounded-md px-3 text-xs font-medium transition-colors ${range === value ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {failed && !stats ? (
                <p className="mt-3 text-sm text-red-300">Could not load the stats. They will retry in a minute.</p>
            ) : !stats ? (
                <p className="mt-3 text-sm text-gray-500">Loading…</p>
            ) : stats.rooms.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">No rooms are set to show stats. Choose them in Settings.</p>
            ) : (
                <>
                    {/* Recording began with this feature, so the first week's
                        "7 days" is shorter than it says until a whole range
                        has been recorded. */}
                    {stats.partial && (
                        <p className="mt-2 text-xs text-gray-500">
                            {since ? `Run times counted since ${formatDate(since)}.` : 'Run times start counting from the next run.'}
                        </p>
                    )}
                    {stats.rooms.length === 1 ? (
                        <WideRoom room={stats.rooms[0]} showAirConditioners={showAirConditioners} />
                    ) : (
                        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                            {stats.rooms.map((room) => (
                                <RoomBlock key={room.id} room={room} showAirConditioners={showAirConditioners} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
