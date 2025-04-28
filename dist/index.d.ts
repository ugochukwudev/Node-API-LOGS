import { Application } from 'express';
/**
 * Initializes and configures an Express logger for tracking API requests.
 * Connects to a MongoDB database, sets up middleware for logging, and serves static HTML, CSS, and JS files.
 *
 * @param {Object} params - Parameters for the logger configuration.
 * @param {import('express').Application} params.app - The Express.js application instance required to make the logger work.
 * @param {string} params.mongoUri - The MongoDB connection string where the API requests will be stored.
 * @param {string[]} [params.beginswith] - Optional array of strings specifying request path prefixes. If the request path doesn't start with any of these strings, the API request won't be saved to the database.
 * @param {string[]} [params.specifics] - Optional array of URL patterns that should be excluded from logging and not saved to the database.
 *
 * @returns {void}
 *
 * @example
 * const express = require('express');
 * const app = express();
 * createExpressLogger({ app, mongoUri: 'mongodb://localhost:27017/mydb', beginswith: ['/api'], specifics: ['/auth'] });
 */
export declare const createExpressLogger: ({ app, mongoUri, beginswith, specifics }: {
    app: Application;
    mongoUri: string;
    beginswith?: string[];
    specifics?: string[];
}) => void;
export declare const CreateNextLogger: () => void;
//# sourceMappingURL=index.d.ts.map