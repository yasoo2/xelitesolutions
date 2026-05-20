import mongoose, { Schema, Document } from 'mongoose';

export interface IFile extends Document {
  originalName: string;
  filename: string;
  mimeType: string;
  size: number;
  path: string;
  content?: string; // Extracted text content
  sessionId?: string;
  createdAt: Date;
}

const FileSchema = new Schema<IFile>({
  originalName: { type: String, required: true },
  filename: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  path: { type: String, required: true },
  content: { type: String }, // For RAG/LLM context
  sessionId: { type: String, index: true },
}, { timestamps: true });

export const FileModel = mongoose.model<IFile>('File', FileSchema);
