import { Schema, model } from 'mongoose';

/**
 * A single-use setup link. Used for dev invites, first-time admin setup and
 * recovery. Only a hash of the token is stored, so a database leak can't be
 * turned into working links.
 */
const inviteSchema = new Schema({
    tokenHash: { type: String, required: true, unique: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
});

const Invite = model('APIInvite', inviteSchema);
export default Invite;
