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

type RoomDisplayKey = 'show_on_dashboard' | 'show_stats';

const ROOM_SWITCHES: { key: RoomDisplayKey; label: string; where: string }[] = [
    { key: 'show_on_dashboard', label: 'Dashboard', where: 'on the dashboard' },
    { key: 'show_stats', label: 'Stats', where: 'in the stats' },
];

/**
 * Where each room appears. The stats switch is display only; hiding a room
 * from the dashboard also switches it off, which is why that one asks first.
 */
function RoomsSettings(): JSX.Element {
    const { showNotification } = useNotification();
    const [rooms, setRooms] = useState<Room[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    // Hiding switches the room off, so it asks first; showing does not.
    const [hiding, setHiding] = useState<number | null>(null);

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

    const toggle = async (room: Room, key: RoomDisplayKey, confirmed = false) => {
        // `!== false`: a room from an API that predates a column counts as shown.
        const next = !(room[key] !== false);

        if (key === 'show_on_dashboard' && !next && !confirmed) {
            setHiding(room.id);
            return;
        }

        setHiding(null);
        const id = `${room.id}:${key}`;
        setBusy(id);
        try {
            const res = await fetch(`/proxy/api/rooms/${room.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: next }),
            });
            if (!res.ok) {
                showNotification(await failureMessage(res, 'Could not change the setting'), 'error');
                return;
            }
            // The server's copy, since hiding also switched the room off.
            const saved: Room = await res.json();
            setRooms((prev) => prev?.map((r) => (r.id === room.id ? saved : r)) ?? prev);
        } catch (error) {
            console.error(error);
            showNotification('Could not change the setting', 'error');
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="rounded-2xl border border-gray-700/50 bg-gray-800/50 p-4 backdrop-blur">
            <h2 className="text-sm font-medium uppercase tracking-wide text-gray-400">Rooms</h2>
            <p className="mt-1 text-xs text-gray-500">
                Where each room appears. Hiding a room switches it off; showing it again leaves it off until you start it.
                Its run times are recorded either way.
            </p>

            {rooms === null ? (
                <p className="mt-3 text-sm text-gray-500">Loading…</p>
            ) : (
                <div className="mt-3 flex flex-col gap-2">
                    {rooms.map((room) => (
                        <div
                            key={room.id}
                            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-gray-700/60 bg-gray-900/40 px-4 py-2"
                        >
                            <span className="min-w-0 truncate text-sm font-medium text-white">{room.name}</span>
                            <div className="flex shrink-0 gap-2">
                                {ROOM_SWITCHES.map(({ key, label, where }) => {
                                    const on = room[key] !== false;

                                    return (
                                        <button
                                            key={key}
                                            onClick={() => toggle(room, key)}
                                            disabled={busy === `${room.id}:${key}`}
                                            role="switch"
                                            aria-checked={on}
                                            aria-label={`Show ${room.name} ${where}`}
                                            className="flex min-h-[2.75rem] items-center gap-2 rounded-lg px-2 text-xs text-gray-400 transition-all hover:bg-gray-700/40 disabled:opacity-50"
                                        >
                                            {label}
                                            <Switch on={on} />
                                        </button>
                                    );
                                })}
                            </div>

                            {hiding === room.id && (
                                <div className={`w-full rounded-lg border p-3 text-sm ${room.drives_boiler
                                    ? 'border-red-500/40 bg-red-500/10 text-red-100'
                                    : 'border-amber-500/40 bg-amber-500/10 text-amber-100'}`}
                                >
                                    {/* The reference room is what the boiler
                                        answers to, so switching it off stops
                                        the radiators everywhere, not just here. */}
                                    <p>
                                        {room.drives_boiler
                                            ? `${room.name} controls the boiler. Hiding switches it off, and the radiators in every room stop with it.`
                                            : `Hiding ${room.name} switches it off and cancels any boost.`}
                                    </p>
                                    <div className="mt-3 flex gap-2">
                                        <button
                                            onClick={() => toggle(room, 'show_on_dashboard', true)}
                                            disabled={busy !== null}
                                            className={`min-h-[2.75rem] flex-1 rounded-lg font-medium transition-all disabled:opacity-50 ${room.drives_boiler
                                                ? 'bg-red-500/30 text-red-100 hover:bg-red-500/40'
                                                : 'bg-amber-500/30 text-amber-100 hover:bg-amber-500/40'}`}
                                        >
                                            Hide and switch off
                                        </button>
                                        <button
                                            onClick={() => setHiding(null)}
                                            disabled={busy !== null}
                                            className="min-h-[2.75rem] flex-1 rounded-lg bg-gray-700/60 text-gray-300 transition-all hover:bg-gray-600/60 disabled:opacity-50"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
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
                        <RoomsSettings />
                        <UserAdmin currentUserId={user.id} />
                    </>
                )}
            </div>
        </div>
    );
}
