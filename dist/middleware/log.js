"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logMiddleware = void 0;
const apilogs_model_1 = __importDefault(require("../models/apilogs.model"));
const logMiddleware = (beginswith, specifics) => (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const startTime = Date.now();
    // Capture the original send function to intercept the response body
    const originalSend = res.send;
    let responseBody = {};
    res.send = function (body) {
        try {
            responseBody = typeof body === 'string' ? JSON.parse(body) : body; // Parse JSON if body is a string
        }
        catch (error) {
            responseBody = body; // Fallback if parsing fails
        }
        return originalSend.apply(res, [body]);
    };
    // If beginswith is defined, skip logging if the URL does NOT start with any of the given prefixes
    if (beginswith && !beginswith.some(prefix => req.originalUrl.startsWith(prefix))) {
        return next(); // Skip logging and continue to the next middleware
    }
    // Skip logging if the request URL matches any specific URL
    if (specifics && specifics.includes(req.originalUrl)) {
        return next(); // Skip logging
    }
    // Skip logging for /logs, /styles/*.css, and /js/*.js
    const excludedPaths = [
        '/logs',
        '/logs/login',
        '/logs/:id',
        '/logs/api',
        '/logs/auth',
        '/styles/',
        '/js/'
    ];
    if (excludedPaths.some(path => req.originalUrl.startsWith(path))) {
        return next();
    }
    res.on('finish', () => __awaiter(void 0, void 0, void 0, function* () {
        const duration = Date.now() - startTime;
        const log = new apilogs_model_1.default({
            method: req.method,
            endpoint: req.originalUrl,
            status: res.statusCode,
            responseTime: duration,
            requestBody: req.body || {},
            responseBody: responseBody || {},
            headers: req.headers,
            ip: req.ip || req.socket.remoteAddress,
            date: new Date(),
        });
        yield log.save();
    }));
    next();
});
exports.logMiddleware = logMiddleware;
//# sourceMappingURL=log.js.map