'use client';

import { Mode } from '@/types/types';

interface ModeToggleProps {
    mode: Mode;
    onToggle: () => void;
    disabled?: boolean;
}

export default function ModeToggle({ mode, onToggle, disabled }: ModeToggleProps) {
    const isHeating = mode === 'heating';
    
    return (
        <button
            onClick={onToggle}
            disabled={disabled}
            className={`
                relative w-32 h-12 rounded-full transition-all duration-300 
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-xl'}
                ${isHeating 
                    ? 'bg-gradient-to-r from-orange-500 to-red-500' 
                    : 'bg-gradient-to-r from-blue-500 to-cyan-500'
                }
                shadow-lg
            `}
        >
            <div className={`
                absolute top-1 h-10 w-10 rounded-full bg-white shadow-md
                transition-all duration-300 flex items-center justify-center
                ${isHeating ? 'left-1' : 'left-[calc(100%-2.75rem)]'}
            `}>
                {isHeating ? (
                    <span className="text-2xl">🔥</span>
                ) : (
                    <span className="text-2xl">❄️</span>
                )}
            </div>
            
            <div className="absolute inset-0 flex items-center justify-center">
                <span className={`
                    font-semibold text-sm text-white transition-all duration-300
                    ${isHeating ? 'ml-8' : 'mr-8'}
                `}>
                    {isHeating ? 'Fűtés' : 'Hűtés'}
                </span>
            </div>
        </button>
    );
}
