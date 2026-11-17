import { useEffect, useState } from 'preact/hooks';
import { api, del, Me, post, put } from '../api';
import { Card, CopyButton, ErrorNote, Field, Spinner, toast, useData } from '../components';
import { dateTime, num, relative, toLocalInput } from '../format';

export const SettingsPage = ({ me }: { me: Me; onMeChange: (m: Me) => void }) => (
    <div class="page">
        <div class="page-head"><h1>Settings</h1></div>
        <Card title="Your account">
            <dl class="facts">
                <div><dt>Email</dt><dd>{me.email}</dd></div>
                <div><dt>Role</dt><dd>{me.role === 'admin' ? 'Admin' : 'Developer'}</dd></div>
                <div><dt>Backup codes left</dt><dd class={me.backupCodesLeft <= 2 ? 'tone-warn' : ''}>{me.backupCodesLeft}</dd></div>
            </dl>
            {me.backupCodesLeft <= 2 && (
                <p class="muted small pad-x">Running low. An admin can reset your two-step sign-in so you get new codes.</p>
            )}
        </Card>
        {me.role === 'admin' && (
            <>
                <TeamSection me={me} />
                <EmailSection />
                <DataSection />
            </>
        )}
    </div>
);

const STATUS_LABEL: Record<string, string> = { invited: 'Invite pending', 'needs-2fa': 'Sets up 2FA at next sign-in', active: 'Active' };

const TeamSection = ({ me }: { me: Me }) => {
    const users = useData(() => api('/auth/users'), []);
    const [email, setEmail] = useState('');
    const [link, setLink] = useState<{ email: string; url: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const invite = async (address: string) => {
        setError(null);
        try {
            const res = await post('/auth/invites', { email: address });
            setLink({ email: res.email, url: window.location.origin + res.path });
            setEmail('');
            users.reload();
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const act = async (fn: () => Promise<any>) => {
        try {
            const res = await fn();
            toast(res.message || 'Done');
            users.reload();
        } catch (err) {
            toast((err as Error).message, 'err');
        }
    };

    return (
        <Card title="Team">
            <form class="row pad" onSubmit={e => { e.preventDefault(); invite(email); }}>
                <input class="input grow" type="email" placeholder="dev@company.com" aria-label="Email to invite" value={email} onInput={e => setEmail((e.target as HTMLInputElement).value)} required />
                <button class="btn btn-primary">Create invite link</button>
            </form>
            <div class="pad-x"><ErrorNote error={error} /></div>
            {link && (
                <div class="note note-info pad-x">
                    <p>Send this link to <strong>{link.email}</strong>. It works once and expires in 24 hours.</p>
                    <div class="row nowrap">
                        <input class="input mono grow" readOnly value={link.url} onFocus={e => (e.target as HTMLInputElement).select()} />
                        <CopyButton text={link.url} />
                    </div>
                </div>
            )}
            {users.loading && !users.data ? (
                <div class="center-pad"><Spinner /></div>
            ) : (
                <table class="table">
                    <thead><tr><th>Person</th><th>Role</th><th>Status</th><th /></tr></thead>
                    <tbody>
                        {(users.data?.users || []).map((u: any) => {
                            const self = String(u._id) === String(me.id);
                            return (
                                <tr key={u._id}>
                                    <td>{u.email}{self && <span class="muted"> (you)</span>}</td>
                                    <td>{u.role === 'admin' ? 'Admin' : 'Developer'}</td>
                                    <td class={u.status === 'active' ? '' : 'muted'}>{STATUS_LABEL[u.status] || u.status}</td>
                                    <td class="actions">
                                        {!self && u.status === 'invited' && <button class="btn btn-ghost btn-sm" onClick={() => invite(u.email)}>New link</button>}
                                        {!self && u.status === 'active' && (
                                            <button
                                                class="btn btn-ghost btn-sm"
                                                onClick={() => confirm(`Reset two-step sign-in for ${u.email}? They'll scan a new QR code next time.`) && act(() => post(`/auth/users/${u._id}/reset-2fa`))}
                                            >
                                                Reset 2FA
                                            </button>
                                        )}
                                        {!self && u.role === 'dev' && (
                                            <button class="btn btn-danger-ghost btn-sm" onClick={() => confirm(`Remove ${u.email}?`) && act(() => del(`/auth/users/${u._id}`))}>
                                                Remove
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
            <p class="muted small pad">Admins are set in the logger config (<code>admins</code>). Locked out yourself? Run <code>npx node-api-logs invite you@company.com</code> on the server.</p>
        </Card>
    );
};

const PROVIDER_LABELS: Record<string, string> = {
    brevo: 'Brevo',
    resend: 'Resend',
    sendgrid: 'SendGrid',
    mailgun: 'Mailgun',
    postmark: 'Postmark',
    smtp: 'SMTP (Gmail, Zoho, Outlook…)',
};

const EmailSection = () => {
    const settings = useData(() => api('/api/alerts/settings'), []);
    const [form, setForm] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (settings.data) setForm({ ...settings.data, apiKey: '', smtpPassword: '' });
    }, [settings.data]);
    if (!form) return <Card title="Email for alerts"><div class="center-pad"><Spinner /></div></Card>;
    const set = (k: string, v: unknown) => setForm((f: any) => ({ ...f, [k]: v }));
    const s = settings.data;

    return (
        <Card title="Email for alerts">
            {s.customSender ? (
                <p class="pad">Alerts are sent by the <code>alerts.sendEmail</code> function in your logger config.</p>
            ) : (
                <form
                    class="form-grid pad"
                    onSubmit={async e => {
                        e.preventDefault();
                        setBusy(true);
                        setError(null);
                        try {
                            await put('/api/alerts/settings', form);
                            toast('Email settings saved');
                            settings.reload();
                        } catch (err) {
                            setError((err as Error).message);
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    <div class="span-all"><ErrorNote error={error} /></div>
                    <Field label="Provider" hint="Hosts like Railway block SMTP; the others send over HTTPS and always work.">
                        <select class="input" value={form.provider || ''} onChange={e => set('provider', (e.target as HTMLSelectElement).value || null)}>
                            <option value="">Not set up</option>
                            {s.providers.map((p: string) => <option key={p} value={p}>{PROVIDER_LABELS[p] || p}</option>)}
                        </select>
                    </Field>
                    <Field label="Send from" hint="An address your provider lets you send from.">
                        <input class="input" type="email" value={form.fromEmail} placeholder="alerts@company.com" onInput={e => set('fromEmail', (e.target as HTMLInputElement).value)} />
                    </Field>
                    <Field label="Sender name">
                        <input class="input" value={form.fromName} onInput={e => set('fromName', (e.target as HTMLInputElement).value)} />
                    </Field>
                    {form.provider && form.provider !== 'smtp' && (
                        <Field label={form.provider === 'postmark' ? 'Server token' : 'API key'} hint={s.hasApiKey ? 'Saved. Leave empty to keep it.' : 'Stored encrypted.'}>
                            <input class="input" type="password" autocomplete="off" value={form.apiKey} placeholder={s.hasApiKey ? '••••••••' : ''} onInput={e => set('apiKey', (e.target as HTMLInputElement).value)} />
                        </Field>
                    )}
                    {form.provider === 'mailgun' && (
                        <>
                            <Field label="Mailgun domain">
                                <input class="input" value={form.mailgunDomain} placeholder="mg.company.com" onInput={e => set('mailgunDomain', (e.target as HTMLInputElement).value)} />
                            </Field>
                            <Field label="Region">
                                <select class="input" value={form.mailgunRegion} onChange={e => set('mailgunRegion', (e.target as HTMLSelectElement).value)}>
                                    <option value="us">US</option>
                                    <option value="eu">EU</option>
                                </select>
                            </Field>
                        </>
                    )}
                    {form.provider === 'smtp' && (
                        <>
                            <Field label="SMTP host"><input class="input" value={form.smtpHost} placeholder="smtp.gmail.com" onInput={e => set('smtpHost', (e.target as HTMLInputElement).value)} /></Field>
                            <Field label="Port"><input class="input" type="number" value={form.smtpPort} onInput={e => set('smtpPort', Number((e.target as HTMLInputElement).value))} /></Field>
                            <Field label="Username"><input class="input" value={form.smtpUser} onInput={e => set('smtpUser', (e.target as HTMLInputElement).value)} /></Field>
                            <Field label="Password" hint={s.hasSmtpPassword ? 'Saved. Leave empty to keep it.' : 'For Gmail, use an app password.'}>
                                <input class="input" type="password" autocomplete="off" value={form.smtpPassword} placeholder={s.hasSmtpPassword ? '••••••••' : ''} onInput={e => set('smtpPassword', (e.target as HTMLInputElement).value)} />
                            </Field>
                            <label class="check"><input type="checkbox" checked={form.smtpSecure} onChange={e => set('smtpSecure', (e.target as HTMLInputElement).checked)} /> Use TLS from the start (port 465)</label>
                        </>
                    )}
                    <Field label="Dashboard URL" hint="Your app's address, so emails can link to the request.">
                        <input class="input" value={form.dashboardUrl} placeholder="https://api.company.com" onInput={e => set('dashboardUrl', (e.target as HTMLInputElement).value)} />
                    </Field>
                    <div class="row span-all">
                        <button class="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
                        <button
                            type="button"
                            class="btn"
                            onClick={async () => {
                                try {
                                    const res = await post('/api/alerts/test');
                                    toast(res.message);
                                } catch (err) {
                                    toast((err as Error).message, 'err');
                                }
                                settings.reload();
                            }}
                        >
                            Send test email
                        </button>
                    </div>
                </form>
            )}
            {(s.lastError || s.lastSentAt) && (
                <div class="pad-x pad-b">
                    {s.lastError && (!s.lastSentAt || new Date(s.lastErrorAt) > new Date(s.lastSentAt)) ? (
                        <div class="note note-err">Last send failed {relative(s.lastErrorAt)}: {s.lastError}</div>
                    ) : (
                        <p class="muted small">Last email sent {relative(s.lastSentAt)}.</p>
                    )}
                </div>
            )}
        </Card>
    );
};

const DataSection = () => {
    const info = useData(() => api('/api/summaries'), []);
    const [before, setBefore] = useState('');

    return (
        <Card title="Stored data">
            <div class="pad stack">
                <p>
                    To delete requests, filter them on the <a href={`${document.documentElement.dataset.base}/requests`}>Requests</a> page and choose <strong>Delete matching</strong>.
                    Hourly totals are kept so the charts still show history.
                </p>
                <p class="muted">
                    Hourly totals stored: {info.data ? num(info.data.count) : '…'}
                    {info.data?.oldest && <> · oldest from {dateTime(info.data.oldest)}</>}
                </p>
                <form
                    class="row"
                    onSubmit={async e => {
                        e.preventDefault();
                        const label = before ? `before ${dateTime(new Date(before))}` : 'all of them';
                        if (!confirm(`Delete hourly totals ${label}? Charts for that period will be empty.`)) return;
                        try {
                            const res = await post('/api/summaries/delete', before ? { before: new Date(before).toISOString() } : {});
                            toast(`Deleted ${num(res.deleted)} hourly totals`);
                            info.reload();
                        } catch (err) {
                            toast((err as Error).message, 'err');
                        }
                    }}
                >
                    <label class="inline-field">
                        Delete totals before
                        <input class="input" type="datetime-local" value={before} max={toLocalInput(new Date())} onChange={e => setBefore((e.target as HTMLInputElement).value)} />
                    </label>
                    <button class="btn btn-danger-ghost">{before ? 'Delete older totals' : 'Delete all totals'}</button>
                </form>
            </div>
        </Card>
    );
};
