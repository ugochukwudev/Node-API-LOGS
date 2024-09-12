import { Request, Response, NextFunction } from 'express';
export declare const logMiddleware: (beginswith?: string[], specifics?: string[]) => (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=log.d.ts.map