import { useEffect, useRef } from 'react';
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
 */
export function useTicketChannel(ticketId: number, onMessage: (message: Message) => void) {
    // Kept in a ref so effect re-runs are driven only by ticketId, not by callers
    // passing a new inline function on every render.
    const onMessageRef = useRef(onMessage);
    useEffect(() => {
        onMessageRef.current = onMessage;
    });

    useEffect(() => {
        let cancelled = false;
        const channelName = `ticket.${ticketId}`;
        let subscribedEcho: Echo<'reverb'> | null = null;

        getToken().then((token) => {
            if (cancelled) {
                return;
            }
            const echo = getEcho(token);
            subscribedEcho = echo;
            // The leading dot is mandatory: without it Echo expects a fully qualified
            // PHP class name for the event and silently matches nothing.
            echo.private(channelName).listen('.message.created', (message: Message) => {
                onMessageRef.current(message);
            });
        });

        return () => {
            cancelled = true;
            if (subscribedEcho) {
                subscribedEcho.private(channelName).stopListening('.message.created');
                subscribedEcho.leave(channelName);
            }
        };
    }, [ticketId]);
}
