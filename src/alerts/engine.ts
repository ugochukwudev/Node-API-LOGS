import mongoose from 'mongoose';
import ApiLog from '../models/apilogs.model';
import User from '../models/user.model';
import { AlertRule, AlertState, IAlertRule, IAlertState } from '../models/alerts.model';
import { buildStatusQuery, escapeRegex } from '../core/search';
import { statsSource } from '../core/retention';
import { internalWarn } from '../core/capture';
import { getDashboardBasePath } from '../core/config';
import { emailConfigured, getEmailSettings, sendEmail } from './email';

export interface WrittenLog {
    _id: unknown;
    method: string;
    endpoint: string;
    status: number;
    responseTime: number;
    date: Date;
}

type Rule = IAlertRule & { _id: mongoose.Types.ObjectId };

const CACHE_MS = 30 * 1000;
let rulesCache: { at: number; rules: Rule[]; configured: boolean } | null = null;

/** Call after rules or email settings change. */
export const invalidateAlertCache = () => {
    rulesCache = null;
};

const loadRules = async () => {
    if (rulesCache && Date.now() - rulesCache.at < CACHE_MS) return rulesCache;
    const [rules, configured] = await Promise.all([
        AlertRule.find({ enabled: true }).lean() as Promise<Rule[]>,
        emailConfigured(),
    ]);
    rulesCache = { at: Date.now(), rules, configured };
    return rulesCache;
};

const pathOf = (endpoint: string) => endpoint.split('?')[0];

/** `5xx,401` style status test, in memory. */
const statusMatcher = (statuses: string) => {
    const parts = statuses.split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return () => true;
    return (status: number) => parts.some(p => {
        const cls = /^([1-5])xx$/.exec(p);
        return cls ? Math.floor(status / 100) === Number(cls[1]) : Number(p) === status;
    });
};

export const ruleMatches = (rule: Pick<IAlertRule, 'statuses' | 'endpoint' | 'minMs'>, log: WrittenLog) =>
    statusMatcher(rule.statuses || '')(log.status) &&
    (!rule.endpoint || log.endpoint.toLowerCase().includes(rule.endpoint.toLowerCase())) &&
    (!rule.minMs || log.responseTime >= rule.minMs);

/** The same rule as a MongoDB filter, for spike counts. */
const ruleFilter = (rule: Rule, since: Date) => {
    const and: Record<string, unknown>[] = [{ date: { $gte: since } }];
    const status = buildStatusQuery(rule.statuses);
    if (status) and.push(status);
    if (rule.endpoint) and.push({ endpoint: { $regex: escapeRegex(rule.endpoint), $options: 'i' } });
    if (rule.minMs) and.push({ responseTime: { $gte: rule.minMs } });
    return { $and: and };
};

const escapeHtml = (value: unknown) =>
    String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const recipientsFor = async (rule: Rule): Promise<string[]> => {
    const hasAccount = { password: { $exists: true, $ne: null } };
    if (rule.scope === 'team') return (await User.find(hasAccount, { email: 1 }).lean()).map(u => u.email);
    const owner = await User.findOne({ _id: rule.ownerId, ...hasAccount }, { email: 1 }).lean();
    return owner ? [owner.email] : [];
};

const logLink = async (logId: string) => {
    const settings = await getEmailSettings();
    const base = (settings?.dashboardUrl || '').replace(/\/$/, '');
    return base ? `${base}${getDashboardBasePath()}/${logId}` : '';
};

interface Notice {
    rule: Rule;
    sample: NonNullable<IAlertState['sample']>;
    /** Matches this email reports */
    count: number;
    /** Matches held back by the cooldown since the previous email */
    held: number;
    kind: 'first' | 'follow-up' | 'spike';
}

export const buildAlertEmail = (n: Notice, link: string) => {
    const { method, status, responseTime, date } = n.sample;
    const what = `${status} on ${method} ${pathOf(n.sample.endpoint)}`;
    const subject = n.kind === 'spike'
        ? `[API Logs] ${n.count} matching errors in ${n.rule.spikeWindowMin} min (${n.rule.name})`
        : n.kind === 'follow-up'
            ? `[API Logs] ${n.count} more: ${what}`
            : `[API Logs] ${what}`;
    const lines = [
        n.kind === 'follow-up'
            ? `${n.count} more matched in the last ${n.rule.cooldownMin} minutes.`
            : n.kind === 'spike'
                ? `${n.count} requests matched in the last ${n.rule.spikeWindowMin} minutes. Latest:`
                : `${n.count === 1 ? 'A request' : `${n.count} requests`} matched your alert.`,
        `Rule: ${n.rule.name}${n.rule.scope === 'team' ? ' (team)' : ''}`,
        `Request: ${method} ${n.sample.endpoint}`,
        `Status: ${status}`,
        `Response time: ${responseTime} ms`,
        `Time: ${new Date(date).toUTCString()}`,
        ...(n.held ? [`Plus ${n.held} more since the previous email.`] : []),
    ];
    const text = [...lines, '', link ? `View log: ${link}` : 'Set "Dashboard URL" in Settings to get links to the log.'].join('\n');
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#111">
<p style="font-size:16px;font-weight:600;margin:0 0 12px">${escapeHtml(what)}</p>
${lines.map(l => `<div style="margin:2px 0">${escapeHtml(l)}</div>`).join('\n')}
${link ? `<p style="margin-top:16px"><a href="${escapeHtml(link)}">View log</a></p>` : ''}
</div>`;
    return { subject, text, html };
};

const notify = async (n: Notice) => {
    const to = await recipientsFor(n.rule);
    if (!to.length) return;
    const email = buildAlertEmail(n, await logLink(n.sample.logId));
    for (const address of to) {
        try {
            await sendEmail({ to: address, ...email });
        } catch (err) {
            internalWarn('alert email failed:', (err as Error).message);
        }
    }
};

const sampleOf = (log: WrittenLog) => ({
    method: log.method,
    endpoint: log.endpoint,
    status: log.status,
    logId: String(log._id),
    responseTime: log.responseTime,
    date: log.date,
});

/**
 * Send now if this rule + error kind is out of its cooldown; otherwise count it
 * for the follow-up. The claim is one atomic upsert, so several server
 * instances never send the same alert twice.
 */
const fire = async (rule: Rule, key: string, logs: WrittenLog[], kind: 'first' | 'spike', spikeTotal?: number) => {
    const now = new Date();
    const sample = sampleOf(logs[logs.length - 1]);
    const cooledDown = new Date(now.getTime() - rule.cooldownMin * 60 * 1000);
    try {
        const previous = await AlertState.findOneAndUpdate(
            { _id: key, $or: [{ lastSentAt: null }, { lastSentAt: { $lte: cooledDown } }] },
            { $set: { ruleId: rule._id, lastSentAt: now, suppressed: 0, sample } },
            { upsert: true, new: false }
        ).lean();
        await notify({ rule, sample, count: kind === 'spike' ? spikeTotal! : logs.length, held: previous?.suppressed || 0, kind });
    } catch (err: any) {
        // Duplicate key = the state exists and is still cooling down.
        if (err?.code !== 11000) throw err;
        await AlertState.updateOne({ _id: key }, { $inc: { suppressed: logs.length }, $set: { sample } });
    }
};

/** Check freshly written logs against every enabled rule. */
export const evaluateLogs = async (logs: WrittenLog[]) => {
    if (!logs.length) return;
    const { rules, configured } = await loadRules();
    if (!configured || !rules.length) return;

    for (const rule of rules) {
        const matched = logs.filter(log => ruleMatches(rule, log));
        if (!matched.length) continue;

        if (rule.spikeCount) {
            const since = new Date(Date.now() - rule.spikeWindowMin * 60 * 1000);
            const total = await ApiLog.countDocuments(ruleFilter(rule, since));
            if (total >= rule.spikeCount) await fire(rule, `${rule._id}|spike`, matched, 'spike', total);
            continue;
        }

        // Group by error kind: the same endpoint + method + status shares one cooldown.
        const groups = new Map<string, WrittenLog[]>();
        for (const log of matched) {
            const key = `${rule._id}|${log.method} ${pathOf(log.endpoint)} ${log.status}`;
            groups.set(key, [...(groups.get(key) || []), log]);
        }
        for (const [key, group] of groups) await fire(rule, key, group, 'first');
    }
};

/** Email the "N more" follow-ups whose cooldown has ended. */
export const sendFollowUps = async (now = new Date()) => {
    const pending = await AlertState.find({ suppressed: { $gt: 0 }, ruleId: { $ne: null } }).lean();
    for (const state of pending) {
        const rule = (await AlertRule.findById(state.ruleId).lean()) as Rule | null;
        if (!rule || !rule.enabled || !state.sample) continue;
        if (state.lastSentAt && state.lastSentAt.getTime() > now.getTime() - rule.cooldownMin * 60 * 1000) continue;
        const claimed = await AlertState.findOneAndUpdate(
            { _id: state._id, suppressed: state.suppressed, lastSentAt: state.lastSentAt },
            { $set: { lastSentAt: now, suppressed: 0 } }
        );
        if (claimed) await notify({ rule, sample: state.sample, count: state.suppressed, held: 0, kind: 'follow-up' });
    }
};

const localDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Hour (server local time) after which the daily summary goes out. */
export const DIGEST_HOUR = 8;

/** Yesterday's summary to everyone who turned it on. Sent once per day across instances. */
export const sendDailyDigests = async (now = new Date()) => {
    if (now.getHours() < DIGEST_HOUR) return false;
    const users = await User.find({ dailyDigest: true, password: { $exists: true, $ne: null } }, { email: 1 }).lean();
    if (!users.length || !(await emailConfigured())) return false;
    try {
        await AlertState.create({ _id: `digest|${localDay(now)}` });
    } catch (err: any) {
        if (err?.code === 11000) return false;
        throw err;
    }

    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const [stats] = await ApiLog.aggregate([
        ...statsSource(start, new Date(end.getTime() - 1)),
        {
            $facet: {
                totals: [{ $group: { _id: null, n: { $sum: '$n' }, t: { $sum: '$t' }, errors: { $sum: { $cond: [{ $gte: ['$status', 500] }, '$n', 0] } } } }],
                slow: [
                    { $group: { _id: '$endpoint', t: { $sum: '$t' }, n: { $sum: '$n' } } },
                    { $project: { avg: { $divide: ['$t', '$n'] } } },
                    { $sort: { avg: -1 } },
                    { $limit: 5 },
                ],
                errors: [
                    { $match: { status: { $gte: 500 } } },
                    { $group: { _id: { endpoint: '$endpoint', status: '$status' }, n: { $sum: '$n' } } },
                    { $sort: { n: -1 } },
                    { $limit: 5 },
                ],
            },
        },
    ]);
    const totals = stats?.totals[0] || { n: 0, t: 0, errors: 0 };
    const lines = [
        `Requests: ${totals.n}`,
        `Server errors (5xx): ${totals.errors}`,
        `Average response time: ${totals.n ? Math.round(totals.t / totals.n) : 0} ms`,
        '',
        'Slowest endpoints:',
        ...(stats?.slow || []).map((s: any) => `  ${Math.round(s.avg)} ms  ${s._id}`),
        '',
        'Most server errors:',
        ...((stats?.errors || []).length ? stats.errors.map((e: any) => `  ${e.n} × ${e._id.status}  ${e._id.endpoint}`) : ['  none']),
    ];
    const subject = `[API Logs] Daily summary for ${localDay(start)}`;
    const html = `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px">${escapeHtml(lines.join('\n'))}</pre>`;
    for (const u of users) {
        try {
            await sendEmail({ to: u.email, subject, text: lines.join('\n'), html });
        } catch (err) {
            internalWarn('daily summary email failed:', (err as Error).message);
        }
    }
    return true;
};

let timers: NodeJS.Timeout[] = [];

/** Background checks for follow-ups (every minute) and the daily summary (every 10 minutes). */
export const startAlertTimers = () => {
    if (timers.length) return;
    const guarded = (fn: () => Promise<unknown>) => () => {
        if (mongoose.connection.readyState !== 1) return;
        fn().catch(err => internalWarn('alerts:', err));
    };
    timers = [
        setInterval(guarded(() => sendFollowUps()), 60 * 1000),
        setInterval(guarded(() => sendDailyDigests()), 10 * 60 * 1000),
    ];
    timers.forEach(t => t.unref());
};

export const stopAlertTimers = () => {
    timers.forEach(t => clearInterval(t));
    timers = [];
};
