import { Application, Request, Response, NextFunction } from 'express';
import { getDashboardBasePath } from '../core/config';
import { trackRequest, ipOf } from '../core';
import { createRouteFilter, RoutePattern } from '../core/filter';
import { initLogger, LoggerOptions } from '../core/setup';

const expressMiddleware = (shouldLog: (url: string) => boolean) =>
    (req: Request, res: Response, next: NextFunction) => {
        // Filter skipped routes BEFORE opening a request context, so nothing is
        // captured (or saved) for them.
        if (!shouldLog(req.originalUrl)) return next();

        trackRequest(res, {
            method: req.method,
            url: req.originalUrl,
            // Grab the ip up front: after a client abort the socket is already
            // destroyed by save time and req.ip/remoteAddress come back undefined.
            ip: req.ip || ipOf(req),
            headers: req.headers,
            getBody: () => req.body,
        }, next);
    };

/** Just the request logging, for apps that set up the dashboard separately. */
export const logMiddleware = (beginswith?: string[], specifics?: RoutePattern[]) =>
    expressMiddleware(createRouteFilter({ beginswith, specifics, internalPrefixes: [getDashboardBasePath()] }));

export interface ExpressLoggerOptions extends LoggerOptions {
    /** The Express.js application instance. */
    app: Application;
}

/**
 * Log an Express app's requests and serve the dashboard at `dashboardPath`
 * (default /logs). Add it before your routes.
 *
 * Throws if no JWT secret or no admins are configured.
 *
 * @example
 * createExpressLogger({
 *   app,
 *   mongoUri: process.env.MONGODB_URI,
 *   jwtSecret: process.env.LOGS_JWT_SECRET,
 *   admins: ['cto@company.com'],
 *   beginswith: ['/api'],
 * });
 */
export const createExpressLogger = ({ app, ...options }: ExpressLoggerOptions) => {
    const { dashboard, shouldLog } = initLogger(options);
    // Logging first, so it sees every request; the dashboard only answers under its path.
    app.use(expressMiddleware(shouldLog));
    app.use(dashboard);
};
