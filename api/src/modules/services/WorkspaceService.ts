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
    return mongoose.connection.readyState === 1;
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
    // [FIX] استخدام مسار داخل مجلد المشروع بدلاً من /root/joe-projects
    public readonly externalRoot: string = (() => {
        const envPath = process.env.EXTERNAL_PROJECTS_DIR;
        if (envPath) return envPath;
        
        // تحديد المسار بناءً على البيئة
        const isApiDir = path.basename(process.cwd()) === 'api';
        const baseDir = isApiDir ? path.join(process.cwd(), '..') : process.cwd();
        const projectsDir = path.join(baseDir, 'data', 'projects');
        
        // إنشاء المجلد إذا لم يكن موجوداً
        try {
            if (!fs.existsSync(projectsDir)) {
                fs.mkdirSync(projectsDir, { recursive: true });
                console.log(`[WorkspaceService] Created projects directory: ${projectsDir}`);
            }
        } catch (e) {
            console.warn(`[WorkspaceService] Could not create projects dir: ${projectsDir}`, e);
            // Fallback إلى مجلد مؤقت
            return path.join(require('os').tmpdir(), 'joe-projects');
        }
        
        return projectsDir;
    })();
    
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

            // [FIX] تأكد من وجود المجلد قبل استخدامه
            const autoPath = path.join(this.externalRoot, wsId);
            try {
                if (!fs.existsSync(autoPath)) {
                    fs.mkdirSync(autoPath, { recursive: true });
                    console.log(`[WorkspaceService] Auto-created workspace dir: ${autoPath}`);
                }
            } catch (e) {
                console.warn(`[WorkspaceService] Could not create workspace dir: ${autoPath}`, e);
                // Fallback إلى المجلد الخارجي نفسه
                return this.externalRoot;
            }
            this.rootsByWorkspaceId.set(wsId, autoPath);
            console.log(`[WorkspaceService] Auto-resolved workspace root: ${wsId} → ${autoPath}`);
            return autoPath;
        }
        return this.currentRoot;
    }

    async setActiveRoot(newPath: string, workspaceId?: string): Promise<boolean> {
        try {
            // [FIX] إنشاء المجلد إذا لم يكن موجوداً
            if (!fs.existsSync(newPath)) {
                fs.mkdirSync(newPath, { recursive: true });
            }
            
            // Validate path exists
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

    /**
     * Create a new workspace and assign the creator as OWNER
     */
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

        // [FIX] Make slug unique by including userId prefix to avoid duplicate key errors
        const baseSlug = slug || slugify(name);
        const userPrefix = String(userId || '').slice(-6);
        const finalSlug = `${baseSlug}-${userPrefix}`;

        // Limits based on FREE plan default
        const defaults = {
            plan: 'free',
            limits: {
                maxAgents: 2,
                maxTokensPerDay: 100000,
                maxConcurrentJobs: 1,
                storageGB: 1
            }
        };

        // [FIX] Use findOneAndUpdate with upsert to handle duplicate slugs gracefully
        const workspace = await Workspace.findOneAndUpdate(
            { ownerId: new Types.ObjectId(userId), slug: finalSlug },
            {
                $setOnInsert: {
                    name,
                    slug: finalSlug,
                    ownerId: new Types.ObjectId(userId),
                    ...defaults
                }
            },
            { upsert: true, new: true }
        );

        // Ensure owner membership exists
        await WorkspaceMember.findOneAndUpdate(
            { workspaceId: workspace._id, userId: new Types.ObjectId(userId) },
            {
                $setOnInsert: {
                    workspaceId: workspace._id,
                    userId: new Types.ObjectId(userId),
                    role: 'OWNER'
                }
            },
            { upsert: true }
        );

        // Set the active root for this workspace to an isolated external path
        const projectPath = path.join(this.externalRoot, String(workspace._id));
        
        // [FIX] إنشاء المجلد إذا لم يكن موجوداً
        try {
            if (!fs.existsSync(projectPath)) {
                fs.mkdirSync(projectPath, { recursive: true });
            }
        } catch (e) {
            console.warn(`[WorkspaceService] Could not create project path: ${projectPath}`, e);
        }
        
        this.rootsByWorkspaceId.set(String(workspace._id), projectPath);

        return workspace;
    }

    /**
     * Get workspace by ID with member check
     */
    async getWorkspace(workspaceId: string, userId: string): Promise<IWorkspace | null> {
        if (!isDbConnected()) {
            const uid = safeObjectIdHex(userId);
            ensureMockPersonalWorkspace(uid);
            const list = mockWorkspacesByUserId.get(uid) || [];
            const found = list.find(w => w._id === String(workspaceId || '').trim());
            return (found || null) as unknown as IWorkspace | null;
        }

        const member = await WorkspaceMember.findOne({
            workspaceId: new Types.ObjectId(workspaceId),
            userId: new Types.ObjectId(userId)
        });

        if (!member) return null; // Access Denied or Not Found

        return await Workspace.findById(workspaceId);
    }

    /**
     * Get all workspaces for a user
     */
    async getUserWorkspaces(userId: string) {
        if (!isDbConnected()) {
            const uid = safeObjectIdHex(userId);
            ensureMockPersonalWorkspace(uid);
            return (mockWorkspacesByUserId.get(uid) || []) as any[];
        }

        const memberships = await WorkspaceMember.find({ userId: new Types.ObjectId(userId) }).populate('workspaceId');
        return memberships.map(m => m.workspaceId);
    }

    /**
     * Add a member to the workspace
     */
    async addMember(adminUserId: string, workspaceId: string, targetEmail: string, role: 'ADMIN' | 'DEVELOPER' | 'VIEWER') {
        if (!isDbConnected()) {
            const uid = safeObjectIdHex(adminUserId);
            ensureMockPersonalWorkspace(uid);
            const wsId = String(workspaceId || '').trim();
            const members = mockMembersByWorkspaceId.get(wsId) || [];
            const admin = members.find(m => m.userId._id === uid && (m.role === 'OWNER' || m.role === 'ADMIN'));
            if (!admin) throw new Error('Unauthorized: Only Admins can add members');

            const email = String(targetEmail || '').trim().toLowerCase();
            const userHex = safeObjectIdHex(`user:${email}`);
            if (members.some(m => m.userId.email.toLowerCase() === email)) throw new Error('User is already a member');

            members.push({
                _id: safeObjectIdHex(`mem:${wsId}:${email}:${Date.now()}`),
                workspaceId: wsId,
                userId: { _id: userHex, name: email.split('@')[0] || 'User', email },
                role
            });
            mockMembersByWorkspaceId.set(wsId, members);
            return;
        }

        // 1. Verify Admin permissions
        const admin = await WorkspaceMember.findOne({
            workspaceId: new Types.ObjectId(workspaceId),
            userId: new Types.ObjectId(adminUserId),
            role: { $in: ['OWNER', 'ADMIN'] }
        });
        if (!admin) throw new Error('Unauthorized: Only Admins can add members');

        // 2. Find target user
        const targetUser = await User.findOne({ email: targetEmail.toLowerCase() });
        if (!targetUser) throw new Error('User not found');

        // 3. Add membership
        try {
            await WorkspaceMember.create({
                workspaceId: new Types.ObjectId(workspaceId),
                userId: targetUser._id,
                role
            });
        } catch (e: any) {
            if (e.code === 11000) throw new Error('User is already a member');
            throw e;
        }
    }

    /**
     * Update workspace details (Name, Provider Config)
     */
    async updateWorkspace(adminUserId: string, workspaceId: string, updates: { name?: string, providerConfig?: any, activeRepo?: string, kind?: 'local' | 'github', projectInitialized?: boolean }) {
        if (!isDbConnected()) {
            const uid = safeObjectIdHex(adminUserId);
            ensureMockPersonalWorkspace(uid);
            const wsId = String(workspaceId || '').trim();
            const list = mockWorkspacesByUserId.get(uid) || [];
            const ws = list.find(w => w._id === wsId);
            if (!ws) throw new Error('Workspace not found');

            const members = mockMembersByWorkspaceId.get(wsId) || [];
            const admin = members.find(m => m.userId._id === uid && (m.role === 'OWNER' || m.role === 'ADMIN'));
            if (!admin) throw new Error('Unauthorized: Only Admins can update workspace');

            if (updates.name) ws.name = updates.name;
            if (updates.activeRepo) {
                ws.integrations = ws.integrations || {};
                ws.integrations.github = {
                    ...(ws.integrations.github || { installationId: '', repositories: [] }),
                    activeRepo: updates.activeRepo
                };
            }
            if (updates.kind) ws.kind = updates.kind;
            if (updates.projectInitialized !== undefined) ws.projectInitialized = updates.projectInitialized;
            ws.updatedAt = new Date();
            return ws as unknown as IWorkspace;
        }

        // 1. Verify Admin permissions
        const admin = await WorkspaceMember.findOne({
            workspaceId: new Types.ObjectId(workspaceId),
            userId: new Types.ObjectId(adminUserId),
            role: { $in: ['OWNER', 'ADMIN'] }
        });
        if (!admin) throw new Error('Unauthorized: Only Admins can update workspace');

        // 2. Update
        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) throw new Error('Workspace not found');

        if (updates.name) workspace.name = updates.name;
        if (updates.activeRepo) {
            if (!workspace.integrations) workspace.integrations = { github: { repositories: [] } } as any;
            if (!workspace.integrations.github) workspace.integrations.github = { installationId: '', repositories: [] };
            if (workspace.integrations.github) {
                workspace.integrations.github.activeRepo = updates.activeRepo;
                
                // [NEW] Sync the GitHub repo to the local workspace directory
                try {
                    const projectPath = path.join(this.externalRoot, String(workspace._id));
                    
                    // [FIX] تأكد من وجود المجلد
                    if (!fs.existsSync(projectPath)) {
                        fs.mkdirSync(projectPath, { recursive: true });
                    }
                    
                    // Retrieve user token
                    const token = await getUserSecret(adminUserId, 'github', 'GITHUB_TOKEN');
                    if (token) {
                        const cleanToken = token.replace(/[\s\n\r]/g, '');
                        const repoUrl = `https://${cleanToken}@github.com/${updates.activeRepo}.git`;
                        
                        console.log(`[WorkspaceService] Cloning ${updates.activeRepo} to ${projectPath}...`);
                        
                        // Clear existing directory if it exists to ensure a fresh clone
                        if (fs.existsSync(projectPath)) {
                            fs.rmSync(projectPath, { recursive: true, force: true });
                        }
                        
                        // Execute clone
                        execSync(`git clone ${repoUrl} ${projectPath}`, { stdio: 'ignore' });
                        console.log(`[WorkspaceService] Successfully cloned ${updates.activeRepo}`);
                        
                        // Update kind to github automatically
                        workspace.kind = 'github';
                    } else {
                        console.warn(`[WorkspaceService] Could not find GITHUB_TOKEN for user ${adminUserId}. Skip cloning.`);
                    }
                } catch (err: any) {
                    console.error(`[WorkspaceService] Failed to clone ${updates.activeRepo}:`, err.message);
                }
            }
        }
        if (updates.providerConfig) {
            // Merge or overwrite provider config into integrations.llmProviders
            if (!workspace.integrations) workspace.integrations = { llmProviders: {} } as any;
            if (!workspace.integrations.llmProviders) workspace.integrations.llmProviders = {};

            workspace.integrations.llmProviders = {
                ...workspace.integrations.llmProviders,
                ...updates.providerConfig
            };
        }
        if (updates.kind) workspace.kind = updates.kind;
        if (updates.projectInitialized !== undefined) workspace.projectInitialized = updates.projectInitialized;

        await workspace.save();
        return workspace;
    }

    /**
     * Remove a member from the workspace
     */
    async removeMember(adminUserId: string, workspaceId: string, targetMemberId: string) {
        if (!isDbConnected()) {
            const uid = safeObjectIdHex(adminUserId);
            ensureMockPersonalWorkspace(uid);
            const wsId = String(workspaceId || '').trim();
            const members = mockMembersByWorkspaceId.get(wsId) || [];
            const admin = members.find(m => m.userId._id === uid && (m.role === 'OWNER' || m.role === 'ADMIN'));
            if (!admin) throw new Error('Unauthorized: Only Admins can remove members');

            const idx = members.findIndex(m => m._id === String(targetMemberId || '').trim());
            if (idx === -1) return;
            if (members[idx].role === 'OWNER') throw new Error('Cannot remove the Workspace Owner');
            members.splice(idx, 1);
            mockMembersByWorkspaceId.set(wsId, members);
            return;
        }

        // 1. Verify Admin permissions
        const admin = await WorkspaceMember.findOne({
            workspaceId: new Types.ObjectId(workspaceId),
            userId: new Types.ObjectId(adminUserId),
            role: { $in: ['OWNER', 'ADMIN'] }
        });
        if (!admin) throw new Error('Unauthorized: Only Admins can remove members');

        // Prevent removing self if Owner (optional safety, but let's just do basic check)
        // Ideally, Owner cannot be removed by anyone.
        const target = await WorkspaceMember.findById(targetMemberId);
        if (!target) return; // Already gone

        if (target.role === 'OWNER') {
            throw new Error('Cannot remove the Workspace Owner');
        }

        await WorkspaceMember.findByIdAndDelete(targetMemberId);
    }

    /**
     * Get all members of a workspace
     */
    async getWorkspaceMembers(userId: string, workspaceId: string) {
        if (!isDbConnected()) {
            const uid = safeObjectIdHex(userId);
            ensureMockPersonalWorkspace(uid);
            const wsId = String(workspaceId || '').trim();
            const members = mockMembersByWorkspaceId.get(wsId) || [];
            const isMember = members.some(m => m.userId._id === uid);
            if (!isMember) throw new Error('Unauthorized');
            return members as any[];
        }

        // Verify membership first
        const member = await WorkspaceMember.findOne({
            workspaceId: new Types.ObjectId(workspaceId),
            userId: new Types.ObjectId(userId)
        });
        if (!member) throw new Error('Unauthorized');

        return await WorkspaceMember.find({ workspaceId: new Types.ObjectId(workspaceId) })
            .populate('userId', 'name email picture');
    }

    /**
     * Migrate legacy user to have a default workspace
     */
    async ensurePersonalWorkspace(userId: string) {
        if (!isDbConnected()) {
            return ensureMockPersonalWorkspace(userId) as unknown as IWorkspace;
        }

        const existing = await this.getUserWorkspaces(userId);
        if (existing.length > 0) return existing[0];

        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');

        const name = user.name ? `${user.name}'s Workspace` : 'Personal Workspace';
        return await this.createWorkspace(userId, name);
    }
}

export const workspaceService = new WorkspaceService();
