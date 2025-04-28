import { Request, Response, NextFunction } from 'express';
import ApiLog from '../models/apilogs.model';
import { AsyncLocalStorage } from 'async_hooks';
// Use AsyncLocalStorage to hold sessionLogs per request
const asyncLocalStorage = new AsyncLocalStorage<{ sessionLogs: string[] }>();

// Dynamically patch Winston loggers so all Winston logs go into sessionLogs for the current request
try {
    // @ts-ignore: optional Winston
    const winston = require('winston');
    if (winston.Logger && winston.Logger.prototype.log) {
        const origLogMethod = winston.Logger.prototype.log;
        winston.Logger.prototype.log = function (levelOrInfo: any, msg?: any, ...meta: any[]) {
            const store = asyncLocalStorage.getStore();
            if (store) {
                let level = typeof levelOrInfo === 'string' ? levelOrInfo : levelOrInfo.level;
                let message = typeof levelOrInfo === 'object' ? levelOrInfo.message : msg;
                let rest = meta.length ? ' ' + JSON.stringify(meta) : '';
                store.sessionLogs.push(`[WINSTON] [${level}] ${message}${rest}`);
            }
            return origLogMethod.apply(this, arguments as any);
        };
    }
    // Patch default logger methods like winston.info(), winston.error(), etc.
    ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly', 'log'].forEach(fn => {
        if (typeof winston[fn] === 'function') {
            const origFn = winston[fn];
            winston[fn] = function (...args: any[]) {
                const store = asyncLocalStorage.getStore();
                if (store) store.sessionLogs.push(`[WINSTON] [${fn}] ${args.join(' ')}`);
                return origFn.apply(winston, args);
            };
        }
    });
} catch {
    // Winston not present or patch failed - silently ignore
}

export const logMiddleware = (beginswith?: string[], specifics?: string[]) => (req: Request, res: Response, next: NextFunction) => {
    // Run the rest of the middleware inside AsyncLocalStorage context
    asyncLocalStorage.run({ sessionLogs: [] }, () => {
        const startTime = Date.now();
        const originalSend = res.send;
        let responseBody: any = {};
        res.send = function (body: any) {
            try { responseBody = typeof body === 'string' ? JSON.parse(body) : body; } catch { responseBody = body; }
            return originalSend.apply(res, [body]);
        };
        // Filter skipped routes
        if (beginswith && !beginswith.some(p => req.originalUrl.startsWith(p))) return next();
        if (specifics && specifics.includes(req.originalUrl)) return next();
        const excluded = ['/logs', '/logs/login', '/logs/:id', '/logs/api', '/logs/auth', '/styles/', '/js/'];
        if (excluded.some(p => req.originalUrl.startsWith(p))) return next();
        // Monkey-patch console and process streams to capture logs and any stdout/stderr writes
        const store = asyncLocalStorage.getStore()!;
        const origLog = console.log, origErr = console.error, origWarn = console.warn;
        const origStdoutWrite = process.stdout.write.bind(process.stdout);
        const origStderrWrite = process.stderr.write.bind(process.stderr);
        console.log = (...args: any[]) => { store.sessionLogs.push('[LOG] ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')); origLog(...args); };
        console.error = (...args: any[]) => { store.sessionLogs.push('[ERROR] ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')); origErr(...args); };
        console.warn = (...args: any[]) => { store.sessionLogs.push('[WARN] ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')); origWarn(...args); };
        process.stdout.write = ((chunk: any, encoding?: any, cb?: any) => {
            store.sessionLogs.push('[STDOUT] ' + chunk.toString().trim());
            return origStdoutWrite(chunk, encoding, cb);
        }) as any;
        process.stderr.write = ((chunk: any, encoding?: any, cb?: any) => {
            store.sessionLogs.push('[STDERR] ' + chunk.toString().trim());
            return origStderrWrite(chunk, encoding, cb);
        }) as any;
        // On response finish, save log including sessionLogs
        res.on('finish', async () => {
            const duration = Date.now() - startTime;
            const logEntry = new ApiLog({ method: req.method, endpoint: req.originalUrl, status: res.statusCode, responseTime: duration, requestBody: req.body || {}, responseBody: responseBody || {}, headers: req.headers, ip: req.ip || req.socket.remoteAddress, date: new Date(), sessionLogs: store.sessionLogs });
            try { await logEntry.save(); } catch (e) { origErr('Failed to save API log:', e); } finally {
                console.log = origLog;
                console.error = origErr;
                console.warn = origWarn;
                // Restore process streams
                process.stdout.write = origStdoutWrite;
                process.stderr.write = origStderrWrite;
            }
        });
        next();
    });
};
