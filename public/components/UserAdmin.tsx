"use client";

import { JSX, useCallback, useEffect, useState } from 'react';
import { useNotification } from '@/context/NotificationContext';
import { failureMessage } from '@/lib/api';
import { Role, User } from '@/types/types';

const ENDPOINT = '/proxy/api/admin/users';

const inputClass = 'min-h-[2.75rem] w-full rounded-lg border border-gray-700/60 bg-gray-900/60 px-3 text-sm text-white placeholder:text-gray-600 disabled:opacity-50';

const EMPTY_FORM = { name: '', email: '', password: '', role: 'member' as Role };

interface Props {
    currentUserId: number;
}

export default function UserAdmin({ currentUserId }: Props): JSX.Element {
    const { showNotification } = useNotification();
    const [users, setUsers] = useState<User[] | null>(null);
    const [busyId, setBusyId] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState(EMPTY_FORM);
    // One row open at a time, for a password reset or a delete confirmation.
    const [open, setOpen] = useState<{ id: number; action: 'password' | 'delete' } | null>(null);
    const [password, setPassword] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await fetch(ENDPOINT);
            if (!res.ok) throw new Error(`users returned ${res.status}`);
            setUsers(await res.json());
        } catch (error) {
            console.error(error);
            showNotification('Could not load the users', 'error');
        }
    }, [showNotification]);

    useEffect(() => {
        load();
    }, [load]);

    const send = async (id: number | 'new', url: string, method: string, body: object | null, fallback: string) => {
        setBusyId(id);
        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                ...(body ? { body: JSON.stringify(body) } : {}),
            });
            if (!res.ok) {
                showNotification(await failureMessage(res, fallback), 'error');
                return false;
            }
            await load();
            return true;
        } catch (error) {
            console.error(error);
            showNotification(fallback, 'error');
            return false;
        } finally {
            setBusyId(null);
        }
    };

    const add = async (e: React.FormEvent) => {
        e.preventDefault();
        if (await send('new', ENDPOINT, 'POST', form, 'Could not add the user')) {
            setForm(EMPTY_FORM);
            showNotification('User added', 'success');
        }
    };

    const setRole = (user: User, role: Role) =>
        send(user.id, `${ENDPOINT}/${user.id}`, 'POST', { role }, 'Could not change the role');

    const savePassword = async (user: User) => {
        if (await send(user.id, `${ENDPOINT}/${user.id}`, 'POST', { password }, 'Could not set the password')) {
            setOpen(null);
            setPassword('');
            showNotification(`Password changed for ${user.name}`, 'success');
        }
    };

    const remove = async (user: User) => {
        if (await send(user.id, `${ENDPOINT}/${user.id}`, 'DELETE', null, 'Could not delete the user')) {
            setOpen(null);
            showNotification(`${user.name} deleted`, 'success');
        }
    };

    return (
        <section className="rounded-2xl border border-gray-700/50 bg-gray-800/50 p-4 backdrop-blur">
            <h2 className="text-sm font-medium uppercase tracking-wide text-gray-400">Users</h2>
            <p className="mt-1 text-xs text-gray-500">
                Admins can change the season and manage users. Members can use everything else.
            </p>

            {users === null ? (
                <p className="mt-3 text-sm text-gray-500">Loading…</p>
            ) : (
                <ul className="mt-3 flex flex-col gap-2">
                    {users.map((user) => {
                        const self = user.id === currentUserId;
                        const busy = busyId === user.id;
                        const tokens = user.tokens_count ?? 0;

                        return (
                            <li key={user.id} className="rounded-xl border border-gray-700/50 bg-gray-900/40 p-3">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-white">
                                            {user.name}
                                            {self && <span className="ml-2 text-xs font-normal text-gray-500">you</span>}
                                        </p>
                                        <p className="truncate text-xs text-gray-500">{user.email}</p>
                                        {/* The Pi signs in as an ordinary account, so the
                                            account it uses shows up here with a token
                                            nobody remembers creating. */}
                                        <p className="text-xs text-gray-600">
                                            {tokens === 0 ? 'Not signed in anywhere' : `Signed in on ${tokens} ${tokens === 1 ? 'device' : 'devices'}`}
                                        </p>
                                    </div>

                                    <select
                                        value={user.role}
                                        onChange={(e) => setRole(user, e.target.value as Role)}
                                        disabled={busy || self}
                                        title={self ? 'You cannot change your own role' : undefined}
                                        aria-label={`Role for ${user.name}`}
                                        className="min-h-[2.75rem] rounded-lg border border-gray-700/60 bg-gray-900/60 px-2 text-sm text-white disabled:opacity-50"
                                    >
                                        <option value="admin">Admin</option>
                                        <option value="member">Member</option>
                                    </select>

                                    <button
                                        onClick={() => { setPassword(''); setOpen(open?.id === user.id && open.action === 'password' ? null : { id: user.id, action: 'password' }); }}
                                        disabled={busy}
                                        className="min-h-[2.75rem] rounded-lg bg-gray-700/60 px-3 text-sm text-gray-300 transition-all hover:bg-gray-600/60 disabled:opacity-50"
                                    >
                                        Password
                                    </button>

                                    {!self && (
                                        <button
                                            onClick={() => setOpen(open?.id === user.id && open.action === 'delete' ? null : { id: user.id, action: 'delete' })}
                                            disabled={busy}
                                            className="min-h-[2.75rem] rounded-lg bg-red-500/15 px-3 text-sm text-red-300 transition-all hover:bg-red-500/25 disabled:opacity-50"
                                        >
                                            Delete
                                        </button>
                                    )}
                                </div>

                                {open?.id === user.id && open.action === 'password' && (
                                    <form
                                        onSubmit={(e) => { e.preventDefault(); savePassword(user); }}
                                        className="mt-3 flex gap-2"
                                    >
                                        <input
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="New password, at least 8 characters"
                                            autoComplete="new-password"
                                            minLength={8}
                                            required
                                            disabled={busy}
                                            className={inputClass}
                                        />
                                        <button
                                            type="submit"
                                            disabled={busy}
                                            className="min-h-[2.75rem] shrink-0 rounded-lg bg-blue-500/25 px-4 text-sm font-medium text-blue-200 transition-all hover:bg-blue-500/35 disabled:opacity-50"
                                        >
                                            Save
                                        </button>
                                    </form>
                                )}

                                {open?.id === user.id && open.action === 'delete' && (
                                    <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">
                                        <p>
                                            Delete {user.name}? They are signed out everywhere.
                                            {tokens > 0 && ' If this is the account the Pi uses, the house stops being controlled until the Pi gets a new token.'}
                                        </p>
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                onClick={() => remove(user)}
                                                disabled={busy}
                                                className="min-h-[2.75rem] flex-1 rounded-lg bg-red-500/30 font-medium text-red-100 transition-all hover:bg-red-500/40 disabled:opacity-50"
                                            >
                                                Delete
                                            </button>
                                            <button
                                                onClick={() => setOpen(null)}
                                                disabled={busy}
                                                className="min-h-[2.75rem] flex-1 rounded-lg bg-gray-700/60 text-gray-300 transition-all hover:bg-gray-600/60 disabled:opacity-50"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}

            <form onSubmit={add} className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <span className="text-[10px] uppercase tracking-wide text-gray-500 sm:col-span-2">Add a user</span>
                <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Name"
                    required
                    disabled={busyId === 'new'}
                    className={inputClass}
                />
                <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="Email"
                    autoComplete="off"
                    required
                    disabled={busyId === 'new'}
                    className={inputClass}
                />
                <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Password, at least 8 characters"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    disabled={busyId === 'new'}
                    className={inputClass}
                />
                <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                    disabled={busyId === 'new'}
                    aria-label="Role for the new user"
                    className={inputClass}
                >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                </select>
                <button
                    type="submit"
                    disabled={busyId === 'new'}
                    className="min-h-[2.75rem] rounded-xl bg-blue-500/25 text-sm font-medium text-blue-200 transition-all hover:bg-blue-500/35 disabled:opacity-50 sm:col-span-2"
                >
                    {busyId === 'new' ? 'Adding…' : 'Add user'}
                </button>
            </form>
        </section>
    );
}
