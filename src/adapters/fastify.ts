import { IncomingMessage, ServerResponse } from 'http';
import { trackRequest } from '../core';
import { isDashboardUrl } from '../dashboard/server';
import { initLogger, LoggerOptions } from '../core/setup';

// Typed loosely so the package doesn't depend on fastify's types.
interface FastifyLike {
    addHook(name: 'onRequest', hook: (request: any, reply: any, done: (err?: Error) => void) => void): unknown;
}

const notFound = (res: ServerResponse) => () => {
    if (res.headersSent) return;
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end('{"message":"Not found"}');
};

/**
 * Fastify plugin: `await app.register(fastifyLogger, { mongoUri, admins, ... })`.
 * Registered globally (not encapsulated), so every route is logged.
 */
export const fastifyLogger = (fastify: FastifyLike, options: LoggerOptions, done: (err?: Error) => void) => {
    let setup: ReturnType<typeof initLogger>;
    try {
        setup = initLogger(options);
    } catch (err) {
        return done(err as Error);
    }
    const { base, dashboard, shouldLog } = setup;

    fastify.addHook('onRequest', (request, reply, next) => {
        const url: string = request.raw.url || '/';
        if (isDashboardUrl(url, base)) {
            // The dashboard handles the raw request itself.
            reply.hijack();
            (dashboard as unknown as (req: IncomingMessage, res: ServerResponse, next: () => void) => void)(
                request.raw, reply.raw, notFound(reply.raw)
            );
            return;
        }
        if (!shouldLog(url)) return next();
        trackRequest(reply.raw, {
            method: request.method,
            url,
            ip: request.ip,
            headers: request.headers,
            // Fastify parses the body after this hook; it's read when the response is done.
            getBody: () => request.body,
        }, () => next());
    });
    done();
};

// What fastify-plugin does: don't encapsulate, so the hook applies to all routes.
(fastifyLogger as any)[Symbol.for('skip-override')] = true;
(fastifyLogger as any)[Symbol.for('fastify.display-name')] = 'node-api-logs';
