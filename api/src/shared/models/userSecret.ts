import mongoose, { Schema, Document, Types } from 'mongoose';
import crypto from 'crypto';
import { config } from '../config';
export interface IUserSecret extends Document {
  userId: string;
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

UserSecretSchema.pre('save', function (next) {
  if (this.isModified('value') && (!this.enc || !this.enc.alg)) {
    const iv = crypto.randomBytes(12);
    // Use first 32 chars of jwtSecret (padded if necessary) as encryption key
    const key = Buffer.from(config.jwtSecret.slice(0, 32).padEnd(32, '0'));
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(this.value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();
    this.value = encrypted;
    this.enc = { alg: 'aes-256-gcm', ivB64: iv.toString('base64'), tagB64: tag.toString('base64') };
  }
  next();
});

UserSecretSchema.methods.getDecryptedValue = function (): string {
  if (!this.enc || this.enc.alg !== 'aes-256-gcm') {
    return this.value; // Unencrypted legacy (lazy migration handled upstream)
  }
  try {
    const key = Buffer.from(config.jwtSecret.slice(0, 32).padEnd(32, '0'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(this.enc.ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(this.enc.tagB64, 'base64'));
    let decrypted = decipher.update(this.value, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.error('[UserSecret] Failed to decrypt secret');
    return this.value;
  }
};

export const UserSecret = mongoose.model<IUserSecret>('UserSecret', UserSecretSchema);
