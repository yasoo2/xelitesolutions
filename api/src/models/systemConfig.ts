import { Schema, model, Document } from 'mongoose';

export interface ISystemConfig extends Document {
    key: string;
    value: any;
    updatedAt: Date;
}

const SystemConfigSchema = new Schema<ISystemConfig>({
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export const SystemConfig = model<ISystemConfig>('SystemConfig', SystemConfigSchema);
