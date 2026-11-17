import ApiLogBlob from '../models/apilogblob.model';

/**
 * Filters shared by the logs list, export and delete. Everything is optional;
 * values come straight from query strings.
 */
export interface LogSearchParams {
    /** ISO date-time bounds */
    from?: string;
    to?: string;
    /** `404`, `5xx`, or a comma list mixing both: `401,403,5xx` */
    status?: string;
    method?: string;
    /** Text anywhere in the URL */
    endpoint?: string;
    ip?: string;
    /** Slower than (ms) */
    minMs?: string;
    /** Text anywhere in the captured console output */
    consoleText?: string;
    /** Text anywhere in the request / response body */
    requestText?: string;
    responseText?: string;
    /** A JSON field equal to a value, e.g. request + event + order.paid */
    jsonTarget?: string;
    jsonPath?: string;
    jsonValue?: string;
}

export const SEARCH_PARAM_KEYS: (keyof LogSearchParams)[] = [
    'from', 'to', 'status', 'method', 'endpoint', 'ip', 'minMs',
    'consoleText', 'requestText', 'responseText', 'jsonTarget', 'jsonPath', 'jsonValue',
];

const DAY_MS = 24 * 60 * 60 * 1000;
/** Without a start date, the list shows the last 30 days... */
export const DEFAULT_WINDOW_DAYS = 30;
/** ...and text searches look at the last 7, so they stay fast. */
export const DEFAULT_TEXT_WINDOW_DAYS = 7;
/** Most stored bodies a single text or field search will match. */
export const MAX_BLOB_MATCHES = 10000;

export const parseSearchParams = (query: Record<string, unknown>): LogSearchParams => {
    const out: LogSearchParams = {};
    for (const key of SEARCH_PARAM_KEYS) {
        const value = query[key];
        if (typeof value === 'string' && value.trim() !== '') out[key] = value.trim();
    }
    return out;
};

export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const containsText = (text: string) => ({ $regex: escapeRegex(text), $options: 'i' });

const parseDate = (value?: string) => {
    if (!value) return undefined;
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
};

/** `404` → 404, `5xx` → 500–599, `401,403,5xx` → either. */
export const buildStatusQuery = (status?: string): Record<string, unknown> | null => {
    if (!status) return null;
    const codes: number[] = [];
    const ranges: { status: { $gte: number; $lt: number } }[] = [];
    for (const part of status.split(',').map(p => p.trim().toLowerCase()).filter(Boolean)) {
        const cls = /^([1-5])xx$/.exec(part);
        if (cls) {
            const base = Number(cls[1]) * 100;
            ranges.push({ status: { $gte: base, $lt: base + 100 } });
        } else if (/^\d{3}$/.test(part)) {
            codes.push(Number(part));
        }
    }
    const clauses: Record<string, unknown>[] = [...ranges];
    if (codes.length) clauses.push({ status: codes.length === 1 ? codes[0] : { $in: codes } });
    if (!clauses.length) return null;
    return clauses.length === 1 ? clauses[0] : { $or: clauses };
};

// Field paths are used as Mongo keys: letters, digits, _ - and dots only.
const SAFE_PATH = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;

/** A query-string value can mean a string, number or boolean in the body. */
const jsonValueCandidates = (value: string): unknown[] => {
    const out: unknown[] = [value];
    if (value !== '' && !isNaN(Number(value))) out.push(Number(value));
    if (value === 'true') out.push(true);
    if (value === 'false') out.push(false);
    if (value === 'null') out.push(null);
    return out;
};

const matchingBlobIds = async (query: Record<string, unknown>, from: Date) => {
    const blobs = await ApiLogBlob.find({ ...query, lastSeenAt: { $gte: from } }, { _id: 1 })
        .limit(MAX_BLOB_MATCHES)
        .lean();
    return blobs.map(b => b._id);
};

export interface LogQuery {
    filter: Record<string, any>;
    /** True when the query can't use the plain indexes (text, contains, body search). */
    usesText: boolean;
    from: Date;
}

/** Build the MongoDB filter for ApiLog from search params. */
export const buildLogQuery = async (params: LogSearchParams, now = new Date()): Promise<LogQuery> => {
    const textSearch = !!(params.consoleText || params.requestText || params.responseText || (params.jsonPath && params.jsonValue !== undefined));
    const usesText = textSearch || !!params.endpoint;
    const windowDays = textSearch ? DEFAULT_TEXT_WINDOW_DAYS : DEFAULT_WINDOW_DAYS;
    const from = parseDate(params.from) || new Date(now.getTime() - windowDays * DAY_MS);
    const to = parseDate(params.to);

    const and: Record<string, unknown>[] = [];
    and.push({ date: to ? { $gte: from, $lte: to } : { $gte: from } });

    const status = buildStatusQuery(params.status);
    if (status) and.push(status);
    if (params.method) and.push({ method: params.method.toUpperCase() });
    if (params.endpoint) and.push({ endpoint: containsText(params.endpoint) });
    if (params.ip) and.push({ ip: params.ip });
    if (params.minMs && !isNaN(Number(params.minMs))) and.push({ responseTime: { $gte: Number(params.minMs) } });
    if (params.consoleText) and.push({ sessionLogs: containsText(params.consoleText) });

    // Body searches run over the unique stored bodies, then find the logs that use them.
    if (params.requestText) {
        and.push({ requestBodyRef: { $in: await matchingBlobIds({ text: containsText(params.requestText) }, from) } });
    }
    if (params.responseText) {
        and.push({ responseBodyRef: { $in: await matchingBlobIds({ text: containsText(params.responseText) }, from) } });
    }
    if (params.jsonPath && params.jsonValue !== undefined) {
        const path = params.jsonPath.replace(/^(body|request|response)\./, '');
        if (!SAFE_PATH.test(path)) throw new SearchError('JSON field may only contain letters, digits, _, - and dots');
        const ids = await matchingBlobIds({ [`data.${path}`]: { $in: jsonValueCandidates(params.jsonValue) } }, from);
        and.push(params.jsonTarget === 'response' ? { responseBodyRef: { $in: ids } } : { requestBodyRef: { $in: ids } });
    }

    return { filter: and.length === 1 ? and[0] : { $and: and }, usesText, from };
};

/** A problem with the search itself (shown to the user as a 400). */
export class SearchError extends Error {}
