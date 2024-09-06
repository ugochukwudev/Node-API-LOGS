import { Request, Response, NextFunction } from 'express';
import ApiLog from '../models/apilogs.model';

export const logMiddleware = (mongoUri: string) => async (req: Request, res: Response, next: NextFunction) => {
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
        return originalSend.apply(res, [body]); // Spread arguments into an array
    };

    res.on('finish', async () => {
        const duration = Date.now() - startTime;

        if(req.originalUrl.includes("/logs")){
return;
        }
        else{

        
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
    }
    });

    next();
};
