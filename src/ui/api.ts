/** Where the dashboard is mounted, set by the server on <html data-base>. */
export const BASE = document.documentElement.dataset.base || '/logs';

export class ApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
    }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => {
    onUnauthorized = fn;
};

export const api = async <T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> => {
    const { json, ...rest } = init;
    const res = await fetch(`${BASE}${path}`, {
        credentials: 'same-origin',
        ...rest,
        headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...(rest.headers || {}) },
        body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        // Signed out (expired session) while using a page: back to sign-in.
        if (res.status === 401 && path.startsWith('/api/')) onUnauthorized();
        throw new ApiError(data.message || `Request failed (${res.status})`, res.status);
    }
    return data as T;
};

export const post = <T = any>(path: string, json: unknown = {}) => api<T>(path, { method: 'POST', json });
export const put = <T = any>(path: string, json: unknown = {}) => api<T>(path, { method: 'PUT', json });
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });

export const qs = (params: Record<string, string | number | undefined | null>) => {
    const out = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') out.set(k, String(v));
    const s = out.toString();
    return s ? `?${s}` : '';
};

export interface Me {
    id: string;
    email: string;
    role: 'admin' | 'dev';
    backupCodesLeft: number;
}
