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

// ═══════════════════════════════════════════════
// SYSTEM HEALTH & METRICS
// ═══════════════════════════════════════════════

router.get('/system/health', async (req, res) => {
    try {
        // CPU & Memory
        const cpuInfo = execSync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' || echo '0'").toString().trim();
        const memInfo = execSync("free -m | awk 'NR==2{printf \"%s/%s (%.1f%%)\", $3,$2,$3*100/$2}'").toString().trim();
        const diskInfo = execSync("df -h / | awk 'NR==2{printf \"%s/%s (%s)\", $3,$2,$5}'").toString().trim();

        // Docker stats
        let containers: any[] = [];
        try {
            const dockerOutput = execSync('docker ps --format "{{json .}}"').toString().trim();
            containers = dockerOutput.split('\n').map(l => {
                try { return JSON.parse(l); } catch { return null; }
            }).filter(Boolean);
        } catch { }

        // MongoDB stats
        let dbStats: any = {};
        try {
            if (mongoose.connection.readyState === 1) {
                const admin = mongoose.connection.db!.admin();
                const serverStatus = await admin.serverStatus();
                const dbStatsRaw = await mongoose.connection.db!.stats();
                dbStats = {
                    collections: dbStatsRaw.collections,
                    documents: dbStatsRaw.objects,
                    dataSize: `${(dbStatsRaw.dataSize / 1024 / 1024).toFixed(1)} MB`,
                    storageSize: `${(dbStatsRaw.storageSize / 1024 / 1024).toFixed(1)} MB`,
                    connections: serverStatus.connections?.current || 0,
                    uptime: `${Math.floor(serverStatus.uptime / 3600)}h ${Math.floor((serverStatus.uptime % 3600) / 60)}m`
                };
            }
        } catch { }

        res.json({
            system: {
                cpu: cpuInfo + '%',
                memory: memInfo,
                disk: diskInfo,
                nodeUptime: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`,
                nodeVersion: process.version,
                platform: process.platform
            },
            containers,
            database: dbStats,
            timestamp: new Date().toISOString()
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

import fs from 'fs';
import path from 'path';

router.get('/system/backups', async (req, res) => {
    try {
        const backupDir = '/root/xelitesolutions/backups';
        if (!fs.existsSync(backupDir)) {
            return res.json({ backups: [], message: 'No backups found' });
        }
        const files = fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.tar.gz'))
            .map(f => {
                const stat = fs.statSync(path.join(backupDir, f));
                return {
                    name: f,
                    size: `${(stat.size / 1024 / 1024).toFixed(1)} MB`,
                    created: stat.mtime.toISOString()
                };
            })
            .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
        res.json({ backups: files });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/system/backup', async (req, res) => {
    try {
        const { spawn } = require('child_process');
        const child = spawn('bash', ['/app/scripts/backup.sh'], { cwd: '/root/xelitesolutions' });
        let output = '';
        child.stdout.on('data', (d: Buffer) => output += d.toString());
        child.stderr.on('data', (d: Buffer) => output += d.toString());
        child.on('close', (code: number) => {
            if (code === 0) {
                res.json({ message: 'Backup completed successfully', output });
            } else {
                res.status(500).json({ error: 'Backup failed', output });
            }
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

import mongoose from 'mongoose';

export default router;
