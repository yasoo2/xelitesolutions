import mongoose, { Schema, Document } from 'mongoose';

export interface SentinelPolicyDocument extends Document {
    name: string;
    weight: number;
    conditions: any; // Rule definition syntax
    autoResponse?: string; // Action name to run automatically (e.g., 'block_ip')
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const SentinelPolicySchema = new Schema<SentinelPolicyDocument>({
    name: { type: String, required: true, unique: true },
    weight: { type: Number, required: true, default: 10 },
    conditions: { type: Schema.Types.Mixed },
    autoResponse: { type: String },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const SentinelPolicyModel = mongoose.model<SentinelPolicyDocument>('SentinelPolicy', SentinelPolicySchema);
