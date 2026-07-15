import { Request, Response, NextFunction } from 'express';
import ApiLog from '../models/apilogs.model';
import { AsyncLocalStorage } from 'async_hooks';
// Use AsyncLocalStorage to hold sessionLogs per request
const asyncLocalStorage = new AsyncLocalStorage<{ sessionLogs: string[] }>();

// Safety cap: one runaway request can't grow its log buffer without bound.
const MAX_SESSION_LOGS = 500;

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
const origErr = console.error;
process.stdout.write = ((chunk: any, encoding?: any, cb?: any) => {
    capture('[STDOUT]', String(chunk).trim());
    return origStdoutWrite(chunk, encoding, cb);
}) as any;
process.stderr.write = ((chunk: any, encoding?: any, cb?: any) => {
    capture('[STDERR]', String(chunk).trim());
    return origStderrWrite(chunk, encoding, cb);
}) as any;

export const logMiddleware = (beginswith?: string[], specifics?: string[]) => (req: Request, res: Response, next: NextFunction) => {
    // Filter skipped routes BEFORE opening a request context, so nothing is
    // captured (or saved) for them.
    if (beginswith && !beginswith.some(p => req.originalUrl.startsWith(p))) return next();
    if (specifics && specifics.includes(req.originalUrl)) return next();
    const excluded = ['/logs', '/logs/login', '/logs/:id', '/logs/api', '/logs/auth', '/styles/', '/js/'];
    if (excluded.some(p => req.originalUrl.startsWith(p))) return next();

    // Run the rest of the request inside AsyncLocalStorage context; the global
    // stdout/stderr wrappers above route logs into this store.
    asyncLocalStorage.run({ sessionLogs: [] }, () => {
        const startTime = Date.now();
        const store = asyncLocalStorage.getStore()!;
        // Grab the ip up front: after a client abort the socket is already
        // destroyed by save time and req.ip/remoteAddress come back undefined.
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const originalSend = res.send;
        let responseBody: any = {};
        res.send = function (body: any) {
            try { responseBody = typeof body === 'string' ? JSON.parse(body) : body; } catch { responseBody = body; }
            return originalSend.apply(res, [body]);
        };

        // Save exactly once, whether the response completed ('finish') or the
        // client aborted / connection dropped ('close' without 'finish' —
        // previously those requests were never saved at all).
        let saved = false;
        const saveLog = () => {
            if (saved) return;
            saved = true;
            const duration = Date.now() - startTime;
            const logEntry = new ApiLog({
                method: req.method,
                endpoint: req.originalUrl,
                status: res.statusCode,
                responseTime: duration,
                requestBody: req.body || {},
                responseBody: responseBody || {},
                headers: req.headers,
                ip,
                date: new Date(),
                sessionLogs: store.sessionLogs
            });
            // Save asynchronously without blocking the response
            logEntry.save().catch(e => origErr('Failed to save API log:', e));
        };
        res.on('finish', saveLog);
        res.on('close', saveLog);
        next();
    });
};
