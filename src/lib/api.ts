import { getToken } from './auth';

export const API_BASE = 'http://localhost:8000';

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

/** ApiError.message is the raw response body, often `{"message": "..."}`. Unwrap it for display. */
export function readableApiError(err: unknown): string {
    if (err instanceof ApiError) {
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
