"use client";

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Link from 'next/link';
import { JSX, useCallback, useEffect, useState } from 'react';
import { useNotification } from '@/context/NotificationContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { failureMessage } from '@/lib/api';
import { Mode, Room } from '@/types/types';
import LoadingSpinner from './LoadingSpinner';
import UserAdmin from './UserAdmin';

const SEASONS: { mode: Mode; label: string; hint: string; tone: string }[] = [
    {
        mode: 'heating',
        label: 'Winter',
        hint: 'Heating. Radiator rooms hide their air conditioners.',
        tone: 'border-orange-500/50 bg-orange-500/20 text-orange-200',
    },
    {
        mode: 'cooling',
        label: 'Summer',
        hint: 'Cooling. The boiler stays off.',
        tone: 'border-blue-500/50 bg-blue-500/20 text-blue-200',
    },
];

/** The track and knob only; the button around it carries role="switch". */
function Switch({ on }: { on: boolean }): JSX.Element {
    return (
        <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-blue-500/70' : 'bg-gray-600'}`}>
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-6' : 'left-1'}`} />
        </span>
    );
}

type DisplayKey = 'show_air_conditioners' | 'show_power_usage';

/** What the dashboard shows. None of these change what the house does. */
const DISPLAY_SETTINGS: { key: DisplayKey; label: string; hint: string }[] = [
    {
        key: 'show_air_conditioners',
        label: 'Show air conditioners',
        hint: 'Their controls and warnings. Hiding them changes the view only; they keep running as set.',
    },
    {
        key: 'show_power_usage',
        label: 'Show power use',
        hint: 'The smart plugs’ wattage, and whether it matches what the units were asked to do.',
    },
];

function Season(): JSX.Element {
    const { showNotification } = useNotification();
    const [mode, setMode] = useState<Mode | null>(null);
    const [display, setDisplay] = useState<Record<DisplayKey, boolean>>({
        show_air_conditioners: true,
        show_power_usage: true,
    });
    const [asking, setAsking] = useState<Mode | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/proxy/api/state');
            if (!res.ok) throw new Error(`state returned ${res.status}`);
            const state = await res.json();
            setMode(state?.mode === 'cooling' ? 'cooling' : 'heating');
            setDisplay({
                show_air_conditioners: state?.show_air_conditioners ?? true,
                show_power_usage: state?.show_power_usage ?? true,
            });
        } catch (error) {
            console.error(error);
            showNotification('Could not load the current season', 'error');
        }
    }, [showNotification]);

    useEffect(() => {
        load();
    }, [load]);

    // Two steps on purpose: this page exists so the season is not one stray
    // tap away, and a single button here would only move the stray tap.
    const confirm = async (next: Mode) => {
        setSaving(true);
        try {
            const res = await fetch('/proxy/api/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: next }),
            });
            if (!res.ok) {
                showNotification(await failureMessage(res, 'Could not change the season'), 'error');
                return;
            }
            setMode(next);
            setAsking(null);
            showNotification(`Switched to ${next === 'heating' ? 'winter' : 'summer'}`, 'success');
        } catch (error) {
            console.error(error);
            showNotification('Could not change the season', 'error');
        } finally {
            setSaving(false);
        }
    };

    // One tap, unlike the season: it changes what the dashboard shows and
    // nothing the house does, so a mistake costs a second tap to undo.
    const toggle = async (key: DisplayKey) => {
        const next = !display[key];
        setSaving(true);
        try {
            const res = await fetch('/proxy/api/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: next }),
            });
            if (!res.ok) {
                showNotification(await failureMessage(res, 'Could not change the setting'), 'error');
                return;
            }
            setDisplay((prev) => ({ ...prev, [key]: next }));
        } catch (error) {
            console.error(error);
            showNotification('Could not change the setting', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
        <section className="rounded-2xl border border-gray-700/50 bg-gray-800/50 p-4 backdrop-blur">
            <h2 className="text-sm font-medium uppercase tracking-wide text-gray-400">Season</h2>

            {mode === null ? (
                <p className="mt-3 text-sm text-gray-500">Loading…</p>
            ) : (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {SEASONS.map((season) => {
                        const current = season.mode === mode;

                        return (
                            <button
                                key={season.mode}
                                onClick={() => setAsking(current ? null : season.mode)}
                                disabled={saving}
                                aria-pressed={current}
                                className={`min-h-[4rem] rounded-xl border px-4 py-3 text-left transition-all disabled:opacity-50 ${current
                                    ? season.tone
                                    : 'border-gray-700/60 bg-gray-900/40 text-gray-400 hover:bg-gray-700/40'}`}
                            >
                                <span className="block text-base font-medium">
                                    {season.label}
                                    {current && <span className="ml-2 text-xs opacity-70">current</span>}
                                </span>
                                <span className="block text-xs opacity-70">{season.hint}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {asking && (
                <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                    <p>
                        Switch the whole house to {asking === 'heating' ? 'winter' : 'summer'}? Every unit is told
                        straight away, and anything switched by remote is taken back.
                    </p>
                    <div className="mt-3 flex gap-2">
                        <button
                            onClick={() => confirm(asking)}
                            disabled={saving}
                            className="min-h-[2.75rem] flex-1 rounded-xl bg-amber-500/30 font-medium text-amber-100 transition-all hover:bg-amber-500/40 disabled:opacity-50"
                        >
                            {saving ? 'Switching…' : 'Switch'}
                        </button>
                        <button
                            onClick={() => setAsking(null)}
                            disabled={saving}
                            className="min-h-[2.75rem] flex-1 rounded-xl bg-gray-700/60 text-gray-300 transition-all hover:bg-gray-600/60 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </section>

        <section className="rounded-2xl border border-gray-700/50 bg-gray-800/50 p-4 backdrop-blur">
            <h2 className="text-sm font-medium uppercase tracking-wide text-gray-400">Dashboard</h2>
            <div className="mt-3 flex flex-col gap-2">
                {DISPLAY_SETTINGS.map(({ key, label, hint }) => (
                    <button
                        key={key}
                        onClick={() => toggle(key)}
                        disabled={saving || mode === null}
                        role="switch"
                        aria-checked={display[key]}
                        className="flex min-h-[3.5rem] w-full items-center justify-between gap-3 rounded-xl border border-gray-700/60 bg-gray-900/40 px-4 py-3 text-left transition-all hover:bg-gray-700/40 disabled:opacity-50"
                    >
                        <span className="min-w-0">
                            <span className="block text-sm font-medium text-white">{label}</span>
                            <span className="block text-xs text-gray-500">{hint}</span>
                        </span>
                        <Switch on={display[key]} />
                    </button>
                ))}
            </div>
        </section>
        </>
    );
}

/** Which rooms the dashboard's stats section lists. */
function StatsRooms(): JSX.Element {
    const { showNotification } = useNotification();
    const [rooms, setRooms] = useState<Room[] | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;

        fetch('/proxy/api/rooms')
            .then((res) => {
                if (!res.ok) throw new Error(`rooms returned ${res.status}`);
                return res.json();
            })
            .then((list: Room[]) => {
                if (!cancelled) setRooms(list);
            })
            .catch((error) => {
                console.error(error);
                if (!cancelled) showNotification('Could not load the rooms', 'error');
            });

        return () => {
            cancelled = true;
        };
    }, [showNotification]);

    const toggle = async (room: Room) => {
        const next = !room.show_stats;
        setBusyId(room.id);
        try {
            const res = await fetch(`/proxy/api/rooms/${room.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ show_stats: next }),
            });
            if (!res.ok) {
                showNotification(await failureMessage(res, 'Could not change the setting'), 'error');
                return;
            }
            setRooms((prev) => prev?.map((r) => (r.id === room.id ? { ...r, show_stats: next } : r)) ?? prev);
        } catch (error) {
            console.error(error);
            showNotification('Could not change the setting', 'error');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <section className="rounded-2xl border border-gray-700/50 bg-gray-800/50 p-4 backdrop-blur">
            <h2 className="text-sm font-medium uppercase tracking-wide text-gray-400">Stats</h2>
            <p className="mt-1 text-xs text-gray-500">Rooms listed in the dashboard&apos;s stats. Run times are recorded for every room either way.</p>

            {rooms === null ? (
                <p className="mt-3 text-sm text-gray-500">Loading…</p>
            ) : (
                <div className="mt-3 flex flex-col gap-2">
                    {rooms.map((room) => (
                        <button
                            key={room.id}
                            onClick={() => toggle(room)}
                            disabled={busyId === room.id}
                            role="switch"
                            aria-checked={room.show_stats}
                            className="flex min-h-[3rem] w-full items-center justify-between gap-3 rounded-xl border border-gray-700/60 bg-gray-900/40 px-4 py-2 text-left transition-all hover:bg-gray-700/40 disabled:opacity-50"
                        >
                            <span className="truncate text-sm font-medium text-white">{room.name}</span>
                            <Switch on={room.show_stats} />
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}

export default function Settings(): JSX.Element {
    const { user, failed, isAdmin } = useCurrentUser();

    return (
        <div className="min-h-[100dvh] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-8">
            <div className="mx-auto flex max-w-3xl flex-col gap-3">
                <header className="flex items-center gap-3">
                    <Link
                        href="/dashboard"
                        aria-label="Back to the dashboard"
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-700/50 text-gray-300 transition-all hover:bg-gray-600/50"
                    >
                        <ArrowBackIcon />
                    </Link>
                    <h1 className="text-xl font-bold text-white md:text-2xl">Settings</h1>
                </header>

                {failed ? (
                    <p className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
                        Could not check who is signed in. Try reloading the page.
                    </p>
                ) : !user ? (
                    <div className="flex justify-center p-8"><LoadingSpinner /></div>
                ) : !isAdmin ? (
                    <p className="rounded-2xl border border-gray-700/50 bg-gray-800/50 p-4 text-sm text-gray-400">
                        Only an admin can change these settings.
                    </p>
                ) : (
                    <>
                        <Season />
                        <StatsRooms />
                        <UserAdmin currentUserId={user.id} />
                    </>
                )}
            </div>
        </div>
    );
}
