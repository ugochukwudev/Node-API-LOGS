"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = void 0;
const express_1 = __importDefault(require("express")); // Import express and Application
const mongoose_1 = __importDefault(require("mongoose"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const path_1 = __importDefault(require("path"));
const api_1 = __importDefault(require("./routes/api"));
const auth_1 = __importDefault(require("./routes/auth"));
const log_1 = require("./middleware/log");
const createApp = (app, mongoUri) => {
    mongoose_1.default.connect(mongoUri)
        .then(() => console.log('MongoDB connected'))
        .catch(err => console.error('MongoDB connection error:', err));
    app.use((0, cookie_parser_1.default)());
    // Middleware for logging
    app.use((0, log_1.logMiddleware)(mongoUri));
    // API and Auth Routes
    app.use('/logs/api', api_1.default);
    app.use('/logs/auth', auth_1.default);
    // Serve static CSS files
    app.use('/styles', express_1.default.static(path_1.default.join(__dirname, '../src/views/styles')));
    //Js
    app.use('/js', express_1.default.static(path_1.default.join(__dirname, '../src/views/js')));
    // Serve static HTML files
    app.get('/logs/login', (req, res) => res.sendFile(path_1.default.join(__dirname, '../src/views/login.html')));
    app.get('/logs', (req, res) => res.sendFile(path_1.default.join(__dirname, '../src/views/logs.html')));
    app.get('/logs/:id', (req, res) => res.sendFile(path_1.default.join(__dirname, '../src/views/logDetails.html')));
};
exports.createApp = createApp;
//# sourceMappingURL=index.js.map