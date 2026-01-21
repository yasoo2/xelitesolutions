/**
 * Long-Term Memory System
 * Vector-based memory storage for conversation history and user preferences
 */

import fs from 'fs/promises';
import path from 'path';

export interface MemoryEntry {
    id: string;
    userId: string;
    type: 'conversation' | 'preference' | 'fact' | 'file' | 'code';
    content: string;
    metadata: Record<string, any>;
    embedding?: number[]; // Will be generated later when we add vector DB
    timestamp: number;
    importance: number; // 0-1, higher = more important
    accessCount: number;
    lastAccessed: number;
}

export interface UserProfile {
    userId: string;
    name?: string;
    preferences: {
        language?: 'ar' | 'en' | 'mixed';
        programmingLanguages?: string[];
        frameworks?: string[];
        codeStyle?: string;
        projectTypes?: string[];
    };
    facts: Map<string, any>; // Known facts about user
    conversationSummaries: string[];
    createdAt: number;
    updatedAt: number;
}

class LongTermMemory {
    private memoryStore: Map<string, MemoryEntry[]> = new Map(); // userId -> memories
    private profiles: Map<string, UserProfile> = new Map(); // userId -> profile
    private memoryDir: string;

    constructor(memoryDir: string = './data/memory') {
        this.memoryDir = memoryDir;
        this.initialize();
    }

    private async initialize() {
        try {
            await fs.mkdir(this.memoryDir, { recursive: true });
            await this.loadFromDisk();
        } catch (error) {
            console.error('[LongTermMemory] Initialization failed:', error);
        }
    }

    /**
     * Store a new memory
     */
    async remember(userId: string, entry: Omit<MemoryEntry, 'id' | 'userId' | 'timestamp' | 'accessCount' | 'lastAccessed'>): Promise<void> {
        const memory: MemoryEntry = {
            ...entry,
            id: `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId,
            timestamp: Date.now(),
            accessCount: 0,
            lastAccessed: Date.now()
        };

        if (!this.memoryStore.has(userId)) {
            this.memoryStore.set(userId, []);
        }

        const userMemories = this.memoryStore.get(userId)!;
        userMemories.push(memory);

        // Keep only last 1000 memories per user
        if (userMemories.length > 1000) {
            userMemories.shift();
        }

        await this.saveToDisk(userId);
    }

    /**
     * Recall memories relevant to a query
     */
    async recall(userId: string, query: string, limit: number = 10): Promise<MemoryEntry[]> {
        const userMemories = this.memoryStore.get(userId) || [];

        if (userMemories.length === 0) return [];

        // Simple keyword matching (will be replaced with vector similarity later)
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

        const scored = userMemories.map(memory => {
            const contentLower = memory.content.toLowerCase();

            // Calculate relevance score
            let score = 0;

            // Keyword matching
            for (const word of queryWords) {
                if (contentLower.includes(word)) {
                    score += 2;
                }
            }

            // Recency bonus (newer = better)
            const ageHours = (Date.now() - memory.timestamp) / (1000 * 60 * 60);
            score += Math.max(0, 1 - (ageHours / 168)); // Decay over 1 week

            // Importance bonus
            score += memory.importance * 3;

            // Access frequency bonus
            score += Math.min(memory.accessCount / 10, 1);

            return { memory, score };
        });

        // Sort by score and return top results
        const ranked = scored
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(s => s.memory);

        // Update access counters
        for (const memory of ranked) {
            memory.accessCount++;
            memory.lastAccessed = Date.now();
        }

        return ranked;
    }

    /**
     * Get or create user profile
     */
    async getProfile(userId: string): Promise<UserProfile> {
        if (!this.profiles.has(userId)) {
            const profile: UserProfile = {
                userId,
                preferences: {} as UserProfile['preferences'],
                facts: new Map(),
                conversationSummaries: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            this.profiles.set(userId, profile);
            await this.saveProfile(userId);
        }

        return this.profiles.get(userId)!;
    }

    /**
     * Update user profile
     */
    async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
        const profile = await this.getProfile(userId);

        Object.assign(profile, updates);
        profile.updatedAt = Date.now();

        await this.saveProfile(userId);
    }

    /**
     * Learn from conversation
     */
    async learnFromConversation(userId: string, messages: any[]): Promise<void> {
        const profile = await this.getProfile(userId);

        // Extract learnings
        for (const msg of messages) {
            if (msg.role !== 'user') continue;

            const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

            // Learn name
            const nameMatch = content.match(/(?:اسمي|انا|أنا|name is|i am|i'm)\s+([أ-يa-z]+)/i);
            if (nameMatch) {
                profile.name = nameMatch[1];
                profile.facts.set('name', nameMatch[1]);
            }

            // Learn programming preferences
            const progLangs = content.match(/\b(javascript|typescript|python|java|golang|rust|c\+\+|react|vue|angular)\b/gi);
            if (progLangs) {
                profile.preferences.programmingLanguages = [
                    ...(profile.preferences.programmingLanguages || []),
                    ...progLangs.map((l: string) => l.toLowerCase())
                ];
                // Remove duplicates
                profile.preferences.programmingLanguages = Array.from(new Set(profile.preferences.programmingLanguages));
            }

            // Learn project types
            if (/\b(website|web app|api|mobile app)\b/i.test(content)) {
                const type = content.match(/\b(website|web app|api|mobile app)\b/i)?.[0].toLowerCase();
                if (type) {
                    profile.preferences.projectTypes = [
                        ...(profile.preferences.projectTypes || []),
                        type
                    ];
                    profile.preferences.projectTypes = Array.from(new Set(profile.preferences.projectTypes));
                }
            }

            // Store important conversations
            if (content.length > 50) {
                await this.remember(userId, {
                    type: 'conversation',
                    content: content.substring(0, 500),
                    metadata: { timestamp: Date.now() },
                    importance: 0.5
                });
            }
        }

        await this.updateProfile(userId, profile);
    }

    /**
     * Get conversation summary for context
     */
    async getContextSummary(userId: string): Promise<string> {
        const profile = await this.getProfile(userId);
        const recentMemories = await this.recall(userId, '', 5);

        const parts: string[] = [];

        if (profile.name) {
            parts.push(`User name: ${profile.name}`);
        }

        if (profile.preferences.programmingLanguages?.length) {
            parts.push(`Prefers: ${profile.preferences.programmingLanguages.join(', ')}`);
        }

        if (recentMemories.length > 0) {
            parts.push(`Recent context: ${recentMemories.map(m => m.content.substring(0, 100)).join('; ')}`);
        }

        return parts.join(' | ');
    }

    /**
     * Save memories to disk
     */
    private async saveToDisk(userId: string): Promise<void> {
        try {
            const userMemories = this.memoryStore.get(userId) || [];
            const filePath = path.join(this.memoryDir, `${userId}.json`);
            await fs.writeFile(filePath, JSON.stringify(userMemories, null, 2));
        } catch (error) {
            console.error('[LongTermMemory] Save failed:', error);
        }
    }

    /**
     * Save profile to disk
     */
    private async saveProfile(userId: string): Promise<void> {
        try {
            const profile = this.profiles.get(userId);
            if (!profile) return;

            // Convert Map to Object for JSON
            const serializable = {
                ...profile,
                facts: Object.fromEntries(profile.facts)
            };

            const filePath = path.join(this.memoryDir, `${userId}_profile.json`);
            await fs.writeFile(filePath, JSON.stringify(serializable, null, 2));
        } catch (error) {
            console.error('[LongTermMemory] Profile save failed:', error);
        }
    }

    /**
     * Load memories from disk
     */
    private async loadFromDisk(): Promise<void> {
        try {
            const files = await fs.readdir(this.memoryDir);

            for (const file of files) {
                if (file.endsWith('_profile.json')) {
                    const userId = file.replace('_profile.json', '');
                    const content = await fs.readFile(path.join(this.memoryDir, file), 'utf-8');
                    const data = JSON.parse(content);

                    this.profiles.set(userId, {
                        ...data,
                        facts: new Map(Object.entries(data.facts || {}))
                    });
                } else if (file.endsWith('.json')) {
                    const userId = file.replace('.json', '');
                    const content = await fs.readFile(path.join(this.memoryDir, file), 'utf-8');
                    const memories = JSON.parse(content);

                    this.memoryStore.set(userId, memories);
                }
            }

            console.info(`[LongTermMemory] Loaded ${this.profiles.size} profiles and ${this.memoryStore.size} memory stores`);
        } catch (error) {
            console.error('[LongTermMemory] Load failed:', error);
        }
    }
}

// Singleton instance
export const longTermMemory = new LongTermMemory();

export default longTermMemory;
