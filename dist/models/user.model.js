"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const userSchema = new mongoose_1.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'dev'], default: 'dev' },
});
const User = (0, mongoose_1.model)('APIUser', userSchema);
exports.default = User;
//# sourceMappingURL=user.model.js.map