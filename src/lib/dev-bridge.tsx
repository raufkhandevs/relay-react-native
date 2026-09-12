import { useEffect, useRef } from 'react';

import { useAuth } from './auth';

/**
 * Dev-only verification hook: this sandbox has no way to synthesize a tap on the iOS
 * Simulator (no Accessibility/automation permission, no idb, and `simctl openurl` always
 * shows an unavoidable "Open in App?" system confirmation for custom schemes). So
 * login/logout for screenshotted verification is driven end to end by polling a plain
 * local HTTP file for a command, then calling the exact same functions a real tap would:
 * `loginBridge.current.submit(...)` is what the "Sign in" button calls, and `signOut()`
 * is what the "Sign out" link calls. Inert outside __DEV__, and gone entirely from any
 * release build since __DEV__ is compiled out.
 */
export const loginBridge: { current: { submit: (email: string, password: string) => void } | null } = {
    current: null,
};

const POLL_URL = 'http://localhost:8899/command.json';
const POLL_INTERVAL_MS = 700;

type DevCommand = { id: number; action: 'login' | 'logout'; email?: string; password?: string };

export function DevLinkBridge() {
    const { signOut } = useAuth();
    const lastId = useRef<number | null>(null);

    useEffect(() => {
        if (!__DEV__) {
            return;
        }
        const interval = setInterval(async () => {
            try {
                const response = await fetch(POLL_URL, { headers: { 'Cache-Control': 'no-cache' } });
                if (!response.ok) return;
                const command = (await response.json()) as DevCommand;
                if (command.id === lastId.current) return;
                lastId.current = command.id;

                if (command.action === 'login') {
                    loginBridge.current?.submit(command.email ?? '', command.password ?? '');
                } else if (command.action === 'logout') {
                    signOut();
                }
            } catch {
                // No command server running; that's the normal state outside verification.
            }
        }, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [signOut]);

    return null;
}
