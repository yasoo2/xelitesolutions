import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  name?: string;
  picture?: string;
  passwordHash: string;
  role: 'OWNER' | 'ADMIN' | 'USER' | 'SUPER_ADMIN';
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
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);
