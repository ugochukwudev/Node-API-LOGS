import express, { Application } from 'express'; // Import express and Application
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import path from 'path';
import apiRoutes from './routes/api';
import authRoutes from './routes/auth';
import { logMiddleware } from './middleware/log';

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
export const createExpressLogger = ({app, mongoUri,beginswith,specifics}:{
    app:Application,mongoUri:string,beginswith?:string[],specifics?:string[]
}) => {

    mongoose.connect(mongoUri)
        .then(() => console.log('node api logger db connected'))
        .catch(err => console.error('node api logger db connection error:', err));

    app.use(cookieParser());

    // Middleware for logging
    app.use(logMiddleware(beginswith,specifics));

    // API and Auth Routes
    app.use('/logs/api', apiRoutes);
    app.use('/logs/auth', authRoutes);

    // Serve static CSS files
    app.use('/styles', express.static(path.join(__dirname, '../src/views/styles')));
    //Js
app.use('/js', express.static(path.join(__dirname, '../src/views/js')));

    // Serve static HTML files
    app.get('/logs/login', (req, res) => res.sendFile(path.join(__dirname, '../src/views/login.html')));
    app.get('/logs', (req, res) => res.sendFile(path.join(__dirname, '../src/views/logs.html')));
    app.get('/logs/:id', (req, res) => res.sendFile(path.join(__dirname, '../src/views/logDetails.html')));
};

export const CreateNextLogger=()=>{}