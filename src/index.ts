import express, { Application } from 'express'; // Import express and Application
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import path from 'path';
import apiRoutes from './routes/api';
import authRoutes from './routes/auth';
import { logMiddleware } from './middleware/log';

export const createApp = (app: Application, mongoUri: string) => {
    mongoose.connect(mongoUri)
        .then(() => console.log('MongoDB connected'))
        .catch(err => console.error('MongoDB connection error:', err));

    app.use(cookieParser());

    // Middleware for logging
    app.use(logMiddleware(mongoUri));

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
