import mongoose, { Schema, Document } from 'mongoose';

/**
 * An operator-configurable Sentinel rule.
 *
 * The previous version of this file declared `conditions: any // Rule definition
 * syntax` and no syntax existed, so nothing could evaluate it and nothing ever
 * did. The language is now defined in SentinelPolicyEvaluator and validated
 * before a policy is ever stored, so a rule that cannot run cannot be saved.
 */
export interface SentinelPolicyDocument extends Document {
    name: string;
    description?: string;
    /** Added to the incident's risk score when the conditions match. */
    weight: number;
    /** A condition tree in the language defined by SentinelPolicyEvaluator. */
    conditions: any;
    /** Severity this rule contributes; the incident takes the highest. */
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
    /** Playbook action to run automatically, e.g. 'block_ip'. */
    autoResponse?: string;
    /** Where the action's target is read from in the telemetry, e.g.
     *  'users[].ip'. Without it an autoResponse cannot be carried out, and the
     *  engine records that rather than acting on a guess. */
    autoResponseTargetField?: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const SentinelPolicySchema = new Schema<SentinelPolicyDocument>({
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String },
    weight: { type: Number, required: true, default: 10, min: 0, max: 100 },
    conditions: { type: Schema.Types.Mixed, required: true },
    severity: {
        type: String,
        enum: ['info', 'low', 'medium', 'high', 'critical'],
        default: 'medium',
    },
    autoResponse: { type: String, enum: ['block_ip', 'kill_process_tree', 'quarantine_file'] },
    autoResponseTargetField: { type: String },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

export const SentinelPolicyModel = mongoose.model<SentinelPolicyDocument>('SentinelPolicy', SentinelPolicySchema);
