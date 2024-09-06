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
const logMiddleware = (mongoUri) => (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
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
        return originalSend.apply(res, [body]); // Spread arguments into an array
    };
    res.on('finish', () => __awaiter(void 0, void 0, void 0, function* () {
        const duration = Date.now() - startTime;
        if (req.originalUrl.includes("/logs")) {
            return;
        }
        else {
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
        }
    }));
    next();
});
exports.logMiddleware = logMiddleware;
//# sourceMappingURL=log.js.map