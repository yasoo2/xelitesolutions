import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  name?: string;
  picture?: string;
  passwordHash: string;
  role: 'OWNER' | 'ADMIN' | 'USER' | 'SUPER_ADMIN';
  failedLoginAttempts: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String },
    picture: { type: String },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['OWNER', 'ADMIN', 'USER', 'SUPER_ADMIN'], default: 'USER' },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);

// Password strength validation utility
const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (!PASSWORD_REGEX.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter, one lowercase letter, and one number' };
  }
  return { valid: true };
}

// Account lockout constants
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
