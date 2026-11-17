import express, { Application, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import path from 'path';
import apiRoutes from '../routes/api';
import authRoutes from '../routes/auth';
import { verifyToken } from '../middleware/auth';
import { createIndexes } from '../utils/indexes';
import { resolveAdmins, resolveJwtSecret, setAdmins, setEncryptionKey, setJwtSecret } from '../core/config';
import { bootstrapAdmins } from '../core/accounts';
import { configureCore, trackRequest, ipOf } from '../core';
import { RedactOptions } from '../core/redact';
import { createRouteFilter, RoutePattern } from '../core/filter';

// The logger's own dashboard, API and static assets are never logged.
export const INTERNAL_PREFIXES = ['/logs', '/styles', '/js'];

export const logMiddleware = (beginswith?: string[], specifics?: RoutePattern[]) => {
    const shouldLog = createRouteFilter({ beginswith, specifics, internalPrefixes: INTERNAL_PREFIXES });

    return (req: Request, res: Response, next: NextFunction) => {
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
};

export interface ExpressLoggerOptions {
    /** The Express.js application instance. */
    app: Application;
    /** MongoDB connection string where the API requests will be stored. */
    mongoUri: string;
    /** Only log request paths starting with one of these prefixes. */
    beginswith?: string[];
    /** Never log paths matching these: exact paths, prefixes ending in '*', or RegExps. */
    specifics?: RoutePattern[];
    /** Secret for dashboard sessions. Falls back to the node_api_logger_jwtSecret env var; required. */
    jwtSecret?: string;
    /** Emails of dashboard admins; required. Everyone else who is invited is a dev. */
    admins: string[];
    /**
     * Key used to encrypt stored secrets such as authenticator keys. Falls back to the
     * node_api_logger_encryptionKey env var, then to a key derived from jwtSecret
     * (rotating jwtSecret then means everyone sets up 2FA again).
     */
    encryptionKey?: string;
    /** Extra fields to mask, or default fields to stop masking. */
    redact?: RedactOptions;
    /** Largest response body kept per request, in bytes. Default 1 MB. */
    maxBodyBytes?: number;
}

/**
 * Initializes and configures an Express logger for tracking API requests.
 * Connects to a MongoDB database, sets up middleware for logging, and serves static HTML, CSS, and JS files.
 *
 * Throws if no JWT secret or no admins are configured.
 *
 * @example
 * const express = require('express');
 * const app = express();
 * createExpressLogger({ app, mongoUri: 'mongodb://localhost:27017/mydb', jwtSecret: process.env.LOGS_JWT_SECRET, admins: ['cto@company.com'], beginswith: ['/api'], specifics: ['/auth'] });
 */
export const createExpressLogger = ({ app, mongoUri, beginswith, specifics, jwtSecret, admins, encryptionKey, redact, maxBodyBytes }: ExpressLoggerOptions) => {
    // Validate before touching the database or the app.
    setJwtSecret(resolveJwtSecret(jwtSecret));
    setAdmins(resolveAdmins(admins));
    setEncryptionKey(encryptionKey);
    configureCore({ redact, maxBodyBytes });

    // Configure connection with pooling and performance optimizations
    mongoose.connect(mongoUri, {
        maxPoolSize: 10, // Maintain up to 10 socket connections
        serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
        compressors: 'zlib', // Use compression
    })
        .then(async () => {
            console.log('node api logger db connected with optimized settings');
            // Create indexes immediately after connection
            await createIndexes();
            await bootstrapAdmins(line => console.log(line));
        })
        .catch(err => console.error('node api logger db connection error:', err));

    app.use(cookieParser());

    // Middleware for logging
    app.use(logMiddleware(beginswith, specifics));

    // API and Auth Routes
    app.use('/logs/api', apiRoutes);
    app.use('/logs/auth', authRoutes);

    // Serve static CSS files
    app.use('/styles', express.static(path.join(__dirname, '../../src/views/styles')));
    //Js
    app.use('/js', express.static(path.join(__dirname, '../../src/views/js')));

    // Serve static HTML files (login unprotected)
    app.get('/logs/login', (req, res) => res.sendFile(path.join(__dirname, '../../src/views/login.html')));
    // Invite / setup links (unprotected: the single-use token is the credential)
    app.get('/logs/invite/:token', (req, res) => res.sendFile(path.join(__dirname, '../../src/views/invite.html')));
    // Dashboard HomePage (protected)
    app.get('/logs', verifyToken, (req, res) => res.sendFile(path.join(__dirname, '../../src/views/logs.html')));
    app.get('/logs/home', verifyToken, (req, res) => res.sendFile(path.join(__dirname, '../../src/views/home.html')));
    // Settings Page (protected)
    app.get('/logs/settings', verifyToken, (req, res) => res.sendFile(path.join(__dirname, '../../src/views/settings.html')));
    app.get('/logs/:id', verifyToken, (req, res) => res.sendFile(path.join(__dirname, '../../src/views/logDetails.html')));

};
