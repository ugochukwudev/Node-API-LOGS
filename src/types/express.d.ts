import { Request } from 'express';

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                role: string;
            };
            /** Set by requirePending: the user who passed the password step. */
            pendingUserId?: string;
        }
    }
}
