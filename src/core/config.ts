import crypto from 'crypto';

export const JWT_SECRET_ENV = 'node_api_logger_jwtSecret';

let jwtSecret: string | null = null;

/**
 * Resolve the dashboard JWT secret from the explicit option or the environment.
 * There is deliberately no fallback: a guessable default lets anyone forge a
 * dashboard session, so the logger refuses to start without one.
 */
export const resolveJwtSecret = (explicit?: string): string => {
    const secret = explicit || process.env[JWT_SECRET_ENV];
    if (!secret) {
        throw new Error(
            `node-api-logs: no JWT secret configured. Pass \`jwtSecret\` to the logger ` +
            `or set the ${JWT_SECRET_ENV} environment variable. The logger will not start without one.`
        );
    }
    return secret;
};

export const setJwtSecret = (secret: string) => {
    jwtSecret = secret;
};

export const getJwtSecret = (): string => {
    if (jwtSecret) return jwtSecret;
    // Allows the auth middleware to work when used without createExpressLogger
    // (e.g. in tests), still with no hard-coded fallback.
    jwtSecret = resolveJwtSecret();
    return jwtSecret;
};

let admins: string[] = [];

export const normalizeEmail = (email: unknown) => String(email || '').trim().toLowerCase();

/**
 * Admins come from config, never from "whoever logs in first". Required so a
 * fresh install can't be claimed by the first visitor.
 */
export const resolveAdmins = (list?: string[]): string[] => {
    const cleaned = Array.from(new Set((list || []).map(normalizeEmail).filter(Boolean)));
    if (!cleaned.length) {
        throw new Error(
            'node-api-logs: no admins configured. Pass `admins: [\'you@company.com\']` to the logger. ' +
            'The logger will not start without at least one admin.'
        );
    }
    return cleaned;
};

export const setAdmins = (list: string[]) => {
    admins = list;
};

export const isAdminEmail = (email: unknown) => admins.includes(normalizeEmail(email));

export const getAdmins = () => admins;

export const ENCRYPTION_KEY_ENV = 'node_api_logger_encryptionKey';
let encryptionKey: Buffer | null = null;

/**
 * Key for secrets stored in the database (authenticator secrets, provider API
 * keys). Uses the explicit key when given, otherwise one derived from the JWT
 * secret, so it is never stored next to the data it protects.
 */
export const setEncryptionKey = (explicit?: string) => {
    const source = explicit || process.env[ENCRYPTION_KEY_ENV];
    encryptionKey = source
        ? crypto.createHash('sha256').update(source).digest()
        : Buffer.from(crypto.hkdfSync('sha256', getJwtSecret(), 'node-api-logs', 'encryption-key', 32));
};

const getEncryptionKey = () => {
    if (!encryptionKey) setEncryptionKey();
    return encryptionKey!;
};

/** AES-256-GCM; output is iv.tag.ciphertext, base64 parts. */
export const encryptSecret = (plain: string): string => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join('.');
};

export const decryptSecret = (stored: string): string => {
    const [iv, tag, data] = stored.split('.').map(p => Buffer.from(p, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
};
