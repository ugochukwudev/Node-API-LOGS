import mongoose, { Schema } from 'mongoose';

/**
 * Hourly totals per endpoint, method and status, written just before logs are
 * deleted so the dashboard charts keep their history.
 */
export interface ILogSummary {
    hour: Date;
    /** Path only, without the query string */
    endpoint: string;
    method: string;
    status: number;
    count: number;
    /** Sum of response times, for averages */
    totalTime: number;
    minTime: number;
    maxTime: number;
}

const LogSummarySchema = new Schema<ILogSummary>({
    hour: { type: Date, required: true },
    endpoint: { type: String, required: true },
    method: { type: String, required: true },
    status: { type: Number, required: true },
    count: { type: Number, required: true },
    totalTime: { type: Number, required: true },
    minTime: { type: Number, required: true },
    maxTime: { type: Number, required: true },
}, { versionKey: false });

LogSummarySchema.index({ hour: 1, endpoint: 1, method: 1, status: 1 }, { unique: true });

const LogSummary = mongoose.model<ILogSummary>('ApiLogSummary', LogSummarySchema);

export default LogSummary;
