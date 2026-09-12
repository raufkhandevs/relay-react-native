import EchoImport from 'laravel-echo';
import Pusher from 'pusher-js';

import { API_BASE } from './config';

import type Echo from 'laravel-echo';

// laravel-echo ships an ESM build exporting the class as `default` and a CJS build setting
// `exports.default`, and depending on which one Metro resolves, the imported binding is
// either the class or a namespace wrapping it. Unwrap defensively.
//
// This runs inside getEcho() rather than at module scope on purpose. There is a require
// cycle (auth -> echo -> api -> auth), and in a cycle Metro hands a module a partially
// initialised binding while the cycle is still resolving. Unwrapping at module scope
// therefore captured an object rather than the class, and `new` on it failed with
// "Object cannot be used as a constructor". Resolving at call time sidesteps the ordering.
function resolveEchoConstructor(): typeof EchoImport {
    const candidate = EchoImport as unknown as { default?: typeof EchoImport };

    return (typeof candidate === 'function' ? candidate : candidate?.default) as typeof EchoImport;
}

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

    const EchoConstructor = resolveEchoConstructor();

    echo = new EchoConstructor<'reverb'>({
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
