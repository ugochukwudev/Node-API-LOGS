import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const jwtSecret =   process.env.node_api_logger_jwtSecret||"your_secret_key";

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const decoded = jwt.verify(token, jwtSecret) as { id: string; role: string };
        (req as any).user = decoded; // Type assertion
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
};
