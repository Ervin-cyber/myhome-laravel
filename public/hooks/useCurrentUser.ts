import { User } from '@/types/types';
import { useEffect, useState } from 'react';

/**
 * Who is signed in, or null until known.
 *
 * Only used to decide what to show. Every admin action is checked again by the
 * API, so a stale or forged answer here hides or shows a button and no more.
 */
export function useCurrentUser() {
    const [user, setUser] = useState<User | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        fetch('/proxy/api/me')
            .then((res) => {
                if (!res.ok) throw new Error(`me returned ${res.status}`);
                return res.json();
            })
            .then((me: User) => {
                if (!cancelled) setUser(me);
            })
            .catch((error) => {
                console.error('Could not load the signed-in user', error);
                if (!cancelled) setFailed(true);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return { user, failed, isAdmin: user?.role === 'admin' };
}
