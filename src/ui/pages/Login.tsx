import { useEffect, useState } from 'preact/hooks';
import { api, post } from '../api';
import { CopyButton, ErrorNote, Field, Spinner } from '../components';

type Step = 'credentials' | 'enroll' | 'verify' | 'backup';

const AuthCard = ({ title, subtitle, children }: { title: string; subtitle?: string; children: preact.ComponentChildren }) => (
    <div class="auth-screen">
        <div class="auth-card">
            <div class="auth-brand">
                <span class="brand-mark" aria-hidden="true">
                    <svg viewBox="0 0 32 32" width="22" height="22"><path d="M7 20h4l3-9 3 12 3-7h5" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </span>
                API Logs
            </div>
            <h1>{title}</h1>
            {subtitle && <p class="muted">{subtitle}</p>}
            {children}
        </div>
    </div>
);

const CodeInput = ({ value, onInput, backup }: { value: string; onInput: (v: string) => void; backup?: boolean }) => (
    <input
        class="input code-input"
        inputMode={backup ? 'text' : 'numeric'}
        autocomplete="one-time-code"
        maxLength={backup ? 11 : 6}
        placeholder={backup ? 'A1B2C-3D4E5' : '000000'}
        value={value}
        onInput={e => onInput((e.target as HTMLInputElement).value)}
        required
        autoFocus
    />
);

/** Enrollment, code entry and backup codes: shared by sign-in and invite links. */
const TwoFactorSteps = ({ step, setStep, done }: { step: Step; setStep: (s: Step) => void; done: () => void }) => {
    const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
    const [code, setCode] = useState('');
    const [useBackup, setUseBackup] = useState(false);
    const [codes, setCodes] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (step !== 'enroll' || setup) return;
        api('/auth/2fa/setup').then(setSetup, err => setError(err.message));
    }, [step]);

    const submit = async (e: Event) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            if (step === 'enroll') {
                const res = await post('/auth/2fa/enable', { code });
                setCodes(res.backupCodes);
                setStep('backup');
            } else {
                await post('/auth/2fa/verify', useBackup ? { backupCode: code } : { code });
                done();
            }
        } catch (err) {
            setError((err as Error).message);
            setCode('');
        } finally {
            setBusy(false);
        }
    };

    if (step === 'enroll') {
        return (
            <AuthCard title="Set up two-step sign-in" subtitle="Scan the code with Google Authenticator, Microsoft Authenticator, Authy or 1Password, then enter the 6-digit code it shows.">
                <ErrorNote error={error} />
                {!setup ? (
                    <div class="center-pad"><Spinner /></div>
                ) : (
                    <form onSubmit={submit} class="stack">
                        <img class="qr" src={setup.qr} alt="QR code for your authenticator app" width={192} height={192} />
                        <details class="manual-key">
                            <summary>Can't scan? Enter a key instead</summary>
                            <code class="secret">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
                        </details>
                        <Field label="6-digit code">
                            <CodeInput value={code} onInput={setCode} />
                        </Field>
                        <button class="btn btn-primary btn-block" disabled={busy}>{busy ? 'Checking…' : 'Turn on two-step sign-in'}</button>
                    </form>
                )}
            </AuthCard>
        );
    }

    if (step === 'backup') {
        return (
            <AuthCard title="Save your backup codes" subtitle="If you lose your phone, each code lets you sign in once. They won't be shown again.">
                <ul class="backup-codes">{codes.map(c => <li key={c}>{c}</li>)}</ul>
                <div class="row">
                    <CopyButton text={codes.join('\n')} label="Copy codes" />
                    <button class="btn btn-primary" onClick={done}>I've saved them</button>
                </div>
            </AuthCard>
        );
    }

    return (
        <AuthCard title="Two-step sign-in" subtitle={useBackup ? 'Enter one of your backup codes. Each works once.' : 'Enter the 6-digit code from your authenticator app.'}>
            <ErrorNote error={error} />
            <form onSubmit={submit} class="stack">
                <Field label={useBackup ? 'Backup code' : '6-digit code'}>
                    <CodeInput value={code} onInput={setCode} backup={useBackup} />
                </Field>
                <button class="btn btn-primary btn-block" disabled={busy}>{busy ? 'Checking…' : 'Verify'}</button>
                <button type="button" class="btn btn-link" onClick={() => { setUseBackup(b => !b); setCode(''); setError(null); }}>
                    {useBackup ? 'Use the authenticator app instead' : 'Lost your phone? Use a backup code'}
                </button>
            </form>
        </AuthCard>
    );
};

export const LoginPage = ({ onSignedIn }: { onSignedIn: () => void }) => {
    const [step, setStep] = useState<Step>('credentials');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (step !== 'credentials') return <TwoFactorSteps step={step} setStep={setStep} done={onSignedIn} />;

    return (
        <AuthCard title="Sign in">
            <ErrorNote error={error} />
            <form
                class="stack"
                onSubmit={async e => {
                    e.preventDefault();
                    setBusy(true);
                    setError(null);
                    try {
                        const res = await post('/auth/login', { email, password });
                        setStep(res.next === 'enroll' ? 'enroll' : 'verify');
                    } catch (err) {
                        setError((err as Error).message);
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <Field label="Email">
                    <input class="input" type="email" autocomplete="username" value={email} onInput={e => setEmail((e.target as HTMLInputElement).value)} required autoFocus />
                </Field>
                <Field label="Password">
                    <input class="input" type="password" autocomplete="current-password" value={password} onInput={e => setPassword((e.target as HTMLInputElement).value)} required />
                </Field>
                <button class="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Continue'}</button>
            </form>
            <p class="muted small">No account, or locked out? Ask an admin for a setup link.</p>
        </AuthCard>
    );
};

export const InvitePage = ({ token }: { token: string }) => {
    const [step, setStep] = useState<Step | 'loading' | 'invalid'>('loading');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api(`/auth/invites/${encodeURIComponent(token)}`).then(
            res => {
                setEmail(res.email);
                setStep('credentials');
            },
            err => {
                setError(err.message);
                setStep('invalid');
            }
        );
    }, [token]);

    const finish = () => {
        window.location.href = `${document.documentElement.dataset.base}/`;
    };

    if (step === 'loading') return <div class="center-screen"><Spinner /></div>;
    if (step === 'invalid') return <AuthCard title="Link not valid"><ErrorNote error={error} /></AuthCard>;
    if (step !== 'credentials') return <TwoFactorSteps step={step} setStep={s => setStep(s)} done={finish} />;

    return (
        <AuthCard title="Set up your access" subtitle={`You're joining as ${email}. Choose a password, then set up two-step sign-in.`}>
            <ErrorNote error={error} />
            <form
                class="stack"
                onSubmit={async e => {
                    e.preventDefault();
                    if (password !== confirm) return setError('The passwords do not match');
                    setBusy(true);
                    setError(null);
                    try {
                        await post(`/auth/invites/${encodeURIComponent(token)}/accept`, { password });
                        setStep('enroll');
                    } catch (err) {
                        setError((err as Error).message);
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                <input type="email" autocomplete="username" value={email} hidden readOnly />
                <Field label="Password" hint="At least 8 characters">
                    <input class="input" type="password" autocomplete="new-password" minLength={8} value={password} onInput={e => setPassword((e.target as HTMLInputElement).value)} required autoFocus />
                </Field>
                <Field label="Confirm password">
                    <input class="input" type="password" autocomplete="new-password" minLength={8} value={confirm} onInput={e => setConfirm((e.target as HTMLInputElement).value)} required />
                </Field>
                <button class="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button>
            </form>
        </AuthCard>
    );
};
