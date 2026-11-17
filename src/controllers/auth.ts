import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import QRCode from 'qrcode';
import User from '../models/user.model';
import Invite from '../models/invite.model';
import { decryptSecret, encryptSecret, isAdminEmail, normalizeEmail } from '../core/config';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../core/totp';
import { createInvite, findValidInvite, resetTwoFactor, sha256 } from '../core/accounts';
import { clearAuthCookies, issuePending, issueSession } from '../middleware/auth';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;
const BACKUP_CODE_COUNT = 10;

type UserDoc = InstanceType<typeof User>;

const serverError = (res: Response, error: unknown) =>
    res.status(500).json({ message: `Server error: ${(error as Error)?.message || error}` });

const lockedMinutes = (user: UserDoc) =>
    user.lockedUntil && user.lockedUntil.getTime() > Date.now()
        ? Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
        : 0;

const lockedResponse = (res: Response, minutes: number) =>
    res.status(429).json({ message: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` });

// 5 failed passwords or codes lock the account for 15 minutes.
const recordFailure = async (user: UserDoc) => {
    const updated = await User.findOneAndUpdate({ _id: user._id }, { $inc: { failedAttempts: 1 } }, { new: true });
    if (updated && updated.failedAttempts >= MAX_ATTEMPTS) {
        await User.updateOne({ _id: user._id }, { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MS) });
    }
};

// The role always follows the `admins` config.
const startSession = async (req: Request, res: Response, user: UserDoc) => {
    const role = isAdminEmail(user.email) ? 'admin' : 'dev';
    await User.updateOne({ _id: user._id }, { role, failedAttempts: 0, lockedUntil: null });
    issueSession(req, res, { _id: user._id, role });
};

const normalizeBackupCode = (code: unknown) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const generateBackupCodes = () =>
    Array.from({ length: BACKUP_CODE_COUNT }, () => {
        const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
        return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });

export const loginUser = async (req: Request, res: Response) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    try {
        const user = await User.findOne({ email });
        // Same message whether the email or the password is wrong.
        if (!user || !user.password) return res.status(400).json({ message: 'Invalid email or password' });

        const minutes = lockedMinutes(user);
        if (minutes) return lockedResponse(res, minutes);

        if (!(await bcrypt.compare(password, user.password))) {
            await recordFailure(user);
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const next = user.totpSecret ? '2fa' : 'enroll';
        issuePending(req, res, user._id, next);
        res.json({ next });
    } catch (error) {
        serverError(res, error);
    }
};

export const setupTwoFactor = async (req: Request, res: Response) => {
    try {
        const user = await User.findById(req.pendingUserId);
        if (!user) return res.status(401).json({ message: 'Sign in again' });

        // Reuse the pending secret so refreshing the page shows the same QR code.
        let secret: string;
        if (user.totpPendingSecret) {
            secret = decryptSecret(user.totpPendingSecret);
        } else {
            secret = generateTotpSecret();
            await User.updateOne({ _id: user._id }, { totpPendingSecret: encryptSecret(secret) });
        }
        const url = otpauthUrl(`API Logs (${req.hostname})`, user.email, secret);
        res.json({ email: user.email, secret, otpauthUrl: url, qr: await QRCode.toDataURL(url) });
    } catch (error) {
        serverError(res, error);
    }
};

export const enableTwoFactor = async (req: Request, res: Response) => {
    try {
        const user = await User.findById(req.pendingUserId);
        if (!user || !user.totpPendingSecret) return res.status(401).json({ message: 'Sign in again' });

        const minutes = lockedMinutes(user);
        if (minutes) return lockedResponse(res, minutes);

        const secret = decryptSecret(user.totpPendingSecret);
        const step = verifyTotp(secret, req.body?.code);
        if (step === null) {
            await recordFailure(user);
            return res.status(400).json({ message: 'That code is not right. Check the app and try again.' });
        }

        const backupCodes = generateBackupCodes();
        await User.updateOne({ _id: user._id }, {
            totpSecret: user.totpPendingSecret,
            totpPendingSecret: null,
            totpLastStep: step,
            backupCodes: backupCodes.map(c => sha256(normalizeBackupCode(c))),
        });
        await startSession(req, res, user);
        // Shown once; only hashes are stored.
        res.json({ backupCodes });
    } catch (error) {
        serverError(res, error);
    }
};

export const verifyTwoFactor = async (req: Request, res: Response) => {
    try {
        const user = await User.findById(req.pendingUserId);
        if (!user || !user.totpSecret) return res.status(401).json({ message: 'Sign in again' });

        const minutes = lockedMinutes(user);
        if (minutes) return lockedResponse(res, minutes);

        let ok = false;
        if (req.body?.backupCode) {
            const hash = sha256(normalizeBackupCode(req.body.backupCode));
            // $pull in the same query: a backup code works exactly once.
            const result = await User.updateOne({ _id: user._id, backupCodes: hash }, { $pull: { backupCodes: hash } });
            ok = result.modifiedCount === 1;
        } else {
            const step = verifyTotp(decryptSecret(user.totpSecret), req.body?.code, user.totpLastStep);
            if (step !== null) {
                // Conditional update so the same code can't be used twice, even concurrently.
                const result = await User.updateOne({ _id: user._id, totpLastStep: { $lt: step } }, { totpLastStep: step });
                ok = result.modifiedCount === 1;
            }
        }

        if (!ok) {
            await recordFailure(user);
            return res.status(400).json({ message: 'That code is not right. Check the app and try again.' });
        }
        await startSession(req, res, user);
        res.json({ message: 'Logged in successfully' });
    } catch (error) {
        serverError(res, error);
    }
};

export const logoutUser = (req: Request, res: Response) => {
    clearAuthCookies(res);
    res.json({ message: 'Logged out successfully' });
};

export const getMe = async (req: Request, res: Response) => {
    try {
        const user = await User.findById(req.user!.id, { email: 1, role: 1, backupCodes: 1 });
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        res.json({ id: user._id, email: user.email, role: user.role, backupCodesLeft: user.backupCodes.length });
    } catch (error) {
        serverError(res, error);
    }
};

export const createInviteLink = async (req: Request, res: Response) => {
    const email = normalizeEmail(req.body?.email);
    if (!email || !email.includes('@')) return res.status(400).json({ message: 'Enter a valid email' });

    try {
        const existing = await User.findOne({ email });
        if (existing?.password) {
            return res.status(400).json({ message: 'This person already has an account. Use "Reset 2FA" if they lost their phone.' });
        }
        const invite = await createInvite(email);
        res.json({ email, path: invite.path, expiresAt: invite.expiresAt });
    } catch (error) {
        serverError(res, error);
    }
};

export const getInvite = async (req: Request, res: Response) => {
    try {
        const invite = await findValidInvite(req.params.token);
        if (!invite) return res.status(404).json({ message: 'This link has expired or was already used. Ask an admin for a new one.' });
        res.json({ email: invite.email, expiresAt: invite.expiresAt });
    } catch (error) {
        serverError(res, error);
    }
};

export const acceptInvite = async (req: Request, res: Response) => {
    const password = String(req.body?.password || '');
    if (password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `Use at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    try {
        // Mark used in the same query that finds it: a link works exactly once.
        const invite = await Invite.findOneAndUpdate(
            { tokenHash: sha256(String(req.params.token || '')), usedAt: null, expiresAt: { $gt: new Date() } },
            { usedAt: new Date() },
            { new: true }
        );
        if (!invite) return res.status(404).json({ message: 'This link has expired or was already used. Ask an admin for a new one.' });

        const hashed = await bcrypt.hash(password, 10);
        await User.updateOne({ email: invite.email }, { password: hashed });
        // A setup link always means a fresh authenticator.
        await resetTwoFactor(invite.email);
        const user = await User.findOne({ email: invite.email });
        if (!user) return res.status(404).json({ message: 'Account not found' });

        issuePending(req, res, user._id, 'enroll');
        res.json({ next: 'enroll' });
    } catch (error) {
        serverError(res, error);
    }
};

export const getUsers = async (req: Request, res: Response) => {
    try {
        const users = await User.find({}, { email: 1, role: 1, password: 1, totpSecret: 1, createdAt: 1 }).lean();
        res.json({
            users: users.map(u => ({
                _id: u._id,
                email: u.email,
                role: isAdminEmail(u.email) ? 'admin' : 'dev',
                status: !u.password ? 'invited' : u.totpSecret ? 'active' : 'needs-2fa',
                createdAt: u.createdAt,
            })),
        });
    } catch (error) {
        serverError(res, error);
    }
};

export const removeUser = async (req: Request, res: Response) => {
    const { userId } = req.params;

    try {
        if (userId === req.user!.id) {
            return res.status(400).json({ message: 'Cannot remove your own account' });
        }
        const target = await User.findById(userId);
        if (!target) return res.status(404).json({ message: 'User not found' });
        if (isAdminEmail(target.email)) {
            return res.status(400).json({ message: 'Admins are set in the logger config; remove them there' });
        }
        await User.deleteOne({ _id: target._id });
        await Invite.updateMany({ email: target.email, usedAt: null }, { usedAt: new Date() });
        res.json({ message: 'User removed successfully' });
    } catch (error) {
        serverError(res, error);
    }
};

export const resetUserTwoFactor = async (req: Request, res: Response) => {
    const { userId } = req.params;

    try {
        if (userId === req.user!.id) {
            return res.status(400).json({ message: 'You cannot reset your own 2FA here. Use the recovery command on the server.' });
        }
        const target = await User.findById(userId);
        if (!target) return res.status(404).json({ message: 'User not found' });
        await resetTwoFactor(target.email);
        res.json({ message: `${target.email} will set up their authenticator at next sign-in` });
    } catch (error) {
        serverError(res, error);
    }
};
