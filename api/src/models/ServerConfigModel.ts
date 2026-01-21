/**
 * Server Configuration MongoDB Model
 */

import mongoose, { Schema, Document, Types } from 'mongoose';
import { ServerConfig as IServerConfig } from './ServerConfig';

export interface ServerConfigDocument extends Document, Omit<IServerConfig, 'id' | 'userId'> {
    userId: Types.ObjectId;
}

const ServerConfigSchema = new Schema<ServerConfigDocument>({
    name: { type: String, required: true },
    host: { type: String, required: true },
    port: { type: Number, default: 22 },
    username: { type: String, required: true },
    authMethod: { type: String, enum: ['key', 'password'], required: true },
    keyPath: { type: String },
    password: { type: String, select: false }, // Don't return by default for security
    tags: [{ type: String }],
    isActive: { type: Boolean, default: true },
    lastConnected: { type: Date },
    createdAt: { type: Date, default: Date.now },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

// Index for faster queries
ServerConfigSchema.index({ userId: 1, isActive: 1 });
ServerConfigSchema.index({ name: 1 });

export const ServerConfigModel = mongoose.model<ServerConfigDocument>('ServerConfig', ServerConfigSchema);
