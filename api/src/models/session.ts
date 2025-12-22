import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISession extends Document {
  tenantId: Types.ObjectId;
  projectId?: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  mode: 'ADVISOR' | 'BUILDER' | 'SAFE' | 'OWNER';
  kind?: 'chat' | 'agent';
  isPinned?: boolean;
  lastSnippet?: string;
  lastUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  folderId?: Types.ObjectId;
  terminalState?: string;
}

const SessionSchema = new Schema<ISession>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    title: { type: String, required: true },
    mode: { type: String, enum: ['ADVISOR', 'BUILDER', 'SAFE', 'OWNER'], default: 'ADVISOR' },
    kind: { type: String, enum: ['chat', 'agent'], default: 'chat', index: true },
    isPinned: { type: Boolean, default: false },
    lastSnippet: { type: String },
    lastUpdatedAt: { type: Date, default: Date.now },
    folderId: { type: Schema.Types.ObjectId, ref: 'Folder' },
    terminalState: { type: String },
  },
  { timestamps: true }
);

SessionSchema.index({ userId: 1, title: 1 }, { unique: true });

export const Session = mongoose.model<ISession>('Session', SessionSchema);
