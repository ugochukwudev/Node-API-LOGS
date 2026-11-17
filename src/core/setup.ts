import mongoose from 'mongoose';
import { createIndexes } from '../utils/indexes';
import {
    resolveAdmins, resolveJwtSecret, setAdmins, setDashboardBasePath, setEncryptionKey, setJwtSecret,
} from './config';
import { bootstrapAdmins } from './accounts';
import { configureCore, getWriter } from '.';
import { createRouteFilter, RoutePattern } from './filter';
import { RedactOptions } from './redact';
import { evaluateLogs, startAlertTimers } from '../alerts/engine';
import { SendEmailFn, setCustomSender } from '../alerts/email';
import { createDashboard, normalizeBasePath } from '../dashboard/server';

/** Options shared by every framework adapter. */
export interface LoggerOptions {
    /** MongoDB connection string where logs are stored. */
    mongoUri: string;
    /** Emails of dashboard admins; required. Everyone else who is invited is a dev. */
    admins: string[];
    /** Secret for dashboard sessions. Falls back to the node_api_logger_jwtSecret env var; required. */
    jwtSecret?: string;
    /**
     * Key used to encrypt stored secrets (authenticator keys, email API keys). Falls back to the
     * node_api_logger_encryptionKey env var, then to a key derived from jwtSecret
     * (rotating jwtSecret then means everyone sets up 2FA again).
     */
    encryptionKey?: string;
    /** Only log request paths starting with one of these prefixes. */
    beginswith?: string[];
    /** Never log paths matching these: exact paths, prefixes ending in '*', or RegExps. */
    specifics?: RoutePattern[];
    /** Extra fields to mask, or default fields to stop masking. */
    redact?: RedactOptions;
    /** Largest response body kept per request, in bytes. Default 1 MB. */
    maxBodyBytes?: number;
    alerts?: {
        /** Send alert emails with your own code instead of a provider set up in the dashboard. */
        sendEmail?: SendEmailFn;
    };
    /** Where the dashboard lives in your app. Default `/logs`. */
    dashboardPath?: string;
}

let alertsHooked = false;

/**
 * Validate options, connect to MongoDB and build the dashboard. Throws (before
 * touching the database) if the JWT secret or admins are missing.
 */
export const initLogger = (options: LoggerOptions) => {
    setJwtSecret(resolveJwtSecret(options.jwtSecret));
    setAdmins(resolveAdmins(options.admins));
    setEncryptionKey(options.encryptionKey);
    const base = normalizeBasePath(options.dashboardPath);
    setDashboardBasePath(base);
    configureCore({ redact: options.redact, maxBodyBytes: options.maxBodyBytes });
    setCustomSender(options.alerts?.sendEmail);
    if (!alertsHooked) {
        getWriter().onWritten(logs => evaluateLogs(logs));
        alertsHooked = true;
    }

    const connected = mongoose.connection.readyState === 1
        ? Promise.resolve()
        : mongoose.connect(options.mongoUri, {
              maxPoolSize: 10, // Maintain up to 10 socket connections
              serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
              socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
              maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
              compressors: 'zlib', // Use compression
          }).then(() => console.log('node api logger db connected'));
    connected
        .then(async () => {
            await createIndexes();
            await bootstrapAdmins(line => console.log(line));
            startAlertTimers();
        })
        .catch(err => console.error('node api logger db connection error:', err));

    return {
        base,
        dashboard: createDashboard(base),
        // The dashboard's own pages and API are never logged.
        shouldLog: createRouteFilter({ beginswith: options.beginswith, specifics: options.specifics, internalPrefixes: [base] }),
    };
};
