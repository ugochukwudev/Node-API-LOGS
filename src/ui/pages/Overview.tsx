import { useMemo, useState } from 'preact/hooks';
import { api } from '../api';
import { Card, ErrorNote, Link, Segmented, Spinner, StatusBadge, useData } from '../components';
import { StackedBars } from '../chart';
import { bytes, duration, ms, num, pct } from '../format';

type Range = '1h' | '24h' | '7d' | '30d';
const RANGES: { value: Range; label: string }[] = [
    { value: '1h', label: '1 hour' },
    { value: '24h', label: '24 hours' },
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
];
// Trend buckets: hourly for short ranges, daily otherwise.
const TREND_WINDOW: Record<Range, string> = { '1h': '1h', '24h': '24h', '7d': '7d', '30d': '1m' };
const SLOW_WINDOW: Record<Range, string> = { '1h': '1h', '24h': '1d', '7d': '7d', '30d': '1m' };

const Stat = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'err' | 'warn' }) => (
    <div class="stat">
        <span class="stat-label">{label}</span>
        <span class={`stat-value ${tone ? `tone-${tone}` : ''}`}>{value}</span>
        {sub && <span class="stat-sub">{sub}</span>}
    </div>
);

const fromFor = (range: Range) => {
    const hours = { '1h': 1, '24h': 24, '7d': 168, '30d': 720 }[range];
    return new Date(Date.now() - hours * 3600 * 1000).toISOString();
};

export const OverviewPage = () => {
    const [range, setRange] = useState<Range>('24h');
    const metrics = useData(() => api(`/api/metrics?timeRange=${range}`), [range]);
    const trends = useData(() => api(`/api/status-trends?window=${TREND_WINDOW[range]}`), [range]);
    const slow = useData(() => api(`/api/slow-endpoints?window=${SLOW_WINDOW[range]}`), [range]);
    const dist = useData(() => api(`/api/status-dist?from=${encodeURIComponent(fromFor(range))}`), [range]);
    const system = useData(() => api('/api/system'), []);
    const jobs = useData(() => api(`/api/jobs?limit=1&from=${encodeURIComponent(fromFor(range))}`), [range]);

    const m = metrics.data;
    const errorRate = m && m.totalRequests ? (m.errorCount / m.totalRequests) * 100 : 0;
    const series = useMemo(
        () =>
            trends.data
                ? [
                      { label: '2xx–3xx', values: trends.data.success, colorVar: '--ok' },
                      { label: '4xx', values: trends.data.client, colorVar: '--warn' },
                      { label: '5xx', values: trends.data.server, colorVar: '--err' },
                  ]
                : [],
        [trends.data]
    );
    const distTotal = (dist.data?.distribution || []).reduce((n: number, d: any) => n + d.count, 0);

    return (
        <div class="page">
            <div class="page-head">
                <h1>Overview</h1>
                <Segmented label="Time range" value={range} options={RANGES} onChange={setRange} />
            </div>
            <ErrorNote error={metrics.error} />

            <div class="stats">
                <Stat label="Requests" value={m ? num(m.totalRequests) : '…'} />
                <Stat label="Error rate (4xx + 5xx)" value={m ? pct(errorRate) : '…'} sub={m ? `${num(m.errorCount)} errors` : undefined} tone={errorRate >= 5 ? 'err' : errorRate >= 1 ? 'warn' : undefined} />
                <Stat label="Avg response time" value={m ? ms(m.avgResponseTime) : '…'} />
                <Stat
                    label="Jobs"
                    value={jobs.data ? num(jobs.data.total) : '…'}
                    sub={jobs.data ? `${num(jobs.data.counts.failed || 0)} failed` : undefined}
                    tone={jobs.data?.counts.failed ? 'err' : undefined}
                />
            </div>

            <Card title="Requests by outcome">
                {trends.loading && !trends.data ? (
                    <div class="chart-placeholder"><Spinner /></div>
                ) : trends.data ? (
                    <StackedBars labels={trends.data.labels} series={series} hourly={TREND_WINDOW[range].endsWith('h')} />
                ) : (
                    <ErrorNote error={trends.error} />
                )}
            </Card>

            <div class="grid-2">
                <Card title="Slowest endpoints" actions={<Link to="/requests" class="btn btn-ghost btn-sm">All requests</Link>}>
                    {slow.data?.slowEndpoints?.length ? (
                        <table class="table table-compact">
                            <thead><tr><th>Endpoint</th><th class="num">Avg</th><th class="num">Requests</th></tr></thead>
                            <tbody>
                                {slow.data.slowEndpoints.map((s: any) => (
                                    <tr key={s._id}>
                                        <td class="mono truncate"><Link to={`/requests?endpoint=${encodeURIComponent(s._id)}`}>{s._id}</Link></td>
                                        <td class="num">{ms(s.avgTime)}</td>
                                        <td class="num">{num(s.count)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p class="muted pad">{slow.loading ? 'Loading…' : 'No requests in this period.'}</p>
                    )}
                </Card>

                <Card title="Status codes">
                    {distTotal ? (
                        <ul class="bars">
                            {dist.data.distribution.map((d: any) => (
                                <li key={d._id}>
                                    <Link to={`/requests?status=${d._id}`} class="bar-label"><StatusBadge status={d._id} /></Link>
                                    <span class="bar-track"><span class={`bar-fill fill-${d._id >= 500 ? 'err' : d._id >= 400 ? 'warn' : d._id >= 300 ? 'info' : 'ok'}`} style={{ width: `${Math.max(1, (d.count / distTotal) * 100)}%` }} /></span>
                                    <span class="num">{num(d.count)}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p class="muted pad">{dist.loading ? 'Loading…' : 'No requests in this period.'}</p>
                    )}
                </Card>
            </div>

            <Card title="Server">
                {system.data ? (
                    <div class="stats stats-inline">
                        <Stat label="App memory (RSS)" value={bytes(system.data.procMem.rss)} sub={`${pct(system.data.procMemPercent)} of machine`} />
                        <Stat label="Machine memory used" value={pct(system.data.memUsage)} sub={`${bytes(system.data.usedMem)} of ${bytes(system.data.totalMem)}`} />
                        <Stat label="Load (1 / 5 / 15 min)" value={system.data.loadAvg.map((l: number) => l.toFixed(2)).join(' / ')} />
                        <Stat label="Uptime" value={duration(system.data.uptime)} />
                    </div>
                ) : (
                    <ErrorNote error={system.error} />
                )}
            </Card>
        </div>
    );
};
