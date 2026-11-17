import ApiLog from '../models/apilogs.model';
import LogSummary from '../models/logsummary.model';
import { BLOB_REF_FIELDS, cleanupOrphanBlobs } from './blobs';

const DELETE_BATCH = 2000;

// Path without the query string, as an aggregation expression.
export const ENDPOINT_PATH = { $arrayElemAt: [{ $split: ['$endpoint', '?'] }, 0] };

// Start of the log's UTC hour (works on MongoDB 4.4, unlike $dateTrunc).
const HOUR_OF_DATE = {
    $dateFromString: { dateString: { $dateToString: { format: '%Y-%m-%dT%H:00:00Z', date: '$date' } } },
};

/** Fold these logs into the hourly summaries. */
const summarize = async (ids: unknown[]) => {
    const groups = await ApiLog.aggregate([
        { $match: { _id: { $in: ids } } },
        {
            $group: {
                _id: { hour: HOUR_OF_DATE, endpoint: ENDPOINT_PATH, method: '$method', status: '$status' },
                count: { $sum: 1 },
                totalTime: { $sum: '$responseTime' },
                minTime: { $min: '$responseTime' },
                maxTime: { $max: '$responseTime' },
            },
        },
    ]).allowDiskUse(true);
    if (!groups.length) return 0;
    await LogSummary.bulkWrite(
        groups.map(g => ({
            updateOne: {
                filter: g._id,
                update: {
                    $inc: { count: g.count, totalTime: g.totalTime },
                    $min: { minTime: g.minTime },
                    $max: { maxTime: g.maxTime },
                },
                upsert: true,
            },
        })),
        { ordered: false }
    );
    return groups.length;
};

export interface DeleteResult {
    deletedLogs: number;
    summaryRows: number;
    deletedBodies: number;
}

/**
 * Delete the logs matching a filter. Hourly summaries are written first, so
 * charts keep their history; stored bodies no other log uses are removed too.
 */
export const deleteLogs = async (filter: Record<string, unknown>): Promise<DeleteResult> => {
    const result: DeleteResult = { deletedLogs: 0, summaryRows: 0, deletedBodies: 0 };
    for (;;) {
        const batch = await ApiLog.find(filter, { _id: 1, requestBodyRef: 1, responseBodyRef: 1, headersRef: 1 })
            .limit(DELETE_BATCH)
            .lean();
        if (!batch.length) break;
        const ids = batch.map(l => l._id);
        result.summaryRows += await summarize(ids);
        const deleted = await ApiLog.deleteMany({ _id: { $in: ids } });
        result.deletedLogs += deleted.deletedCount || 0;
        const refs = batch.flatMap(l => BLOB_REF_FIELDS.map(f => (l as any)[f])).filter(Boolean) as string[];
        result.deletedBodies += await cleanupOrphanBlobs(refs);
        if (batch.length < DELETE_BATCH) break;
    }
    return result;
};

/** Delete hourly summaries, all of them or those before a date. */
export const deleteSummaries = async (before?: Date) => {
    const result = await LogSummary.deleteMany(before ? { hour: { $lt: before } } : {});
    return result.deletedCount || 0;
};

/**
 * Stats stages over logs AND summaries, as one stream of
 * { date, endpoint, method, status, n (requests), t (total ms) }.
 */
export const statsSource = (from: Date, to?: Date) => {
    const range = to ? { $gte: from, $lte: to } : { $gte: from };
    return [
        { $match: { date: range } },
        { $project: { _id: 0, date: 1, endpoint: ENDPOINT_PATH, method: 1, status: 1, n: { $literal: 1 }, t: '$responseTime' } },
        {
            $unionWith: {
                coll: LogSummary.collection.name,
                pipeline: [
                    { $match: { hour: range } },
                    { $project: { _id: 0, date: '$hour', endpoint: 1, method: 1, status: 1, n: '$count', t: '$totalTime' } },
                ],
            },
        },
    ];
};
