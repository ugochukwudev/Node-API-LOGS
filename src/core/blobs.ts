import crypto from 'crypto';
import ApiLog from '../models/apilogs.model';
import ApiLogBlob from '../models/apilogblob.model';

export const BLOB_REF_FIELDS = ['requestBodyRef', 'responseBodyRef', 'headersRef'] as const;

// Same content must give the same hash regardless of key order.
export const stableStringify = (value: unknown): string => {
    if (value === undefined) return 'undefined';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value instanceof Date) return JSON.stringify(value);
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
};

export interface PreparedBlob {
    hash: string;
    data: unknown;
    text: string;
    size: number;
}

// Body text search covers the first 32 KB of each stored body.
export const SEARCH_TEXT_CHARS = 32 * 1024;

/** Hash a value for storage. Missing values get no blob (null ref). */
export const prepareBlob = (value: unknown): PreparedBlob | null => {
    if (value === undefined || value === null) return null;
    const json = stableStringify(value);
    return {
        hash: crypto.createHash('sha256').update(json).digest('hex'),
        data: value,
        text: (typeof value === 'string' ? value : json).slice(0, SEARCH_TEXT_CHARS),
        size: Buffer.byteLength(json),
    };
};

/** Store each blob once; existing blobs only get their lastSeenAt refreshed. */
export const storeBlobs = async (blobs: PreparedBlob[]) => {
    if (!blobs.length) return;
    const now = new Date();
    await ApiLogBlob.bulkWrite(
        blobs.map(b => ({
            updateOne: {
                filter: { _id: b.hash },
                update: {
                    $setOnInsert: { data: b.data, text: b.text, size: b.size, createdAt: now },
                    $set: { lastSeenAt: now },
                },
                upsert: true,
            },
        })),
        { ordered: false }
    );
};

/**
 * Put stored bodies and headers back onto a log for display. Logs written by
 * v2 kept them inline, and are returned as they are.
 */
export const hydrateLog = async <T extends Record<string, any>>(
    log: T
): Promise<T & { requestBody: unknown; responseBody: unknown; headers: unknown }> => {
    const refs = BLOB_REF_FIELDS.map(f => log[f]).filter(Boolean) as string[];
    const blobs = refs.length
        ? await ApiLogBlob.find({ _id: { $in: refs } }).lean()
        : [];
    const byId = new Map(blobs.map(b => [b._id, b.data]));
    const resolve = (ref: string | undefined, inline: unknown) => {
        if (ref) return byId.has(ref) ? byId.get(ref) : '[body no longer stored]';
        return inline ?? {};
    };
    const out: Record<string, any> = { ...log };
    out.requestBody = resolve(log.requestBodyRef, log.requestBody);
    out.responseBody = resolve(log.responseBodyRef, log.responseBody);
    out.headers = resolve(log.headersRef, log.headers);
    for (const f of BLOB_REF_FIELDS) delete out[f];
    return out as T & { requestBody: unknown; responseBody: unknown; headers: unknown };
};

// Blobs reused within this window are never deleted, which covers a log being
// written between "which blobs are unused?" and "delete them".
const ORPHAN_GRACE_MS = 5 * 60 * 1000;

/**
 * Delete blobs that no log points to any more. Pass the refs of the logs you
 * just deleted to limit the check to those; omit to scan every blob.
 * Returns the number of blobs deleted.
 */
export const cleanupOrphanBlobs = async (candidates?: string[]): Promise<number> => {
    const startedAt = Date.now();
    const ids = candidates
        ? Array.from(new Set(candidates.filter(Boolean)))
        : (await ApiLogBlob.find({}, { _id: 1 }).lean()).map(b => b._id);
    if (!ids.length) return 0;

    let deleted = 0;
    const BATCH = 1000;
    for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        const used = new Set<string>();
        for (const field of BLOB_REF_FIELDS) {
            const inUse = await ApiLog.distinct(field, { [field]: { $in: chunk } });
            inUse.forEach(id => used.add(String(id)));
        }
        const orphans = chunk.filter(id => !used.has(id));
        if (!orphans.length) continue;
        const result = await ApiLogBlob.deleteMany({
            _id: { $in: orphans },
            lastSeenAt: { $lt: new Date(startedAt - ORPHAN_GRACE_MS) },
        });
        deleted += result.deletedCount || 0;
    }
    return deleted;
};
