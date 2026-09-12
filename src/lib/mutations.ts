import { api, ApiError, API_BASE } from './api';
import { getToken } from './auth';
import type { Message } from '../types/api';

/** What the picker gives us, kept to the fields the upload actually needs. */
export type PickedFile = {
    uri: string;
    name: string;
    mimeType: string;
};

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
 * one, which is what makes retrying a failed send safe - including a retry
 * that carries a file, since the server discards any file on a replayed key.
 *
 * A message with no file goes through the ordinary JSON `api.post` used
 * elsewhere. One with a file needs `FormData` and, for `onProgress`, a raw
 * `XMLHttpRequest` - `fetch` has no upload-progress event in React Native.
 */
export function sendMessage(
    ticketId: number,
    body: string,
    idempotencyKey: string,
    file?: PickedFile,
    onProgress?: (fraction: number) => void,
): Promise<Message> {
    if (!file) {
        return api.post<Message>(`/tickets/${ticketId}/messages`, {
            body,
            idempotency_key: idempotencyKey,
        });
    }

    return sendMessageWithAttachment(ticketId, body, idempotencyKey, file, onProgress);
}

async function sendMessageWithAttachment(
    ticketId: number,
    body: string,
    idempotencyKey: string,
    file: PickedFile,
    onProgress?: (fraction: number) => void,
): Promise<Message> {
    const token = await getToken();

    const form = new FormData();
    form.append('body', body);
    form.append('idempotency_key', idempotencyKey);
    // React Native's FormData accepts this {uri, name, type} shape for a file part,
    // in place of a Blob. The field must be named `file` to match StoreMessageRequest.
    // Whatever mimeType the picker reported goes straight through - an iPhone photo
    // is HEIC, and the server, not this client, decides what type it really is.
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);

    return new Promise<Message>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/api/tickets/${ticketId}/messages`);
        xhr.setRequestHeader('Accept', 'application/json');
        if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }
        // No Content-Type header: XMLHttpRequest sets the multipart boundary itself
        // when the body is a FormData instance. Setting it by hand drops that
        // boundary parameter and the server can no longer parse the body.

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                onProgress?.(event.loaded / event.total);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText) as Message);
            } else {
                // A 413 (oversized) arrives with no JSON body; a 422 (disallowed type)
                // does. Both become an ApiError here - readableApiError tells them apart.
                reject(new ApiError(xhr.status, xhr.responseText));
            }
        };

        xhr.onerror = () => reject(new Error('Could not reach the server. Check your connection and try again.'));

        xhr.send(form);
    });
}
