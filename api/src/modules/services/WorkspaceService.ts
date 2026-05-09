import { Workspace, IWorkspace } from '../../shared/models/workspace';
import { WorkspaceMember, IWorkspaceMember } from '../../shared/models/workspaceMember';
import { User } from '../../shared/models/user';
import mongoose, { Types } from 'mongoose';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { getUserSecret } from './secrets';

const workspaceAsyncContext = new AsyncLocalStorage<{ workspaceId?: string }>();

type MockWorkspace = {
    _id: string;
    slug: string;
    name: string;
    ownerId: string;
    status: 'active' | 'suspended' | 'archived';
    plan: 'free' | 'pro' | 'enterprise';
    limits: {
        maxAgents: number;
        maxTokensPerDay: number;
        maxConcurrentJobs: number;
        storageGB: number;
    };
    integrations: {
        github?: { installationId: string; repositories: string[]; activeRepo?: string };
        llmProviders?: Record<string, any>;
    };
    settings: { allowPublicView: boolean; requireApproval: boolean };
    kind: 'local' | 'github';
    projectInitialized: boolean;
    createdAt: Date;
    updatedAt: Date;
};

type MockMember = {
    _id: string;
    workspaceId: string;
    userId: { _id: string; name: string; email: string; picture?: string };
    role: 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';
};

const mockWorkspacesByUserId = new Map<string, MockWorkspace[]>();
const mockMembersByWorkspaceId = new Map<string, MockMember[]>();

function isDbConnected() {
    const isPersistenceDisabled = process.env.PERSISTENCE_MODE === 'JSON';
    return mongoose.connection.readyState === 1 && !isPersistenceDisabled;
}

function isValidObjectIdHex(id: string) {
    return /^[0-9a-fA-F]{24}$/.test(String(id || '').trim());
}

function safeObjectIdHex(seed: string) {
    const s = String(seed || '').trim();
    if (isValidObjectIdHex(s)) return s.toLowerCase();
    return crypto.createHash('sha1').update(s).digest('hex').slice(0, 24);
}

function slugify(name: string) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
}

function ensureMockPersonalWorkspace(userId: string) {
    const uid = safeObjectIdHex(userId);
    const existing = mockWorkspacesByUserId.get(uid);
    if (existing && existing.length > 0) return existing[0];

    const now = new Date();
    const ws: MockWorkspace = {
        _id: safeObjectIdHex(`ws:${uid}`),
        name: 'Personal Workspace',
        slug: 'personal',
        ownerId: uid,
        status: 'active',
        plan: 'free',
        limits: { maxAgents: 2, maxTokensPerDay: 100000, maxConcurrentJobs: 1, storageGB: 1 },
        integrations: { llmProviders: {} },
        settings: { allowPublicView: false, requireApproval: true },
        kind: 'local',
        projectInitialized: false,
        createdAt: now,
        updatedAt: now
    };

    mockWorkspacesByUserId.set(uid, [ws]);
    mockMembersByWorkspaceId.set(ws._id, [
        {
            _id: safeObjectIdHex(`mem:${ws._id}:${uid}`),
            workspaceId: ws._id,
            userId: { _id: uid, name: 'Developer', email: 'dev@joe.local' },
            role: 'OWNER'
        }
    ]);

    return ws;
}

export class WorkspaceService {
    private currentRoot: string = process.cwd();
    public get externalRoot(): string {
        const envPath = process.env.EXTERNAL_PROJECTS_DIR;
        if (envPath) return envPath;
        const isApiDir = path.basename(process.cwd()) === 'api';
        const baseDir = isApiDir ? path.join(process.cwd(), '..') : process.cwd();
        const projectsDir = path.join(baseDir, 'data', 'projects');
        try {
            if (!fs.existsSync(projectsDir)) {
                fs.mkdirSync(projectsDir, { recursive: true });
                console.log(`[WorkspaceService] Created projects directory: ${projectsDir}`);
            }
        } catch (e) {
            console.warn(`[WorkspaceService] Could not create projects dir: ${projectsDir}`, e);
            return path.join(require('os').tmpdir(), 'joe-projects');
        }
        return projectsDir;
    }
    
    private rootsByWorkspaceId = new Map<string, string>();

    private resolveWorkspaceId(workspaceId?: string) {
        const explicit = typeof workspaceId === 'string' ? workspaceId.trim() : '';
        if (explicit) return explicit;
        return String(workspaceAsyncContext.getStore()?.workspaceId || '').trim();
    }

    getActiveRoot(workspaceId?: string): string {
        const wsId = this.resolveWorkspaceId(workspaceId);
        if (wsId) {
            const root = this.rootsByWorkspaceId.get(wsId);
            if (root) return root;
            const autoPath = path.join(this.externalRoot, wsId);
            try {
                if (!fs.existsSync(autoPath)) {
                    fs.mkdirSync(autoPath, { recursive: true });
                }
            } catch (e) {
                console.warn(`[WorkspaceService] Could not create workspace dir: ${autoPath}`, e);
                return this.externalRoot;
            }
            this.rootsByWorkspaceId.set(wsId, autoPath);
            return autoPath;
        }
        const fallback = path.join(this.externalRoot, 'system-fallback');
        if (!fs.existsSync(fallback)) {
            try { fs.mkdirSync(fallback, { recursive: true }); } catch { }
        }
        return fallback;
    }

    async setActiveRoot(newPath: string, workspaceId?: string): Promise<boolean> {
        try {
            if (!fs.existsSync(newPath)) {
                fs.mkdirSync(newPath, { recursive: true });
            }
            await import('fs').then(fs => fs.promises.access(newPath));
            const wsId = this.resolveWorkspaceId(workspaceId);
            if (wsId) this.rootsByWorkspaceId.set(wsId, newPath);
            else this.currentRoot = newPath;
            return true;
        } catch {
            return false;
        }
    }

    resetToSystem(workspaceId?: string) {
        const wsId = this.resolveWorkspaceId(workspaceId);
        if (wsId) this.rootsByWorkspaceId.delete(wsId);
        else this.currentRoot = process.cwd();
    }

    async runWithWorkspace<T>(workspaceId: string | undefined, fn: () => Promise<T> | T): Promise<T> {
        const wsId = typeof workspaceId === 'string' && workspaceId.trim() ? workspaceId.trim() : undefined;
        return await workspaceAsyncContext.run({ workspaceId: wsId }, async () => await fn());
    }

    async createWorkspace(userId: string, name: string, slug?: string): Promise<IWorkspace> {
        if (!isDbConnected()) {
            const uid = safeObjectIdHex(userId);
            ensureMockPersonalWorkspace(uid);
            const now = new Date();
            const ws: MockWorkspace = {
                _id: safeObjectIdHex(`ws:${uid}:${Date.now()}`),
                name,
                slug: slug ? slugify(slug) : slugify(name),
                ownerId: uid,
                status: 'active',
                plan: 'free',
                limits: { maxAgents: 2, maxTokensPerDay: 100000, maxConcurrentJobs: 1, storageGB: 1 },
                integrations: { llmProviders: {} },
                settings: { allowPublicView: false, requireApproval: true },
                kind: 'local',
                projectInitialized: false,
                createdAt: now,
                updatedAt: now
            };
            const list = mockWorkspacesByUserId.get(uid) || [];
            list.push(ws);
            mockWorkspacesByUserId.set(uid, list);
            const members = mockMembersByWorkspaceId.get(ws._id) || [];
            members.push({
                _id: safeObjectIdHex(`mem:${ws._id}:${uid}`),
                workspaceId: ws._id,
                userId: { _id: uid, name: 'Developer', email: 'dev@joe.local' },
                role: 'OWNER'
            });
            mockMembersByWorkspaceId.set(ws._id, members);
            return ws as unknown as IWorkspace;
        }

        const baseSlug = slug || slugify(name);
        const userPrefix = String(userId || '').slice(-6);
        const finalSlug = `${baseSlug}-${userPrefix}`;
        const defaults = {
            plan: 'free',
            limits: { maxAgents: 2, maxTokensPerDay: 100000, maxConcurrentJobs: 1, storageGB: 1 }
        };

        const workspace = await Workspace.findOneAndUpdate(
            { ownerId: userId, slug: finalSlug } as any,
            {
                $setOnInsert: {
                    name,
                    slug: finalSlug,
                    ownerId: userId,
                    ...defaults
                }
            },
            { upsert: true, new: true }
        );

        await WorkspaceMember.findOneAndUpdate(
            { workspaceId: String(workspace?._id), userId } as any,
            {
                $setOnInsert: {
                    workspaceId: String(workspace?._id),
                    userId,
                    role: 'OWNER'
                }
            },
            { upsert: true }
        );

        const projectPath = path.join(this.externalRoot, String(workspace?._id));
        try {
            if (!fs.existsSync(projectPath)) {
                fs.mkdirSync(projectPath, { recursive: true });
            }
        } catch { }
        this.rootsByWorkspaceId.set(String(workspace?._id), projectPath);

        return workspace as IWorkspace;
    }

    async getWorkspace(workspaceId: string, userId: string): Promise<IWorkspace | null> {
        if (!isDbConnected()) {
            const uid = safeObjectIdHex(userId);
            ensureMockPersonalWorkspace(uid);
            const list = mockWorkspacesByUserId.get(uid) || [];
            const found = list.find(w => w._id === String(workspaceId || '').trim());
            return (found || null) as unknown as IWorkspace | null;
        }

        const member = await WorkspaceMember.findOne({
            workspaceId,
            userId
        } as any);

        if (!member) return null;

        return await Workspace.findById(workspaceId);
    }

    async getUserWorkspaces(userId: string) {
        if (!isDbConnected()) {
            const uid = safeObjectIdHex(userId);
            ensureMockPersonalWorkspace(uid);
            return (mockWorkspacesByUserId.get(uid) || []) as any[];
        }

        const memberships = await WorkspaceMember.find({ userId } as any).populate('workspaceId');
        return memberships.map(m => m.workspaceId);
    }

    async addMember(adminUserId: string, workspaceId: string, targetEmail: string, role: 'ADMIN' | 'DEVELOPER' | 'VIEWER') {
        if (!isDbConnected()) {
            const uid = safeObjectIdHex(adminUserId);
            ensureMockPersonalWorkspace(uid);
            const wsId = String(workspaceId || '').trim();
            const members = mockMembersByWorkspaceId.get(wsId) || [];
            const admin = members.find(m => m.userId._id === uid && (m.role === 'OWNER' || m.role === 'ADMIN'));
            if (!admin) throw new Error('Unauthorized');

            const email = String(targetEmail || '').trim().toLowerCase();
            const userHex = safeObjectIdHex(`user:${email}`);
            if (members.some(m => m.userId.email.toLowerCase() === email)) throw new Error('Already a member');

            members.push({
                _id: safeObjectIdHex(`mem:${wsId}:${email}:${Date.now()}`),
                workspaceId: wsId,
                userId: { _id: userHex, name: email.split('@')[0] || 'User', email },
                role
            });
            mockMembersByWorkspaceId.set(wsId, members);
            return;
        }

        const admin = await WorkspaceMember.findOne({
            workspaceId,
            userId: adminUserId,
            role: { $in: ['OWNER', 'ADMIN'] }
        } as any);
        if (!admin) throw new Error('Unauthorized');

        const targetUser = await User.findOne({ email: targetEmail.toLowerCase() });
        if (!targetUser) throw new Error('User not found');

        try {
            await WorkspaceMember.create({
                workspaceId,
                userId: targetUser._id,
                role
            } as any);
        } catch (e: any) {
            if (e.code === 11000) throw new Error('Already a member');
            throw e;
        }
    }

    async updateWorkspace(adminUserId: string, workspaceId: string, updates: { name?: string, activeRepo?: string, kind?: 'local' | 'github', projectInitialized?: boolean }) {
        if (!isDbConnected()) {
            const uid = safeObjectIdHex(adminUserId);
            ensureMockPersonalWorkspace(uid);
            const wsId = String(workspaceId || '').trim();
            const list = mockWorkspacesByUserId.get(uid) || [];
            const ws = list.find(w => w._id === wsId);
            if (!ws) throw new Error('Not found');

            const members = mockMembersByWorkspaceId.get(wsId) || [];
            const admin = members.find(m => m.userId._id === uid && (m.role === 'OWNER' || m.role === 'ADMIN'));
            if (!admin) throw new Error('Unauthorized');

            if (updates.name) ws.name = updates.name;
            if (updates.kind) ws.kind = updates.kind;
            if (updates.projectInitialized !== undefined) ws.projectInitialized = updates.projectInitialized;
            ws.updatedAt = new Date();
            return ws as unknown as IWorkspace;
        }

        const admin = await WorkspaceMember.findOne({
            workspaceId,
            userId: adminUserId,
            role: { $in: ['OWNER', 'ADMIN'] }
        } as any);
        if (!admin) throw new Error('Unauthorized');

        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) throw new Error('Not found');

        if (updates.name) workspace.name = updates.name;
        if (updates.activeRepo) {
            if (!workspace.integrations) workspace.integrations = { github: { repositories: [] } } as any;
            if (!workspace.integrations.github) workspace.integrations.github = { installationId: '', repositories: [] };
            workspace.integrations.github.activeRepo = updates.activeRepo;
            workspace.kind = 'github';
        }
        if (updates.kind) workspace.kind = updates.kind;
        if (updates.projectInitialized !== undefined) workspace.projectInitialized = updates.projectInitialized;

        await workspace.save();
        return workspace;
    }

    async removeMember(adminUserId: string, workspaceId: string, targetMemberId: string) {
        if (!isDbConnected()) {
            const uid = safeObjectIdHex(adminUserId);
            ensureMockPersonalWorkspace(uid);
            const wsId = String(workspaceId || '').trim();
            const members = mockMembersByWorkspaceId.get(wsId) || [];
            const admin = members.find(m => m.userId._id === uid && (m.role === 'OWNER' || m.role === 'ADMIN'));
            if (!admin) throw new Error('Unauthorized');

            const idx = members.findIndex(m => m._id === String(targetMemberId || '').trim());
            if (idx === -1) return;
            if (members[idx].role === 'OWNER') throw new Error('Cannot remove Owner');
            members.splice(idx, 1);
            mockMembersByWorkspaceId.set(wsId, members);
            return;
        }

        const admin = await WorkspaceMember.findOne({
            workspaceId,
            userId: adminUserId,
            role: { $in: ['OWNER', 'ADMIN'] }
        } as any);
        if (!admin) throw new Error('Unauthorized');

        const target = await WorkspaceMember.findById(targetMemberId);
        if (!target) return;
        if (target.role === 'OWNER') throw new Error('Cannot remove Owner');

        await WorkspaceMember.findByIdAndDelete(targetMemberId);
    }

    async getWorkspaceMembers(userId: string, workspaceId: string) {
        if (!isDbConnected()) {
            const uid = safeObjectIdHex(userId);
            ensureMockPersonalWorkspace(uid);
            const wsId = String(workspaceId || '').trim();
            const members = mockMembersByWorkspaceId.get(wsId) || [];
            if (!members.some(m => m.userId._id === uid)) throw new Error('Unauthorized');
            return members as any[];
        }

        const member = await WorkspaceMember.findOne({
            workspaceId,
            userId
        } as any);
        if (!member) throw new Error('Unauthorized');

        return await WorkspaceMember.find({ workspaceId } as any).populate('userId', 'name email picture');
    }

    async ensurePersonalWorkspace(userId: string) {
        if (!isDbConnected()) {
            return ensureMockPersonalWorkspace(userId) as unknown as IWorkspace;
        }

        const existing = await this.getUserWorkspaces(userId);
        if (existing.length > 0) return existing[0];

        const user = await User.findById(userId);
        if (!user) throw new Error('Not found');

        const name = user.name ? `${user.name}'s Workspace` : 'Personal Workspace';
        return await this.createWorkspace(userId, name);
    }
}

export const workspaceService = new WorkspaceService();
