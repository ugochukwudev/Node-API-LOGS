import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const jwtSecret = process.env.node_api_logger_jwtSecret || "your_secret_key";

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.token;
    const isApiRequest = req.originalUrl.startsWith('/logs/api');
    if (!token) {
        return isApiRequest
            ? res.status(401).json({ message: 'Unauthorized' })
            : res.redirect('/logs/login');
    }

    try {
        const decoded = jwt.verify(token, jwtSecret) as { id: string; role: string };
        (req as any).user = decoded;
        next();
    } catch (error) {
        return isApiRequest
            ? res.status(401).json({ message: 'Invalid token' })
            : res.redirect('/logs/login');
    }
};
