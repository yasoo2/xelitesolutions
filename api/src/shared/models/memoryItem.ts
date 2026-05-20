import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMemoryItem extends Document {
  scope: 'session' | 'project' | 'user';
  sessionId?: Types.ObjectId;
  projectId?: Types.ObjectId;
  userId?: Types.ObjectId;
  key: string;
  value: any;
  createdAt: Date;
  updatedAt: Date;
}

const MemoryItemSchema = new Schema<IMemoryItem>(
  {
    scope: { type: String, enum: ['session', 'project', 'user'], required: true },
    sessionId: { type: String, ref: 'Session', index: true },
    projectId: { type: String, ref: 'Project', index: true },
    userId: { type: String, ref: 'User', index: true },
    key: { type: String, required: true },
    value: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const MemoryItem = mongoose.model<IMemoryItem>('MemoryItem', MemoryItemSchema);
