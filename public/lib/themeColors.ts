import { Mode } from '@/types/types';

export const getThemeColors = (mode: Mode) => {
    if (mode === 'heating') {
        return {
            primary: '#f97316',      // Orange
            secondary: '#dc2626',    // Red
            light: '#fbbf24',        // Amber
            glow: 'rgba(249, 115, 22, 0.5)',
            gradient: 'from-orange-500 to-red-500',
            text: 'text-orange-400',
            border: 'border-orange-500',
            bg: 'bg-orange-500',
            icon: '🔥',
            shadowColor: 'shadow-orange-500',
        };
    } else {
        return {
            primary: '#3b82f6',      // Blue
            secondary: '#2563eb',    // Blue darker
            light: '#60a5fa',        // Blue lighter
            glow: 'rgba(59, 130, 246, 0.5)',
            gradient: 'from-blue-500 to-cyan-500',
            text: 'text-blue-400',
            border: 'border-blue-500',
            bg: 'bg-blue-500',
            icon: '❄️',
            shadowColor: 'shadow-blue-500',
        };
    }
};
