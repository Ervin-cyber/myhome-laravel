'use client';

import { Mode } from '@/types/types';
import { useEffect, useRef, useState } from 'react';
import SnowflakeIcon from './SnowflakeIcon';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';

interface ModeToggleProps {
    mode: Mode;
    onToggle: () => void;
    disabled?: boolean;
    hvacOn: boolean;
}

export default function ModeToggle({ mode, onToggle, disabled, hvacOn }: ModeToggleProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const getModeConfig = (m: Mode) => {
        switch (m) {
            case 'heating':
                return { icon: '🔥', label: 'Heating', nextLabel: 'Switch to Cooling', nextIcon: '❄️' };
            case 'cooling':
                return { icon: <SnowflakeIcon isOn={hvacOn} />, label: 'Cooling', nextLabel: 'Switch to Off', nextIcon: <PowerSettingsNewIcon className="text-xl" /> };
            case 'off':
                return { icon: <PowerSettingsNewIcon className="text-3xl" />, label: 'Off', nextLabel: 'Switch to Heating', nextIcon: '🔥' };
            default:
                return { icon: '?', label: 'Unknown', nextLabel: 'Reset', nextIcon: '🔥' };
        }
    };

    const currentConfig = getModeConfig(mode);

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
                <div className="absolute left-0 top-full mt-2 w-44 rounded-2xl border border-slate-700/80 bg-slate-950/95 shadow-2xl backdrop-blur-sm z-50">
                    <button
                        type="button"
                        onClick={() => {
                            setOpen(false);
                            onToggle();
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-white transition-colors duration-200 hover:bg-slate-800"
                    >
                        <span className="mr-2 inline-flex items-center align-middle">{currentConfig.nextIcon}</span>
                        <span className="align-middle">{currentConfig.nextLabel}</span>
                    </button>
                </div>
            )}
        </div>
    );
}
