export const MASK = '********';

export const DEFAULT_SENSITIVE_FIELDS = [
    'password', 'passwd', 'pwd', 'secret', 'token', 'accessToken', 'refreshToken',
    'apiKey', 'authorization', 'cookie', 'otp', 'pin', 'cvv', 'cardNumber', 'ssn',
];

export const DEFAULT_SENSITIVE_HEADERS = ['authorization', 'cookie', 'set-cookie', 'x-api-key'];

export interface RedactOptions {
    /** Extra field names to mask, e.g. ['bvn', 'nin'] */
    add?: string[];
    /** Default field names to stop masking, e.g. ['pin'] */
    remove?: string[];
}

export interface Redactor {
    body: (value: unknown) => unknown;
    headers: (headers: Record<string, unknown> | undefined) => Record<string, unknown>;
    url: (url: string) => string;
}

// accessToken, access_token and Access-Token all normalise to "accesstoken".
const normalize = (key: string) => key.toLowerCase().replace(/[_\-\s]/g, '');

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    Object.prototype.toString.call(value) === '[object Object]';

// Empty stays empty so you can still tell "not sent" from "sent".
const maskValue = (value: unknown) =>
    value === '' || value === null || value === undefined ? value : MASK;

const MAX_DEPTH = 50;

export const createRedactor = ({ add = [], remove = [] }: RedactOptions = {}): Redactor => {
    const removed = new Set(remove.map(normalize));
    const fields = new Set(
        [...DEFAULT_SENSITIVE_FIELDS, ...add].map(normalize).filter(f => !removed.has(f))
    );
    const headerNames = new Set(
        DEFAULT_SENSITIVE_HEADERS.filter(h => !removed.has(normalize(h)))
    );
    const isSensitive = (key: string) => fields.has(normalize(key));

    const body = (value: unknown, depth = 0): unknown => {
        if (depth > MAX_DEPTH) return value;
        if (Array.isArray(value)) return value.map(v => body(v, depth + 1));
        if (!isPlainObject(value)) return value;
        const out: Record<string, unknown> = {};
        for (const [key, v] of Object.entries(value)) {
            out[key] = isSensitive(key) ? maskValue(v) : body(v, depth + 1);
        }
        return out;
    };

    const headers = (input: Record<string, unknown> | undefined) => {
        const out: Record<string, unknown> = {};
        for (const [key, v] of Object.entries(input || {})) {
            out[key] = headerNames.has(key.toLowerCase()) || isSensitive(key) ? maskValue(v) : v;
        }
        return out;
    };

    // Rebuilt by hand rather than with URLSearchParams so untouched params keep
    // their original encoding.
    const url = (input: string) => {
        const q = input.indexOf('?');
        if (q === -1) return input;
        const params = input.slice(q + 1).split('&').map(pair => {
            const eq = pair.indexOf('=');
            if (eq === -1) return pair;
            const key = pair.slice(0, eq);
            const value = pair.slice(eq + 1);
            let decodedKey = key;
            try { decodedKey = decodeURIComponent(key); } catch { /* keep raw */ }
            return isSensitive(decodedKey) && value !== '' ? `${key}=${MASK}` : pair;
        });
        return `${input.slice(0, q)}?${params.join('&')}`;
    };

    return { body: v => body(v), headers, url };
};
