import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { Writable } from 'stream';
import ApiLog from '../models/apilogs.model';
import ApiLogBlob from '../models/apilogblob.model';
import { BLOB_REF_FIELDS } from './blobs';
import { buildXlsx, Cell } from './xlsx';

export type ExportFormat = 'csv' | 'xlsx' | 'sqlite' | 'jsonl';
export const EXPORT_FORMATS: ExportFormat[] = ['csv', 'xlsx', 'sqlite', 'jsonl'];

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
    csv: 'text/csv; charset=utf-8',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sqlite: 'application/vnd.sqlite3',
    jsonl: 'application/x-ndjson; charset=utf-8',
};

/** XLSX is built in memory, so it has a row cap; CSV, SQLite and JSON Lines don't. */
export const MAX_XLSX_ROWS = 100000;
/** Top-level JSON fields turned into their own spreadsheet columns, per body. */
const MAX_FLAT_COLUMNS = 50;
const BATCH = 500;

export interface ExportRow {
    id: string;
    date: string;
    method: string;
    endpoint: string;
    status: number;
    responseTime: number;
    ip: string;
    requestBody: unknown;
    responseBody: unknown;
    headers: unknown;
    sessionLogs: string[];
}

/** Matching logs, newest first, with bodies and headers put back. */
export async function* iterateLogs(filter: Record<string, unknown>, limit?: number): AsyncGenerator<ExportRow> {
    const cursor = ApiLog.find(filter).sort({ date: -1 }).lean().cursor({ batchSize: BATCH });
    let batch: any[] = [];
    let emitted = 0;

    const flush = async function* () {
        const refs = Array.from(new Set(batch.flatMap(l => BLOB_REF_FIELDS.map(f => l[f])).filter(Boolean)));
        const blobs = refs.length ? await ApiLogBlob.find({ _id: { $in: refs } }, { data: 1 }).lean() : [];
        const byId = new Map(blobs.map(b => [b._id, b.data]));
        const resolve = (ref: string | null | undefined, inline: unknown) =>
            ref ? (byId.has(ref) ? byId.get(ref) : '[body no longer stored]') : inline ?? {};
        for (const l of batch) {
            yield {
                id: String(l._id),
                date: new Date(l.date).toISOString(),
                method: l.method,
                endpoint: l.endpoint,
                status: l.status,
                responseTime: l.responseTime,
                ip: l.ip,
                requestBody: resolve(l.requestBodyRef, l.requestBody),
                responseBody: resolve(l.responseBodyRef, l.responseBody),
                headers: resolve(l.headersRef, l.headers),
                sessionLogs: l.sessionLogs || [],
            } as ExportRow;
        }
        batch = [];
    };

    for await (const log of cursor) {
        batch.push(log);
        emitted++;
        if (batch.length >= BATCH) yield* flush();
        if (limit && emitted >= limit) break;
    }
    if (batch.length) yield* flush();
    await cursor.close();
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    Object.prototype.toString.call(v) === '[object Object]';

const asText = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v));

const BASE_COLUMNS = ['id', 'date', 'method', 'endpoint', 'status', 'response_time_ms', 'ip'];
const BODY_COLUMNS = ['request_body', 'response_body', 'headers', 'console_logs'];

/** Spreadsheet columns: fixed ones, then `request.<field>` / `response.<field>` for top-level JSON fields. */
const discoverColumns = async (filter: Record<string, unknown>, limit?: number) => {
    const req = new Set<string>();
    const res = new Set<string>();
    for await (const row of iterateLogs(filter, limit)) {
        if (isPlainObject(row.requestBody)) for (const k of Object.keys(row.requestBody)) if (req.size < MAX_FLAT_COLUMNS) req.add(k);
        if (isPlainObject(row.responseBody)) for (const k of Object.keys(row.responseBody)) if (res.size < MAX_FLAT_COLUMNS) res.add(k);
    }
    return { req: Array.from(req), res: Array.from(res) };
};

const spreadsheetRow = (row: ExportRow, cols: { req: string[]; res: string[] }): Cell[] => [
    row.id, row.date, row.method, row.endpoint, row.status, row.responseTime, row.ip,
    ...cols.req.map(k => (isPlainObject(row.requestBody) ? asText(row.requestBody[k]) : '')),
    ...cols.res.map(k => (isPlainObject(row.responseBody) ? asText(row.responseBody[k]) : '')),
    asText(row.requestBody), asText(row.responseBody), asText(row.headers), row.sessionLogs.join('\n'),
];

const spreadsheetHeader = (cols: { req: string[]; res: string[] }) => [
    ...BASE_COLUMNS,
    ...cols.req.map(k => `request.${k}`),
    ...cols.res.map(k => `response.${k}`),
    ...BODY_COLUMNS,
];

// Logged values come from API callers; a cell starting with = + - @ would run
// as a formula when the CSV is opened in Excel.
const csvCell = (value: Cell) => {
    let text = value === null || value === undefined ? '' : String(value);
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const write = (out: Writable, chunk: string | Buffer) =>
    new Promise<void>((resolve, reject) => {
        if (out.write(chunk)) return resolve();
        out.once('drain', resolve);
        out.once('error', reject);
    });

const exportJsonl = async (filter: Record<string, unknown>, out: Writable) => {
    for await (const row of iterateLogs(filter)) await write(out, JSON.stringify(row) + '\n');
};

const exportCsv = async (filter: Record<string, unknown>, out: Writable) => {
    const cols = await discoverColumns(filter);
    // BOM so Excel reads UTF-8 correctly
    await write(out, '﻿' + spreadsheetHeader(cols).map(csvCell).join(',') + '\r\n');
    for await (const row of iterateLogs(filter)) {
        await write(out, spreadsheetRow(row, cols).map(csvCell).join(',') + '\r\n');
    }
};

const exportXlsx = async (filter: Record<string, unknown>, out: Writable) => {
    const cols = await discoverColumns(filter, MAX_XLSX_ROWS);
    const rows: Cell[][] = [];
    for await (const row of iterateLogs(filter, MAX_XLSX_ROWS)) rows.push(spreadsheetRow(row, cols));
    if (rows.length >= MAX_XLSX_ROWS && (await ApiLog.find(filter, { _id: 1 }).skip(MAX_XLSX_ROWS).limit(1).lean()).length) {
        rows.push([`[Export stopped at ${MAX_XLSX_ROWS.toLocaleString('en')} rows. Use CSV, SQLite or JSON Lines for everything.]`]);
    }
    await write(out, buildXlsx(spreadsheetHeader(cols), rows));
};

/** node:sqlite ships with Node 22.5+; older Node gets a clear message instead. */
export const loadSqlite = (): any | null => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('node:sqlite');
    } catch {
        return null;
    }
};

export class ExportUnavailableError extends Error {}

const exportSqlite = async (filter: Record<string, unknown>, out: Writable) => {
    const sqlite = loadSqlite();
    if (!sqlite) throw new ExportUnavailableError('SQLite export needs Node.js 22.5 or newer. Use CSV or JSON Lines instead.');
    const file = path.join(os.tmpdir(), `api-logs-${crypto.randomBytes(8).toString('hex')}.sqlite`);
    const db = new sqlite.DatabaseSync(file);
    try {
        db.exec(`CREATE TABLE logs (
            id TEXT PRIMARY KEY, date TEXT, method TEXT, endpoint TEXT, status INTEGER,
            response_time_ms INTEGER, ip TEXT, request_body TEXT, response_body TEXT,
            headers TEXT, console_logs TEXT
        )`);
        const insert = db.prepare('INSERT INTO logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        db.exec('BEGIN');
        for await (const r of iterateLogs(filter)) {
            insert.run(r.id, r.date, r.method, r.endpoint, r.status, r.responseTime, r.ip,
                JSON.stringify(r.requestBody), JSON.stringify(r.responseBody), JSON.stringify(r.headers), r.sessionLogs.join('\n'));
        }
        db.exec('COMMIT');
        db.exec('CREATE INDEX logs_date ON logs (date); CREATE INDEX logs_endpoint ON logs (endpoint); CREATE INDEX logs_status ON logs (status);');
        db.close();
        await new Promise<void>((resolve, reject) => {
            const stream = fs.createReadStream(file);
            stream.on('error', reject);
            stream.on('end', resolve);
            stream.pipe(out, { end: false });
        });
    } finally {
        try { db.close(); } catch { /* already closed */ }
        fs.rm(file, { force: true }, () => {});
    }
};

/** Write matching logs to `out` in the chosen format. Does not end `out`. */
export const exportLogs = async (format: ExportFormat, filter: Record<string, unknown>, out: Writable) => {
    if (format === 'jsonl') return exportJsonl(filter, out);
    if (format === 'csv') return exportCsv(filter, out);
    if (format === 'xlsx') return exportXlsx(filter, out);
    return exportSqlite(filter, out);
};

export const exportFileName = (format: ExportFormat, now = new Date()) =>
    `api-logs-${now.toISOString().slice(0, 16).replace(/[-:T]/g, '')}.${format}`;
