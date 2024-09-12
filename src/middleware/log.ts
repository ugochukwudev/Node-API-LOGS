import { Request, Response, NextFunction } from 'express';
import ApiLog from '../models/apilogs.model';

export const logMiddleware = (beginswith?: string[], specifics?: string[]) => async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Capture the original send function to intercept the response body
    const originalSend = res.send;
    let responseBody: any = {};

    res.send = function (body: any) {
        try {
            responseBody = typeof body === 'string' ? JSON.parse(body) : body; // Parse JSON if body is a string
        } catch (error) {
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
    res.on('finish', async () => {
        const duration = Date.now() - startTime;

        const log = new ApiLog({
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

        await log.save();
    });

    next();
};
