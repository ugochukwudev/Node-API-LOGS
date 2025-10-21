"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateNextLogger = exports.createExpressLogger = void 0;
const express_1 = __importDefault(require("express")); // Import express and Application
const mongoose_1 = __importDefault(require("mongoose"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = __importDefault(require("path"));
const api_1 = __importDefault(require("./routes/api"));
const auth_1 = __importDefault(require("./routes/auth"));
const log_1 = require("./middleware/log");
const auth_2 = require("./middleware/auth");
const indexes_1 = require("./utils/indexes");
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
const createExpressLogger = ({ app, mongoUri, beginswith, specifics }) => {
    // Configure connection with pooling and performance optimizations
    mongoose_1.default.connect(mongoUri, {
        maxPoolSize: 10, // Maintain up to 10 socket connections
        serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
        compressors: 'zlib', // Use compression
    })
        .then(async () => {
        console.log('node api logger db connected with optimized settings');
        // Create indexes immediately after connection
        await (0, indexes_1.createIndexes)();
    })
        .catch(err => console.error('node api logger db connection error:', err));
    app.use((0, cookie_parser_1.default)());
    // Middleware for logging
    app.use((0, log_1.logMiddleware)(beginswith, specifics));
    // API and Auth Routes
    app.use('/logs/api', api_1.default);
    app.use('/logs/auth', auth_1.default);
    // Serve static CSS files
    app.use('/styles', express_1.default.static(path_1.default.join(__dirname, '../src/views/styles')));
    //Js
    app.use('/js', express_1.default.static(path_1.default.join(__dirname, '../src/views/js')));
    // Serve static HTML files (login unprotected)
    app.get('/logs/login', (req, res) => res.sendFile(path_1.default.join(__dirname, '../src/views/login.html')));
    // Dashboard HomePage (protected)
    app.get('/logs', auth_2.verifyToken, (req, res) => res.sendFile(path_1.default.join(__dirname, '../src/views/logs.html')));
    app.get('/logs/home', auth_2.verifyToken, (req, res) => res.sendFile(path_1.default.join(__dirname, '../src/views/home.html')));
    // Settings Page (protected)
    app.get('/logs/settings', auth_2.verifyToken, (req, res) => res.sendFile(path_1.default.join(__dirname, '../src/views/settings.html')));
    app.get('/logs/:id', auth_2.verifyToken, (req, res) => res.sendFile(path_1.default.join(__dirname, '../src/views/logDetails.html')));
};
exports.createExpressLogger = createExpressLogger;
const CreateNextLogger = () => { };
exports.CreateNextLogger = CreateNextLogger;
