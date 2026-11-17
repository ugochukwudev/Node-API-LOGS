import mongoose, { Schema } from 'mongoose';

export type JobStatus = 'waiting' | 'delayed' | 'active' | 'completed' | 'failed';

/** One run of a queued job (retries of the same run update it). */
export interface IJobLog {
    library: string;
    queue: string;
    name: string;
    jobId: string;
    status: JobStatus;
    payloadRef: string | null;
    resultRef: string | null;
    error: string | null;
    attempts: number;
    queuedAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
    duration: number | null;
    sessionLogs: string[];
    /** The request that queued this job, when it was queued during one. */
    requestLogId: mongoose.Types.ObjectId | null;
}

const JobLogSchema = new Schema<IJobLog>({
    library: { type: String, required: true },
    queue: { type: String, required: true },
    name: { type: String, required: true },
    jobId: { type: String, required: true },
    status: { type: String, enum: ['waiting', 'delayed', 'active', 'completed', 'failed'], required: true },
    payloadRef: { type: String, default: null },
    resultRef: { type: String, default: null },
    error: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    queuedAt: { type: Date, required: true },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    duration: { type: Number, default: null },
    sessionLogs: { type: [String], default: [] },
    requestLogId: { type: Schema.Types.ObjectId, default: null },
}, { versionKey: false });

JobLogSchema.index({ library: 1, queue: 1, jobId: 1, queuedAt: -1 });
JobLogSchema.index({ queuedAt: -1 });
JobLogSchema.index({ status: 1, queuedAt: -1 });
JobLogSchema.index({ requestLogId: 1 });

const JobLog = mongoose.model<IJobLog>('ApiJobLog', JobLogSchema);

export default JobLog;
