import { EmailProvider, EmailSettings, IEmailSettings } from '../models/alerts.model';
import { decryptSecret } from '../core/config';

export interface EmailMessage {
    to: string;
    subject: string;
    text: string;
    html: string;
}

/** Your own sender, for any provider not built in (Amazon SES, internal services…). */
export type SendEmailFn = (message: EmailMessage & { from: string }) => Promise<void>;

let customSender: SendEmailFn | null = null;
export const setCustomSender = (fn?: SendEmailFn) => {
    customSender = fn || null;
};
export const hasCustomSender = () => !!customSender;

export class EmailError extends Error {}

const failIfNotOk = async (provider: string, res: Response) => {
    if (res.ok) return;
    const body = (await res.text().catch(() => '')).slice(0, 300);
    throw new EmailError(`${provider} rejected the email (HTTP ${res.status})${body ? `: ${body}` : ''}`);
};

const fromHeader = (s: IEmailSettings) => (s.fromName ? `${s.fromName} <${s.fromEmail}>` : s.fromEmail);

// Every provider is one HTTPS request with Node's fetch: no SDKs, and it works
// on hosts that block outbound SMTP (Railway, and others).
const HTTP_SENDERS: Record<Exclude<EmailProvider, 'smtp'>, (s: IEmailSettings, key: string, m: EmailMessage) => Promise<void>> = {
    brevo: async (s, key, m) => {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
                sender: { email: s.fromEmail, name: s.fromName || undefined },
                to: [{ email: m.to }],
                subject: m.subject,
                htmlContent: m.html,
                textContent: m.text,
            }),
        });
        await failIfNotOk('Brevo', res);
    },
    resend: async (s, key, m) => {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
            body: JSON.stringify({ from: fromHeader(s), to: [m.to], subject: m.subject, html: m.html, text: m.text }),
        });
        await failIfNotOk('Resend', res);
    },
    sendgrid: async (s, key, m) => {
        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
            body: JSON.stringify({
                personalizations: [{ to: [{ email: m.to }] }],
                from: { email: s.fromEmail, name: s.fromName || undefined },
                subject: m.subject,
                content: [
                    { type: 'text/plain', value: m.text },
                    { type: 'text/html', value: m.html },
                ],
            }),
        });
        await failIfNotOk('SendGrid', res);
    },
    mailgun: async (s, key, m) => {
        const host = s.mailgunRegion === 'eu' ? 'api.eu.mailgun.net' : 'api.mailgun.net';
        const res = await fetch(`https://${host}/v3/${encodeURIComponent(s.mailgunDomain)}/messages`, {
            method: 'POST',
            headers: { authorization: `Basic ${Buffer.from(`api:${key}`).toString('base64')}` },
            body: new URLSearchParams({ from: fromHeader(s), to: m.to, subject: m.subject, text: m.text, html: m.html }),
        });
        await failIfNotOk('Mailgun', res);
    },
    postmark: async (s, key, m) => {
        const res = await fetch('https://api.postmarkapp.com/email', {
            method: 'POST',
            headers: { 'x-postmark-server-token': key, 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
                From: fromHeader(s),
                To: m.to,
                Subject: m.subject,
                HtmlBody: m.html,
                TextBody: m.text,
                MessageStream: 'outbound',
            }),
        });
        await failIfNotOk('Postmark', res);
    },
};

// nodemailer is only needed for SMTP, so it's an optional dependency.
const sendSmtp = async (s: IEmailSettings, m: EmailMessage) => {
    let nodemailer: any;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        nodemailer = require('nodemailer');
    } catch {
        throw new EmailError('SMTP needs the nodemailer package: npm install nodemailer');
    }
    const transport = nodemailer.createTransport({
        host: s.smtpHost,
        port: s.smtpPort,
        secure: s.smtpSecure,
        auth: s.smtpUser ? { user: s.smtpUser, pass: s.smtpPassEnc ? decryptSecret(s.smtpPassEnc) : '' } : undefined,
        connectionTimeout: 10000,
    });
    try {
        await transport.sendMail({ from: fromHeader(s), to: m.to, subject: m.subject, text: m.text, html: m.html });
    } catch (err) {
        throw new EmailError(`SMTP send failed: ${(err as Error).message}`);
    } finally {
        transport.close?.();
    }
};

export const getEmailSettings = async () => (await EmailSettings.findById('email').lean()) as IEmailSettings | null;

/** Whether alerts can be emailed at all (a provider or custom sender is configured). */
export const emailConfigured = async () => {
    if (customSender) return true;
    const s = await getEmailSettings();
    return !!(s?.provider && s.fromEmail);
};

/**
 * Send one email with the configured provider. Failures are recorded so the
 * Settings page can show them, then rethrown.
 */
export const sendEmail = async (message: EmailMessage) => {
    const settings = await getEmailSettings();
    try {
        if (customSender) {
            await customSender({ ...message, from: settings?.fromEmail || '' });
        } else {
            if (!settings?.provider || !settings.fromEmail) throw new EmailError('No email provider is set up');
            if (settings.provider === 'smtp') {
                await sendSmtp(settings, message);
            } else {
                if (!settings.apiKeyEnc) throw new EmailError('No API key is saved for this provider');
                await HTTP_SENDERS[settings.provider](settings, decryptSecret(settings.apiKeyEnc), message);
            }
        }
        await EmailSettings.updateOne({ _id: 'email' }, { lastSentAt: new Date(), lastError: null }, { upsert: true });
    } catch (err) {
        await EmailSettings.updateOne(
            { _id: 'email' },
            { lastError: (err as Error).message, lastErrorAt: new Date() },
            { upsert: true }
        ).catch(() => {});
        throw err;
    }
};
