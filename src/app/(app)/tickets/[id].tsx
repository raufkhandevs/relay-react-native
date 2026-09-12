import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Linking,
    Platform,
    Pressable,
    StyleSheet,
    TextInput,
    View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { openBrowserAsync } from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TypingBubble } from '@/components/typing-bubble';
import { DangerColor, FontFamily, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTicketChannel } from '@/hooks/use-ticket-channel';
import { readableApiError, resolveAttachmentUrl } from '@/lib/api';
import { newIdempotencyKey, sendMessage, type PickedFile } from '@/lib/mutations';
import { useMe, useMessages } from '@/lib/queries';
import type { Attachment, Message } from '@/types/api';

type PendingMessage = {
    clientId: string;
    body: string;
    file?: PickedFile;
    status: 'sending' | 'failed';
    /** Fraction 0-1, set only while a file upload is in flight. */
    progress?: number;
};

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
});

// Hide the bubble this long after the last whisper. Never wait for a
// "stopped typing" message: the sender can close the app or lose signal
// mid-word, and this is what keeps the bubble from getting stuck forever.
const TYPING_EXPIRY_MS = 3000;
// At most one whisper per second, leading edge: the first keystroke of a
// burst fires immediately and the rest are swallowed until the second is up.
const TYPING_THROTTLE_MS = 1000;

/** A message timestamp: bare time for today, date and time otherwise. */
function formatTimestamp(iso: string): string {
    const date = new Date(iso);
    const isToday = date.toDateString() === new Date().toDateString();
    return (isToday ? timeFormatter : dateTimeFormatter).format(date);
}

function isImageMime(mime: string): boolean {
    return mime.startsWith('image/');
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${Math.round(bytes / 1024)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Resolves and opens an attachment through the authorised endpoint, never a stored
 * storage URL - each tap re-authorises, because the presigned URL it resolves to is
 * only good for 5 minutes and access can change between one tap and the next.
 */
async function openAttachment(attachment: Attachment) {
    try {
        const url = await resolveAttachmentUrl(attachment.id);
        await openBrowserAsync(url);
    } catch (err) {
        Alert.alert('Could not open attachment', readableApiError(err));
    }
}

/** Resolves an image attachment's presigned URL for inline display. Never cached to disk or state beyond this component's lifetime. */
function useAttachmentImageUrl(attachmentId: number): string | null {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        // attachmentId never changes for a mounted instance - each AttachmentImage is
        // keyed by it in MessageAttachments - so there is no stale URL to reset here.
        let cancelled = false;
        resolveAttachmentUrl(attachmentId).then(
            (resolved) => {
                if (!cancelled) {
                    setUrl(resolved);
                }
            },
            () => {
                // Left null: the row below falls back to nothing rather than a broken image.
            },
        );
        return () => {
            cancelled = true;
        };
    }, [attachmentId]);

    return url;
}

function AttachmentImage({ attachment }: { attachment: Attachment }) {
    const theme = useTheme();
    const url = useAttachmentImageUrl(attachment.id);

    return (
        <Pressable
            testID={`attachment-${attachment.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Open ${attachment.original_name}`}
            onPress={() => openAttachment(attachment)}
            style={[styles.attachmentImageWrap, { backgroundColor: theme.backgroundElement }]}>
            {url ? (
                <Image source={{ uri: url }} style={styles.attachmentImage} contentFit="cover" />
            ) : null}
        </Pressable>
    );
}

function AttachmentRow({ attachment }: { attachment: Attachment }) {
    const theme = useTheme();
    return (
        <Pressable
            testID={`attachment-${attachment.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Open ${attachment.original_name}`}
            onPress={() => openAttachment(attachment)}
            style={[styles.attachmentRow, { backgroundColor: theme.backgroundElement, borderColor: theme.rule }]}>
            <ThemedText style={styles.attachmentRowName} numberOfLines={1}>
                {attachment.original_name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
                {formatBytes(attachment.size_bytes)}
            </ThemedText>
        </Pressable>
    );
}

function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
    if (attachments.length === 0) {
        return null;
    }
    return (
        <View style={styles.attachmentsList}>
            {attachments.map((attachment) =>
                isImageMime(attachment.mime) ? (
                    <AttachmentImage key={attachment.id} attachment={attachment} />
                ) : (
                    <AttachmentRow key={attachment.id} attachment={attachment} />
                ),
            )}
        </View>
    );
}

function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
    const theme = useTheme();
    return (
        <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
            <View
                // Assertion target. React Native Text frequently does not reach the
                // accessibility tree, so matching on the rendered words fails even when
                // they are plainly on screen. Without this an automated check cannot tell
                // a delivered message from a missing one.
                testID={`message-${message.id}`}
                accessible
                accessibilityLabel={`${message.author.name}: ${message.body}`}
                style={[
                    styles.bubble,
                    isOwn
                        ? { backgroundColor: theme.surfaceOwn }
                        : { backgroundColor: theme.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.rule },
                ]}>
                <ThemedText style={styles.bubbleText}>{message.body}</ThemedText>
                <MessageAttachments attachments={message.attachments} />
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
    const theme = useTheme();
    return (
        <View style={[styles.bubbleRow, styles.bubbleRowOwn]}>
            <View style={[styles.bubble, styles.bubblePending, { backgroundColor: theme.surfaceOwn }]}>
                <ThemedText style={styles.bubbleText}>{entry.body}</ThemedText>
                {entry.file ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.pendingFileName}>
                        {entry.file.name}
                    </ThemedText>
                ) : null}
            </View>
            {entry.status === 'sending' ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
                    {entry.file && entry.progress !== undefined
                        ? `Uploading… ${Math.round(entry.progress * 100)}%`
                        : 'Sending…'}
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

/**
 * Asks for photo library access at the point of use rather than at launch, and only
 * asks again when the OS says it can (`canAskAgain`). Returns null on cancel or refusal.
 */
async function pickLibraryImage(): Promise<PickedFile | null | 'denied'> {
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = current.status;
    if (status !== 'granted' && current.canAskAgain) {
        const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
        status = requested.status;
    }
    if (status !== 'granted') {
        return 'denied';
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (result.canceled || result.assets.length === 0) {
        return null;
    }

    const asset = result.assets[0];
    return {
        uri: asset.uri,
        // The library doesn't always know a filename (limited access, some content
        // providers); fall back to the last path segment rather than leaving it blank.
        name: asset.fileName ?? asset.uri.split('/').pop() ?? 'attachment',
        // Sent through untouched: an iPhone photo is HEIC, and the server - not this
        // client - decides whether the real type is acceptable.
        mimeType: asset.mimeType ?? 'application/octet-stream',
    };
}

function Composer({
    onSend,
    onTyping,
}: {
    onSend: (body: string, file?: PickedFile) => void;
    onTyping: () => void;
}) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const [body, setBody] = useState('');
    const [attachment, setAttachment] = useState<PickedFile | null>(null);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const lastTypingSentAt = useRef(0);
    const trimmed = body.trim();
    // A photo often needs no caption, so a message is sendable with text, a file, or
    // both. The API agrees: body is required only when no file is present.
    const canSend = trimmed.length > 0 || attachment !== null;

    const attach = async () => {
        setPermissionDenied(false);
        const picked = await pickLibraryImage();
        if (picked === 'denied') {
            setPermissionDenied(true);
            return;
        }
        if (picked) {
            setAttachment(picked);
        }
    };

    const submit = () => {
        if (!canSend) {
            return;
        }
        onSend(trimmed, attachment ?? undefined);
        setBody('');
        setAttachment(null);
    };

    const changeBody = (text: string) => {
        setBody(text);

        const now = Date.now();
        if (now - lastTypingSentAt.current >= TYPING_THROTTLE_MS) {
            lastTypingSentAt.current = now;
            onTyping();
        }
    };

    return (
        <View
            style={[
                styles.composerContainer,
                { backgroundColor: theme.surface, borderTopColor: theme.rule, paddingBottom: Math.max(insets.bottom, Spacing.three) },
            ]}>
            {permissionDenied ? (
                <View style={[styles.permissionBanner, { backgroundColor: theme.backgroundElement }]}>
                    <ThemedText type="small" style={styles.permissionText}>
                        Relay needs access to your photos to attach an image.
                    </ThemedText>
                    <Pressable
                        testID="open-settings"
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={() => Linking.openSettings()}>
                        <ThemedText type="link" themeColor="accent">
                            Open Settings
                        </ThemedText>
                    </Pressable>
                </View>
            ) : null}
            {attachment ? (
                <View style={[styles.preview, { borderColor: theme.rule }]}>
                    {isImageMime(attachment.mimeType) ? (
                        <Image source={{ uri: attachment.uri }} style={styles.previewImage} contentFit="cover" />
                    ) : (
                        <View style={[styles.previewFileIcon, { backgroundColor: theme.backgroundElement }]}>
                            <ThemedText type="small" numberOfLines={1} style={styles.previewFileName}>
                                {attachment.name}
                            </ThemedText>
                        </View>
                    )}
                    <Pressable
                        testID="remove-attachment"
                        accessibilityRole="button"
                        accessibilityLabel="Remove attachment"
                        hitSlop={8}
                        onPress={() => setAttachment(null)}
                        style={[styles.previewRemove, { backgroundColor: theme.text }]}>
                        <ThemedText style={[styles.previewRemoveText, { color: theme.surface }]}>×</ThemedText>
                    </Pressable>
                </View>
            ) : null}
            <View style={styles.composer}>
                <Pressable
                    testID="attach-button"
                    accessibilityRole="button"
                    accessibilityLabel="Attach a photo"
                    hitSlop={8}
                    onPress={attach}
                    style={[styles.attachButton, { borderColor: theme.rule }]}>
                    <ThemedText style={[styles.attachButtonText, { color: theme.accent }]}>+</ThemedText>
                </Pressable>
                <TextInput
                    testID="message-input"
                    value={body}
                    onChangeText={changeBody}
                    placeholder="Write a reply"
                    placeholderTextColor={theme.textSecondary}
                    multiline
                    style={[styles.composerInput, { borderColor: theme.rule, color: theme.text }]}
                />
                <Pressable
                    testID="message-send"
                    accessibilityRole="button"
                    accessibilityLabel="Send"
                    disabled={!canSend}
                    onPress={submit}
                    style={[
                        styles.sendButton,
                        { backgroundColor: theme.accent },
                        !canSend && styles.sendButtonDisabled,
                    ]}>
                    <ThemedText style={styles.sendButtonText}>Send</ThemedText>
                </Pressable>
            </View>
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
    const [typingName, setTypingName] = useState<string | null>(null);
    const typingExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Cleared and restarted on every whisper, so the bubble only disappears
    // once TYPING_EXPIRY_MS has passed with no further whisper.
    const handleTypingReceived = useCallback(
        (name: string) => {
            if (name === me?.name) {
                return;
            }

            setTypingName(name);

            if (typingExpiryRef.current) {
                clearTimeout(typingExpiryRef.current);
            }
            typingExpiryRef.current = setTimeout(() => {
                setTypingName(null);
            }, TYPING_EXPIRY_MS);
        },
        [me?.name],
    );

    useEffect(() => {
        return () => {
            if (typingExpiryRef.current) {
                clearTimeout(typingExpiryRef.current);
            }
        };
    }, []);

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

    const { whisperTyping } = useTicketChannel(ticketId, append, handleTypingReceived);

    const sendTyping = useCallback(() => {
        if (me) {
            whisperTyping(me.name);
        }
    }, [whisperTyping, me]);

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
        (body: string, file?: PickedFile, clientId: string = newIdempotencyKey()) => {
            setPending((current) => [
                ...current.filter((p) => p.clientId !== clientId),
                { clientId, body, file, status: 'sending' },
            ]);

            const onProgress = (fraction: number) => {
                setPending((current) =>
                    current.map((p) => (p.clientId === clientId ? { ...p, progress: fraction } : p)),
                );
            };

            sendMessage(ticketId, body, clientId, file, file ? onProgress : undefined)
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
                send(entry.body, entry.file, clientId);
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
                            pending.length > 0 || typingName ? (
                                <View style={styles.pendingList}>
                                    {pending.map((entry) => (
                                        <PendingBubble key={entry.clientId} entry={entry} onRetry={retry} />
                                    ))}
                                    {typingName ? <TypingBubble name={typingName} /> : null}
                                </View>
                            ) : null
                        }
                    />
                )}

                <Composer onSend={send} onTyping={sendTyping} />
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
        // backgroundColor comes from the theme at the call site; a StyleSheet
        // cannot see the colour scheme.
        opacity: 0.6,
    },
    bubbleText: {
        fontSize: 15,
        lineHeight: 21,
    },
    pendingFileName: {
        marginTop: Spacing.one,
    },
    attachmentsList: {
        marginTop: Spacing.two,
        gap: Spacing.two,
    },
    attachmentImageWrap: {
        borderRadius: Spacing.two,
        overflow: 'hidden',
    },
    attachmentImage: {
        width: '100%',
        // A "sensible max height": tall enough to read a screenshot, short enough
        // that one photo never pushes the rest of the thread off screen.
        height: 220,
    },
    attachmentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.two,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Spacing.two,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    attachmentRowName: {
        flex: 1,
        fontFamily: FontFamily.sansMedium,
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
    composerContainer: {
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.three,
        paddingTop: Spacing.three,
    },
    permissionBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.three,
        borderRadius: Spacing.two,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
        marginBottom: Spacing.two,
    },
    permissionText: {
        flex: 1,
    },
    preview: {
        alignSelf: 'flex-start',
        marginBottom: Spacing.two,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Spacing.two,
        overflow: 'visible',
    },
    previewImage: {
        width: 72,
        height: 72,
        borderRadius: Spacing.two,
    },
    previewFileIcon: {
        width: 140,
        height: 72,
        borderRadius: Spacing.two,
        justifyContent: 'center',
        paddingHorizontal: Spacing.two,
    },
    previewFileName: {
        fontFamily: FontFamily.sansMedium,
    },
    previewRemove: {
        position: 'absolute',
        top: -8,
        right: -8,
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    previewRemoveText: {
        fontSize: 14,
        lineHeight: 16,
    },
    composer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: Spacing.two,
        paddingBottom: Spacing.three,
    },
    attachButton: {
        minHeight: 44,
        minWidth: 44,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Spacing.two,
        alignItems: 'center',
        justifyContent: 'center',
    },
    attachButtonText: {
        fontSize: 22,
        lineHeight: 24,
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
