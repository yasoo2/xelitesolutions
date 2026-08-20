import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IRun extends Document {
  sessionId: string;
  runId?: string;
  status: 'pending' | 'running' | 'done' | 'blocked' | 'failed';
  steps: Array<{
    name: string;
    status: 'pending' | 'running' | 'done' | 'blocked' | 'failed';
    why?: string;
    evidence?: Array<{ type: 'log' | 'screenshot' | 'artifact'; ref: string }>;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const RunSchema = new Schema<IRun>(
  {
    sessionId: { type: String, ref: 'Session', index: true, required: true },
    runId: { type: String, index: true, sparse: true },
    status: { type: String, enum: ['pending', 'running', 'done', 'blocked', 'failed'], default: 'pending' },
    steps: [
      {
        name: String,
        status: { type: String, enum: ['pending', 'running', 'done', 'blocked', 'failed'], default: 'pending' },
        why: String,
        evidence: [{ type: { type: String }, ref: String }],
      },
    ],
  },
  { timestamps: true }
);

export const Run = mongoose.model<IRun>('Run', RunSchema);
