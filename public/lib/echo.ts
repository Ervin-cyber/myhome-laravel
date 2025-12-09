import Echo from 'laravel-echo';
import Pusher, * as PusherModule from 'pusher-js';

declare global {
    interface Window {
        Pusher: typeof Pusher;
    }
}

if (typeof window !== 'undefined') {
    window.Pusher = PusherModule.default || PusherModule;;
}

export const createEcho = () => {
    if (typeof window === 'undefined') return null;

    return new Echo({
        broadcaster: 'reverb',
        key: process.env.NEXT_PUBLIC_REVERB_APP_KEY,
        wsHost: process.env.NEXT_PUBLIC_REVERB_HOST,
        wsPort: Number(process.env.NEXT_PUBLIC_REVERB_PORT) ?? 80,
        wssPort: Number(process.env.NEXT_PUBLIC_REVERB_PORT) ?? 443,
        cluster: 'us2',
        forceTLS: (process.env.NEXT_PUBLIC_REVERB_SCHEME ?? 'https') === 'https',
        enabledTransports: ['ws', 'wss'],
        logToConsole: true,
    });
};