import { Router } from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { Deployment } from '../models/deployment';
import { deployManager } from '../services/DeployManager';
import { execSync } from 'child_process';
import { logger } from '../utils/logger';

const router = Router();

router.use(authenticate, requireSuperAdmin);

router.get('/deployments', async (req, res) => {
    try {
        const list = await Deployment.find().sort({ createdAt: -1 }).limit(20);
        res.json(list);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/deployments/:id', async (req, res) => {
    try {
        await Deployment.findByIdAndDelete(req.params.id);
        res.json({ message: 'Deployment record deleted' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/deployments', async (req, res) => {
    try {
        await Deployment.deleteMany({});
        res.json({ message: 'All deployment records deleted' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/deploy', async (req, res) => {
    try {
        const { expectedCommit } = req.body || {};
        const id = await deployManager.startDeploy('manual', expectedCommit);
        res.json({ id, message: 'Deployment started' });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

router.post('/rollback/:id', async (req, res) => {
    try {
        const id = await deployManager.rollback(req.params.id);
        res.json({ id, message: 'Rollback started' });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

router.get('/system/containers', async (req, res) => {
    try {
        const output = execSync('docker ps --format "{{json .}}"').toString();
        const containers = output.trim().split('\n').map(l => {
            if (!l) return null;
            try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
        res.json(containers);
    } catch (e: any) {
        logger.error(`[AdminAPI] Failed to fetch containers: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

import { SystemConfig } from '../models/systemConfig';

router.get('/settings/notifications', async (req, res) => {
    try {
        const config = await SystemConfig.findOne({ key: 'notification_settings' });
        res.json(config?.value || {});
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/settings/notifications', async (req, res) => {
    try {
        await SystemConfig.findOneAndUpdate(
            { key: 'notification_settings' },
            { value: req.body },
            { upsert: true, new: true }
        );
        res.json({ message: 'Settings updated successfully' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
