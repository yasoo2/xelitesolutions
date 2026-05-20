import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWorkspaceMember extends Document {
    workspaceId: string;
    userId: string;
    role: 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER' | 'AGENT';
    joinedAt: Date;
    updatedAt: Date;
}

const WorkspaceMemberSchema = new Schema<IWorkspaceMember>(
    {
        workspaceId: { type: String, ref: 'Workspace', required: true, index: true },
        userId: { type: String, ref: 'User', required: true, index: true },
        role: { type: String, enum: ['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER', 'AGENT'], default: 'VIEWER' },
        joinedAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

// Compound index to prevent duplicate membership
WorkspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export const WorkspaceMember = mongoose.model<IWorkspaceMember>('WorkspaceMember', WorkspaceMemberSchema);
