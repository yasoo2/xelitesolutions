import mongoose, { Schema, Document } from 'mongoose';

export interface IDeployment extends Document {
    commit: string;
    status: 'PENDING' | 'BUILDING' | 'SUCCESS' | 'FAILED' | 'ROLLBACK';
    startTime: Date;
    endTime?: Date;
    duration?: number;
    logs: string[];
    triggeredBy: 'webhook' | 'manual';
    error?: string;
}

const DeploymentSchema = new Schema<IDeployment>(
    {
        commit: { type: String, required: true },
        status: { type: String, enum: ['PENDING', 'BUILDING', 'SUCCESS', 'FAILED', 'ROLLBACK'], default: 'PENDING' },
        startTime: { type: Date, default: Date.now },
        endTime: { type: Date },
        duration: { type: Number },
        logs: { type: [String], default: [] },
        triggeredBy: { type: String, enum: ['webhook', 'manual'], required: true },
        error: { type: String },
    },
    { timestamps: true }
);

export const Deployment = mongoose.model<IDeployment>('Deployment', DeploymentSchema);
