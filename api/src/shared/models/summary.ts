import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISummary extends Document {
  sessionId: Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const SummarySchema = new Schema<ISummary>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', index: true, required: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

export const Summary = mongoose.model<ISummary>('Summary', SummarySchema);
