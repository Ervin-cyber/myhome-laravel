export const getHoursFromSeconds = (seconds: number) => {
    return Math.floor(seconds / 3600);
}

export const getMinutesFromSeconds = (seconds: number) => {
    return Math.floor((seconds % 3600) / 60);
}

export const formatTime = (date?: Date | null | undefined) => {
    if (!date) return '--:--:--';
    return date?.toLocaleTimeString('ro-RO', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    })
}
export const formatDate = (date?: Date | null | undefined) => {
    if (!date) return '--.--.----';
    return date?.toLocaleDateString('ro-RO');
}

/**
 * How long ago a reading was taken, in words.
 *
 * A Gree unit stops reporting the moment it powers off, so its temperature can
 * be hours stale while still looking like a live number. Every reading shown in
 * the UI carries its age for that reason.
 */
export const formatAge = (timestamp?: string | null): string => {
    if (!timestamp) return 'never';

    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);

    if (!Number.isFinite(seconds)) return 'never';
    if (seconds < 0) return 'just now';
    if (seconds < 45) return 'just now';
    if (seconds < 90) return 'a minute ago';
    if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
    if (seconds < 7200) return 'an hour ago';
    if (seconds < 86400) return `${Math.round(seconds / 3600)} hours ago`;

    return `${Math.round(seconds / 86400)} days ago`;
}

/**
 * A length of time, in the largest unit that still reads naturally.
 *
 * For durations the API already worked out (`silent_for`), where formatAge
 * would need a timestamp it does not have. Minutes alone turned three weeks of
 * a unit being switched off into "32000 minutes".
 */
export const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) return `${minutes} min`;
    if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} h`;

    return `${Math.floor(minutes / (24 * 60))} days`;
}

/** A runtime total: "4h 05m", or "35m" under an hour. */
export const formatRuntime = (seconds: number): string => {
    const h = getHoursFromSeconds(seconds);
    const m = getMinutesFromSeconds(seconds);

    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Readings older than this are shown as stale rather than current. */
export const STALE_AFTER_SECONDS = 600;

export const isStale = (timestamp?: string | null): boolean => {
    if (!timestamp) return true;

    return (Date.now() - new Date(timestamp).getTime()) / 1000 > STALE_AFTER_SECONDS;
}