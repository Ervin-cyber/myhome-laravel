import { StatsRange, StatsResponse } from '@/types/types';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Totals over a day or a week move by the minute at most, so this refreshes on
 * its own slower clock rather than riding the dashboard's fifteen-second poll.
 */
const REFRESH_MS = 60_000;

const RANGE_KEY = 'myhome.statsRange';

/** Per device, and only a convenience: unreadable storage means "24h". */
function storedRange(): StatsRange {
    try {
        return window.localStorage.getItem(RANGE_KEY) === '7d' ? '7d' : '24h';
    } catch {
        return '24h';
    }
}

export function useRoomStats() {
    const [range, setRangeState] = useState<StatsRange>('24h');
    const [stats, setStats] = useState<StatsResponse | null>(null);
    const [failed, setFailed] = useState(false);
    const rangeRef = useRef<StatsRange>('24h');

    // Read after mount rather than in the initial state, so the server render
    // and the first client render agree.
    useEffect(() => {
        setRangeState(storedRange());
    }, []);

    const load = useCallback(async (which: StatsRange) => {
        try {
            const res = await fetch(`/proxy/api/stats?range=${which}`);
            if (!res.ok) throw new Error(`stats returned ${res.status}`);
            const body: StatsResponse = await res.json();
            // A slow answer for the range just switched away from must not
            // overwrite the one now asked for.
            if (which === rangeRef.current) {
                setStats(body);
                setFailed(false);
            }
        } catch (error) {
            console.error('Could not load stats', error);
            if (which === rangeRef.current) setFailed(true);
        }
    }, []);

    useEffect(() => {
        rangeRef.current = range;
        load(range);

        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') load(range);
        }, REFRESH_MS);

        return () => clearInterval(timer);
    }, [range, load]);

    const setRange = useCallback((next: StatsRange) => {
        setRangeState(next);
        try {
            window.localStorage.setItem(RANGE_KEY, next);
        } catch {
            // Remembering the choice is a nicety; the switch still works.
        }
    }, []);

    // Stats for the range on screen only: a switch shows the loading state
    // rather than last range's figures under the new range's label.
    return { range, setRange, stats: stats?.range === range ? stats : null, failed };
}
