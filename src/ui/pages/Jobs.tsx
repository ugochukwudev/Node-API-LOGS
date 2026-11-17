import { useEffect, useState } from 'preact/hooks';
import { api, qs } from '../api';
import { navigate } from '../router';
import { Card, CopyButton, Empty, ErrorNote, JobStatusBadge, JsonView, Link, Pagination, Spinner, useData } from '../components';
import { dateTime, ms, relative } from '../format';

const STATUSES = ['waiting', 'delayed', 'active', 'completed', 'failed'];
const PAGE_SIZE = 50;

export const JobsPage = ({ query }: { query: URLSearchParams }) => {
    const status = query.get('status') || '';
    const queue = query.get('queue') || '';
    const name = query.get('name') || '';
    const page = Math.max(1, Number(query.get('page')) || 1);
    const key = `${status}|${queue}|${name}|${page}`;
    const [search, setSearch] = useState(name);
    useEffect(() => setSearch(name), [name]);

    const list = useData(() => api(`/api/jobs${qs({ status, queue, name, page, limit: PAGE_SIZE })}`), [key]);
    const go = (next: Record<string, string | number>) =>
        navigate(`/jobs${qs({ status, queue, name, ...next, page: next.page && Number(next.page) > 1 ? next.page : undefined })}`);
    const counts = list.data?.counts || {};
    const all = Object.values(counts).reduce((n: number, c) => n + (c as number), 0);

    return (
        <div class="page">
            <div class="page-head">
                <h1>Jobs</h1>
                <span class="muted">Last 7 days</span>
            </div>

            <div class="filters card">
                <div class="filter-row">
                    <div class="chips" role="group" aria-label="Status">
                        <button type="button" class={`chip ${!status ? 'active' : ''}`} onClick={() => go({ status: '' })}>All <span class="count">{all}</span></button>
                        {STATUSES.map(s => (
                            <button type="button" key={s} class={`chip ${status === s ? 'active' : ''}`} onClick={() => go({ status: s })}>
                                {s} <span class="count">{counts[s] || 0}</span>
                            </button>
                        ))}
                    </div>
                    <select class="input" aria-label="Queue" value={queue} onChange={e => go({ queue: (e.target as HTMLSelectElement).value })}>
                        <option value="">All queues</option>
                        {(list.data?.queues || []).map((q: string) => <option key={q} value={q}>{q}</option>)}
                    </select>
                    <form class="row nowrap grow" onSubmit={e => { e.preventDefault(); go({ name: search }); }}>
                        <input class="input grow" type="search" placeholder="Job name" aria-label="Job name" value={search} onInput={e => setSearch((e.target as HTMLInputElement).value)} />
                        <button class="btn">Search</button>
                    </form>
                </div>
            </div>

            <ErrorNote error={list.error} />
            <div class="card table-card">
                {list.loading && !list.data ? (
                    <div class="center-pad"><Spinner /></div>
                ) : list.data?.jobs?.length ? (
                    <div class="table-scroll">
                        <table class={`table table-click ${list.loading ? 'is-loading' : ''}`}>
                            <thead>
                                <tr><th>Queued</th><th>Job</th><th>Queue</th><th>Status</th><th class="num">Attempts</th><th class="num">Duration</th><th class="hide-sm">From request</th></tr>
                            </thead>
                            <tbody>
                                {list.data.jobs.map((j: any) => (
                                    <tr key={j._id} onClick={e => !(e.target as HTMLElement).closest('a') && navigate(`/jobs/${j._id}`)}>
                                        <td class="nowrap muted" title={dateTime(j.queuedAt)}>{relative(j.queuedAt)}</td>
                                        <td><Link to={`/jobs/${j._id}`}>{j.name}</Link></td>
                                        <td class="muted">{j.queue} <span class="tag">{j.library}</span></td>
                                        <td><JobStatusBadge status={j.status} /></td>
                                        <td class="num">{j.attempts}</td>
                                        <td class="num">{ms(j.duration)}</td>
                                        <td class="hide-sm">{j.requestLogId ? <Link to={`/requests/${j.requestLogId}`}>View request</Link> : <span class="muted">–</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <Empty title="No jobs yet">
                        Connect your queue with trackBullQueue, trackBullMQQueue, trackAgenda or trackPgBoss, or wrap work in trackJob.
                    </Empty>
                )}
                {list.data && (
                    <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} count={list.data.jobs.length} onPage={p => go({ page: p })} />
                )}
            </div>
        </div>
    );
};

export const JobDetailPage = ({ id }: { id: string }) => {
    const { data, error, loading } = useData(() => api(`/api/jobs/${encodeURIComponent(id)}`), [id]);
    if (loading && !data) return <div class="page center-pad"><Spinner /></div>;
    if (error) return <div class="page"><ErrorNote error={error} /><Link to="/jobs">← Back to jobs</Link></div>;
    const job = data.job;
    const consoleText = (job.sessionLogs || []).join('\n');

    return (
        <div class="page">
            <Link to="/jobs" class="back">← Jobs</Link>
            <div class="detail-head">
                <JobStatusBadge status={job.status} />
                <h1>{job.name}</h1>
                <span class="tag">{job.library}</span>
            </div>
            <dl class="facts">
                <div><dt>Queue</dt><dd>{job.queue}</dd></div>
                <div><dt>Job ID</dt><dd class="mono">{job.jobId}</dd></div>
                <div><dt>Queued</dt><dd>{dateTime(job.queuedAt)}</dd></div>
                <div><dt>Started</dt><dd>{dateTime(job.startedAt)}</dd></div>
                <div><dt>Finished</dt><dd>{dateTime(job.finishedAt)}</dd></div>
                <div><dt>Duration</dt><dd>{ms(job.duration)}</dd></div>
                <div><dt>Attempts</dt><dd>{job.attempts}</dd></div>
                <div><dt>Queued by</dt><dd>{job.requestLogId ? <Link to={`/requests/${job.requestLogId}`}>View request</Link> : '–'}</dd></div>
            </dl>

            {job.error && (
                <Card title="Error" class="card-err" actions={<CopyButton text={job.error} />}>
                    <pre class="code console">{job.error}</pre>
                </Card>
            )}
            <div class="grid-2">
                <Card title="Payload" actions={<CopyButton text={JSON.stringify(job.payload, null, 2) ?? ''} />}>
                    {job.payload === null || job.payload === undefined ? <p class="muted pad">None.</p> : <JsonView value={job.payload} />}
                </Card>
                <Card title="Result">
                    {job.result === null || job.result === undefined ? <p class="muted pad">{job.status === 'completed' ? 'No return value.' : 'Not finished.'}</p> : <JsonView value={job.result} />}
                </Card>
            </div>
            <Card title="Console output" actions={consoleText && <CopyButton text={consoleText} />}>
                {consoleText ? <pre class="code console">{consoleText}</pre> : <p class="muted pad">Nothing was logged while this job ran.</p>}
            </Card>
        </div>
    );
};
