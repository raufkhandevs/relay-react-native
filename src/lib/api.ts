import { getToken } from './auth';

import { API_BASE } from './config';

export { API_BASE };

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message);
    }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();

    const response = await fetch(`${API_BASE}/api${path}`, {
        ...init,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...init.headers,
        },
    });

    if (!response.ok) {
        const body = await response.text();
        throw new ApiError(response.status, body || response.statusText);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}

export const api = {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body: unknown) =>
        request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
    delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/**
 * GET /attachments/{id} authorises against the ticket, then redirects to a presigned
 * storage URL for a browser. This client asks for JSON instead and gets `{url}` back,
 * because React Native's `fetch` has no `redirect: 'manual'`: following the redirect to
 * read its destination would mean downloading the entire file just to learn an address.
 *
 * The URL is resolved fresh on every call and never cached. It expires in five minutes,
 * and re-resolving is what makes the server re-run authorisation each time.
 */
export async function resolveAttachmentUrl(attachmentId: number): Promise<string> {
    const token = await getToken();

    const response = await fetch(`${API_BASE}/api/attachments/${attachmentId}`, {
        headers: {
            Accept: 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
    });

    if (!response.ok) {
        throw new ApiError(response.status, await response.text());
    }

    const { url } = (await response.json()) as { url: string };

    return url;
}

/** ApiError.message is the raw response body, often `{"message": "..."}`. Unwrap it for display. */
export function readableApiError(err: unknown): string {
    if (err instanceof ApiError) {
        // A 413 is rejected before Laravel's router runs (a body-size limit upstream of
        // the app), so there is no JSON to unwrap - unlike a 422, which always carries a
        // readable `message` from validation.
        if (err.status === 413) {
            return 'That file is too large. Relay accepts attachments up to 10 MB.';
        }
        try {
            const body = JSON.parse(err.message) as { message?: string };
            if (typeof body.message === 'string') {
                return body.message;
            }
        } catch {
            // body wasn't JSON, fall through to the raw text
        }
        return err.message || 'Something went wrong. Try again.';
    }
    if (err instanceof Error) {
        return 'Could not reach the server. Check your connection and try again.';
    }
    return 'Something went wrong. Try again.';
}
