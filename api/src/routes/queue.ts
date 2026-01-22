import { Router } from 'express';
import { taskQueueManager } from '../services/TaskQueueManager';
import { authenticate as requireAuth } from '../middleware/auth';

const router = Router();

/**
 * GET /queue/:sessionId - Get all queued tasks for a session
 */
router.get('/:sessionId', requireAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const tasks = taskQueueManager.getQueue(sessionId);
        res.json({ tasks });
    } catch (error) {
        console.error('Error fetching queue:', error);
        res.status(500).json({ error: 'Failed to fetch queue' });
    }
});

/**
 * POST /queue/analyze - Analyze if a new message should be merged or queued
 */
router.post('/analyze', requireAuth, async (req, res) => {
    try {
        const { message, sessionId } = req.body;

        if (!message || !sessionId) {
            return res.status(400).json({ error: 'Message and sessionId are required' });
        }

        const currentTask = taskQueueManager.getCurrentTask(sessionId);
        const analysis = await taskQueueManager.analyzeContext(message, currentTask, sessionId);

        res.json(analysis);
    } catch (error) {
        console.error('Error analyzing context:', error);
        res.status(500).json({ error: 'Failed to analyze context' });
    }
});

/**
 * POST /queue - Add a task to the queue
 */
router.post('/', requireAuth, async (req, res) => {
    try {
        const { message, sessionId, priority = 'normal', relatedToCurrentTask = false } = req.body;

        if (!message || !sessionId) {
            return res.status(400).json({ error: 'Message and sessionId are required' });
        }

        const task = taskQueueManager.addToQueue({
            message,
            sessionId,
            priority,
            relatedToCurrentTask,
        });

        res.json({ task });
    } catch (error) {
        console.error('Error adding to queue:', error);
        res.status(500).json({ error: 'Failed to add to queue' });
    }
});

/**
 * DELETE /queue/:sessionId/:taskId - Remove a task from the queue
 */
router.delete('/:sessionId/:taskId', requireAuth, async (req, res) => {
    try {
        const { sessionId, taskId } = req.params;
        const success = taskQueueManager.removeFromQueue(taskId, sessionId);

        if (!success) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error removing from queue:', error);
        res.status(500).json({ error: 'Failed to remove from queue' });
    }
});

/**
 * POST /queue/:sessionId/start/:taskId - Start a queued task
 */
router.post('/:sessionId/start/:taskId', requireAuth, async (req, res) => {
    try {
        const { sessionId, taskId } = req.params;
        const success = taskQueueManager.startTask(taskId, sessionId);

        if (!success) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error starting task:', error);
        res.status(500).json({ error: 'Failed to start task' });
    }
});

/**
 * POST /queue/:sessionId/current - Set the current task description
 */
router.post('/:sessionId/current', requireAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { description } = req.body;

        if (!description) {
            return res.status(400).json({ error: 'Description is required' });
        }

        taskQueueManager.setCurrentTask(sessionId, description);
        res.json({ success: true });
    } catch (error) {
        console.error('Error setting current task:', error);
        res.status(500).json({ error: 'Failed to set current task' });
    }
});

/**
 * DELETE /queue/:sessionId/current - Clear the current task
 */
router.delete('/:sessionId/current', requireAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        taskQueueManager.clearCurrentTask(sessionId);
        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing current task:', error);
        res.status(500).json({ error: 'Failed to clear current task' });
    }
});

/**
 * DELETE /queue/:sessionId - Clear all tasks for a session
 */
router.delete('/:sessionId', requireAuth, async (req, res) => {
    try {
        const { sessionId } = req.params;
        taskQueueManager.clearQueue(sessionId);
        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing queue:', error);
        res.status(500).json({ error: 'Failed to clear queue' });
    }
});

export default router;
