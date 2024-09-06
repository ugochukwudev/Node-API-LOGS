import mongoose, { Document, Schema } from 'mongoose';

export interface IApiLog extends Document {
    method: string;
    endpoint: string;
    status: number;
    responseTime: number;
    requestBody: any;
    responseBody: any; // Ensure this is of type Schema.Types.Mixed to support objects
    headers: any;
    ip: string;
    date: Date;
}

const ApiLogSchema: Schema = new Schema({
    method: { type: String, required: true },
    endpoint: { type: String, required: true },
    status: { type: Number, required: true },
    responseTime: { type: Number, required: true },
    requestBody: { type: Schema.Types.Mixed, required: true },
    responseBody: { type: Schema.Types.Mixed, required: true }, // Ensure this allows objects
    headers: { type: Schema.Types.Mixed, required: true },
    ip: { type: String, required: true },
    date: { type: Date, default: Date.now },
});

const ApiLog = mongoose.model<IApiLog>('ApiLog', ApiLogSchema);

export default ApiLog;
