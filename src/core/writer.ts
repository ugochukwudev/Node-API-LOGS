import mongoose from 'mongoose';
import ApiLog from '../models/apilogs.model';
import { internalWarn, runOutsideCapture } from './capture';
import { prepareBlob, PreparedBlob, storeBlobs } from './blobs';
import { Redactor } from './redact';

/** A finished request as captured, before masking or storage. */
export interface RawLogEntry {
    method: string;
    endpoint: string;
    status: number;
    responseTime: number;
    requestBody: unknown;
    responseBody: unknown;
    headers: Record<string, unknown>;
    ip: string;
    date: Date;
    sessionLogs: string[];
}

export interface LogWriterOptions {
    redactor: Redactor;
    /** How often buffered logs are written. */
    flushIntervalMs?: number;
    /** Write early once this many logs are waiting. */
    maxBatch?: number;
    /** Hard cap on logs held in memory while the database is slow or down. */
    maxBuffer?: number;
    /** Whether the logs database is reachable right now. */
    isConnected?: () => boolean;
}

const WARN_EVERY_MS = 60 * 1000;

/**
 * Buffers captured requests and writes them in batches, off the request path.
 * Masking and hashing happen here, after the response has gone out. If the
 * database is unavailable, logs are dropped with a warning instead of piling up
 * in the host app's memory.
 */
export class LogWriter {
    private buffer: RawLogEntry[] = [];
    private timer: NodeJS.Timeout | null = null;
    private flushing: Promise<void> = Promise.resolve();
    private lastWarnAt = 0;
    private dropped = 0;
    redactor: Redactor;
    readonly flushIntervalMs: number;
    readonly maxBatch: number;
    readonly maxBuffer: number;
    private readonly isConnected: () => boolean;

    constructor({
        redactor,
        flushIntervalMs = 1000,
        maxBatch = 100,
        maxBuffer = 5000,
        isConnected = () => mongoose.connection.readyState === 1,
    }: LogWriterOptions) {
        this.redactor = redactor;
        this.isConnected = isConnected;
        this.flushIntervalMs = flushIntervalMs;
        this.maxBatch = maxBatch;
        this.maxBuffer = maxBuffer;
    }

    enqueue(entry: RawLogEntry) {
        if (this.buffer.length >= this.maxBuffer) {
            this.drop(1, 'in-memory log buffer is full (database too slow?)');
            return;
        }
        this.buffer.push(entry);
        if (this.buffer.length >= this.maxBatch) {
            runOutsideCapture(() => setImmediate(() => void this.flush()));
        } else {
            this.ensureTimer();
        }
    }

    /** Write everything buffered so far. Safe to call concurrently. */
    flush(): Promise<void> {
        this.flushing = this.flushing.then(() => this.writeBatch());
        return this.flushing;
    }

    stop() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    private ensureTimer() {
        if (this.timer) return;
        runOutsideCapture(() => {
            this.timer = setTimeout(() => {
                this.timer = null;
                void this.flush();
            }, this.flushIntervalMs);
            // Never keep the host process alive just to write logs.
            this.timer.unref();
        });
    }

    private drop(count: number, reason: string) {
        this.dropped += count;
        const now = Date.now();
        if (now - this.lastWarnAt >= WARN_EVERY_MS) {
            internalWarn(`dropped ${this.dropped} log(s): ${reason}`);
            this.lastWarnAt = now;
            this.dropped = 0;
        }
    }

    private async writeBatch() {
        if (!this.buffer.length) return;
        const batch = this.buffer.splice(0);
        if (!this.isConnected()) {
            this.drop(batch.length, 'logs database is not connected');
            return;
        }
        try {
            const blobs = new Map<string, PreparedBlob>();
            const ref = (value: unknown) => {
                const blob = prepareBlob(value);
                if (!blob) return null;
                blobs.set(blob.hash, blob);
                return blob.hash;
            };
            const docs = batch.map(e => ({
                method: e.method,
                endpoint: this.redactor.url(e.endpoint),
                status: e.status,
                responseTime: e.responseTime,
                // Masking runs before hashing, so real secrets are never stored or fingerprinted.
                requestBodyRef: ref(this.redactor.body(e.requestBody)),
                responseBodyRef: ref(this.redactor.body(e.responseBody)),
                headersRef: ref(this.redactor.headers(e.headers)),
                ip: e.ip,
                date: e.date,
                sessionLogs: e.sessionLogs,
            }));
            // Blobs first: a log must never point at a blob that isn't there yet.
            await storeBlobs(Array.from(blobs.values()));
            await ApiLog.insertMany(docs, { ordered: false });
        } catch (err) {
            internalWarn('failed to save API logs:', err);
        }
    }
}
