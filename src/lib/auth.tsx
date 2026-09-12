import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useQueryClient } from '@tanstack/react-query';

import { API_BASE } from './config';
import { disconnectEcho } from './echo';

const TOKEN_KEY = 'relay.token';

// SecureStore writes to the iOS Keychain, not AsyncStorage: AsyncStorage is
// plaintext on disk and rides along in device backups, which would make a
// backup a copy of the bearer token.

export async function getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
}

type AuthContextValue = {
    /** undefined while the initial Keychain read is in flight. */
    token: string | null | undefined;
    signIn: (token: string) => Promise<void>;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
    const value = useContext(AuthContext);
    if (!value) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return value;
}

/** Loads the Keychain token once and exposes it reactively so the root layout can route on it. */
export function AuthProvider({ children }: PropsWithChildren) {
    const [token, setTokenState] = useState<string | null | undefined>(undefined);
    // Requires AuthProvider to render inside QueryClientProvider, which it already does
    // in _layout.tsx.
    const queryClient = useQueryClient();

    useEffect(() => {
        getToken().then(setTokenState);
    }, []);

    const signIn = async (newToken: string) => {
        await setToken(newToken);
        setTokenState(newToken);
    };

    const signOut = async () => {
        // Revoke server side first, while the token is still in the Keychain for the
        // request to carry. Sanctum deletes only the current token, so signing out here
        // does not sign the same account out on the web or desktop clients. Best effort:
        // a failure must not trap the user in a signed-in state, so the local clear below
        // happens either way.
        try {
            const current = await getToken();
            if (current) {
                await fetch(`${API_BASE}/api/tokens/current`, {
                    method: 'DELETE',
                    headers: { Accept: 'application/json', Authorization: `Bearer ${current}` },
                });
            }
        } catch {
            // Offline or already-expired token. Nothing to recover; clear locally anyway.
        }

        await clearToken();
        // The QueryClient and the Echo connection both live for the whole app process
        // (see _layout.tsx and lib/echo.ts), so without this a second person signing in
        // on the same device would see the first person's cached tickets and messages,
        // and their channel subscriptions would still be authorised with the first
        // person's bearer token until they expire.
        queryClient.clear();
        disconnectEcho();
        setTokenState(null);
    };

    return <AuthContext.Provider value={{ token, signIn, signOut }}>{children}</AuthContext.Provider>;
}
