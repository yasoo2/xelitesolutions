import mongoose, { Schema, Document } from 'mongoose';

export interface SentinelAuditLogDocument extends Document {
    timestamp: Date;
    actor: string;     // 'system', 'agent', or 'User:ID'
    action: string;    // e.g., 'PROCESS_KIILED', 'IP_BLOCKED', 'INCIDENT_RESOLVED'
    resource: string;  // e.g., 'Server:46.224.187.142', 'PID:1234'
    result: string;    // 'success', 'failure', raw output
    hash: string;      // Cryptographic hash of previous row + current row to detect tampering
}

const SentinelAuditLogSchema = new Schema<SentinelAuditLogDocument>({
    timestamp: { type: Date, default: Date.now, required: true },
    actor: { type: String, required: true },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    result: { type: String, required: true },
    hash: { type: String, required: true }
});

// Immutable collection setting
SentinelAuditLogSchema.set('autoIndex', false);

export const SentinelAuditLogModel = mongoose.model<SentinelAuditLogDocument>('SentinelAuditLog', SentinelAuditLogSchema);
