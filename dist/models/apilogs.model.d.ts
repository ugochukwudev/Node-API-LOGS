import mongoose, { Document } from 'mongoose';
export interface IApiLog extends Document {
    method: string;
    endpoint: string;
    status: number;
    responseTime: number;
    requestBody: any;
    responseBody: any;
    headers: any;
    ip: string;
    date: Date;
}
declare const ApiLog: mongoose.Model<IApiLog, {}, {}, {}, mongoose.Document<unknown, {}, IApiLog> & IApiLog & Required<{
    _id: unknown;
}>, any>;
export default ApiLog;
//# sourceMappingURL=apilogs.model.d.ts.map