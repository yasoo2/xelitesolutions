import mongoose, { Schema, Document } from 'mongoose';

export interface IFolder extends Document {
  name: string;
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FolderSchema = new Schema<IFolder>({
  name: { type: String, required: true },
  userId: { type: String, index: true },
}, { timestamps: true });

export const Folder = mongoose.model<IFolder>('Folder', FolderSchema);
