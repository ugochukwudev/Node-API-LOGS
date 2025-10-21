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
    sessionLogs: any[];
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
    date: { type: Date, default: Date.now, index: true },
    sessionLogs: { type: [Schema.Types.Mixed], default: [] },
});

// Add compound indexes for better query performance
ApiLogSchema.index({ date: -1, status: 1 }); // For filtering by date and status
ApiLogSchema.index({ endpoint: 1, date: -1 }); // For endpoint filtering with date sorting
ApiLogSchema.index({ status: 1, date: -1 }); // For status filtering with date sorting
ApiLogSchema.index({ responseTime: -1 }); // For finding slow endpoints
ApiLogSchema.index({ date: -1 }); // For general date-based queries (already exists but explicit)

const ApiLog = mongoose.model<IApiLog>('ApiLog', ApiLogSchema);

export default ApiLog;
