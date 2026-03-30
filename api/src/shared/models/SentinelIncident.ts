import mongoose, { Schema, Document, Types } from 'mongoose';

export interface SentinelIncidentDocument extends Document {
    title: string;
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
    serverId: Types.ObjectId;
    detectingRules: string[];
    evidence: any;
    status: 'open' | 'acknowledged' | 'contained' | 'resolved' | 'false_positive';
    recommendedActions: string[];
    createdAt: Date;
    updatedAt: Date;
}

const SentinelIncidentSchema = new Schema<SentinelIncidentDocument>({
    title: { type: String, required: true },
    severity: { type: String, enum: ['info', 'low', 'medium', 'high', 'critical'], required: true },
    serverId: { type: Schema.Types.ObjectId, ref: 'ServerConfig', required: true },
    detectingRules: [{ type: String }],
    evidence: { type: Schema.Types.Mixed }, // Dynamic JSON payload
    status: { type: String, enum: ['open', 'acknowledged', 'contained', 'resolved', 'false_positive'], default: 'open' },
    recommendedActions: [{ type: String }]
}, { timestamps: true });

// Indexes for super-admin dashboard querying
SentinelIncidentSchema.index({ serverId: 1, status: 1 });
SentinelIncidentSchema.index({ severity: 1, status: 1 });

export const SentinelIncidentModel = mongoose.model<SentinelIncidentDocument>('SentinelIncident', SentinelIncidentSchema);
