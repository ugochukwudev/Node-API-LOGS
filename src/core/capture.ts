import { AsyncLocalStorage } from 'async_hooks';
import { ServerResponse } from 'http';
import zlib from 'zlib';

export interface CaptureStore {
    sessionLogs: string[];
    /** _id the current request's log will be saved under, so queued jobs can link to it. */
    requestLogId?: string;
}

// Holds the current request's (or job's) console output.
const asyncLocalStorage = new AsyncLocalStorage<CaptureStore>();

// Safety cap: one runaway request can't grow its log buffer without bound.
export const MAX_SESSION_LOGS = 500;

// Push a line into the CURRENT request's sessionLogs (if we're inside one).
// Outside a request context getStore() is undefined and this is a no-op.
const capture = (prefix: string, text: string) => {
    const store = asyncLocalStorage.getStore();
    if (!store) return;
    if (store.sessionLogs.length > MAX_SESSION_LOGS) return;
    if (store.sessionLogs.length === MAX_SESSION_LOGS) {
        store.sessionLogs.push(`[TRUNCATED] session log cap of ${MAX_SESSION_LOGS} lines reached`);
        return;
    }
    store.sessionLogs.push(`${prefix} ${text}`);
};

// Capture at the stream level, patched ONCE at module load. Everything a
// server logs ends up in stdout/stderr — console.log, Winston, pino, morgan —
// so these two wrappers cover every logger with no library-specific patching.
// The wrappers look up the active request via AsyncLocalStorage on each call.
// Never patch per request: a previous per-request patch/restore built chains
// of stale wrappers under concurrent or aborted requests, permanently
// retaining every wrapped request and a copy of every later log line
// (confirmed production heap leak).
const origStdoutWrite = process.stdout.write.bind(process.stdout);
const origStderrWrite = process.stderr.write.bind(process.stderr);
process.stdout.write = ((chunk: any, encoding?: any, cb?: any) => {
    capture('[STDOUT]', String(chunk).trim());
    return origStdoutWrite(chunk, encoding, cb);
}) as any;
process.stderr.write = ((chunk: any, encoding?: any, cb?: any) => {
    capture('[STDERR]', String(chunk).trim());
    return origStderrWrite(chunk, encoding, cb);
}) as any;

/** Run fn with a fresh capture context; console output inside lands in the returned store. */
export const runWithCapture = <T>(fn: (store: CaptureStore) => T, init: Partial<CaptureStore> = {}): T => {
    const store: CaptureStore = { sessionLogs: [], ...init };
    return asyncLocalStorage.run(store, () => fn(store));
};

/** The log id of the request currently running, if any. */
export const currentRequestLogId = () => asyncLocalStorage.getStore()?.requestLogId;

/** Run fn outside any request context, so the logger's own work is never captured into a request. */
export const runOutsideCapture = <T>(fn: () => T): T => asyncLocalStorage.exit(fn);

/** Write the logger's own warnings straight to stderr, bypassing capture. */
export const internalWarn = (...parts: unknown[]) => {
    const text = parts
        .map(p => (p instanceof Error ? p.stack || p.message : typeof p === 'string' ? p : JSON.stringify(p)))
        .join(' ');
    origStderrWrite(`[node-api-logs] ${text}\n`);
};

export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

const TEXT_TYPE = /^(text\/|application\/(json|.*\+json|xml|.*\+xml|javascript|x-www-form-urlencoded|graphql))/i;
const JSON_TYPE = /^application\/(json|.*\+json)/i;

const decompress = (buf: Buffer, encoding: string): Buffer => {
    // SYNC_FLUSH lets a body cut off at maxBodyBytes still decode as far as it goes.
    const opts = { finishFlush: zlib.constants.Z_SYNC_FLUSH };
    if (encoding === 'gzip') return zlib.gunzipSync(buf, opts);
    if (encoding === 'deflate') return zlib.inflateSync(buf, opts);
    if (encoding === 'br') return zlib.brotliDecompressSync(buf, { finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH });
    return buf;
};

export const decodeBody = (
    raw: Buffer,
    contentType: string,
    contentEncoding: string,
    truncated: boolean,
    maxBytes: number
): unknown => {
    if (raw.length === 0) return {};
    let buf = raw;
    if (contentEncoding && contentEncoding !== 'identity') {
        try { buf = decompress(raw, contentEncoding.toLowerCase()); } catch {
            return `[${contentEncoding}-encoded body, ${raw.length} bytes, could not decode]`;
        }
    }
    // A missing content-type is treated as text: res.end('...') with no header is common.
    if (contentType && !TEXT_TYPE.test(contentType)) {
        return `[binary ${contentType.split(';')[0]}, ${raw.length}${truncated ? '+' : ''} bytes]`;
    }
    const text = buf.toString('utf8');
    if (truncated) return `${text}\n[TRUNCATED] response body over ${maxBytes} bytes`;
    if (!contentType || JSON_TYPE.test(contentType)) {
        try { return JSON.parse(text); } catch { /* not JSON, keep text */ }
    }
    return text;
};

/**
 * Record everything written to a raw Node response (write + end), so bodies are
 * captured whether a framework sends them in one go or streams them.
 * Returns a function that decodes the captured body once the response is done.
 */
export const captureResponseBody = (res: ServerResponse, maxBytes = DEFAULT_MAX_BODY_BYTES) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;

    const push = (chunk: unknown, encoding: unknown) => {
        if (chunk == null || typeof chunk === 'function') return;
        const buf = Buffer.isBuffer(chunk)
            ? chunk
            : chunk instanceof Uint8Array
                ? Buffer.from(chunk)
                : Buffer.from(String(chunk), typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8');
        const room = maxBytes - size;
        if (room <= 0) {
            if (buf.length) truncated = true;
            return;
        }
        if (buf.length > room) {
            chunks.push(buf.subarray(0, room));
            size += room;
            truncated = true;
        } else {
            chunks.push(buf);
            size += buf.length;
        }
    };

    const origWrite = res.write;
    const origEnd = res.end;
    res.write = function (this: ServerResponse, chunk: any, ...rest: any[]) {
        push(chunk, rest[0]);
        return (origWrite as any).call(this, chunk, ...rest);
    } as any;
    res.end = function (this: ServerResponse, chunk?: any, ...rest: any[]) {
        push(chunk, rest[0]);
        return (origEnd as any).call(this, chunk, ...rest);
    } as any;

    return (): unknown => decodeBody(
        Buffer.concat(chunks),
        String(res.getHeader('content-type') || ''),
        String(res.getHeader('content-encoding') || ''),
        truncated,
        maxBytes
    );
};
