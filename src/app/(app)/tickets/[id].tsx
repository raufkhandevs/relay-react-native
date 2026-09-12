import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DangerColor, FontFamily, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTicketChannel } from '@/hooks/use-ticket-channel';
import { readableApiError } from '@/lib/api';
import { newIdempotencyKey, sendMessage } from '@/lib/mutations';
import { useMe, useMessages } from '@/lib/queries';
import type { Message } from '@/types/api';

type PendingMessage = {
    clientId: string;
    body: string;
    status: 'sending' | 'failed';
};

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
});

/** A message timestamp: bare time for today, date and time otherwise. */
function formatTimestamp(iso: string): string {
    const date = new Date(iso);
    const isToday = date.toDateString() === new Date().toDateString();
    return (isToday ? timeFormatter : dateTimeFormatter).format(date);
}

function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
    const theme = useTheme();
    return (
        <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
            <View
                style={[
                    styles.bubble,
                    isOwn
                        ? { backgroundColor: 'rgba(29, 111, 139, 0.12)' }
                        : { backgroundColor: theme.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.rule },
                ]}>
                <ThemedText style={styles.bubbleText}>{message.body}</ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
                {message.author.name}{'  '}
                <ThemedText type="small" themeColor="textSecondary" style={styles.mono}>
                    {formatTimestamp(message.created_at)}
                </ThemedText>
            </ThemedText>
        </View>
    );
}

function PendingBubble({ entry, onRetry }: { entry: PendingMessage; onRetry: (clientId: string) => void }) {
    return (
        <View style={[styles.bubbleRow, styles.bubbleRowOwn]}>
            <View style={[styles.bubble, styles.bubblePending]}>
                <ThemedText style={styles.bubbleText}>{entry.body}</ThemedText>
            </View>
            {entry.status === 'sending' ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
                    Sending…
                </ThemedText>
            ) : (
                <View style={styles.retryRow}>
                    <ThemedText type="small" style={[styles.caption, { color: DangerColor }]}>
                        Failed to send
                    </ThemedText>
                    <Pressable
                        testID={`retry-message-${entry.clientId}`}
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={() => onRetry(entry.clientId)}>
                        <ThemedText type="link" themeColor="accent">
                            Retry
                        </ThemedText>
                    </Pressable>
                </View>
            )}
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

function Composer({ onSend }: { onSend: (body: string) => void }) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const [body, setBody] = useState('');
    const trimmed = body.trim();

    const submit = () => {
        if (!trimmed) {
            return;
        }
        onSend(trimmed);
        setBody('');
    };

    return (
        <View
            style={[
                styles.composer,
                { backgroundColor: theme.surface, borderTopColor: theme.rule, paddingBottom: Math.max(insets.bottom, Spacing.three) },
            ]}>
            <TextInput
                testID="message-input"
                value={body}
                onChangeText={setBody}
                placeholder="Write a reply"
                placeholderTextColor={theme.textSecondary}
                multiline
                style={[styles.composerInput, { borderColor: theme.rule, color: theme.text }]}
            />
            <Pressable
                testID="message-send"
                accessibilityRole="button"
                accessibilityLabel="Send"
                disabled={!trimmed}
                onPress={submit}
                style={[
                    styles.sendButton,
                    { backgroundColor: theme.accent },
                    !trimmed && styles.sendButtonDisabled,
                ]}>
                <ThemedText style={styles.sendButtonText}>Send</ThemedText>
            </Pressable>
        </View>
    );
}

export default function TicketThreadScreen() {
    const insets = useSafeAreaInsets();
    const theme = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const ticketId = Number(id);
    const listRef = useRef<FlatList>(null);

    const { data: me } = useMe();
    const { data, isLoading, isError, error, refetch } = useMessages(ticketId);
    const showSkeleton = useDelayedLoading(isLoading);

    // History arrives newest-first; reverse it for a normal chat reading order,
    // oldest at the top, newest at the bottom.
    const history = useMemo(() => (data ? [...data.data].reverse() : []), [data]);
    const [liveMessages, setLiveMessages] = useState<Message[]>([]);
    const [pending, setPending] = useState<PendingMessage[]>([]);

    const append = useCallback(
        (incoming: Message) => {
            setLiveMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));

            // The sender receives their own broadcast. If it wins the race against
            // the POST's own success handler below, drop the matching optimistic
            // entry here too so it is never shown twice.
            if (incoming.author.id === me?.id) {
                setPending((prev) => prev.filter((p) => !(p.status === 'sending' && p.body === incoming.body)));
            }
        },
        [me?.id],
    );

    useTicketChannel(ticketId, append);

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

    const send = useCallback(
        (body: string, clientId: string = newIdempotencyKey()) => {
            setPending((current) => [
                ...current.filter((p) => p.clientId !== clientId),
                { clientId, body, status: 'sending' },
            ]);

            sendMessage(ticketId, body, clientId)
                .then((message) => {
                    setPending((current) => current.filter((p) => p.clientId !== clientId));
                    append(message);
                })
                .catch(() => {
                    setPending((current) =>
                        current.map((p) => (p.clientId === clientId ? { ...p, status: 'failed' } : p)),
                    );
                });
        },
        [append, ticketId],
    );

    const retry = useCallback(
        (clientId: string) => {
            const entry = pending.find((p) => p.clientId === clientId);
            if (entry) {
                send(entry.body, clientId);
            }
        },
        [pending, send],
    );

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
                <View style={[styles.header, { borderBottomColor: theme.rule }]}>
                    <Pressable testID="back-button" style={styles.backButton} onPress={() => router.back()} hitSlop={8}>
                        <ThemedText type="link" themeColor="accent">
                            Back
                        </ThemedText>
                    </Pressable>
                    <ThemedText style={[styles.headerTitle, styles.mono]} numberOfLines={1}>
                        TKT-{id}
                    </ThemedText>
                    <View style={styles.backButton} />
                </View>

                {isError ? (
                    <View style={styles.centered}>
                        <ThemedText style={[styles.errorText, { color: DangerColor }]}>
                            {readableApiError(error)}
                        </ThemedText>
                        <Pressable
                            testID="retry-messages"
                            style={[styles.retryButton, { backgroundColor: theme.accent }]}
                            onPress={() => refetch()}>
                            <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
                        </Pressable>
                    </View>
                ) : showSkeleton ? (
                    <FlatList
                        style={styles.messagesList}
                        data={[0, 1, 2, 3, 4]}
                        keyExtractor={(item) => String(item)}
                        contentContainerStyle={styles.listContent}
                        renderItem={({ item }) => <SkeletonBubble align={item % 2 === 0 ? 'flex-start' : 'flex-end'} />}
                    />
                ) : isLoading ? null : messages.length === 0 && pending.length === 0 ? (
                    <View style={[styles.centered, styles.messagesList]}>
                        <ThemedText style={styles.emptyText}>No messages yet.</ThemedText>
                    </View>
                ) : (
                    <FlatList
                        ref={listRef}
                        style={styles.messagesList}
                        data={messages}
                        keyExtractor={(item) => String(item.id)}
                        contentContainerStyle={styles.listContent}
                        renderItem={({ item }) => <MessageBubble message={item} isOwn={item.author.id === me?.id} />}
                        // A chat thread opens at the newest message, and stays pinned there as
                        // more arrive, own or otherwise - onContentSizeChange fires once the new
                        // bubble has actually been measured, unlike scrolling on the state update.
                        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
                        ListFooterComponent={
                            pending.length > 0 ? (
                                <View style={styles.pendingList}>
                                    {pending.map((entry) => (
                                        <PendingBubble key={entry.clientId} entry={entry} onRetry={retry} />
                                    ))}
                                </View>
                            ) : null
                        }
                    />
                )}

                <Composer onSend={send} />
            </ThemedView>
        </KeyboardAvoidingView>
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
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backButton: {
        minHeight: 44,
        minWidth: 44,
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 16,
        flex: 1,
        textAlign: 'center',
    },
    mono: {
        fontFamily: FontFamily.mono,
    },
    messagesList: {
        flex: 1,
    },
    listContent: {
        padding: Spacing.four,
    },
    bubbleRow: {
        alignItems: 'flex-start',
        marginBottom: Spacing.four,
    },
    bubbleRowOwn: {
        alignItems: 'flex-end',
    },
    bubble: {
        maxWidth: '82%',
        borderRadius: Spacing.two,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
    },
    bubblePending: {
        backgroundColor: 'rgba(29, 111, 139, 0.12)',
        opacity: 0.6,
    },
    bubbleText: {
        fontSize: 15,
        lineHeight: 21,
    },
    caption: {
        marginTop: Spacing.one,
        paddingHorizontal: Spacing.one,
    },
    retryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        marginTop: Spacing.one,
        paddingHorizontal: Spacing.one,
    },
    pendingList: {
        marginTop: -Spacing.two,
    },
    skeletonBubble: {
        width: '60%',
        height: 40,
        borderRadius: Spacing.two,
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
    },
    retryButton: {
        minHeight: 44,
        paddingHorizontal: Spacing.four,
        justifyContent: 'center',
        borderRadius: Spacing.two,
    },
    retryButtonText: {
        color: '#ffffff',
        fontFamily: FontFamily.sansSemiBold,
    },
    composer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: Spacing.two,
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
    },
    composerInput: {
        flex: 1,
        minHeight: 44,
        maxHeight: 120,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Spacing.two,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        fontFamily: FontFamily.sans,
        fontSize: 15,
    },
    sendButton: {
        minHeight: 44,
        minWidth: 64,
        paddingHorizontal: Spacing.three,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Spacing.two,
    },
    sendButtonDisabled: {
        opacity: 0.4,
    },
    sendButtonText: {
        color: '#ffffff',
        fontFamily: FontFamily.sansSemiBold,
        fontSize: 15,
    },
});
