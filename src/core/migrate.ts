import ApiLog from '../models/apilogs.model';
import { prepareBlob, PreparedBlob, storeBlobs } from './blobs';
import { Redactor } from './redact';

const BATCH = 500;

/**
 * Opt-in cleanup for logs written before v3: masks secrets in their bodies,
 * headers and URL, and moves bodies into the store-once collection.
 * Safe to run more than once; only v2 logs (inline bodies) are touched.
 * Returns how many logs were rewritten.
 */
export const maskStoredLogs = async (redactor: Redactor, onProgress?: (done: number) => void): Promise<number> => {
    const v2 = {
        $or: [
            { requestBody: { $exists: true } },
            { responseBody: { $exists: true } },
            { headers: { $exists: true } },
        ],
    };
    let done = 0;
    for (;;) {
        const batch = await ApiLog.find(v2, { requestBody: 1, responseBody: 1, headers: 1, endpoint: 1 }).limit(BATCH).lean();
        if (!batch.length) break;

        const blobs = new Map<string, PreparedBlob>();
        const ref = (value: unknown) => {
            const blob = prepareBlob(value);
            if (!blob) return null;
            blobs.set(blob.hash, blob);
            return blob.hash;
        };
        const updates = batch.map(log => ({
            updateOne: {
                filter: { _id: log._id },
                update: {
                    $set: {
                        endpoint: redactor.url(log.endpoint),
                        requestBodyRef: ref(redactor.body(log.requestBody)),
                        responseBodyRef: ref(redactor.body(log.responseBody)),
                        headersRef: ref(redactor.headers(log.headers)),
                    },
                    $unset: { requestBody: '', responseBody: '', headers: '' },
                },
            },
        }));
        // Blobs first: a log must never point at a blob that isn't there yet.
        await storeBlobs(Array.from(blobs.values()));
        await ApiLog.bulkWrite(updates, { ordered: false });
        done += batch.length;
        onProgress?.(done);
        if (batch.length < BATCH) break;
    }
    return done;
};
