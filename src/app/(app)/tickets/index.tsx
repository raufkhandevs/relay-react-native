import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { readableApiError } from '@/lib/api';
import { useTickets } from '@/lib/queries';
import type { Ticket, TicketStatus } from '@/types/api';

const ROW_HEIGHT = 72;

const STATUS_COLORS: Record<TicketStatus, string> = {
    open: '#208AEF',
    pending: '#E8A33D',
    resolved: '#2FA84F',
    closed: '#8A8F98',
};

function StatusPill({ status }: { status: TicketStatus }) {
    return (
        <View style={[styles.pill, { backgroundColor: STATUS_COLORS[status] }]}>
            <ThemedText style={styles.pillText}>{status}</ThemedText>
        </View>
    );
}

function TicketRow({ ticket }: { ticket: Ticket }) {
    const theme = useTheme();
    return (
        <Pressable
            style={[styles.row, { borderColor: theme.backgroundElement }]}
            // `/tickets/[id]` doesn't exist until task 4; cast past typed-routes until then.
            onPress={() => router.push(`/tickets/${ticket.id}` as never)}>
            <View style={styles.rowText}>
                <ThemedText numberOfLines={1} style={styles.subject}>
                    {ticket.subject}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                    TKT-{ticket.id}
                </ThemedText>
            </View>
            <StatusPill status={ticket.status} />
        </Pressable>
    );
}

function SkeletonRow() {
    const theme = useTheme();
    return (
        <View style={[styles.row, { borderColor: theme.backgroundElement }]}>
            <View style={styles.rowText}>
                <View style={[styles.skeletonBlock, { width: '70%', backgroundColor: theme.backgroundElement }]} />
                <View
                    style={[
                        styles.skeletonBlock,
                        { width: 60, height: 12, marginTop: 6, backgroundColor: theme.backgroundElement },
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
    const { signOut } = useAuth();
    const { data, isLoading, isError, error, refetch, isRefetching } = useTickets();
    const showSkeleton = useDelayedLoading(isLoading);

    return (
        <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <ThemedText type="title" style={styles.headerTitle}>
                    Tickets
                </ThemedText>
                <Pressable style={styles.signOut} onPress={() => signOut()} hitSlop={8}>
                    <ThemedText type="link" themeColor="textSecondary">
                        Sign out
                    </ThemedText>
                </Pressable>
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
                    data={[1, 2, 3, 4, 5]}
                    keyExtractor={(item) => String(item)}
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
                    contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.three }}
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
    row: {
        height: ROW_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.three,
        borderBottomWidth: StyleSheet.hairlineWidth * 2,
        gap: Spacing.two,
    },
    rowText: {
        flex: 1,
        gap: 4,
    },
    subject: {
        fontWeight: '600',
    },
    pill: {
        paddingHorizontal: Spacing.two,
        paddingVertical: 4,
        borderRadius: 999,
    },
    pillText: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'capitalize',
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
