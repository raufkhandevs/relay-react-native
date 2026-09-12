import { api } from './api';
import type { Message } from '../types/api';

/**
 * One per distinct message; a retry of the same message reuses the value it
 * was first generated with.
 *
 * The uniqueness requirement is wider than this device: the backend's unique
 * index is on (ticket_id, idempotency_key) across every client, so a collision
 * with another device posting to the same ticket would return that device's
 * message instead of storing this one. A lost message, silently.
 *
 * Math.random is still sufficient. The key is 122 random bits in v4 shape, and
 * two clients would have to collide within one ticket, so the real probability
 * is negligible. What it does not need is cryptographic unpredictability:
 * nobody gains anything from guessing a key, because the server only ever
 * replays a message the caller was already authorised to read. That is why
 * this does not pull in expo-crypto for `randomUUID`.
 */
export function newIdempotencyKey(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * POST /tickets/{id}/messages. The backend keys on `idempotency_key`: a
 * repeated key returns the original message instead of creating a second
 * one, which is what makes retrying a failed send safe.
 */
export function sendMessage(ticketId: number, body: string, idempotencyKey: string) {
    return api.post<Message>(`/tickets/${ticketId}/messages`, {
        body,
        idempotency_key: idempotencyKey,
    });
}
