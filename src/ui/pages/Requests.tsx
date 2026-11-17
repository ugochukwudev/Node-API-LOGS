import { useEffect, useState } from 'preact/hooks';
import { api, BASE, Me, post, qs } from '../api';
import { navigate } from '../router';
import { ErrorNote, Field, Link, MethodBadge, Modal, Pagination, Spinner, StatusBadge, toast, useData, Empty } from '../components';
import { dateTime, ms, shortDateTime, toLocalInput } from '../format';

export const FILTER_KEYS = [
    'endpoint', 'status', 'method', 'from', 'to', 'minMs', 'ip',
    'consoleText', 'requestText', 'responseText', 'jsonTarget', 'jsonPath', 'jsonValue',
] as const;
type FilterKey = typeof FILTER_KEYS[number];
type Filters = Partial<Record<FilterKey, string>>;

const ADVANCED: FilterKey[] = ['minMs', 'ip', 'consoleText', 'requestText', 'responseText', 'jsonPath', 'jsonValue'];
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
const STATUS_PRESETS = [
    { value: '', label: 'All' },
    { value: '2xx', label: '2xx' },
    { value: '3xx', label: '3xx' },
    { value: '4xx', label: '4xx' },
    { value: '5xx', label: '5xx' },
];
const PAGE_SIZE = 50;

const filtersFrom = (query: URLSearchParams): Filters => {
    const f: Filters = {};
    for (const k of FILTER_KEYS) {
        const v = query.get(k);
        if (v) f[k] = v;
    }
    return f;
};

const toQuery = (f: Filters, page?: number) => qs({ ...f, page: page && page > 1 ? page : undefined });

/** <input type=datetime-local> works in local time; the API takes ISO. */
const isoToLocal = (iso?: string) => (iso ? toLocalInput(new Date(iso)) : '');
const localToIso = (local: string) => (local ? new Date(local).toISOString() : '');

const describe = (f: Filters) => {
    const parts: string[] = [];
    if (f.endpoint) parts.push(`URL contains "${f.endpoint}"`);
    if (f.status) parts.push(`status ${f.status}`);
    if (f.method) parts.push(f.method);
    if (f.from || f.to) parts.push(`${f.from ? dateTime(f.from) : 'the start'} → ${f.to ? dateTime(f.to) : 'now'}`);
    if (f.minMs) parts.push(`slower than ${f.minMs} ms`);
    if (f.ip) parts.push(`IP ${f.ip}`);
    if (f.consoleText) parts.push(`console has "${f.consoleText}"`);
    if (f.requestText) parts.push(`request has "${f.requestText}"`);
    if (f.responseText) parts.push(`response has "${f.responseText}"`);
    if (f.jsonPath) parts.push(`${f.jsonTarget === 'response' ? 'response' : 'request'}.${f.jsonPath} = "${f.jsonValue || ''}"`);
    return parts;
};

const TEXT_SEARCH: FilterKey[] = ['consoleText', 'requestText', 'responseText', 'jsonPath'];

export const RequestsPage = ({ me, query }: { me: Me; query: URLSearchParams }) => {
    const applied = filtersFrom(query);
    const page = Math.max(1, Number(query.get('page')) || 1);
    const appliedKey = toQuery(applied, page);

    const [draft, setDraft] = useState<Filters>(applied);
    const [showAdvanced, setShowAdvanced] = useState(ADVANCED.some(k => applied[k]));
    const [confirmDelete, setConfirmDelete] = useState(false);
    useEffect(() => setDraft(applied), [appliedKey]);

    const list = useData(() => api(`/api/logs${qs({ ...applied, page, limit: PAGE_SIZE })}`), [appliedKey]);
    const formats = useData(() => api('/api/export/formats'), []);

    const set = (k: FilterKey, v: string) => setDraft(d => ({ ...d, [k]: v }));
    const apply = (f: Filters) => {
        const clean: Filters = {};
        for (const k of FILTER_KEYS) if (f[k]) clean[k] = f[k]!.trim();
        navigate(`/requests${toQuery(clean)}`);
    };
    const usesText = TEXT_SEARCH.some(k => applied[k]);
    const exportHref = (format: string) => `${BASE}/api/export${qs({ ...applied, format })}`;

    return (
        <div class="page">
            <div class="page-head">
                <h1>Requests</h1>
                <div class="row">
                    <details class="menu">
                        <summary class="btn">Export</summary>
                        <div class="menu-list" role="menu">
                            {(formats.data?.formats || [{ format: 'csv', available: true }, { format: 'xlsx', available: true }, { format: 'jsonl', available: true }]).map((f: any) =>
                                f.available ? (
                                    <a key={f.format} role="menuitem" href={exportHref(f.format)} download>
                                        {{ csv: 'CSV (Excel, Sheets)', xlsx: 'Excel (.xlsx)', sqlite: 'SQLite database', jsonl: 'JSON Lines' }[f.format as string] || f.format}
                                    </a>
                                ) : (
                                    <span key={f.format} class="menu-disabled" title="Needs Node.js 22.5 or newer on the server">SQLite (needs Node 22.5+)</span>
                                )
                            )}
                            <p class="menu-note">Exports everything matching the current filters.</p>
                        </div>
                    </details>
                    {me.role === 'admin' && (
                        <button class="btn btn-danger-ghost" onClick={() => setConfirmDelete(true)}>Delete matching…</button>
                    )}
                </div>
            </div>

            <form
                class="filters card"
                onSubmit={e => {
                    e.preventDefault();
                    apply(draft);
                }}
            >
                <div class="filter-row">
                    <input
                        class="input grow"
                        type="search"
                        placeholder="Search URL, e.g. /webhooks/partner-x"
                        aria-label="URL contains"
                        value={draft.endpoint || ''}
                        onInput={e => set('endpoint', (e.target as HTMLInputElement).value)}
                    />
                    <select class="input" aria-label="Method" value={draft.method || ''} onChange={e => apply({ ...draft, method: (e.target as HTMLSelectElement).value })}>
                        <option value="">Any method</option>
                        {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input
                        class="input w-status"
                        placeholder="Status: 404, 5xx, 401,403"
                        aria-label="Status"
                        value={draft.status || ''}
                        onInput={e => set('status', (e.target as HTMLInputElement).value)}
                    />
                    <button class="btn btn-primary">Search</button>
                </div>
                <div class="filter-row">
                    <div class="chips" role="group" aria-label="Status class">
                        {STATUS_PRESETS.map(p => (
                            <button
                                type="button"
                                key={p.value}
                                class={`chip ${(applied.status || '') === p.value ? 'active' : ''}`}
                                onClick={() => apply({ ...draft, status: p.value })}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <label class="inline-field">
                        From
                        <input class="input" type="datetime-local" value={isoToLocal(draft.from)} onChange={e => set('from', localToIso((e.target as HTMLInputElement).value))} />
                    </label>
                    <label class="inline-field">
                        To
                        <input class="input" type="datetime-local" value={isoToLocal(draft.to)} onChange={e => set('to', localToIso((e.target as HTMLInputElement).value))} />
                    </label>
                    <button type="button" class="btn btn-ghost" aria-expanded={showAdvanced} onClick={() => setShowAdvanced(s => !s)}>
                        {showAdvanced ? 'Fewer filters' : 'More filters'}
                    </button>
                    {Object.keys(applied).length > 0 && (
                        <button type="button" class="btn btn-ghost" onClick={() => apply({})}>Clear</button>
                    )}
                </div>
                {showAdvanced && (
                    <div class="advanced">
                        <Field label="Console output contains">
                            <input class="input" value={draft.consoleText || ''} placeholder="Payment provider timeout" onInput={e => set('consoleText', (e.target as HTMLInputElement).value)} />
                        </Field>
                        <Field label="Request body contains">
                            <input class="input" value={draft.requestText || ''} onInput={e => set('requestText', (e.target as HTMLInputElement).value)} />
                        </Field>
                        <Field label="Response body contains">
                            <input class="input" value={draft.responseText || ''} placeholder="insufficient funds" onInput={e => set('responseText', (e.target as HTMLInputElement).value)} />
                        </Field>
                        <Field label="JSON field equals" hint="Top-level or dotted path, e.g. event or data.orderId">
                            <div class="row nowrap">
                                <select class="input" aria-label="Body" value={draft.jsonTarget || 'request'} onChange={e => set('jsonTarget', (e.target as HTMLSelectElement).value)}>
                                    <option value="request">Request</option>
                                    <option value="response">Response</option>
                                </select>
                                <input class="input" aria-label="Field" placeholder="event" value={draft.jsonPath || ''} onInput={e => set('jsonPath', (e.target as HTMLInputElement).value)} />
                                <input class="input" aria-label="Value" placeholder="order.paid" value={draft.jsonValue || ''} onInput={e => set('jsonValue', (e.target as HTMLInputElement).value)} />
                            </div>
                        </Field>
                        <Field label="Slower than (ms)">
                            <input class="input" type="number" min="0" value={draft.minMs || ''} onInput={e => set('minMs', (e.target as HTMLInputElement).value)} />
                        </Field>
                        <Field label="IP address">
                            <input class="input" value={draft.ip || ''} onInput={e => set('ip', (e.target as HTMLInputElement).value)} />
                        </Field>
                        <p class="muted small span-all">Text searches look at the last 7 days unless you set From.</p>
                    </div>
                )}
            </form>

            <ErrorNote error={list.error} />
            <div class="card table-card">
                {list.loading && !list.data ? (
                    <div class="center-pad"><Spinner /></div>
                ) : list.data?.logs?.length ? (
                    <div class="table-scroll">
                        <table class={`table table-click ${list.loading ? 'is-loading' : ''}`}>
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>Method</th>
                                    <th>Status</th>
                                    <th>URL</th>
                                    <th class="num">Duration</th>
                                    <th class="hide-sm">IP</th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.data.logs.map((l: any) => (
                                    <tr key={l._id} onClick={e => !(e.target as HTMLElement).closest('a') && navigate(`/requests/${l._id}`)}>
                                        <td class="nowrap muted" title={dateTime(l.date)}>{shortDateTime(l.date)}</td>
                                        <td><MethodBadge method={l.method} /></td>
                                        <td><StatusBadge status={l.status} /></td>
                                        <td class="mono truncate url-cell"><Link to={`/requests/${l._id}`}>{l.endpoint}</Link></td>
                                        <td class={`num nowrap ${l.responseTime >= 1000 ? 'tone-warn' : ''}`}>{ms(l.responseTime)}</td>
                                        <td class="mono muted hide-sm">{l.ip}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <Empty title="No requests match">
                        {Object.keys(applied).length ? 'Try fewer filters or a wider date range.' : 'Requests show up here as soon as your app handles them.'}
                    </Empty>
                )}
                {list.data && (
                    <Pagination
                        page={page}
                        pageSize={PAGE_SIZE}
                        total={list.data.total}
                        estimated={list.data.estimated || usesText}
                        count={list.data.logs.length}
                        onPage={p => navigate(`/requests${toQuery(applied, p)}`)}
                    />
                )}
            </div>

            {confirmDelete && <DeleteModal filters={applied} onClose={() => setConfirmDelete(false)} onDone={() => list.reload()} />}
        </div>
    );
};

const DeleteModal = ({ filters, onClose, onDone }: { filters: Filters; onClose: () => void; onDone: () => void }) => {
    const parts = describe(filters);
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const everything = parts.length === 0;

    return (
        <Modal
            title="Delete requests"
            onClose={onClose}
            footer={
                <>
                    <button class="btn" onClick={onClose}>Cancel</button>
                    <button
                        class="btn btn-danger"
                        disabled={busy || (everything && typed !== 'delete all')}
                        onClick={async () => {
                            setBusy(true);
                            setError(null);
                            try {
                                const res = await post('/api/logs/delete', everything ? { all: true } : filters);
                                toast(`Deleted ${res.deletedLogs.toLocaleString()} requests. Chart totals were kept.`);
                                onDone();
                                onClose();
                            } catch (err) {
                                setError((err as Error).message);
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        {busy ? 'Deleting…' : 'Delete'}
                    </button>
                </>
            }
        >
            <ErrorNote error={error} />
            {everything ? (
                <>
                    <p>No filters are set, so this deletes <strong>every stored request</strong>.</p>
                    <Field label='Type "delete all" to confirm'>
                        <input class="input" value={typed} onInput={e => setTyped((e.target as HTMLInputElement).value)} />
                    </Field>
                </>
            ) : (
                <>
                    <p>This permanently deletes all requests where:</p>
                    <ul class="list">{parts.map(p => <li key={p}>{p}</li>)}</ul>
                    {!filters.from && <p class="muted small">No start date is set, so this includes requests of any age.</p>}
                </>
            )}
            <p class="muted small">Hourly totals are saved first, so the Overview charts keep their history. Export first if you may need the full requests later.</p>
        </Modal>
    );
};
