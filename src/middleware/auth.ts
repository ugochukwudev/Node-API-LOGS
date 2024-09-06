import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const SECRET_KEY = 'your_secret_key';

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const decoded = jwt.verify(token, SECRET_KEY) as { id: string; role: string };
        (req as any).user = decoded; // Type assertion
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
};
