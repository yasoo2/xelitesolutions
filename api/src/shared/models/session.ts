import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISession extends Document {
  tenantId: string;
  workspaceId?: string;
  projectId?: string;
  userId: string;
  title: string;
  mode: 'ADVISOR' | 'BUILDER' | 'SAFE' | 'OWNER';
  kind?: 'chat' | 'agent';
  status: 'active' | 'archived' | 'deleted';
  folderId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema<ISession>(
  {
    tenantId: { type: String, ref: 'Tenant', index: true, required: true },
    workspaceId: { type: String, ref: 'Workspace', index: true },
    projectId: { type: String, ref: 'Project', index: true },
    userId: { type: String, ref: 'User', index: true, required: true },
    title: { type: String, required: true },
    mode: { type: String, enum: ['ADVISOR', 'BUILDER', 'SAFE', 'OWNER'], default: 'BUILDER' },
    kind: { type: String, enum: ['chat', 'agent'], default: 'chat' },
    status: { type: String, enum: ['active', 'archived', 'deleted'], default: 'active' },
    folderId: { type: String, ref: 'Folder', index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const Session = mongoose.model<ISession>('Session', SessionSchema);
