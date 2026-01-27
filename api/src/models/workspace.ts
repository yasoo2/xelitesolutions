import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWorkspace extends Document {
    slug: string;
    name: string;
    ownerId: Types.ObjectId;
    status: 'active' | 'suspended' | 'archived';
    plan: 'free' | 'pro' | 'enterprise';

    limits: {
        maxAgents: number;
        maxTokensPerDay: number;
        maxConcurrentJobs: number;
        storageGB: number;
    };

    integrations: {
        github?: {
            installationId: string;
            repositories: string[]; // ['owner/repo']
        };
        llmProviders?: {
            openai?: { apiKey: string }; // Encrypted
            openrouter?: { apiKey: string };
        };
    };

    settings: {
        allowPublicView: boolean;
        requireApproval: boolean;
    };

    createdAt: Date;
    updatedAt: Date;
}

const WorkspaceSchema = new Schema<IWorkspace>(
    {
        slug: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
        name: { type: String, required: true },
        ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        status: { type: String, enum: ['active', 'suspended', 'archived'], default: 'active' },
        plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
        limits: {
            maxAgents: { type: Number, default: 2 },
            maxTokensPerDay: { type: Number, default: 100000 },
            maxConcurrentJobs: { type: Number, default: 1 },
            storageGB: { type: Number, default: 1 }
        },
        /* Deprecated providerConfig removed */
        integrations: {
            github: {
                installationId: { type: String },
                repositories: [{ type: String }]
            },
            llmProviders: {
                openai: { apiKey: { type: String } }, // In reality, use simple encryption helpers on save
                openrouter: { apiKey: { type: String } }
            }
        },
        settings: {
            allowPublicView: { type: Boolean, default: false },
            requireApproval: { type: Boolean, default: true }
        }
    },
    { timestamps: true }
);

export const Workspace = mongoose.model<IWorkspace>('Workspace', WorkspaceSchema);
