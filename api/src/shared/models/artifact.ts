import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IArtifact extends Document {
  runId?: Types.ObjectId;
  name: string;
  href: string;
  createdAt: Date;
  updatedAt: Date;
}

const ArtifactSchema = new Schema<IArtifact>(
  {
    runId: { type: Schema.Types.ObjectId, ref: 'Run', index: true },
    name: { type: String, required: true },
    href: { type: String, required: true },
  },
  { timestamps: true }
);

export const Artifact = mongoose.model<IArtifact>('Artifact', ArtifactSchema);
