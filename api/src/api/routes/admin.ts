import { Router } from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { Deployment } from '../../shared/models/deployment';
import { deployManager } from '../../modules/services/DeployManager';
import { execSync } from 'child_process';
import { User } from '../../shared/models/user';
import { logger } from '../../shared/utils/logger';

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

// Auto-deploy poller status
router.get('/autodeploy/status', async (req, res) => {
    try {
        res.json(deployManager.getPollerStatus());
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Toggle auto-deploy on/off
router.post('/autodeploy/toggle', async (req, res) => {
    try {
        const { enabled } = req.body;
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled (boolean) is required' });
        }
        if (enabled) {
            deployManager.enableAutoDeployPoller();
        } else {
            deployManager.stopAutoDeployPoller();
        }
        res.json(deployManager.getPollerStatus());
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Safe container listing - uses fixed command, no user input in shell
router.get('/system/containers', async (req, res) => {
    try {
        // Fixed command string - never interpolate user input into shell commands
        const output = execSync('docker ps --format "{{json .}}"', {
            timeout: 10000,
            encoding: 'utf8',
            env: { ...process.env, PATH: process.env.PATH },
        });
        const containers = output.trim().split('\n').map(l => {
            if (!l) return null;
            try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
        res.json(containers);
    } catch (e: any) {
        logger.error(`[AdminAPI] Failed to fetch containers: ${e.message}`);
        res.status(500).json({ error: 'Failed to list containers' });
    }
});

import { SystemConfig } from '../../shared/models/systemConfig';

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
import os from 'os';

router.get('/system/health', async (req, res) => {
    try {
        // CPU & Memory using Node's built-in OS module (avoids missing 'top'/'free' in Alpine/Slim images)
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memPercent = (usedMem / totalMem) * 100;
        const memInfo = `${(usedMem / 1024 / 1024 / 1024).toFixed(1)}GB/${(totalMem / 1024 / 1024 / 1024).toFixed(1)}GB (${memPercent.toFixed(1)}%)`;

        const cpus = os.cpus();
        let totalIdle = 0, totalTick = 0;
        cpus.forEach(cpu => {
            for (let type in cpu.times) {
                totalTick += cpu.times[type as keyof typeof cpu.times];
            }
            totalIdle += cpu.times.idle;
        });
        const cpuInfo = (((totalTick - totalIdle) / totalTick) * 100).toFixed(1);

        let diskInfo = 'Unknown';
        try {
            diskInfo = execSync("df -h / | awk 'NR==2{printf \"%s/%s (%s)\", $3,$2,$5}'").toString().trim();
        } catch { }

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
        const backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
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
        const backupScript = path.join(process.cwd(), 'scripts', 'backup.sh');
        const child = spawn('bash', [backupScript], { cwd: process.cwd() });
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

// ═══════════════════════════════════════════════
// USER / ADMIN MANAGEMENT
// ═══════════════════════════════════════════════

router.get('/users', async (req, res) => {
    try {
        const { search, role } = req.query;
        let query: any = {};

        if (search) {
            query.$or = [
                { email: { $regex: search, $options: 'i' } },
                { name: { $regex: search, $options: 'i' } }
            ];
        }

        if (role) {
            query.role = role;
        }

        const users = await User.find(query)
            .select('-passwordHash')
            .sort({ createdAt: -1 })
            .limit(100);

        res.json(users);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.patch('/users/:id/role', async (req, res) => {
    try {
        const { role } = req.body;
        if (!['OWNER', 'ADMIN', 'USER', 'SUPER_ADMIN'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { role },
            { new: true }
        ).select('-passwordHash');

        if (!user) return res.status(404).json({ error: 'User not found' });

        logger.info(`[AdminAPI] User ${user.email} role updated to ${role} by ${(req as any).auth?.email}`);
        res.json(user);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

import mongoose from 'mongoose';

export default router;
