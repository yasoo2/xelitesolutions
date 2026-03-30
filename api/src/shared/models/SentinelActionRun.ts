import mongoose, { Schema, Document, Types } from 'mongoose';

export interface SentinelActionRunDocument extends Document {
    incidentId: Types.ObjectId;
    actionType: string;
    initiatedBySystem: boolean;
    initiatedByUserId?: Types.ObjectId;
    status: 'pending' | 'running' | 'success' | 'failed' | 'rolled_back';
    logs: string;
    rollbackLogs: string;
    createdAt: Date;
    updatedAt: Date;
}

const SentinelActionRunSchema = new Schema<SentinelActionRunDocument>({
    incidentId: { type: Schema.Types.ObjectId, ref: 'SentinelIncident', required: true },
    actionType: { type: String, required: true },
    initiatedBySystem: { type: Boolean, default: false },
    initiatedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'running', 'success', 'failed', 'rolled_back'], default: 'pending' },
    logs: { type: String, default: '' },
    rollbackLogs: { type: String, default: '' }
}, { timestamps: true });

export const SentinelActionRunModel = mongoose.model<SentinelActionRunDocument>('SentinelActionRun', SentinelActionRunSchema);
