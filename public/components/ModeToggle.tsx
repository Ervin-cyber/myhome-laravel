'use client';

import { Mode } from '@/types/types';
import { useEffect, useRef, useState } from 'react';
import SnowflakeIcon from './SnowflakeIcon';

interface ModeToggleProps {
    mode: Mode;
    onToggle: () => void;
    disabled?: boolean;
    hvacOn: boolean;
}

export default function ModeToggle({ mode, onToggle, disabled, hvacOn }: ModeToggleProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const isHeating = mode === 'heating';
    const nextLabel = isHeating ? 'Switch to Cooling' : 'Switch to Heating';
    const nextIcon = isHeating ? '❄️' : '🔥';

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
                aria-label={isHeating ? 'Switch to cooling mode' : 'Switch to heating mode'}
            >
                <span className="text-3xl leading-none">{isHeating ? '🔥' : <SnowflakeIcon isOn={hvacOn} />}</span>
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
                        <span className="mr-2">{nextIcon}</span>
                        {nextLabel}
                    </button>
                </div>
            )}
        </div>
    );
}
