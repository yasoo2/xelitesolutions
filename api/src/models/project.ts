import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IProject extends Document {
  tenantId: Types.ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true, required: true },
    name: { type: String, required: true },
  },
  { timestamps: true }
);

export const Project = mongoose.model<IProject>('Project', ProjectSchema);
