import { useState } from 'preact/hooks';
import { api, del, Me, post, put } from '../api';
import { Card, Empty, ErrorNote, Field, Link, Modal, Spinner, toast, useData } from '../components';

interface Rule {
    _id?: string;
    name: string;
    scope: 'personal' | 'team';
    enabled: boolean;
    statuses: string;
    endpoint: string;
    minMs: number | null;
    spikeCount: number | null;
    spikeWindowMin: number;
    cooldownMin: number;
    canEdit?: boolean;
}

const BLANK: Rule = { name: '', scope: 'personal', enabled: true, statuses: '5xx', endpoint: '', minMs: null, spikeCount: null, spikeWindowMin: 5, cooldownMin: 15 };

const summary = (r: Rule) => {
    const parts: string[] = [];
    if (r.statuses) parts.push(`status ${r.statuses}`);
    if (r.endpoint) parts.push(`URL contains "${r.endpoint}"`);
    if (r.minMs) parts.push(`slower than ${r.minMs} ms`);
    let text = parts.join(', ');
    if (r.spikeCount) text += ` · when ${r.spikeCount}+ happen within ${r.spikeWindowMin} min`;
    return `${text} · at most every ${r.cooldownMin} min`;
};

export const AlertsPage = ({ me }: { me: Me }) => {
    const rules = useData(() => api('/api/alerts/rules'), []);
    const status = useData(() => api('/api/alerts/status'), []);
    const digest = useData(() => api('/api/alerts/digest'), []);
    const [editing, setEditing] = useState<Rule | null>(null);

    const toggle = async (r: Rule) => {
        try {
            await put(`/api/alerts/rules/${r._id}`, { enabled: !r.enabled });
            rules.reload();
        } catch (err) {
            toast((err as Error).message, 'err');
        }
    };

    return (
        <div class="page">
            <div class="page-head">
                <h1>Alerts</h1>
                <button class="btn btn-primary" onClick={() => setEditing({ ...BLANK })}>New alert</button>
            </div>

            {status.data && !status.data.configured && (
                <div class="note note-warn">
                    Emails can't be sent yet because no email provider is set up.{' '}
                    {me.role === 'admin' ? <Link to="/settings">Set one up in Settings</Link> : 'Ask an admin to set one up in Settings.'}
                </div>
            )}

            <Card title="Your alerts and team alerts">
                {rules.loading && !rules.data ? (
                    <div class="center-pad"><Spinner /></div>
                ) : rules.data?.rules?.length ? (
                    <ul class="rule-list">
                        {rules.data.rules.map((r: Rule) => (
                            <li key={r._id} class={r.enabled ? '' : 'disabled'}>
                                <div class="rule-main">
                                    <span class="rule-name">
                                        {r.name} {r.scope === 'team' && <span class="tag">Team</span>}
                                    </span>
                                    <span class="muted small">{summary(r)}</span>
                                </div>
                                {r.canEdit ? (
                                    <div class="row nowrap">
                                        <label class="switch" title={r.enabled ? 'On' : 'Off'}>
                                            <input type="checkbox" checked={r.enabled} onChange={() => toggle(r)} aria-label={`${r.name} enabled`} />
                                            <span />
                                        </label>
                                        <button class="btn btn-ghost btn-sm" onClick={() => setEditing({ ...r })}>Edit</button>
                                    </div>
                                ) : (
                                    <span class="muted small">Managed by admins</span>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <Empty title="No alerts yet">For example: email me on any 5xx, or when /api/payments is slower than 3 seconds.</Empty>
                )}
            </Card>

            <Card title="Daily summary">
                <div class="row between">
                    <p class="muted">Each morning: yesterday's requests, server errors, average response time and slowest endpoints.</p>
                    {digest.data && (
                        <label class="switch">
                            <input
                                type="checkbox"
                                checked={digest.data.enabled}
                                aria-label="Daily summary email"
                                onChange={async e => {
                                    const enabled = (e.target as HTMLInputElement).checked;
                                    await put('/api/alerts/digest', { enabled });
                                    digest.reload();
                                    toast(enabled ? 'Daily summary turned on' : 'Daily summary turned off');
                                }}
                            />
                            <span />
                        </label>
                    )}
                </div>
            </Card>

            {editing && <RuleModal me={me} rule={editing} onClose={() => setEditing(null)} onSaved={() => rules.reload()} />}
        </div>
    );
};

const RuleModal = ({ me, rule, onClose, onSaved }: { me: Me; rule: Rule; onClose: () => void; onSaved: () => void }) => {
    const [r, setR] = useState<Rule>(rule);
    const [spike, setSpike] = useState(!!rule.spikeCount);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const set = <K extends keyof Rule>(k: K, v: Rule[K]) => setR(x => ({ ...x, [k]: v }));
    const numOrNull = (v: string) => (v === '' ? null : Number(v));

    const save = async (e: Event) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const body = { ...r, spikeCount: spike ? r.spikeCount || 10 : null };
        try {
            if (r._id) await put(`/api/alerts/rules/${r._id}`, body);
            else await post('/api/alerts/rules', body);
            toast('Alert saved');
            onSaved();
            onClose();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal
            title={r._id ? 'Edit alert' : 'New alert'}
            onClose={onClose}
            footer={
                <>
                    {r._id && (
                        <button
                            type="button"
                            class="btn btn-danger-ghost push-left"
                            onClick={async () => {
                                if (!confirm(`Delete "${r.name}"?`)) return;
                                await del(`/api/alerts/rules/${r._id}`);
                                toast('Alert deleted');
                                onSaved();
                                onClose();
                            }}
                        >
                            Delete
                        </button>
                    )}
                    <button type="button" class="btn" onClick={onClose}>Cancel</button>
                    <button class="btn btn-primary" form="rule-form" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
                </>
            }
        >
            <form id="rule-form" class="stack" onSubmit={save}>
                <ErrorNote error={error} />
                <Field label="Name">
                    <input class="input" value={r.name} placeholder="Payments failing" onInput={e => set('name', (e.target as HTMLInputElement).value)} required />
                </Field>
                <p class="field-label">Email when a request matches all of:</p>
                <Field label="Status" hint="e.g. 5xx, 500,502 or 401. Leave empty for any status.">
                    <input class="input" value={r.statuses} onInput={e => set('statuses', (e.target as HTMLInputElement).value)} />
                </Field>
                <Field label="URL contains" hint="Leave empty for every endpoint.">
                    <input class="input" value={r.endpoint} placeholder="/api/payments" onInput={e => set('endpoint', (e.target as HTMLInputElement).value)} />
                </Field>
                <Field label="Slower than (ms)" hint="Optional.">
                    <input class="input" type="number" min="1" value={r.minMs ?? ''} onInput={e => set('minMs', numOrNull((e.target as HTMLInputElement).value))} />
                </Field>
                <label class="check">
                    <input type="checkbox" checked={spike} onChange={e => setSpike((e.target as HTMLInputElement).checked)} />
                    Only when it keeps happening (an error spike)
                </label>
                {spike && (
                    <div class="row nowrap">
                        <Field label="At least">
                            <input class="input" type="number" min="2" value={r.spikeCount ?? 10} onInput={e => set('spikeCount', numOrNull((e.target as HTMLInputElement).value))} />
                        </Field>
                        <Field label="Within (minutes)">
                            <input class="input" type="number" min="1" value={r.spikeWindowMin} onInput={e => set('spikeWindowMin', Number((e.target as HTMLInputElement).value))} />
                        </Field>
                    </div>
                )}
                <Field label="At most one email every (minutes)" hint="Repeats during this time are counted and sent as one follow-up.">
                    <input class="input" type="number" min="1" max="1440" value={r.cooldownMin} onInput={e => set('cooldownMin', Number((e.target as HTMLInputElement).value))} />
                </Field>
                {me.role === 'admin' && !r._id && (
                    <Field label="Who gets it">
                        <select class="input" value={r.scope} onChange={e => set('scope', (e.target as HTMLSelectElement).value as Rule['scope'])}>
                            <option value="personal">Just me</option>
                            <option value="team">Everyone on the team</option>
                        </select>
                    </Field>
                )}
            </form>
        </Modal>
    );
};
