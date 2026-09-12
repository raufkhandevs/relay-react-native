import { api } from './api';
import type { Message } from '../types/api';

/**
 * One per distinct message; a retry of the same message reuses the value it
 * was first generated with. Only needs to avoid collisions between messages
 * sent from this device, not cryptographic unpredictability, so this stays a
 * plain Math.random template rather than pulling in expo-crypto for
 * `randomUUID`.
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
