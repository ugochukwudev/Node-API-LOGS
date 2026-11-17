import mongoose, { Schema } from 'mongoose';

/**
 * One stored copy of a request body, response body or header set, keyed by the
 * SHA-256 of its content. Logs point at blobs instead of embedding copies.
 */
export interface IApiLogBlob {
    _id: string;
    data: any;
    size: number;
    createdAt: Date;
    lastSeenAt: Date;
}

const ApiLogBlobSchema = new Schema<IApiLogBlob>({
    _id: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    size: { type: Number, required: true },
    createdAt: { type: Date, required: true },
    // Refreshed every time a new log reuses this blob; orphan cleanup only
    // deletes blobs not seen recently, so it can't race a log being written.
    lastSeenAt: { type: Date, required: true },
}, { versionKey: false, minimize: false });

const ApiLogBlob = mongoose.model<IApiLogBlob>('ApiLogBlob', ApiLogBlobSchema);

export default ApiLogBlob;
