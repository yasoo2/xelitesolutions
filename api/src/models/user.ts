import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  role: 'OWNER' | 'ADMIN' | 'USER';
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['OWNER', 'ADMIN', 'USER'], default: 'USER' },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
