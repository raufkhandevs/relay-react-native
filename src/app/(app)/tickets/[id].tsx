import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTicketChannel } from '@/hooks/use-ticket-channel';
import { readableApiError } from '@/lib/api';
import { useMe, useMessages } from '@/lib/queries';
import type { Message } from '@/types/api';

function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
    const theme = useTheme();
    return (
        <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
            <View
                style={[
                    styles.bubble,
                    { backgroundColor: isOwn ? '#208AEF' : theme.backgroundElement },
                ]}>
                {!isOwn && (
                    <ThemedText type="smallBold" style={styles.author}>
                        {message.author.name}
                    </ThemedText>
                )}
                <ThemedText style={isOwn ? styles.bodyOwn : undefined}>{message.body}</ThemedText>
            </View>
        </View>
    );
}

function SkeletonBubble({ align }: { align: 'flex-start' | 'flex-end' }) {
    const theme = useTheme();
    return (
        <View style={[styles.bubbleRow, { alignItems: align }]}>
            <View style={[styles.skeletonBubble, { backgroundColor: theme.backgroundElement }]} />
        </View>
    );
}

/** Delays showing the loading skeleton so a fast response never flashes it. */
function useDelayedLoading(isLoading: boolean, delayMs = 200) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!isLoading) {
            return;
        }
        const timer = setTimeout(() => setShow(true), delayMs);
        return () => {
            clearTimeout(timer);
            setShow(false);
        };
    }, [isLoading, delayMs]);

    return show;
}

export default function TicketThreadScreen() {
    const insets = useSafeAreaInsets();
    const { id } = useLocalSearchParams<{ id: string }>();
    const ticketId = Number(id);

    const { data: me } = useMe();
    const { data, isLoading, isError, error, refetch } = useMessages(ticketId);
    const showSkeleton = useDelayedLoading(isLoading);

    // History arrives newest-first; reverse it for a normal chat reading order,
    // oldest at the top, newest at the bottom.
    const history = useMemo(() => (data ? [...data.data].reverse() : []), [data]);
    const [liveMessages, setLiveMessages] = useState<Message[]>([]);

    useTicketChannel(ticketId, (message) => {
        setLiveMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    });

    // De-duplicate live messages against history: the sender receives their own
    // broadcast, so a message that has already landed in a history refetch would
    // otherwise render twice. (expo-router mounts a fresh screen instance per
    // ticket id, so liveMessages starts empty for each ticket without needing to
    // reset it here.)
    const historyIds = useMemo(() => new Set(history.map((m) => m.id)), [history]);
    const messages = useMemo(
        () => [...history, ...liveMessages.filter((m) => !historyIds.has(m.id))],
        [history, liveMessages, historyIds],
    );

    return (
        <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <Pressable style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
                    <ThemedText type="link">Back</ThemedText>
                </Pressable>
                <ThemedText type="subtitle" style={styles.headerTitle} numberOfLines={1}>
                    TKT-{id}
                </ThemedText>
                <View style={styles.backButton} />
            </View>

            {isError ? (
                <View style={styles.centered}>
                    <ThemedText style={styles.errorText}>{readableApiError(error)}</ThemedText>
                    <Pressable style={styles.retryButton} onPress={() => refetch()}>
                        <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
                    </Pressable>
                </View>
            ) : showSkeleton ? (
                <FlatList
                    data={[0, 1, 2, 3, 4]}
                    keyExtractor={(item) => String(item)}
                    contentContainerStyle={{ padding: Spacing.three }}
                    renderItem={({ item }) => <SkeletonBubble align={item % 2 === 0 ? 'flex-start' : 'flex-end'} />}
                />
            ) : isLoading ? null : messages.length === 0 ? (
                <View style={styles.centered}>
                    <ThemedText style={styles.emptyText}>No messages yet.</ThemedText>
                </View>
            ) : (
                <FlatList
                    data={messages}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={({ item }) => <MessageBubble message={item} isOwn={item.author.id === me?.id} />}
                    contentContainerStyle={{ padding: Spacing.three, paddingBottom: insets.bottom + Spacing.three }}
                />
            )}
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
    },
    backButton: {
        minHeight: 44,
        minWidth: 44,
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 20,
        lineHeight: 24,
        flex: 1,
        textAlign: 'center',
    },
    bubbleRow: {
        alignItems: 'flex-start',
        marginBottom: Spacing.two,
    },
    bubbleRowOwn: {
        alignItems: 'flex-end',
    },
    bubble: {
        maxWidth: '80%',
        borderRadius: Spacing.two,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        gap: 2,
    },
    author: {
        marginBottom: 2,
    },
    skeletonBubble: {
        width: '60%',
        height: 40,
        borderRadius: Spacing.two,
    },
    bodyOwn: {
        color: '#ffffff',
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.five,
        gap: Spacing.three,
    },
    emptyText: {
        textAlign: 'center',
    },
    errorText: {
        textAlign: 'center',
        color: '#c0392b',
    },
    retryButton: {
        minHeight: 44,
        paddingHorizontal: Spacing.four,
        justifyContent: 'center',
        backgroundColor: '#208AEF',
        borderRadius: Spacing.two,
    },
    retryButtonText: {
        color: '#ffffff',
        fontWeight: '600',
    },
});
