"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logMiddleware = void 0;
const apilogs_model_1 = __importDefault(require("../models/apilogs.model"));
const async_hooks_1 = require("async_hooks");
// Use AsyncLocalStorage to hold sessionLogs per request
const asyncLocalStorage = new async_hooks_1.AsyncLocalStorage();
// Dynamically patch Winston loggers so all Winston logs go into sessionLogs for the current request
try {
    // @ts-ignore: optional Winston
    const winston = require('winston');
    if (winston.Logger && winston.Logger.prototype.log) {
        const origLogMethod = winston.Logger.prototype.log;
        winston.Logger.prototype.log = function (levelOrInfo, msg, ...meta) {
            const store = asyncLocalStorage.getStore();
            if (store) {
                let level = typeof levelOrInfo === 'string' ? levelOrInfo : levelOrInfo.level;
                let message = typeof levelOrInfo === 'object' ? levelOrInfo.message : msg;
                let rest = meta.length ? ' ' + JSON.stringify(meta) : '';
                store.sessionLogs.push(`[WINSTON] [${level}] ${message}${rest}`);
            }
            return origLogMethod.apply(this, arguments);
        };
    }
    // Patch default logger methods like winston.info(), winston.error(), etc.
    ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly', 'log'].forEach(fn => {
        if (typeof winston[fn] === 'function') {
            const origFn = winston[fn];
            winston[fn] = function (...args) {
                const store = asyncLocalStorage.getStore();
                if (store)
                    store.sessionLogs.push(`[WINSTON] [${fn}] ${args.join(' ')}`);
                return origFn.apply(winston, args);
            };
        }
    });
}
catch {
    // Winston not present or patch failed - silently ignore
}
const logMiddleware = (beginswith, specifics) => (req, res, next) => {
    // Run the rest of the middleware inside AsyncLocalStorage context
    asyncLocalStorage.run({ sessionLogs: [] }, () => {
        const startTime = Date.now();
        const originalSend = res.send;
        let responseBody = {};
        res.send = function (body) {
            try {
                responseBody = typeof body === 'string' ? JSON.parse(body) : body;
            }
            catch {
                responseBody = body;
            }
            return originalSend.apply(res, [body]);
        };
        // Filter skipped routes
        if (beginswith && !beginswith.some(p => req.originalUrl.startsWith(p)))
            return next();
        if (specifics && specifics.includes(req.originalUrl))
            return next();
        const excluded = ['/logs', '/logs/login', '/logs/:id', '/logs/api', '/logs/auth', '/styles/', '/js/'];
        if (excluded.some(p => req.originalUrl.startsWith(p)))
            return next();
        // Monkey-patch console and process streams to capture logs and any stdout/stderr writes
        const store = asyncLocalStorage.getStore();
        const origLog = console.log, origErr = console.error, origWarn = console.warn;
        const origStdoutWrite = process.stdout.write.bind(process.stdout);
        const origStderrWrite = process.stderr.write.bind(process.stderr);
        console.log = (...args) => { store.sessionLogs.push('[LOG] ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')); origLog(...args); };
        console.error = (...args) => { store.sessionLogs.push('[ERROR] ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')); origErr(...args); };
        console.warn = (...args) => { store.sessionLogs.push('[WARN] ' + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')); origWarn(...args); };
        process.stdout.write = ((chunk, encoding, cb) => {
            store.sessionLogs.push('[STDOUT] ' + chunk.toString().trim());
            return origStdoutWrite(chunk, encoding, cb);
        });
        process.stderr.write = ((chunk, encoding, cb) => {
            store.sessionLogs.push('[STDERR] ' + chunk.toString().trim());
            return origStderrWrite(chunk, encoding, cb);
        });
        // On response finish, save log including sessionLogs asynchronously
        res.on('finish', () => {
            const duration = Date.now() - startTime;
            const logEntry = new apilogs_model_1.default({
                method: req.method,
                endpoint: req.originalUrl,
                status: res.statusCode,
                responseTime: duration,
                requestBody: req.body || {},
                responseBody: responseBody || {},
                headers: req.headers,
                ip: req.ip || req.socket.remoteAddress,
                date: new Date(),
                sessionLogs: store.sessionLogs
            });
            // Save asynchronously without blocking the response
            logEntry.save().catch(e => origErr('Failed to save API log:', e));
            // Restore console methods immediately after response
            console.log = origLog;
            console.error = origErr;
            console.warn = origWarn;
            process.stdout.write = origStdoutWrite;
            process.stderr.write = origStderrWrite;
        });
        next();
    });
};
exports.logMiddleware = logMiddleware;
