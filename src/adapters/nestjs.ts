import { createExpressLogger } from './express';
import { fastifyLogger } from './fastify';
import { LoggerOptions } from '../core/setup';

// Typed loosely: this works with NestJS 9–12 without importing @nestjs packages.
interface NestAppLike {
    getHttpAdapter(): { getType(): string; getInstance(): any };
}

/**
 * Add logging and the dashboard to a NestJS app, on the Express or Fastify
 * platform. Call it in main.ts after `NestFactory.create` and before `listen`:
 *
 * @example
 * const app = await NestFactory.create(AppModule);
 * await setupNestLogger(app, { mongoUri, admins: ['cto@company.com'], jwtSecret });
 * await app.listen(3000);
 */
export const setupNestLogger = async (app: NestAppLike, options: LoggerOptions) => {
    const adapter = app.getHttpAdapter();
    const type = adapter.getType();
    if (type === 'express') {
        createExpressLogger({ app: adapter.getInstance(), ...options });
    } else if (type === 'fastify') {
        await adapter.getInstance().register(fastifyLogger, options);
    } else {
        throw new Error(`node-api-logs: unsupported NestJS platform "${type}" (Express and Fastify are supported)`);
    }
};
