import { Schema, model } from 'mongoose';

const userSchema = new Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'dev'], default: 'dev' },
});

const User = model('APIUser', userSchema);
export default User;
