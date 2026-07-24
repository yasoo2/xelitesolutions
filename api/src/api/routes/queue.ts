import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';

/**
 * Per-session task queue. The frontend (useTaskQueue) calls /queue/* but no
 * backend router existed, so the task tracker silently 404'd. This is a small,
 * single-user, in-memory implementation (global.joeQueues) matching the shapes
 * the hook expects.
 */
const router = Router();

interface QTask {
    id: string;
    message: string;
    timestamp: Date;
    priority: 'high' | 'normal';
    relatedToCurrentTask: boolean;
    sessionId: string;
}

function queues(): Record<string, { tasks: QTask[]; current?: string }> {
    if (!(global as any).joeQueues) (global as any).joeQueues = {};
    return (global as any).joeQueues;
}
function q(sessionId: string) {
    const all = queues();
    if (!all[sessionId]) all[sessionId] = { tasks: [] };
    return all[sessionId];
}

// POST /queue/analyze -> decide how to handle a new message (heuristic)
router.post('/analyze', authenticate as any, (req: Request, res: Response) => {
    const message = String(req.body?.message || '').trim();
    const isCorrection = /^(no|not|actually|instead|wait|stop|rather|لا|بدل|في الحقيقة|توقف|انتظر|بدلاً)/i.test(message);
    res.json({
        action: isCorrection ? 'merge' : 'execute',
        isCorrection,
        confidence: 0.6,
        reason: isCorrection ? 'correction/adjustment detected' : 'normal task',
    });
});

// POST /queue -> add a task
router.post('/', authenticate as any, (req: Request, res: Response) => {
    const sessionId = String(req.body?.sessionId || 'default');
    const task: QTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        message: String(req.body?.message || ''),
        timestamp: new Date(),
        priority: req.body?.priority === 'high' ? 'high' : 'normal',
        relatedToCurrentTask: !!req.body?.relatedToCurrentTask,
        sessionId,
    };
    q(sessionId).tasks.push(task);
    res.json({ task });
});

// DELETE /queue/:sessionId/current -> clear current (MUST be before /:sessionId/:taskId)
router.delete('/:sessionId/current', authenticate as any, (req: Request, res: Response) => {
    q(String(req.params.sessionId)).current = undefined;
    res.json({ ok: true });
});

// POST /queue/:sessionId/current -> set current task description
router.post('/:sessionId/current', authenticate as any, (req: Request, res: Response) => {
    q(String(req.params.sessionId)).current = String(req.body?.description || '');
    res.json({ ok: true });
});

// POST /queue/:sessionId/start/:taskId -> start (dequeue) a task
router.post('/:sessionId/start/:taskId', authenticate as any, (req: Request, res: Response) => {
    const s = q(String(req.params.sessionId));
    const task = s.tasks.find(t => t.id === String(req.params.taskId)) || null;
    s.tasks = s.tasks.filter(t => t.id !== String(req.params.taskId));
    res.json({ ok: true, task });
});

// DELETE /queue/:sessionId/:taskId -> remove a task
router.delete('/:sessionId/:taskId', authenticate as any, (req: Request, res: Response) => {
    const s = q(String(req.params.sessionId));
    s.tasks = s.tasks.filter(t => t.id !== String(req.params.taskId));
    res.json({ ok: true });
});

// GET /queue/:sessionId -> list tasks
router.get('/:sessionId', authenticate as any, (req: Request, res: Response) => {
    res.json({ tasks: q(String(req.params.sessionId)).tasks });
});

export default router;
