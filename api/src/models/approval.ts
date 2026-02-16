import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IApproval extends Document {
  runId: Types.ObjectId;
  action: string;
  risk: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: Date;
  updatedAt: Date;
}

const ApprovalSchema = new Schema<IApproval>(
  {
    runId: { type: Schema.Types.ObjectId, ref: 'Run', index: true, required: true },
    action: { type: String, required: true },
    risk: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
  },
  { timestamps: true }
);

export const Approval = mongoose.model<IApproval>('Approval', ApprovalSchema);
