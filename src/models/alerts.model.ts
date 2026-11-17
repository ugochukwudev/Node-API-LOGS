import mongoose, { Schema } from 'mongoose';

export const EMAIL_PROVIDERS = ['brevo', 'resend', 'sendgrid', 'mailgun', 'postmark', 'smtp'] as const;
export type EmailProvider = typeof EMAIL_PROVIDERS[number];

/** Email provider settings (one document). Secrets are stored encrypted. */
export interface IEmailSettings {
    _id: string;
    provider: EmailProvider | null;
    fromEmail: string;
    fromName: string;
    apiKeyEnc: string | null;
    mailgunDomain: string;
    mailgunRegion: 'us' | 'eu';
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPassEnc: string | null;
    /** Your app's address, for links in emails, e.g. https://api.company.com */
    dashboardUrl: string;
    lastError: string | null;
    lastErrorAt: Date | null;
    lastSentAt: Date | null;
    updatedAt: Date;
}

const EmailSettingsSchema = new Schema<IEmailSettings>({
    _id: { type: String, default: 'email' },
    provider: { type: String, enum: [...EMAIL_PROVIDERS, null], default: null },
    fromEmail: { type: String, default: '' },
    fromName: { type: String, default: 'API Logs' },
    apiKeyEnc: { type: String, default: null },
    mailgunDomain: { type: String, default: '' },
    mailgunRegion: { type: String, enum: ['us', 'eu'], default: 'us' },
    smtpHost: { type: String, default: '' },
    smtpPort: { type: Number, default: 587 },
    smtpSecure: { type: Boolean, default: false },
    smtpUser: { type: String, default: '' },
    smtpPassEnc: { type: String, default: null },
    dashboardUrl: { type: String, default: '' },
    lastError: { type: String, default: null },
    lastErrorAt: { type: Date, default: null },
    lastSentAt: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

export const EmailSettings = mongoose.model<IEmailSettings>('ApiLogsEmailSettings', EmailSettingsSchema);

/**
 * Who gets an email for which errors. Personal rules email their owner;
 * team rules (admins only) email everyone with an account.
 */
export interface IAlertRule {
    name: string;
    ownerId: mongoose.Types.ObjectId;
    scope: 'personal' | 'team';
    enabled: boolean;
    /** `5xx`, `500,502`, `401` — empty matches any status */
    statuses: string;
    /** Text the URL must contain — empty matches any endpoint */
    endpoint: string;
    /** Only requests slower than this (ms) */
    minMs: number | null;
    /** Error spike: only alert when this many matches happen within spikeWindowMin */
    spikeCount: number | null;
    spikeWindowMin: number;
    /** At most one email per rule and error kind per this many minutes */
    cooldownMin: number;
    createdAt: Date;
}

const AlertRuleSchema = new Schema<IAlertRule>({
    name: { type: String, required: true },
    ownerId: { type: Schema.Types.ObjectId, required: true },
    scope: { type: String, enum: ['personal', 'team'], default: 'personal' },
    enabled: { type: Boolean, default: true },
    statuses: { type: String, default: '' },
    endpoint: { type: String, default: '' },
    minMs: { type: Number, default: null },
    spikeCount: { type: Number, default: null },
    spikeWindowMin: { type: Number, default: 5 },
    cooldownMin: { type: Number, default: 15 },
    createdAt: { type: Date, default: Date.now },
}, { versionKey: false });

AlertRuleSchema.index({ ownerId: 1 });

export const AlertRule = mongoose.model<IAlertRule>('ApiLogsAlertRule', AlertRuleSchema);

/**
 * Flood control, shared by every server instance: one document per rule and
 * error kind, claimed atomically before an email goes out.
 */
export interface IAlertState {
    _id: string;
    ruleId: mongoose.Types.ObjectId | null;
    lastSentAt: Date | null;
    /** Matches since the last email, reported in the next one */
    suppressed: number;
    sample: { method: string; endpoint: string; status: number; logId: string; responseTime: number; date: Date } | null;
}

const AlertStateSchema = new Schema<IAlertState>({
    _id: { type: String, required: true },
    ruleId: { type: Schema.Types.ObjectId, default: null },
    lastSentAt: { type: Date, default: null },
    suppressed: { type: Number, default: 0 },
    sample: { type: Schema.Types.Mixed, default: null },
}, { versionKey: false });

AlertStateSchema.index({ suppressed: 1, lastSentAt: 1 });

export const AlertState = mongoose.model<IAlertState>('ApiLogsAlertState', AlertStateSchema);
