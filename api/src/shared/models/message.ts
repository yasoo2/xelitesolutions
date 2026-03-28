import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IMessage extends Document {
  sessionId: Types.ObjectId;
  role: 'user' | 'assistant' | 'system';
  content: string;
  runId?: string;
  attachments?: Array<{ name: string; href: string }>;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', index: true, required: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, required: true },
    runId: { type: String },
    attachments: [{ name: String, href: String }],
  },
  { timestamps: true }
);

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
