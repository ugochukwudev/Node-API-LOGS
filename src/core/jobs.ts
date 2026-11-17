import mongoose, { Types } from 'mongoose';
import JobLog, { JobStatus } from '../models/joblog.model';
import { currentRequestLogId, internalWarn, runWithCapture } from './capture';
import { prepareBlob, storeBlobs } from './blobs';
import { getWriter } from '.';

export interface JobRef {
    /** Which integration recorded it: bull, bullmq, agenda, pg-boss, custom */
    library: string;
    queue: string;
    name: string;
    jobId: string;
}

const isConnected = () => mongoose.connection.readyState === 1;

const KEY_FIELDS = (ref: JobRef) => ({ library: ref.library, queue: ref.queue, jobId: ref.jobId });

/** Mask and store a payload or result once, like request bodies. */
const storeValue = async (value: unknown) => {
    const blob = prepareBlob(getWriter().redactor.body(value));
    if (!blob) return null;
    await storeBlobs([blob]);
    return blob.hash;
};

// Job tracking must never break the host app's queue: every write is best-effort.
const safely = async (what: string, fn: () => Promise<unknown>) => {
    if (!isConnected()) return;
    try {
        await fn();
    } catch (err) {
        internalWarn(`failed to record job ${what}:`, err);
    }
};

/** Record that a job was queued. Call right after the queue accepted it. */
export const recordEnqueued = (ref: JobRef, payload: unknown, delayed = false) => {
    // Read synchronously: we're still inside the request that queued it.
    const requestLogId = currentRequestLogId();
    return safely('enqueue', async () => {
        // Upsert: a fast worker may already have started (and recorded) the job.
        await JobLog.findOneAndUpdate(
            KEY_FIELDS(ref),
            {
                $setOnInsert: {
                    name: ref.name,
                    status: delayed ? 'delayed' : 'waiting',
                    payloadRef: await storeValue(payload),
                    queuedAt: new Date(),
                },
                ...(requestLogId ? { $set: { requestLogId: new Types.ObjectId(requestLogId) } } : {}),
            },
            { upsert: true, sort: { queuedAt: -1 } }
        );
    });
};

// A run continues the latest unfinished record for the job (retries included);
// a job that already completed (e.g. a repeating job) starts a new record.
const startRun = async (ref: JobRef, payload: unknown, attempt?: number) => {
    const now = new Date();
    const update = {
        status: 'active' as JobStatus,
        startedAt: now,
        finishedAt: null,
        ...(attempt ? { attempts: attempt } : {}),
    };
    const existing = await JobLog.findOneAndUpdate(
        { ...KEY_FIELDS(ref), status: { $in: ['waiting', 'delayed', 'active', 'failed'] } },
        attempt ? { $set: update } : { $set: update, $inc: { attempts: 1 } },
        { sort: { queuedAt: -1 }, new: true }
    );
    if (existing) return existing._id;
    const created = await JobLog.create({
        ...ref,
        ...update,
        attempts: attempt || 1,
        payloadRef: await storeValue(payload),
        queuedAt: now,
        requestLogId: null,
    });
    return created._id;
};

const finishRun = async (id: Types.ObjectId, startedAt: number, sessionLogs: string[], outcome: { result?: unknown; error?: unknown }) => {
    const failed = 'error' in outcome;
    const error = outcome.error as Error | undefined;
    await JobLog.updateOne({ _id: id }, {
        status: failed ? 'failed' : 'completed',
        finishedAt: new Date(),
        duration: Date.now() - startedAt,
        sessionLogs,
        error: failed ? String(error?.stack || error?.message || error) : null,
        resultRef: failed ? null : await storeValue(outcome.result),
    });
};

export interface RunInfo extends JobRef {
    payload?: unknown;
    /** The library's own attempt number, when it has one. */
    attempt?: number;
}

/**
 * Run a job's processor with tracking: console output is captured, the run is
 * marked active, then completed or failed. The processor's result or error is
 * passed through unchanged.
 */
export const runTracked = <T>(info: RunInfo, fn: () => Promise<T> | T): Promise<T> =>
    runWithCapture(async store => {
        const startedAt = Date.now();
        let id: Types.ObjectId | null = null;
        await safely('start', async () => { id = await startRun(info, info.payload, info.attempt); });
        try {
            const result = await fn();
            if (id) await safely('result', () => finishRun(id!, startedAt, store.sessionLogs, { result }));
            return result;
        } catch (error) {
            if (id) await safely('failure', () => finishRun(id!, startedAt, store.sessionLogs, { error }));
            throw error;
        }
    });

/** Like runTracked, for libraries that hand one processor call several jobs (pg-boss batches). */
export const runTrackedMany = <T>(infos: RunInfo[], fn: () => Promise<T> | T): Promise<T> =>
    runWithCapture(async store => {
        const startedAt = Date.now();
        const ids: Types.ObjectId[] = [];
        await safely('start', async () => {
            for (const info of infos) ids.push(await startRun(info, info.payload, info.attempt));
        });
        try {
            const result = await fn();
            await safely('result', async () => { for (const id of ids) await finishRun(id, startedAt, store.sessionLogs, { result }); });
            return result;
        } catch (error) {
            await safely('failure', async () => { for (const id of ids) await finishRun(id, startedAt, store.sessionLogs, { error }); });
            throw error;
        }
    });

/**
 * Track work that doesn't go through a supported queue library: it is recorded
 * as queued and run immediately.
 *
 * @example
 * await trackJob('send-invoice', { orderId }, () => sendInvoice(orderId));
 */
export const trackJob = async <T>(
    name: string,
    payload: unknown,
    fn: () => Promise<T> | T,
    options: { queue?: string } = {}
): Promise<T> => {
    const ref: JobRef = { library: 'custom', queue: options.queue || 'default', name, jobId: new Types.ObjectId().toHexString() };
    await recordEnqueued(ref, payload);
    return runTracked({ ...ref, payload }, fn);
};
