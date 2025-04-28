import { Request, Response } from 'express';
export declare const getLogs: (req: Request, res: Response) => Promise<void>;
export declare const getLogById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getMetrics: (req: Request, res: Response) => Promise<void>;
export declare const getStatusDistribution: (req: Request, res: Response) => Promise<void>;
export declare const getSystemStats: (req: Request, res: Response) => Promise<void>;
export declare const getStatusTrends: (req: Request, res: Response) => Promise<void>;
export declare const getSlowEndpoints: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=api.d.ts.map