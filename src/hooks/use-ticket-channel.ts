import { useCallback, useEffect, useRef } from 'react';
import type Echo from 'laravel-echo';

import { getToken } from '@/lib/auth';
import { getEcho } from '@/lib/echo';
import type { Message } from '@/types/api';

/**
 * Subscribes to `private-ticket.{ticketId}` and calls `onMessage` for every
 * `message.created` broadcast. Leaves the channel on unmount or when
 * `ticketId` changes, so navigating between tickets never accumulates
 * subscriptions (which would otherwise render the same message several
 * times).
 *
 * Typing rides the same channel as a whisper: `channel.whisper()` and
 * `.listenForWhisper()` go client -> Reverb -> client and never touch
 * Laravel, matching the web client's `use-ticket-channel.ts`. Both sides are
 * wired against the same channel instance this hook already holds open, so
 * this adds no second subscription.
 */
export function useTicketChannel(
    ticketId: number,
    onMessage: (message: Message) => void,
    onTyping: (name: string) => void,
) {
    // Kept in refs so effect re-runs are driven only by ticketId, not by callers
    // passing a new inline function on every render.
    const onMessageRef = useRef(onMessage);
    const onTypingRef = useRef(onTyping);
    useEffect(() => {
        onMessageRef.current = onMessage;
    });
    useEffect(() => {
        onTypingRef.current = onTyping;
    });

    const channelRef = useRef<ReturnType<Echo<'reverb'>['private']> | null>(null);

    useEffect(() => {
        let cancelled = false;
        const channelName = `ticket.${ticketId}`;
        let subscribedEcho: Echo<'reverb'> | null = null;

        const typingListener = ({ name }: { name: string }) => onTypingRef.current(name);

        getToken().then((token) => {
            if (cancelled) {
                return;
            }
            const echo = getEcho(token);
            subscribedEcho = echo;
            const channel = echo.private(channelName);
            channelRef.current = channel;
            // The leading dot is mandatory: without it Echo expects a fully qualified
            // PHP class name for the event and silently matches nothing.
            channel.listen('.message.created', (message: Message) => {
                onMessageRef.current(message);
            });
            channel.listenForWhisper('typing', typingListener);
        });

        return () => {
            cancelled = true;
            channelRef.current = null;
            if (subscribedEcho) {
                const channel = subscribedEcho.private(channelName);
                channel.stopListening('.message.created');
                channel.stopListeningForWhisper('typing', typingListener);
                subscribedEcho.leave(channelName);
            }
        };
    }, [ticketId]);

    const whisperTyping = useCallback((name: string) => {
        channelRef.current?.whisper('typing', { name });
    }, []);

    return { whisperTyping };
}
