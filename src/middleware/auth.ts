import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDashboardBasePath, getJwtSecret } from '../core/config';

export const SESSION_COOKIE = 'token';
export const PENDING_COOKIE = 'logs_pending';
const SESSION_TTL_S = 60 * 60;
const PENDING_TTL_S = 5 * 60;

export type PendingStage = '2fa' | 'enroll';

const cookieOptions = (req: Request, maxAgeS: number) => ({
    httpOnly: true,
    sameSite: 'lax' as const,
    // Secure whenever the request came in over HTTPS (set `trust proxy` behind a proxy).
    secure: req.secure,
    maxAge: maxAgeS * 1000,
    // Only sent to the dashboard, never to the rest of the host app.
    path: getDashboardBasePath(),
});

/** Full dashboard session, only issued after the authenticator code. */
export const issueSession = (req: Request, res: Response, user: { _id: unknown; role: string }) => {
    const token = jwt.sign({ id: String(user._id), role: user.role, purpose: 'session' }, getJwtSecret(), { expiresIn: SESSION_TTL_S });
    res.clearCookie(PENDING_COOKIE, { path: getDashboardBasePath() });
    res.cookie(SESSION_COOKIE, token, cookieOptions(req, SESSION_TTL_S));
};

/** "Password OK, code still needed": opens nothing but the 2FA endpoints. */
export const issuePending = (req: Request, res: Response, userId: unknown, stage: PendingStage) => {
    const token = jwt.sign({ id: String(userId), stage, purpose: 'pending' }, getJwtSecret(), { expiresIn: PENDING_TTL_S });
    res.cookie(PENDING_COOKIE, token, cookieOptions(req, PENDING_TTL_S));
};

export const clearAuthCookies = (res: Response) => {
    res.clearCookie(SESSION_COOKIE, { path: getDashboardBasePath() });
    res.clearCookie(PENDING_COOKIE, { path: getDashboardBasePath() });
};

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE];
    // Pages are public shells; only the API needs a session, so this always answers JSON.
    const reject = (message: string) => res.status(401).json({ message });
    if (!token) return reject('Unauthorized');

    try {
        const decoded = jwt.verify(token, getJwtSecret()) as { id: string; role: string; purpose?: string };
        // Pending (password-only) tokens and pre-v3 tokens never open the dashboard.
        if (decoded.purpose !== 'session') return reject('Invalid token');
        req.user = { id: decoded.id, role: decoded.role };
        next();
    } catch (error) {
        return reject('Invalid token');
    }
};

export const requirePending = (stage: PendingStage) => (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[PENDING_COOKIE];
    if (!token) return res.status(401).json({ message: 'Sign in again' });
    try {
        const decoded = jwt.verify(token, getJwtSecret()) as { id: string; stage: PendingStage; purpose?: string };
        if (decoded.purpose !== 'pending' || decoded.stage !== stage) {
            return res.status(401).json({ message: 'Sign in again' });
        }
        req.pendingUserId = decoded.id;
        next();
    } catch {
        return res.status(401).json({ message: 'Sign in again' });
    }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Only admins can do this' });
    next();
};
