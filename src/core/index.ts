import { IncomingMessage, ServerResponse } from 'http';
import { Types } from 'mongoose';
import { captureResponseBody, DEFAULT_MAX_BODY_BYTES, runWithCapture } from './capture';
import { createRedactor, RedactOptions } from './redact';
import { LogWriter } from './writer';

export interface CoreOptions {
    redact?: RedactOptions;
    /** Largest response body kept per request, in bytes. Default 1 MB. */
    maxBodyBytes?: number;
}

const state = {
    writer: new LogWriter({ redactor: createRedactor() }),
    maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
};

export const configureCore = ({ redact, maxBodyBytes }: CoreOptions = {}) => {
    state.writer.redactor = createRedactor(redact);
    if (maxBodyBytes) state.maxBodyBytes = maxBodyBytes;
};

export const getWriter = () => state.writer;

/** What an adapter must read from its framework's request once the response is done. */
export interface RequestInfo {
    method: string;
    url: string;
    ip: string;
    headers: Record<string, unknown>;
    /** Read at the end, after the framework's body parser has run. */
    getBody: () => unknown;
}

/**
 * Framework-independent request tracking. An adapter calls this with the raw
 * Node request/response and runs the rest of its pipeline inside `next`.
 * Saves exactly once, whether the response finished or the client aborted.
 */
export const trackRequest = (res: ServerResponse, info: RequestInfo, next: () => void) => runWithCapture(store => {
    const startTime = Date.now();
    const readBody = captureResponseBody(res, state.maxBodyBytes);

    // Save exactly once, whether the response completed ('finish') or the
    // client aborted / connection dropped ('close' without 'finish').
    let saved = false;
    const save = () => {
        if (saved) return;
        saved = true;
        state.writer.enqueue({
            _id: store.requestLogId,
            method: info.method,
            endpoint: info.url,
            status: res.statusCode,
            responseTime: Date.now() - startTime,
            requestBody: info.getBody() ?? {},
            responseBody: readBody(),
            headers: info.headers,
            ip: info.ip,
            date: new Date(),
            sessionLogs: store.sessionLogs,
        });
    };
    res.on('finish', save);
    res.on('close', save);
    next();
}, { requestLogId: new Types.ObjectId().toHexString() });

export const ipOf = (req: IncomingMessage) => req.socket?.remoteAddress || 'unknown';
