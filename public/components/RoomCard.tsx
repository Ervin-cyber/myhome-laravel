"use client";

import { JSX, useState } from 'react';
import { AirConditioner, FAN_SPEEDS, Mode, ModeOverride, Room } from '@/types/types';
import { formatAge, isStale } from '@/lib/utils';
import AcUnitCard from './AcUnitCard';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface Props {
    room: Room;
    houseMode: Mode;
    houseEnabled: boolean;
    isPending: boolean;
    pendingAcIds: number[];
    onUpdateRoom: (roomId: number, body: Partial<Room>) => void;
    onUpdateAc: (acId: number, body: Partial<AirConditioner>) => void;
    onRunRoom: (roomId: number, on: boolean) => void;
}

const BOOSTS = [15, 30, 60];

const MODE_CHOICES: { value: ModeOverride; label: string; hint: string }[] = [
    { value: null, label: 'Auto', hint: 'Follow the house' },
    { value: 'dry', label: 'Dry', hint: 'Dehumidify' },
    { value: 'fan', label: 'Fan', hint: 'Move air only' },
];

/**
 * How the collapsed unit row reads.
 *
 * A count is the one thing already visible, so the row carries the unit's name
 * and the setting you would have opened it to check instead. Anything that
 * needs attention — offline, switched off — takes precedence over the rest.
 */
function summariseUnits(units: AirConditioner[]): { title: string; detail: string; warn: boolean } {
    const offline = units.filter((ac) => !ac.online);
    const byRemote = units.filter((ac) => ac.following_remote);

    if (units.length === 1) {
        const [ac] = units;
        const fan = FAN_SPEEDS.find((f) => f.value === ac.fan_speed)?.label ?? ac.fan_speed;

        if (!ac.online) return { title: ac.name, detail: 'offline', warn: true };
        // Ahead of "parked", because it is the more recent decision and the one
        // that explains why the room is not doing what the card otherwise says.
        if (ac.following_remote) {
            return { title: ac.name, detail: ac.manual_power ? 'on by remote' : 'off by remote', warn: true };
        }
        if (!ac.enabled) return { title: ac.name, detail: 'parked', warn: true };

        return { title: ac.name, detail: `fan ${fan.toLowerCase()}`, warn: false };
    }

    const title = `${units.length} units`;

    if (offline.length > 0) return { title, detail: `${offline.length} offline`, warn: true };
    if (byRemote.length > 0) return { title, detail: `${byRemote.length} by remote`, warn: true };

    const running = units.filter((ac) => ac.power_on).length;

    return { title, detail: running > 0 ? `${running} running` : 'all idle', warn: false };
}

/** What this room is doing right now, in words. */
function statusOf(room: Room, active: boolean): { label: string; tone: string } {
    if (!active) return { label: 'Off', tone: 'bg-gray-700/50 text-gray-400' };
    if (room.mode_override === 'fan') return { label: 'Fan', tone: 'bg-teal-500/20 text-teal-300' };
    if (room.mode_override === 'dry') return { label: 'Drying', tone: 'bg-cyan-500/20 text-cyan-300' };
    if (room.heating_on) return { label: 'Heating', tone: 'bg-orange-500/20 text-orange-300' };
    if (room.cooling_on) return { label: 'Cooling', tone: 'bg-blue-500/20 text-blue-300' };

    return { label: 'Standby', tone: 'bg-green-500/20 text-green-400' };
}

export default function RoomCard({
    room,
    houseMode,
    houseEnabled,
    isPending,
    pendingAcIds,
    onUpdateRoom,
    onUpdateAc,
    onRunRoom,
}: Props): JSX.Element {
    const [showUnits, setShowUnits] = useState(false);

    const active = (houseEnabled && room.enabled) || room.is_boosting;
    const status = statusOf(room, active);
    const units = room.air_conditioners ?? [];
    const summary = summariseUnits(units);
    const stale = isStale(room.current_temp_at);

    // A room with its own sensor still has a second opinion in the unit's
    // intake sensor, and the two rarely agree — a Gree sits high on the wall in
    // its own return air and reads warm. Worth showing, but quietly: it is not
    // what the room is regulated against. Omitted where the room already reads
    // from the unit, since that would print the same number twice.
    // Worth saying on the room card rather than only inside the unit list: it
    // is the reason the room is not doing what the rest of this card implies,
    // and it is not obvious that the room's own switch is what undoes it.
    const byRemote = units.filter((ac) => ac.following_remote);

    const unitReadings = room.temp_source === 'ac'
        ? []
        : units
            .filter((ac) => ac.calibrated_temp !== null)
            .sort((a, b) => Date.parse(b.reported_at ?? '') - Date.parse(a.reported_at ?? ''));

    // A radiator-only room has nothing for its unit to do in winter, and a room
    // with no unit at all has no airflow settings worth showing.
    const unitsUsable = units.length > 0 && (houseMode === 'cooling' || room.heat_source === 'ac' || room.mode_override !== null);

    // The setpoint follows whatever acts on it. A Gree carries Celsius as a
    // whole-degree integer and refuses anything outside 16-30, so offering
    // half degrees or 12°C there would promise something the unit cannot do.
    // The boiler is regulated by us, against a 0.2° deadband, so it can.
    const acDriven = units.length > 0 && (houseMode === 'cooling' || room.heat_source === 'ac');
    const step = acDriven ? 1 : 0.5;
    const min = acDriven ? 16 : 10;
    const max = 30;

    // Shown rounded to what will actually be honoured, so a target carried over
    // from the other season does not sit on screen as a number nothing can use.
    const shownTarget = Math.min(max, Math.max(min, acDriven ? Math.round(room.target_temp) : room.target_temp));

    const setTarget = (next: number) => onUpdateRoom(room.id, {
        target_temp: Math.min(max, Math.max(min, next)),
    });

    return (
        <section className="rounded-2xl border border-gray-700/50 bg-gray-800/50 p-4 backdrop-blur">
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-white">{room.name}</h2>
                    <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.tone}`}>
                        <span className={`h-1.5 w-1.5 rounded-full bg-current ${active && (room.heating_on || room.cooling_on) ? 'animate-pulse' : ''}`} />
                        {status.label}
                        {room.is_boosting && <span className="opacity-70">· boost</span>}
                    </span>
                </div>

                {/* Runs the room outright: the API also switches the house on
                    and revives any parked unit, so one press is always enough.
                    Switching off releases this room only. */}
                <button
                    onClick={() => onRunRoom(room.id, !active)}
                    disabled={isPending}
                    aria-label={active ? `Switch ${room.name} off` : `Run ${room.name} now`}
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all active:scale-95 disabled:opacity-50 ${active ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-500'}`}
                >
                    <PowerSettingsNewIcon sx={{ fontSize: 26 }} />
                </button>
            </header>

            <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                    <p className="text-5xl font-light leading-none text-white">
                        {room.current_temp !== null ? room.current_temp.toFixed(1) : '--'}
                        <span className="text-2xl text-gray-400">°C</span>
                    </p>
                    <p className="mt-1.5 text-xs text-gray-500">
                        {room.temp_source === 'ac' ? 'from the unit' : 'room sensor'}
                        <span className={stale ? 'text-amber-600/80' : ''}> · {formatAge(room.current_temp_at)}</span>
                    </p>

                    {unitReadings.map((ac) => (
                        <p key={ac.id} className="mt-0.5 text-xs text-gray-600">
                            <span className="font-mono">{ac.calibrated_temp?.toFixed(1)}°C</span>
                            {' at '}
                            {units.length > 1 ? ac.name : 'the unit'}
                            <span className={isStale(ac.reported_at) ? 'text-amber-700/70' : ''}>
                                {' · '}{formatAge(ac.reported_at)}
                            </span>
                        </p>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setTarget(shownTarget - step)}
                        disabled={isPending || shownTarget <= min}
                        aria-label={`Lower ${room.name} target`}
                        className="h-12 w-12 rounded-xl bg-gray-700 text-2xl font-light text-white transition-all active:scale-95 hover:bg-gray-600 disabled:opacity-40"
                    >
                        −
                    </button>
                    <div className="w-16 text-center">
                        <span className="font-mono text-2xl text-white">{shownTarget}</span>
                        <span className="block text-[10px] uppercase tracking-wide text-gray-500">Target</span>
                    </div>
                    <button
                        onClick={() => setTarget(shownTarget + step)}
                        disabled={isPending || shownTarget >= max}
                        aria-label={`Raise ${room.name} target`}
                        className="h-12 w-12 rounded-xl bg-gray-700 text-2xl font-light text-white transition-all active:scale-95 hover:bg-gray-600 disabled:opacity-40"
                    >
                        +
                    </button>
                </div>
            </div>

            {byRemote.length > 0 && (
                <p className="mt-3 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">
                    {byRemote.length === units.length && units.length === 1
                        ? `Switched ${byRemote[0].manual_power ? 'on' : 'off'} by remote.`
                        : `${byRemote.length} of ${units.length} units switched by remote.`}
                    {' '}Left alone until you use the controls here.
                </p>
            )}

            {units.length > 0 && (
                <div className="mt-4">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">Mode</span>
                    <div className="mt-1.5 grid grid-cols-3 gap-2">
                        {MODE_CHOICES.map(({ value, label, hint }) => (
                            <button
                                key={label}
                                onClick={() => onUpdateRoom(room.id, { mode_override: value })}
                                disabled={isPending}
                                title={hint}
                                aria-pressed={room.mode_override === value}
                                className={`min-h-[2.75rem] rounded-xl border text-sm font-medium transition-all active:scale-95 disabled:opacity-50 ${room.mode_override === value
                                    ? 'border-blue-500/50 bg-blue-500/20 text-blue-300'
                                    : 'border-gray-700/60 bg-gray-900/40 text-gray-400 hover:bg-gray-700/40'}`}
                            >
                                {value === null && houseMode === 'heating' ? 'Heat' : value === null ? 'Cool' : label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-4">
                <span className="text-[10px] uppercase tracking-wide text-gray-500">Boost</span>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {room.is_boosting ? (
                        <button
                            onClick={() => onUpdateRoom(room.id, { hvac_until: 0 })}
                            disabled={isPending}
                            className="col-span-3 min-h-[2.75rem] rounded-xl bg-red-500/20 text-sm font-medium text-red-400 transition-all active:scale-95 hover:bg-red-500/30 disabled:opacity-50"
                        >
                            Cancel boost
                        </button>
                    ) : (
                        BOOSTS.map((mins) => (
                            <button
                                key={mins}
                                onClick={() => onUpdateRoom(room.id, { hvac_until: mins })}
                                disabled={isPending}
                                className="min-h-[2.75rem] rounded-xl border border-purple-500/40 bg-purple-500/15 text-sm font-medium text-purple-300 transition-all active:scale-95 hover:bg-purple-500/25 disabled:opacity-50"
                            >
                                {mins} min
                            </button>
                        ))
                    )}
                </div>
            </div>

            {units.length > 0 && (
                <>
                    <button
                        onClick={() => setShowUnits((open) => !open)}
                        aria-expanded={showUnits}
                        aria-label={`${showUnits ? 'Hide' : 'Show'} controls for ${summary.title}`}
                        className="mt-4 flex min-h-[2.75rem] w-full items-center justify-between gap-3 rounded-xl bg-gray-900/40 px-3 text-sm transition-all hover:bg-gray-900/70"
                    >
                        <span className="min-w-0 truncate text-gray-300">{summary.title}</span>
                        <span className="ml-auto shrink-0 text-xs text-gray-500">
                            {!unitsUsable
                                ? <span className="text-gray-600">idle in {houseMode === 'heating' ? 'heating' : 'cooling'}</span>
                                : <span className={summary.warn ? 'text-amber-500/80' : ''}>{summary.detail}</span>}
                        </span>
                        <ExpandMoreIcon
                            sx={{ fontSize: 22 }}
                            className={`shrink-0 text-gray-500 transition-transform ${showUnits ? 'rotate-180' : ''}`}
                        />
                    </button>

                    {showUnits && (
                        <div className="mt-2 flex flex-col gap-2">
                            {units.map((ac) => (
                                <AcUnitCard
                                    key={ac.id}
                                    ac={ac}
                                    isPending={pendingAcIds.includes(ac.id)}
                                    onUpdate={onUpdateAc}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
