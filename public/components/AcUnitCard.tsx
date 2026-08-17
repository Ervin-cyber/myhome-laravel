"use client";

import { JSX } from 'react';
import { AirConditioner, FAN_SPEEDS, FanSpeed, SWING_HORIZONTAL, SWING_VERTICAL, SwingHorizontal, SwingVertical } from '@/types/types';
import { formatAge, isStale } from '@/lib/utils';
import ACUnitIcon from './ACUnitIcon';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';

interface Props {
    ac: AirConditioner;
    isPending: boolean;
    onUpdate: (acId: number, body: Partial<AirConditioner>) => void;
}

const selectClass = 'min-h-[2.75rem] w-full rounded-lg bg-gray-900/60 px-2 text-sm text-white border border-gray-700/60 disabled:opacity-50';

export default function AcUnitCard({ ac, isPending, onUpdate }: Props): JSX.Element {
    const running = ac.online && ac.power_on;
    const stale = isStale(ac.reported_at);

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

                <button
                    onClick={() => onUpdate(ac.id, { enabled: !ac.enabled })}
                    disabled={isPending || !ac.online}
                    aria-label={ac.enabled ? `Disable ${ac.name}` : `Enable ${ac.name}`}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all active:scale-95 disabled:opacity-50 ${ac.enabled ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-500'}`}
                >
                    <PowerSettingsNewIcon sx={{ fontSize: 20 }} />
                </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">Fan</span>
                    <select
                        value={ac.fan_speed}
                        onChange={(e) => onUpdate(ac.id, { fan_speed: e.target.value as FanSpeed })}
                        disabled={isPending || !ac.online}
                        aria-label={`Fan speed for ${ac.name}`}
                        className={selectClass}
                    >
                        {FAN_SPEEDS.map(({ value, label }) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </label>

                <label className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">Up / down</span>
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
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">Left / right</span>
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
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">Coil dry</span>
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

            {!ac.online && (
                <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-wider text-gray-500">Offline</p>
            )}
        </div>
    );
}
