import { Workspace, IWorkspace } from '../models/workspace';
import { WorkspaceMember, IWorkspaceMember } from '../models/workspaceMember';
import { User } from '../models/user';
import { Types } from 'mongoose';

export class WorkspaceService {

    /**
     * Create a new workspace and assign the creator as OWNER
     */
    async createWorkspace(userId: string, name: string, slug?: string): Promise<IWorkspace> {
        const finalSlug = slug || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

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

        const workspace = await Workspace.create({
            name,
            slug: finalSlug,
            ownerId: new Types.ObjectId(userId),
            ...defaults
        });

        // Add creator as OWNER
        await WorkspaceMember.create({
            workspaceId: workspace._id,
            userId: new Types.ObjectId(userId),
            role: 'OWNER'
        });

        return workspace;
    }

    /**
     * Get workspace by ID with member check
     */
    async getWorkspace(workspaceId: string, userId: string): Promise<IWorkspace | null> {
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
        const memberships = await WorkspaceMember.find({ userId: new Types.ObjectId(userId) }).populate('workspaceId');
        return memberships.map(m => m.workspaceId);
    }

    /**
     * Add a member to the workspace
     */
    async addMember(adminUserId: string, workspaceId: string, targetEmail: string, role: 'ADMIN' | 'DEVELOPER' | 'VIEWER') {
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
    async updateWorkspace(adminUserId: string, workspaceId: string, updates: { name?: string, providerConfig?: any }) {
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
        if (updates.providerConfig) {
            // Merge or overwrite provider config
            workspace.providerConfig = { ...workspace.providerConfig, ...updates.providerConfig };
        }

        await workspace.save();
        return workspace;
    }

    /**
     * Remove a member from the workspace
     */
    async removeMember(adminUserId: string, workspaceId: string, targetMemberId: string) {
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
        const existing = await this.getUserWorkspaces(userId);
        if (existing.length > 0) return existing[0];

        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');

        const name = user.name ? `${user.name}'s Workspace` : 'Personal Workspace';
        return await this.createWorkspace(userId, name);
    }
}

export const workspaceService = new WorkspaceService();
