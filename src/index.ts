import express, { Application } from 'express'; // Import express and Application
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import path from 'path';
import apiRoutes from './routes/api';
import authRoutes from './routes/auth';
import { logMiddleware } from './middleware/log';

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