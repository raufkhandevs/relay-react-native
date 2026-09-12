import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { DangerColor, FontFamily, Spacing, StatusColors, StatusLabels } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { readableApiError } from '@/lib/api';
import { useMe, useTickets } from '@/lib/queries';
import type { Ticket } from '@/types/api';

// Roomy: this is the customer surface (decision 0009). The agent console
// runs the same tokens compact; this client never does.
const ROW_HEIGHT = 92;

// Intl.RelativeTimeFormat is not present in this app's Hermes build (confirmed by an
// "undefined cannot be used as a constructor" crash on launch), so this formats "N
// units ago" by hand rather than reaching for a polyfill or a date library.
const RELATIVE_UNITS: [string, number][] = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
];

/** "3 hours ago", falling back to "just now" for anything under a minute. */
function formatRelativeTime(iso: string): string {
    const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
    for (const [unit, unitSeconds] of RELATIVE_UNITS) {
        if (seconds >= unitSeconds) {
            const count = Math.round(seconds / unitSeconds);
            return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
        }
    }
    return 'just now';
}

function TicketRow({ ticket }: { ticket: Ticket }) {
    const theme = useTheme();
    return (
        <Pressable
            // Automation finds rows by this, not by reading the subject text. React Native
            // Text often does not surface in the accessibility tree, so a text matcher
            // fails even when the words are plainly on screen, and the fallback is pixel
            // coordinates that break on any layout change.
            testID={`ticket-row-${ticket.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Ticket ${ticket.id}: ${ticket.subject}`}
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.rule }]}
            onPress={() => router.push(`/tickets/${ticket.id}`)}>
            {/* Status is a 3px coloured left edge, never a pill: decision 0009. */}
            <View style={[styles.edge, { backgroundColor: StatusColors[ticket.status] }]} />
            <View style={styles.cardBody}>
                <ThemedText numberOfLines={1} type="smallBold" style={styles.subject}>
                    {ticket.subject}
                </ThemedText>
                <View style={styles.metaRow}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.mono}>
                        TKT-{ticket.id}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                        {StatusLabels[ticket.status]}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.mono}>
                        {formatRelativeTime(ticket.last_message_at ?? ticket.created_at)}
                    </ThemedText>
                </View>
            </View>
        </Pressable>
    );
}

function SkeletonRow() {
    const theme = useTheme();
    return (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.rule }]}>
            <View style={[styles.edge, { backgroundColor: theme.backgroundElement }]} />
            <View style={styles.cardBody}>
                <View style={[styles.skeletonBlock, { width: '70%', backgroundColor: theme.backgroundElement }]} />
                <View
                    style={[
                        styles.skeletonBlock,
                        { width: 100, height: 12, marginTop: Spacing.two, backgroundColor: theme.backgroundElement },
                    ]}
                />
            </View>
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

export default function TicketListScreen() {
    const insets = useSafeAreaInsets();
    const theme = useTheme();
    const { signOut } = useAuth();
    const { data: me } = useMe();
    const { data, isLoading, isError, error, refetch, isRefetching } = useTickets(me?.id);
    const showSkeleton = useDelayedLoading(isLoading);

    return (
        <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
            <View style={[styles.header, { borderBottomColor: theme.rule }]}>
                <ThemedText type="title" style={styles.headerTitle}>
                    Tickets
                </ThemedText>
                <Pressable testID="sign-out" style={styles.signOut} onPress={() => signOut()} hitSlop={8}>
                    <ThemedText type="link" themeColor="accent">
                        Sign out
                    </ThemedText>
                </Pressable>
            </View>

            {isError ? (
                <View style={styles.centered}>
                    <ThemedText style={[styles.errorText, { color: DangerColor }]}>
                        {readableApiError(error)}
                    </ThemedText>
                    <Pressable
                        testID="retry-tickets"
                        style={[styles.retryButton, { backgroundColor: theme.accent }]}
                        onPress={() => refetch()}>
                        <ThemedText style={styles.retryButtonText}>Retry</ThemedText>
                    </Pressable>
                </View>
            ) : showSkeleton ? (
                <FlatList
                    data={[1, 2, 3, 4, 5]}
                    keyExtractor={(item) => String(item)}
                    contentContainerStyle={styles.listContent}
                    renderItem={() => <SkeletonRow />}
                />
            ) : isLoading ? null : data && data.data.length === 0 ? (
                <View style={styles.centered}>
                    <ThemedText style={styles.emptyText}>
                        Nothing open. Start a ticket and we will reply within the hour.
                    </ThemedText>
                </View>
            ) : (
                <FlatList
                    data={data?.data ?? []}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={({ item }) => <TicketRow ticket={item} />}
                    refreshing={isRefetching}
                    onRefresh={refetch}
                    contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + Spacing.three }]}
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
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.four,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: {
        fontSize: 28,
        lineHeight: 32,
    },
    signOut: {
        minHeight: 44,
        minWidth: 44,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    listContent: {
        padding: Spacing.four,
        gap: Spacing.three,
    },
    card: {
        minHeight: ROW_HEIGHT,
        flexDirection: 'row',
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Spacing.two,
        overflow: 'hidden',
    },
    edge: {
        width: 3,
        alignSelf: 'stretch',
    },
    cardBody: {
        flex: 1,
        justifyContent: 'center',
        gap: Spacing.two,
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.three,
    },
    subject: {
        fontSize: 17,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.two,
    },
    mono: {
        fontFamily: FontFamily.mono,
        fontSize: 12,
    },
    skeletonBlock: {
        height: 16,
        borderRadius: 4,
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
});
