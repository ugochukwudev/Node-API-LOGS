import { Schema, model } from 'mongoose';

const userSchema = new Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Empty until the user accepts their invite and chooses a password.
    password: { type: String },
    // Synced from the `admins` config on every login.
    role: { type: String, enum: ['admin', 'dev'], default: 'dev' },
    // Authenticator secrets, encrypted (see encryptSecret).
    totpSecret: { type: String, default: null },
    totpPendingSecret: { type: String, default: null },
    // Last accepted time step; a code can't be reused.
    totpLastStep: { type: Number, default: -1 },
    // SHA-256 hashes of unused one-time backup codes.
    backupCodes: { type: [String], default: [] },
    failedAttempts: { type: Number, default: 0 },
    // Opt-in daily summary email
    dailyDigest: { type: Boolean, default: false },
    lockedUntil: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
});

const User = model('APIUser', userSchema);
export default User;
