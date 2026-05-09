import mongoose, { Schema, Document, Types } from 'mongoose';

export interface SentinelActionRunDocument extends Document {
    incidentId: string;
    actionType: string;
    initiatedBySystem: boolean;
    initiatedByUserId?: string;
    status: 'pending' | 'running' | 'success' | 'failed' | 'rolled_back';
    logs: string;
    rollbackLogs: string;
    createdAt: Date;
    updatedAt: Date;
}

const SentinelActionRunSchema = new Schema<SentinelActionRunDocument>({
    incidentId: { type: String, ref: 'SentinelIncident', required: true },
    actionType: { type: String, required: true },
    initiatedBySystem: { type: Boolean, default: false },
    initiatedByUserId: { type: String, ref: 'User' },
    status: { type: String, enum: ['pending', 'running', 'success', 'failed', 'rolled_back'], default: 'pending' },
    logs: { type: String, default: '' },
    rollbackLogs: { type: String, default: '' }
}, { timestamps: true });

export const SentinelActionRunModel = mongoose.model<SentinelActionRunDocument>('SentinelActionRun', SentinelActionRunSchema);
