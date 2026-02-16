import mongoose, { Schema, Document } from 'mongoose';

export interface ITenant extends Document {
  name: string;
  domain?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, unique: true },
    domain: { type: String },
  },
  { timestamps: true }
);

export const Tenant = mongoose.model<ITenant>('Tenant', TenantSchema);
