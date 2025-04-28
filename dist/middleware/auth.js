"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwtSecret = process.env.node_api_logger_jwtSecret || "your_secret_key";
const verifyToken = (req, res, next) => {
    const token = req.cookies.token;
    const isApiRequest = req.originalUrl.startsWith('/logs/api');
    if (!token) {
        return isApiRequest
            ? res.status(401).json({ message: 'Unauthorized' })
            : res.redirect('/logs/login');
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
        req.user = decoded;
        next();
    }
    catch (error) {
        return isApiRequest
            ? res.status(401).json({ message: 'Invalid token' })
            : res.redirect('/logs/login');
    }
};
exports.verifyToken = verifyToken;
//# sourceMappingURL=auth.js.map