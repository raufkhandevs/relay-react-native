import Echo from 'laravel-echo';
import * as PusherModule from 'pusher-js';

import { API_BASE } from './config';


// pusher-js's React Native build exports the class as a NAMED export, not a default,
// so a default import is the module namespace `{ Pusher }`. laravel-echo does
// `new options.Pusher(...)` internally, which then fails with "Object cannot be used as
// a constructor" and surfaces at the `new Echo(...)` call site rather than here.
// laravel-echo's own default export is a real class and needs no unwrapping.
type PusherClass = typeof import('pusher-js').default;
const Pusher = ((PusherModule as unknown as { Pusher?: PusherClass }).Pusher ??
    PusherModule) as PusherClass;

// Metro resolves pusher-js's own "react-native" package.json field automatically
// (see node_modules/pusher-js/package.json), which ships a React Native runtime
// built on the global WebSocket. No polyfill needed.

let echo: Echo<'reverb'> | null = null;

/**
 * Reverb speaks the Pusher protocol, so laravel-echo drives it through pusher-js,
 * the same two libraries the web client (backend-laravel/resources/js/app.tsx)
 * uses. That client leaves host/port/key to Vite's VITE_REVERB_* build-time
 * defaults; this app has no such bundler magic, so they are spelled out here.
 *
 * The Reverb app key is not secret (it is the public identifier sent by every
 * client, web included) but it is still environment-specific, so it comes from
 * EXPO_PUBLIC_REVERB_APP_KEY in this project's .env rather than being hardcoded -
 * copy the value from backend-laravel's REVERB_APP_KEY.
 */
export function getEcho(token: string | null): Echo<'reverb'> {
    if (echo) {
        return echo;
    }

    const key = process.env.EXPO_PUBLIC_REVERB_APP_KEY;
    if (!key) {
        throw new Error(
            'EXPO_PUBLIC_REVERB_APP_KEY is not set. Add it to mobile-react-native/.env, ' +
                'copying the value from backend-laravel/.env (REVERB_APP_KEY).',
        );
    }



    echo = new Echo<'reverb'>({
        broadcaster: 'reverb',
        Pusher,
        key,
        wsHost: process.env.EXPO_PUBLIC_REVERB_HOST ?? 'localhost',
        wsPort: Number(process.env.EXPO_PUBLIC_REVERB_PORT ?? 8080),
        forceTLS: (process.env.EXPO_PUBLIC_REVERB_SCHEME ?? 'http') === 'https',
        enabledTransports: ['ws', 'wss'],
        // The default `/broadcasting/auth` doesn't exist on this backend; the route is
        // registered under `/api` so one endpoint serves both the cookie-based web
        // client and this token-based one. Getting this wrong shipped once already.
        authEndpoint: `${API_BASE}/api/broadcasting/auth`,
        // The web client authorises the channel with a session cookie; this client has
        // none, so it sends the Keychain-backed bearer token as a header instead. Same
        // endpoint, same policy, different credential.
        auth: {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
    });

    return echo;
}

/** Tears down the live connection. Call on sign-out so the next signed-in user on this device doesn't inherit the previous user's authorised socket. */
export function disconnectEcho(): void {
    echo?.disconnect();
    echo = null;
}
