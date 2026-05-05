'use client';

import { Mode } from '@/types/types';
import { useEffect, useRef, useState } from 'react';
import SnowflakeIcon from './SnowflakeIcon';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';

interface ModeToggleProps {
    mode: Mode;
    onChangeMode: (newMode: Mode) => void;
    disabled?: boolean;
    hvacOn: boolean;
}

export default function ModeToggle({ mode, onChangeMode, disabled, hvacOn }: ModeToggleProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const getModeConfig = (m: Mode, isCurrent: boolean) => {
        switch (m) {
            case 'heating':
                return { icon: <span className={isCurrent ? "text-3xl" : "text-xl"}>🔥</span>, label: 'Heating' };
            case 'cooling':
                return { icon: <SnowflakeIcon isOn={hvacOn && isCurrent} size={isCurrent ? 32 : 24} />, label: 'Cooling' };
            case 'off':
                return { icon: <PowerSettingsNewIcon className={isCurrent ? "text-3xl" : "text-xl"} />, label: 'Off' };
            default:
                return { icon: '?', label: 'Unknown' };
        }
    };

    const currentConfig = getModeConfig(mode, true);
    const modes: Mode[] = ['heating', 'cooling', 'off'];

    useEffect(() => {
        if (!open) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    return (
        <div ref={containerRef} className="relative inline-flex">
            <button
                type="button"
                onClick={() => setOpen(prev => !prev)}
                disabled={disabled}
                className={`relative z-10 flex items-center justify-center rounded-2xl w-14 h-14 transition-all duration-300 shadow-xl ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-600' : 'cursor-pointer bg-gray-700 hover:bg-gray-600'}`}
                aria-label={`Current mode: ${currentConfig.label}. Click to change.`}
            >
                <span className="text-3xl leading-none flex items-center justify-center">{currentConfig.icon}</span>
            </button>

            {open && !disabled && (
                <div className="absolute left-0 top-full mt-2 w-48 rounded-2xl border border-slate-700/80 bg-slate-950/95 shadow-2xl backdrop-blur-sm z-50 overflow-hidden">
                    {modes.filter(m => m !== mode).map((m) => {
                        const config = getModeConfig(m, false);
                        return (
                            <button
                                key={m}
                                type="button"
                                onClick={() => {
                                    setOpen(false);
                                    onChangeMode(m);
                                }}
                                className="w-full px-4 py-3 text-left text-sm text-white transition-colors duration-200 hover:bg-slate-800 flex items-center gap-3"
                            >
                                <span className="inline-flex items-center justify-center w-8 h-8 opacity-70">{config.icon}</span>
                                <span className="capitalize">{m}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
