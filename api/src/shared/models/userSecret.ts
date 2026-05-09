import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUserSecret extends Document {
  userId: Types.ObjectId;
  provider: string;
  key: string;
  value: string;
  enc?: {
    alg: 'aes-256-gcm';
    ivB64: string;
    tagB64: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSecretSchema = new Schema<IUserSecret>(
  {
    userId: { type: String, ref: 'User', index: true, required: true },
    provider: { type: String, required: true, index: true },
    key: { type: String, required: true, index: true },
    value: { type: String, required: true },
    enc: {
      alg: { type: String },
      ivB64: { type: String },
      tagB64: { type: String },
    },
  },
  { timestamps: true }
);

UserSecretSchema.index({ userId: 1, provider: 1, key: 1 }, { unique: true });

export const UserSecret = mongoose.model<IUserSecret>('UserSecret', UserSecretSchema);

