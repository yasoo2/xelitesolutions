import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * ConversationSummary Model
 * Stores compressed conversation history per user with session isolation.
 * Each user's data is completely isolated by userId.
 */
export interface IConversationSummary extends Document {
    userId: string;           // Required: Isolates data between users
    sessionId?: Types.ObjectId; // Optional: Links to specific session
    summary: string;          // AI-generated summary of the conversation
    messageCount: number;     // Number of messages summarized
    topics: string[];         // Key topics discussed
    createdAt: Date;
    updatedAt: Date;
}

const ConversationSummarySchema = new Schema<IConversationSummary>(
    {
        userId: {
            type: String,
            required: true,
            index: true  // Critical: Fast lookups by user
        },
        sessionId: {
            type: String,
            ref: 'Session',
            index: true
        },
        summary: {
            type: String,
            required: true,
            maxlength: 2000  // Keep summaries concise
        },
        messageCount: {
            type: Number,
            default: 0
        },
        topics: [{
            type: String
        }]
    },
    { timestamps: true }
);

// Compound index for efficient user + time queries
ConversationSummarySchema.index({ userId: 1, createdAt: -1 });

export const ConversationSummary = mongoose.model<IConversationSummary>('ConversationSummary', ConversationSummarySchema);
