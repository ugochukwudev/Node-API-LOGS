import crypto from 'crypto';

// RFC 6238 TOTP (SHA-1, 6 digits, 30 s): what Google Authenticator,
// Microsoft Authenticator, Authy and 1Password all speak.
const STEP_SECONDS = 30;
const DIGITS = 6;
// Accept the previous and next step too, for phones with slightly-off clocks.
const DRIFT_STEPS = 1;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const base32Encode = (buf: Buffer): string => {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const byte of buf) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            out += BASE32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
    return out;
};

export const base32Decode = (input: string): Buffer => {
    const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const char of clean) {
        value = (value << 5) | BASE32.indexOf(char);
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(out);
};

export const generateTotpSecret = () => base32Encode(crypto.randomBytes(20));

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

export const totpAt = (secret: string, step: number): string => {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
    return code.toString().padStart(DIGITS, '0');
};

/**
 * Check a code against the secret. Returns the matched time step, or null.
 * Codes at or before `lastUsedStep` are rejected, so each code works only once.
 */
export const verifyTotp = (
    secret: string,
    code: string,
    lastUsedStep = -1,
    now = Date.now()
): number | null => {
    const clean = String(code || '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(clean)) return null;
    const step = currentStep(now);
    for (let s = step - DRIFT_STEPS; s <= step + DRIFT_STEPS; s++) {
        if (s <= lastUsedStep) continue;
        const expected = totpAt(secret, s);
        if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return s;
    }
    return null;
};

export const otpauthUrl = (issuer: string, account: string, secret: string) => {
    const label = encodeURIComponent(`${issuer}:${account}`);
    const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });
    return `otpauth://totp/${label}?${params.toString()}`;
};
