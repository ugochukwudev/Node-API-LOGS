export const JWT_SECRET_ENV = 'node_api_logger_jwtSecret';

let jwtSecret: string | null = null;

/**
 * Resolve the dashboard JWT secret from the explicit option or the environment.
 * There is deliberately no fallback: a guessable default lets anyone forge a
 * dashboard session, so the logger refuses to start without one.
 */
export const resolveJwtSecret = (explicit?: string): string => {
    const secret = explicit || process.env[JWT_SECRET_ENV];
    if (!secret) {
        throw new Error(
            `node-api-logs: no JWT secret configured. Pass \`jwtSecret\` to the logger ` +
            `or set the ${JWT_SECRET_ENV} environment variable. The logger will not start without one.`
        );
    }
    return secret;
};

export const setJwtSecret = (secret: string) => {
    jwtSecret = secret;
};

export const getJwtSecret = (): string => {
    if (jwtSecret) return jwtSecret;
    // Allows the auth middleware to work when used without createExpressLogger
    // (e.g. in tests), still with no hard-coded fallback.
    jwtSecret = resolveJwtSecret();
    return jwtSecret;
};
