import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISession extends Document {
  tenantId: Types.ObjectId; // Keeping for legacy, eventually replace with workspaceId
  workspaceId?: Types.ObjectId; // New Workspace Link
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
  pendingTool?: {
    runId: string;
    name: string;
    input: any;
    workspaceId?: string;
  };
}

const SessionSchema = new Schema<ISession>(
  {
    tenantId: { type: String, ref: 'Tenant', index: true, required: true },
    workspaceId: { type: String, ref: 'Workspace', index: true },
    projectId: { type: String, ref: 'Project', index: true },
    userId: { type: String, ref: 'User', index: true },
    title: { type: String, required: true },
    mode: { type: String, enum: ['ADVISOR', 'BUILDER', 'SAFE', 'OWNER'], default: 'ADVISOR' },
    kind: { type: String, enum: ['chat', 'agent'], default: 'chat', index: true },
    isPinned: { type: Boolean, default: false },
    lastSnippet: { type: String },
    lastUpdatedAt: { type: Date, default: Date.now },
    folderId: { type: String, ref: 'Folder' },
    terminalState: { type: String },
    pendingTool: {
      runId: { type: String },
      name: { type: String },
      input: { type: Schema.Types.Mixed },
      workspaceId: { type: String }
    },
  },
  { timestamps: true }
);

SessionSchema.index({ userId: 1, title: 1 });

export const Session = mongoose.model<ISession>('Session', SessionSchema);
