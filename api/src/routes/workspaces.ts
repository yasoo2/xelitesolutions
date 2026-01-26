import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { workspaceService } from '../services/WorkspaceService';

const router = Router();

// List My Workspaces
router.get('/', authenticate as any, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).auth?.sub;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const workspaces = await workspaceService.getUserWorkspaces(userId);
        res.json(workspaces);
    } catch (e: any) {
        console.error('List Workspaces Error', e);
        res.status(500).json({ error: e.message });
    }
});

// Create Workspace
router.post('/', authenticate as any, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).auth?.sub;
        const { name, slug } = req.body;

        if (!name) return res.status(400).json({ error: 'Name is required' });

        const workspace = await workspaceService.createWorkspace(userId, name, slug);
        res.status(201).json(workspace);
    } catch (e: any) {
        console.error('Create Workspace Error', e);
        res.status(500).json({ error: e.message });
    }
});

// Get Single Workspace
router.get('/:id', authenticate as any, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).auth?.sub;
        const workspace = await workspaceService.getWorkspace(req.params.id, userId);
        if (!workspace) return res.status(404).json({ error: 'Not found or access denied' });
        res.json(workspace);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Update Workspace
router.put('/:id', authenticate as any, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).auth?.sub;
        const workspace = await workspaceService.updateWorkspace(userId, req.params.id, req.body);
        res.json(workspace);
    } catch (e: any) {
        res.status(403).json({ error: e.message });
    }
});

// Get Members
router.get('/:id/members', authenticate as any, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).auth?.sub;
        const members = await workspaceService.getWorkspaceMembers(userId, req.params.id);
        res.json(members);
    } catch (e: any) {
        res.status(403).json({ error: e.message });
    }
});

// Invite Member
router.post('/:id/members', authenticate as any, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).auth?.sub;
        const { email, role } = req.body;
        await workspaceService.addMember(userId, req.params.id, email, role || 'VIEWER');
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Remove Member
router.delete('/:id/members/:memberId', authenticate as any, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).auth?.sub;
        await workspaceService.removeMember(userId, req.params.id, req.params.memberId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

export default router;
