import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { router } from 'expo-router';
import * as Device from 'expo-device';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, readableApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { loginBridge } from '@/lib/dev-bridge';
import type { User } from '@/types/api';

export default function LoginScreen() {
    const { signIn } = useAuth();
    const theme = useTheme();
    const [email, setEmail] = useState(__DEV__ ? 'priya@relay.test' : '');
    const [password, setPassword] = useState(__DEV__ ? 'password' : '');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(overrideEmail?: string, overridePassword?: string) {
        const submitEmail = overrideEmail ?? email;
        const submitPassword = overridePassword ?? password;
        setError(null);
        setSubmitting(true);
        try {
            const result = await api.post<{ token: string; user: User }>('/tokens', {
                email: submitEmail,
                password: submitPassword,
                device_name: Device.deviceName ?? Device.osName ?? 'relay-ios',
            });
            await signIn(result.token);
            router.replace('/tickets');
        } catch (err) {
            setError(readableApiError(err));
        } finally {
            setSubmitting(false);
        }
    }

    // Lets the dev-only deep link bridge drive this exact submit path (see lib/dev-bridge.tsx).
    useEffect(() => {
        if (!__DEV__) {
            return;
        }
        loginBridge.current = {
            submit: (bridgeEmail, bridgePassword) => {
                setEmail(bridgeEmail);
                setPassword(bridgePassword);
                handleSubmit(bridgeEmail, bridgePassword);
            },
        };
        return () => {
            loginBridge.current = null;
        };
    });

    return (
        <ThemedView style={styles.container}>
            <ThemedText type="title" style={styles.title}>
                Relay
            </ThemedText>

            <TextInput
                style={[styles.input, { borderColor: theme.backgroundSelected, color: theme.text }]}
                placeholder="Email"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                value={email}
                onChangeText={setEmail}
                editable={!submitting}
            />
            <TextInput
                style={[styles.input, { borderColor: theme.backgroundSelected, color: theme.text }]}
                placeholder="Password"
                placeholderTextColor={theme.textSecondary}
                secureTextEntry
                textContentType="password"
                value={password}
                onChangeText={setPassword}
                editable={!submitting}
            />

            {error ? (
                <ThemedText type="small" style={styles.error}>
                    {error}
                </ThemedText>
            ) : null}

            <Pressable
                style={[styles.button, (submitting || !email || !password) && styles.buttonDisabled]}
                onPress={() => handleSubmit()}
                disabled={submitting || !email || !password}>
                {submitting ? (
                    <ActivityIndicator color="#ffffff" />
                ) : (
                    <ThemedText style={styles.buttonText}>Sign in</ThemedText>
                )}
            </Pressable>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: Spacing.four,
        gap: Spacing.three,
    },
    title: {
        textAlign: 'center',
        marginBottom: Spacing.four,
    },
    input: {
        borderWidth: 1,
        borderRadius: Spacing.two,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
        fontSize: 16,
        minHeight: 44,
    },
    error: {
        color: '#c0392b',
    },
    button: {
        backgroundColor: '#208AEF',
        borderRadius: Spacing.two,
        paddingVertical: Spacing.three,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: Spacing.two,
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    buttonText: {
        color: '#ffffff',
        fontWeight: '600',
    },
});
