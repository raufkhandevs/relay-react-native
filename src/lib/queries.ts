import { useQuery } from '@tanstack/react-query';

import { api } from './api';
import type { CursorPaginated, Message, Paginated, Ticket, User } from '../types/api';

/**
 * `staleTime: Infinity` because the signed-in user can't change without a fresh
 * sign-in, and sign-in follows a sign-out that clears the whole cache (see
 * `signOut` in ./auth). So this fetches once per session instead of on every
 * screen that needs to know who "you" are.
 */
export function useMe() {
    return useQuery({
        queryKey: ['me'],
        queryFn: () => api.get<User>('/me'),
        staleTime: Infinity,
    });
}

/**
 * `/tickets` returns only the signed-in user's tickets, so the cache entry must
 * be keyed by user id too - not just to avoid a redundant refetch, but so a
 * leftover cache entry can never be served to a different signed-in user on the
 * same device (see `signOut` in ./auth for the primary guard against that).
 */
export function useTickets(userId: number | undefined) {
    return useQuery({
        queryKey: ['tickets', userId],
        queryFn: () => api.get<Paginated<Ticket>>('/tickets'),
    });
}

/**
 * Unlike `/tickets`, `/tickets/{id}/messages` returns the same data for every
 * user authorised to view that ticket - it isn't personalised - so the ticket
 * id alone is a safe cache key.
 */
export function useMessages(ticketId: number) {
    return useQuery({
        queryKey: ['messages', ticketId],
        queryFn: () => api.get<CursorPaginated<Message>>(`/tickets/${ticketId}/messages`),
    });
}
