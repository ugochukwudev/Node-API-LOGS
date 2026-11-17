import crypto from 'crypto';
import User from '../models/user.model';
import Invite from '../models/invite.model';
import { getAdmins, normalizeEmail } from './config';

export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export const invitePath = (token: string) => `/logs/invite/${token}`;

/**
 * Create a fresh single-use setup link for an email, creating the user if
 * needed. Any earlier unused links for that email stop working.
 */
export const createInvite = async (rawEmail: string) => {
    const email = normalizeEmail(rawEmail);
    if (!email) throw new Error('Email is required');
    await User.updateOne({ email }, { $setOnInsert: { email, role: 'dev' } }, { upsert: true });
    await Invite.updateMany({ email, usedAt: null }, { usedAt: new Date() });
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await Invite.create({ tokenHash: sha256(token), email, expiresAt });
    return { email, token, path: invitePath(token), expiresAt };
};

/** Find an invite that can still be used. */
export const findValidInvite = (token: string) =>
    Invite.findOne({ tokenHash: sha256(String(token || '')), usedAt: null, expiresAt: { $gt: new Date() } });

/** Clear a user's authenticator so they enroll again at next login. */
export const resetTwoFactor = (email: string) =>
    User.updateOne(
        { email: normalizeEmail(email) },
        { totpSecret: null, totpPendingSecret: null, totpLastStep: -1, backupCodes: [], failedAttempts: 0, lockedUntil: null }
    );

/**
 * Configured admins who can't sign in yet get a setup link printed to the
 * server console. Only someone with access to the server's output sees it.
 */
export const bootstrapAdmins = async (print: (line: string) => void) => {
    for (const email of getAdmins()) {
        const user = await User.findOne({ email });
        if (user?.password) continue;
        const invite = await createInvite(email);
        print(`node-api-logs: admin setup link for ${email} (valid 24h, single use): ${invite.path}`);
    }
};
