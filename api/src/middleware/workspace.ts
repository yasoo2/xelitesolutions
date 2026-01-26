import { Request, Response, NextFunction } from 'express';
import { WorkspaceMember } from '../models/workspaceMember';
import { Workspace } from '../models/workspace';
import mongoose from 'mongoose';

export interface WorkspaceRequest extends Request {
    workspace?: any;
    workspaceMember?: any;
}

export async function requireWorkspace(req: WorkspaceRequest, res: Response, next: NextFunction) {
    const userId = (req as any).auth?.sub;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    // 1. Resolve Workspace ID (Header > Query > Body)
    let workspaceId = req.headers['x-workspace-id'] as string;
    if (!workspaceId) {
        if (req.body && req.body.workspaceId) workspaceId = req.body.workspaceId;
        else if (req.query && req.query.workspaceId) workspaceId = req.query.workspaceId as string;
    }

    // 2. Fallback: If no ID, and User is Owner/Admin, maybe we can auto-select? 
    // For now, strict requirement: Client MUST send ID or we fail (unless it's a list operation)
    if (!workspaceId) {
        // Soft Fail: If route handles missing workspace, let it proceed. 
        // But for "requireWorkspace", we enforce it.
        return res.status(400).json({ error: 'Workspace ID required (x-workspace-id)' });
    }

    try {
        const wsId = new mongoose.Types.ObjectId(workspaceId);

        // 3. Verify Membership
        const member = await WorkspaceMember.findOne({
            workspaceId: wsId,
            userId: new mongoose.Types.ObjectId(userId)
        });

        if (!member) {
            return res.status(403).json({ error: 'Access denied to this workspace' });
        }

        // 4. Load Workspace Metadata
        const workspace = await Workspace.findById(wsId);
        if (!workspace || workspace.status === 'suspended') {
            return res.status(403).json({ error: 'Workspace unavailable' });
        }

        // 5. Inject Context
        req.workspace = workspace;
        req.workspaceMember = member;

        next();
    } catch (e) {
        console.error('Workspace Middleware Error', e);
        return res.status(400).json({ error: 'Invalid Workspace ID' });
    }
}
