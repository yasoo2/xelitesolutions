import mongoose, { Schema, Document, Types } from 'mongoose';

export interface SentinelServerBaselineDocument extends Document {
    serverId: string;
    checksums: Map<string, string>; // filepath -> hash
    pm2Apps: Array<{ name: string; status: string; memory: number; cpu: number }>;
    dockerContainers: Array<{ id: string; name: string; state: string; image: string }>;
    openPorts: number[];
    lastUpdated: Date;
}

const SentinelServerBaselineSchema = new Schema<SentinelServerBaselineDocument>({
    serverId: { type: String, ref: 'ServerConfig', required: true, unique: true },
    checksums: { type: Map, of: String, default: {} },
    pm2Apps: [{
        name: { type: String },
        status: { type: String },
        memory: { type: Number },
        cpu: { type: Number }
    }],
    dockerContainers: [{
        id: { type: String },
        name: { type: String },
        state: { type: String },
        image: { type: String }
    }],
    openPorts: [{ type: Number }],
    lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

export const SentinelServerBaselineModel = mongoose.model<SentinelServerBaselineDocument>('SentinelServerBaseline', SentinelServerBaselineSchema);
