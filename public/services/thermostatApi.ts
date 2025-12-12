import { Stat } from "@/types/types";

export const fetchStats = async (): Promise<Stat> => {
    const res = await fetch('/proxy/api/stats');
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
};

export const fetchLatestData = async () => {
    const [tempResult, stateResult] = await Promise.all([
        fetch('/proxy/api/temperature-latest'),
        fetch('/proxy/api/state')
    ]);

    const temp = tempResult.ok ? await tempResult.json() : null;
    const state = stateResult.ok ? await stateResult.json() : null;

    return { temp, state };
};

export const updateState = async (targetTemp: number, heatingUntil: number) => {
    const res = await fetch('/proxy/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ "target_temp": targetTemp, "heating_until": heatingUntil }),
    });
    if (!res.ok) throw new Error('Failed to save state');
    return res.json();
};