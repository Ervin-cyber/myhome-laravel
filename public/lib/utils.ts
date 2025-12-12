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