import { Workspace, IWorkspace } from '../../shared/models/workspace';
import { WorkspaceMember, IWorkspaceMember } from '../../shared/models/workspaceMember';
import { User } from '../../shared/models/user';
import mongoose, { Types } from 'mongoose';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'path';
import fs from 'fs';
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

    // The local (no-workspace) project root — where builds land in single-user
    // local mode. Two real bugs lived here: getActiveRoot() ignored currentRoot
    // and always returned an internal "system-fallback" folder, so choosing a
    // folder had NO effect; and the choice was in-memory only, so every restart
    // reverted it. Now it is a clearly-named default that PERSISTS to disk.
    private _localRoot: string | null = null;
    private get localRootFile(): string {
        return path.join(this.externalRoot, '.joe-local-root.json');
    }
    private get localRoot(): string {
        if (this._localRoot) return this._localRoot;
        /**
         * AN OPERATOR CAN PIN WHERE BUILDS LAND.
         *
         * An outside test ran Joe inside a sandbox, told it in the prompt not
         * to write outside a designated folder, and Joe wrote into its own
         * `my-workspace` — inside its configured root, so no boundary was
         * crossed, but not where the operator had decided either. It had no
         * supported way to be TOLD: the root is a saved choice or a default,
         * and prose in a prompt is not a setting.
         *
         * This is that setting. `JOE_WORKSPACE_ROOT` wins over the saved
         * choice and the default, so a sandbox, a CI job or a test harness can
         * confine every build to one directory and then assert that nothing
         * appeared anywhere else.
         */
        const pinned = String(process.env.JOE_WORKSPACE_ROOT || '').trim();
        if (pinned) {
            try {
                fs.mkdirSync(pinned, { recursive: true });
                this._localRoot = pinned;
                return pinned;
            } catch (e: any) {
                console.warn(`[WorkspaceService] JOE_WORKSPACE_ROOT is set to ${pinned} but could not be used (${e?.message}) — falling back.`);
            }
        }
        // Load a previously chosen location — but only if it still EXISTS.
        // A saved path can outlive its folder (a temp dir, an unplugged drive,
        // a folder the user deleted), and returning it anyway pointed every
        // build and the whole File Explorer at a directory that was not there.
        // Proven while auditing: a run that pointed the root at a temp folder
        // and then removed it left the choice persisted and the workspace dead
        // until the file was deleted by hand. A vanished choice now falls back
        // to the default instead of poisoning the next start.
        try {
            const saved = JSON.parse(fs.readFileSync(this.localRootFile, 'utf-8'))?.path;
            if (saved && typeof saved === 'string' && fs.existsSync(saved)) { this._localRoot = saved; return saved; }
            if (saved) console.warn(`[WorkspaceService] saved workspace root is gone (${saved}) — falling back to the default.`);
        } catch { /* no saved choice yet */ }
        // A name the user understands — "my-workspace", not "system-fallback".
        this._localRoot = path.join(this.externalRoot, 'my-workspace');
        return this._localRoot;
    }
    private set localRoot(p: string) {
        this._localRoot = p;
        try {
            fs.mkdirSync(path.dirname(this.localRootFile), { recursive: true });
            fs.writeFileSync(this.localRootFile, JSON.stringify({ path: p }, null, 2));
        } catch (e) {
            console.warn('[WorkspaceService] Could not persist local root choice:', e);
        }
    }

    private resolveWorkspaceId(workspaceId?: string) {
        const explicit = typeof workspaceId === 'string' ? workspaceId.trim() : '';
        if (explicit) return explicit;
        return String(workspaceAsyncContext.getStore()?.workspaceId || '').trim();
    }

    private get isLocalSingleUserMode(): boolean {
        return process.env.PERSISTENCE_MODE === 'JSON'
            || process.env.MOCK_DB === 'true'
            || String(process.env.MOCK_DB) === '1';
    }

    getActiveRoot(workspaceId?: string): string {
        const wsId = this.resolveWorkspaceId(workspaceId);

        // JSON/mock mode exposes ONE on-disk workspace. The File Explorer changes
        // this persisted location without a logical chat workspace id, while an
        // executing run *does* have one. Previously a run that had looked up its
        // id before the folder change retained the old value in
        // `rootsByWorkspaceId`, so the explorer showed one folder and
        // `shell_execute` ran in a stale sibling. Resolve the shared visible root
        // before consulting that cache, and refresh the cache only as bookkeeping.
        if (this.isLocalSingleUserMode) {
            const local = this.localRoot;
            if (!fs.existsSync(local)) {
                try { fs.mkdirSync(local, { recursive: true }); } catch { }
            }
            if (wsId) this.rootsByWorkspaceId.set(wsId, local);
            return local;
        }

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
        // No workspace id (local single-user mode): use the persisted local
        // root, creating it if needed. This is the folder the File Explorer
        // shows and where local builds land — the same path everywhere.
        const local = this.localRoot;
        if (!fs.existsSync(local)) {
            try { fs.mkdirSync(local, { recursive: true }); } catch { }
        }
        return local;
    }

    /**
     * The root the File Explorer ACTUALLY displays.
     *
     * The explorer fetches /project/tree with no workspaceId, from an HTTP
     * request that carries no async workspace context — so it always resolves
     * to the persisted local root. A tool, meanwhile, runs inside
     * runWithWorkspace(sessionWorkspaceId): its getActiveRoot() lands in
     * externalRoot/<wsId>/, a sibling folder the explorer never lists. That
     * is the whole story of «تم بناء النظام ولكن الملفات لم تظهر في قائمة
     * فايل اكسبلورر» — the build's mirror wrote real files into a folder no
     * panel shows. Anything meant to be SEEN in the explorer must be written
     * under THIS root, resolved the same way the explorer's own request is.
     */
    getExplorerRoot(): string {
        const local = this.localRoot;
        if (!fs.existsSync(local)) {
            try { fs.mkdirSync(local, { recursive: true }); } catch { }
        }
        return local;
    }

    async setActiveRoot(newPath: string, workspaceId?: string): Promise<boolean> {
        try {
            if (!fs.existsSync(newPath)) {
                fs.mkdirSync(newPath, { recursive: true });
            }
            await import('fs').then(fs => fs.promises.access(newPath));
            const wsId = this.resolveWorkspaceId(workspaceId);
            if (this.isLocalSingleUserMode) {
                // The location picker is global in local mode: persist it even if
                // an API caller happened to supply the current chat workspace id.
                this.currentRoot = newPath;
                this.localRoot = newPath;
                if (wsId) this.rootsByWorkspaceId.set(wsId, newPath);
            } else if (wsId) {
                this.rootsByWorkspaceId.set(wsId, newPath);
            } else {
                // No workspace id: persist the choice so it actually takes effect
                // AND survives the next restart (the old currentRoot was ignored + lost).
                this.currentRoot = newPath;
                this.localRoot = newPath;
            }
            return true;
        } catch {
            return false;
        }
    }

    resetToSystem(workspaceId?: string) {
        const wsId = this.resolveWorkspaceId(workspaceId);
        if (this.isLocalSingleUserMode) {
            this.rootsByWorkspaceId.clear();
            this.currentRoot = process.cwd();
            this.localRoot = path.join(this.externalRoot, 'my-workspace');
        } else if (wsId) {
            this.rootsByWorkspaceId.delete(wsId);
        } else {
            this.currentRoot = process.cwd();
            this.localRoot = path.join(this.externalRoot, 'my-workspace');
        }
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

    /** Every stored workspace, ignoring ownership. READ-ONLY lookup helper for the
     *  local single-user mode, where an orchestrated tool run can arrive without a
     *  usable user id and still needs to find the one repo the user connected.
     *  Never use this to grant access — it answers "what exists", not "who may". */
    async getAllWorkspacesForLookup(): Promise<any[]> {
        if (!isDbConnected()) {
            const out: any[] = [];
            for (const list of mockWorkspacesByUserId.values()) out.push(...list);
            return out;
        }
        return await Workspace.find({}).limit(200).lean() as any[];
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
            // activeRepo used to be handled ONLY in the database branch, so in local
            // mode (PERSISTENCE_MODE=JSON / no Mongo) connecting a repository was
            // silently discarded: the UI reported "repository connected" while the
            // server kept nothing, and every later "analyse the connected repo" had
            // no repo to find. Same behaviour as the DB branch now.
            if (updates.activeRepo) {
                if (!ws.integrations) ws.integrations = {} as any;
                if (!ws.integrations.github) ws.integrations.github = { installationId: '', repositories: [] };
                ws.integrations.github.activeRepo = updates.activeRepo;
                ws.kind = 'github';
            }
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
