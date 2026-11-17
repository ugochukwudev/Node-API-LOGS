import { useState } from 'preact/hooks';
import { api } from '../api';
import { Card, CopyButton, ErrorNote, JobStatusBadge, JsonView, Link, MethodBadge, Spinner, StatusBadge, useData } from '../components';
import { dateTime, ms } from '../format';

const asText = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2) ?? '');

const isEmpty = (v: unknown) =>
    v === null || v === undefined || v === '' || (typeof v === 'object' && Object.keys(v as object).length === 0);

const TABS = ['Request body', 'Response body', 'Headers', 'Console output'] as const;
type Tab = typeof TABS[number];

export const RequestDetailPage = ({ id }: { id: string }) => {
    const { data, error, loading } = useData(() => api(`/api/logs/${encodeURIComponent(id)}`), [id]);
    const jobs = useData(() => api(`/api/logs/${encodeURIComponent(id)}/jobs`), [id]);
    const [tab, setTab] = useState<Tab>('Request body');

    if (loading && !data) return <div class="page center-pad"><Spinner /></div>;
    if (error) return <div class="page"><ErrorNote error={error} /><Link to="/requests">← Back to requests</Link></div>;
    const log = data.log;
    const sessionText = (log.sessionLogs || []).join('\n');
    const content: Record<Tab, unknown> = {
        'Request body': log.requestBody,
        'Response body': log.responseBody,
        Headers: log.headers,
        'Console output': sessionText,
    };
    const current = content[tab];

    return (
        <div class="page">
            <Link to="/requests" class="back">← Requests</Link>
            <div class="detail-head">
                <MethodBadge method={log.method} />
                <StatusBadge status={log.status} />
                <h1 class="mono break">{log.endpoint}</h1>
            </div>
            <dl class="facts">
                <div><dt>Time</dt><dd>{dateTime(log.date)}</dd></div>
                <div><dt>Duration</dt><dd class={log.responseTime >= 1000 ? 'tone-warn' : ''}>{ms(log.responseTime)}</dd></div>
                <div><dt>IP</dt><dd class="mono">{log.ip}</dd></div>
                <div><dt>Request ID</dt><dd class="mono">{log._id}</dd></div>
            </dl>

            <Card
                title={
                    <div class="tabs" role="tablist">
                        {TABS.map(t => (
                            <button key={t} role="tab" aria-selected={tab === t} class={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                                {t}
                                {t === 'Console output' && log.sessionLogs?.length ? <span class="count">{log.sessionLogs.length}</span> : null}
                            </button>
                        ))}
                    </div>
                }
                actions={!isEmpty(current) && <CopyButton text={asText(current)} />}
            >
                {isEmpty(current) ? (
                    <p class="muted pad">{tab === 'Console output' ? 'Nothing was logged while handling this request.' : 'Empty.'}</p>
                ) : tab === 'Console output' ? (
                    <pre class="code console">{sessionText}</pre>
                ) : (
                    <JsonView value={current} />
                )}
            </Card>

            <Card title="Jobs queued by this request">
                {jobs.data?.jobs?.length ? (
                    <table class="table table-compact">
                        <thead><tr><th>Job</th><th>Queue</th><th>Status</th><th class="num">Duration</th></tr></thead>
                        <tbody>
                            {jobs.data.jobs.map((j: any) => (
                                <tr key={j._id}>
                                    <td><Link to={`/jobs/${j._id}`}>{j.name}</Link></td>
                                    <td class="muted">{j.queue}</td>
                                    <td><JobStatusBadge status={j.status} /></td>
                                    <td class="num">{ms(j.duration)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p class="muted pad">{jobs.loading ? 'Loading…' : 'None.'}</p>
                )}
            </Card>
        </div>
    );
};
