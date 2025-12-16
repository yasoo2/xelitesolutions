import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISession extends Document {
  tenantId: Types.ObjectId;
  projectId?: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  mode: 'ADVISOR' | 'BUILDER' | 'SAFE' | 'OWNER';
  lastSnippet?: string;
  lastUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema<ISession>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    title: { type: String, required: true },
    mode: { type: String, enum: ['ADVISOR', 'BUILDER', 'SAFE', 'OWNER'], default: 'ADVISOR' },
    lastSnippet: { type: String },
    lastUpdatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Session = mongoose.model<ISession>('Session', SessionSchema);
