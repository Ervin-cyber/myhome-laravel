"use client";

import { JSX } from 'react';
import { AirConditioner, FAN_SPEEDS, FanSpeed, SettableField, SWING_HORIZONTAL, SWING_VERTICAL, SwingHorizontal, SwingVertical } from '@/types/types';
import { formatAge, isStale } from '@/lib/utils';
import ACUnitIcon from './ACUnitIcon';

interface Props {
    ac: AirConditioner;
    isPending: boolean;
    onUpdate: (acId: number, body: Partial<AirConditioner>) => void;
}

const selectClass = 'min-h-[2.75rem] w-full rounded-lg bg-gray-900/60 px-2 text-sm text-white border border-gray-700/60 disabled:opacity-50';

/**
 * Quiet and turbo are one setting at the unit, not two flags: it holds at most
 * one of them, and either overrides the fan speed. Presenting them as a single
 * three-way choice is the only shape that cannot express a state the hardware
 * refuses.
 */
const FAN_PROFILES = [
    { key: 'normal', label: 'Normal', body: { quiet: false, turbo: false } },
    { key: 'quiet', label: 'Quiet', body: { quiet: true, turbo: false } },
    { key: 'turbo', label: 'Turbo', body: { quiet: false, turbo: true } },
] as const;

export default function AcUnitCard({ ac, isPending, onUpdate }: Props): JSX.Element {
    const running = ac.online && ac.power_on;
    const stale = isStale(ac.reported_at);

    // Everything else on this card is what we asked for. This is what the unit
    // answered, and the two parting company is how a command lost to the IR
    // remote or a dropped packet finally becomes visible.
    const drifted = ac.observed_power !== null && ac.observed_power !== ac.power_on;

    // Following the remote is not a fault and must not be dressed as one: the
    // unit is doing what somebody asked, and the system has agreed to let it.
    const status = ac.following_remote
        ? { label: ac.manual_power ? 'On by remote' : 'Off by remote', tone: 'bg-violet-500/20 text-violet-300' }
        : drifted
            ? { label: ac.observed_power ? 'On at the unit' : 'Off at the unit', tone: 'bg-amber-500/20 text-amber-300' }
            : running
                ? { label: 'Running', tone: 'bg-blue-500/20 text-blue-300' }
                : ac.enabled
                    ? { label: 'Idle', tone: 'bg-gray-700/50 text-gray-400' }
                    : { label: 'Parked', tone: 'bg-amber-500/20 text-amber-300' };

    const profile = ac.turbo ? 'turbo' : ac.quiet ? 'quiet' : 'normal';

    // The unit decides its own speed under either, and silently drops whatever
    // we send. Better to say so than to offer a control that does nothing.
    const fanSpeedLocked = ac.quiet || ac.turbo;

    /**
     * Flags a setting the unit is not actually holding.
     *
     * Deliberately not worded as a failure. Before the settle window is up the
     * command may simply still be travelling; after it, the cause could equally
     * be a lost command or somebody at the handset, and this cannot tell those
     * apart. "Not applied" is the part that is true either way, and the Pi goes
     * on re-asserting, so it can still clear itself.
     */
    const note = (field: SettableField) => {
        if (!(field in ac.divergence)) return null;

        return ac.divergence_settled
            ? <span className="ml-1 normal-case text-amber-500/90">not applied</span>
            : <span className="ml-1 normal-case text-gray-500">sending…</span>;
    };

    return (
        <div className={`rounded-xl border border-gray-700/50 bg-gray-900/40 p-3 ${ac.online ? '' : 'opacity-60'}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <ACUnitIcon size={20} isOn={running} />
                    <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{ac.name}</p>
                        {/* The unit's own sensor, always with its age: a Gree stops
                            reporting the moment it powers off, so a bare number here
                            would keep looking live long after it stopped being true. */}
                        {ac.calibrated_temp !== null ? (
                            <p className="text-xs text-gray-500">
                                <span className={`font-mono ${stale ? 'text-gray-600' : 'text-gray-400'}`}>
                                    {ac.calibrated_temp.toFixed(1)}°C
                                </span>
                                <span className={stale ? 'text-amber-600/80' : ''}> · {formatAge(ac.reported_at)}</span>
                            </p>
                        ) : (
                            <p className="truncate font-mono text-xs text-gray-600">{ac.ip}</p>
                        )}
                    </div>
                </div>

                {/* Status, not a control. A unit in a room is part of that room,
                    and three identical power glyphs meaning three different
                    things was the whole problem. `enabled` is still enforced by
                    the API; the room's own switch is what revives a parked unit. */}
                <span
                    title={drifted ? 'The unit disagrees with what it was told. It will be commanded again shortly.' : undefined}
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${status.tone}`}
                >
                    {status.label}
                </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">
                        Fan
                        {fanSpeedLocked
                            ? <span className="ml-1 normal-case text-amber-500/80">set by {profile}</span>
                            : note('fan_speed')}
                    </span>
                    <select
                        value={ac.fan_speed}
                        onChange={(e) => onUpdate(ac.id, { fan_speed: e.target.value as FanSpeed })}
                        disabled={isPending || !ac.online || fanSpeedLocked}
                        aria-label={`Fan speed for ${ac.name}`}
                        className={selectClass}
                    >
                        {FAN_SPEEDS.map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </label>

                <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">Up / down{note('swing_vertical')}</span>
                    <select
                        value={ac.swing_vertical}
                        onChange={(e) => onUpdate(ac.id, { swing_vertical: e.target.value as SwingVertical })}
                        disabled={isPending || !ac.online}
                        aria-label={`Vertical airflow for ${ac.name}`}
                        className={selectClass}
                    >
                        {SWING_VERTICAL.map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </label>

                <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">Left / right{note('swing_horizontal')}</span>
                    <select
                        value={ac.swing_horizontal}
                        onChange={(e) => onUpdate(ac.id, { swing_horizontal: e.target.value as SwingHorizontal })}
                        disabled={isPending || !ac.online}
                        aria-label={`Horizontal airflow for ${ac.name}`}
                        className={selectClass}
                    >
                        {SWING_HORIZONTAL.map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </label>

                <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">Coil dry{note('xfan')}</span>
                    <button
                        onClick={() => onUpdate(ac.id, { xfan: !ac.xfan })}
                        disabled={isPending || !ac.online}
                        aria-pressed={ac.xfan}
                        title="Runs the fan on after cooling so the coil dries instead of growing mould"
                        className={`min-h-[2.75rem] rounded-lg border text-sm transition-all active:scale-95 disabled:opacity-50 ${ac.xfan ? 'border-teal-500/50 bg-teal-500/20 text-teal-300' : 'border-gray-700/60 bg-gray-900/60 text-gray-500'}`}
                    >
                        {ac.xfan ? 'X-Fan on' : 'X-Fan off'}
                    </button>
                </label>
            </div>

            <div className="mt-2">
                <span className="text-[10px] uppercase tracking-wide text-gray-500">
                    Fan profile{note('quiet') ?? note('turbo')}
                </span>
                <div className="mt-1 grid grid-cols-3 gap-2">
                    {FAN_PROFILES.map(({ key, label, body }) => (
                        <button
                            key={key}
                            onClick={() => onUpdate(ac.id, body)}
                            disabled={isPending || !ac.online}
                            aria-pressed={profile === key}
                            className={`min-h-[2.75rem] rounded-lg border text-sm transition-all active:scale-95 disabled:opacity-50 ${profile === key
                                ? 'border-blue-500/50 bg-blue-500/20 text-blue-300'
                                : 'border-gray-700/60 bg-gray-900/60 text-gray-500 hover:bg-gray-700/40'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {!ac.online && (
                <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-wider text-gray-500">Offline</p>
            )}
        </div>
    );
}
