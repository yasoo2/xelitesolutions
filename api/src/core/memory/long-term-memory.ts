/**
 * Long-Term Memory System
 * Vector-based memory storage for conversation history and user preferences
 */

import fs from 'fs/promises';
import path from 'path';
import { extractProfileLearnings, isCorruptedName, normalizeForMatch } from './learn';

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

export interface MemoryScope {
    /**
     * Stable identifier of the active project workspace. Conversation/code/file
     * memories are private to this scope; user preferences remain global.
     */
    workspaceId?: string;
}

export interface MemoryContextDetails {
    /** The context text injected into the agent, including global preferences. */
    text: string;
    /** True only when conversation/file/code memory belongs to the active workspace. */
    hasWorkspaceContext: boolean;
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

function normalizedWorkspaceId(value?: string): string {
    return String(value || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/\/+$/, '');
}

export class LongTermMemory {
    private memoryStore: Map<string, MemoryEntry[]> = new Map(); // userId -> memories
    private profiles: Map<string, UserProfile> = new Map(); // userId -> profile
    private memoryDir: string;
    private initPromise: Promise<void> | null = null;

    constructor(memoryDir: string = './data/memory') {
        this.memoryDir = memoryDir;
    }

    private async initialize() {
        try {
            await fs.mkdir(this.memoryDir, { recursive: true });
            await this.loadFromDisk();
        } catch (error) {
            console.error('[LongTermMemory] Initialization failed:', error);
        }
    }

    private async ensureInitialized(): Promise<void> {
        if (!this.initPromise) {
            this.initPromise = this.initialize();
        }
        await this.initPromise;
    }

    /**
     * Store a new memory
     */
    async remember(userId: string, entry: Omit<MemoryEntry, 'id' | 'userId' | 'timestamp' | 'accessCount' | 'lastAccessed'>): Promise<void> {
        await this.ensureInitialized();
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
    async recall(userId: string, query: string, limit: number = 10, scope: MemoryScope = {}): Promise<MemoryEntry[]> {
        await this.ensureInitialized();
        const activeWorkspaceId = normalizedWorkspaceId(scope.workspaceId);
        const allMemories = this.memoryStore.get(userId) || [];
        // A workspace is an isolation boundary. Project conversation, file, and
        // code memories from another workspace must never influence a fresh run.
        // Preferences and explicit facts describe the user rather than a project,
        // so they deliberately remain available across workspaces.
        const userMemories = activeWorkspaceId
            ? allMemories.filter(memory => {
                if (memory.type === 'preference' || memory.type === 'fact') return true;
                return normalizedWorkspaceId(memory.metadata?.workspaceId) === activeWorkspaceId;
            })
            : allMemories;

        if (userMemories.length === 0) return [];

        // Simple keyword matching (will be replaced with vector similarity later)
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

        const normQueryWords = queryWords.map(normalizeForMatch).filter(Boolean);
        const scored = userMemories.map(memory => {
            // Normalize BOTH sides so «البرمجة» in memory matches «برمجة» in the
            // query — Arabic proclitics and hamza forms no longer hide a match.
            const contentNorm = normalizeForMatch(memory.content);

            // Calculate relevance score
            let score = 0;

            // Keyword matching
            for (const word of normQueryWords) {
                if (contentNorm.includes(word)) {
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
        await this.ensureInitialized();
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
        await this.ensureInitialized();
        const profile = await this.getProfile(userId);

        Object.assign(profile, updates);
        profile.updatedAt = Date.now();

        await this.saveProfile(userId);
    }

    /**
     * Learn from conversation
     */
    async learnFromConversation(userId: string, messages: any[], scope: MemoryScope = {}): Promise<void> {
        await this.ensureInitialized();
        const profile = await this.getProfile(userId);
        const workspaceId = normalizedWorkspaceId(scope.workspaceId);

        // Extract learnings
        for (const msg of messages) {
            if (msg.role !== 'user') continue;

            const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

            // [SAFE LEARNING] Only an explicit self-introduction sets the name;
            // «أنا أريد بناء موقع» no longer teaches Joe the name is «أريد».
            const learned = extractProfileLearnings(content);
            if (learned.name) {
                profile.name = learned.name;
                profile.facts.set('name', learned.name);
            }
            if (learned.programmingLanguages.length) {
                profile.preferences.programmingLanguages = Array.from(new Set([
                    ...(profile.preferences.programmingLanguages || []),
                    ...learned.programmingLanguages,
                ])).slice(-12); // keep the most recent dozen, not an unbounded pile
            }
            if (learned.projectTypes.length) {
                profile.preferences.projectTypes = Array.from(new Set([
                    ...(profile.preferences.projectTypes || []),
                    ...learned.projectTypes,
                ])).slice(-12);
            }

            // Store important conversations
            if (content.length > 50) {
                await this.remember(userId, {
                    type: 'conversation',
                    content: content.substring(0, 500),
                    metadata: { timestamp: Date.now(), ...(workspaceId ? { workspaceId } : {}) },
                    importance: 0.5
                });
            }
        }

        await this.updateProfile(userId, profile);
    }

    /**
     * Get memory context together with its provenance. Global profile preferences
     * may be useful to the agent, but they are not evidence of a prior project in
     * the active workspace and must not be presented to the user as project recall.
     */
    async getContextDetails(userId: string, query: string = '', scope: MemoryScope = {}): Promise<MemoryContextDetails> {
        await this.ensureInitialized();
        const profile = await this.getProfile(userId);
        // Recall is driven by the CURRENT request, so the past that surfaces is
        // the past that is relevant — not merely the most recent.
        const recentMemories = await this.recall(userId, query, 5, scope);
        const activeWorkspaceId = normalizedWorkspaceId(scope.workspaceId);
        const hasWorkspaceContext = Boolean(activeWorkspaceId && recentMemories.some(memory => {
            if (memory.type === 'preference' || memory.type === 'fact') return false;
            return normalizedWorkspaceId(memory.metadata?.workspaceId) === activeWorkspaceId;
        }));

        const parts: string[] = [];

        // [SELF-HEAL] A profile poisoned by the old extractor («name: أريد») is
        // dropped on read, so a returning user is never greeted by a verb.
        if (profile.name && isCorruptedName(profile.name)) {
            profile.name = undefined;
            profile.facts.delete('name');
            this.saveProfile(userId).catch(() => { /* best effort */ });
        }
        if (profile.name) {
            parts.push(`User name: ${profile.name}`);
        }

        if (profile.preferences.programmingLanguages?.length) {
            parts.push(`Prefers: ${profile.preferences.programmingLanguages.join(', ')}`);
        }

        if (recentMemories.length > 0) {
            parts.push(`Recent context: ${recentMemories.map(m => m.content.substring(0, 100)).join('; ')}`);
        }

        return { text: parts.join(' | '), hasWorkspaceContext };
    }

    /**
     * Backwards-compatible text-only API for callers that do not need provenance.
     */
    async getContextSummary(userId: string, query: string = '', scope: MemoryScope = {}): Promise<string> {
        const details = await this.getContextDetails(userId, query, scope);
        return details.text;
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
                    if (!content || content.trim() === '') continue;
                    try {
                        const data = JSON.parse(content);
                        this.profiles.set(userId, {
                            ...data,
                            facts: new Map(Object.entries(data.facts || {}))
                        });
                    } catch (e) {
                        console.warn(`[LongTermMemory] Failed to parse profile: ${file}`, e);
                    }
                } else if (file.endsWith('.json')) {
                    const userId = file.replace('.json', '');
                    const content = await fs.readFile(path.join(this.memoryDir, file), 'utf-8');
                    if (!content || content.trim() === '') continue;
                    try {
                        const memories = JSON.parse(content);
                        this.memoryStore.set(userId, memories);
                    } catch (e) {
                        console.warn(`[LongTermMemory] Failed to parse memory file: ${file}`, e);
                    }
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
