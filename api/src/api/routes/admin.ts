import { Router } from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { Deployment } from '../../shared/models/deployment';
import { deployManager } from '../../modules/services/DeployManager';
import { ExecutionGateway } from '../../kernel/ExecutionGateway';
import { User } from '../../shared/models/user';
import { logger } from '../../shared/utils/logger';
import os from 'os';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { SystemConfig } from '../../shared/models/systemConfig';

const router = Router();

router.use(authenticate, requireSuperAdmin);

// ... (Deployment routes remain same)

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

router.get('/autodeploy/status', async (req, res) => {
    try {
        res.json(deployManager.getPollerStatus());
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

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

// Safe container listing - uses Gateway
router.get('/system/containers', async (req, res) => {
    try {
        const result = await ExecutionGateway.execute('docker', ['ps', '--format', '{{json .}}']);
        if (!result.ok) throw new Error(result.error);
        
        const containers = (result.output || '').trim().split('\n').map(l => {
            if (!l) return null;
            try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
        res.json(containers);
    } catch (e: any) {
        logger.error(`[AdminAPI] Failed to fetch containers: ${e.message}`);
        res.status(500).json({ error: 'Failed to list containers' });
    }
});

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

router.get('/system/health', async (req, res) => {
    try {
        // CPU & Memory using Node's built-in OS module
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
            const diskRes = await ExecutionGateway.execute("df -h / | awk 'NR==2{printf \"%s/%s (%s)\", $3,$2,$5}'");
            if (diskRes.ok) diskInfo = (diskRes.output || '').trim();
        } catch { }

        // Docker stats
        let containers: any[] = [];
        try {
            const dockerRes = await ExecutionGateway.execute('docker', ['ps', '--format', '{{json .}}']);
            if (dockerRes.ok) {
                containers = (dockerRes.output || '').split('\n').map(l => {
                    try { return JSON.parse(l); } catch { return null; }
                }).filter(Boolean);
            }
        } catch { }

        // Systemd status
        let apiServiceStatus = 'unknown';
        try {
            const serviceRes = await ExecutionGateway.execute('systemctl', ['is-active', 'joe-api.service']);
            apiServiceStatus = (serviceRes.output || '').trim() || (serviceRes.ok ? 'active' : 'inactive');
        } catch { 
            apiServiceStatus = 'inactive';
        }

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
            apiService: {
                name: 'joe-api.service',
                status: apiServiceStatus
            },
            database: dbStats,
            timestamp: new Date().toISOString()
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

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
        const backupScript = path.join(process.cwd(), 'scripts', 'backup.sh');
        const result = await ExecutionGateway.execute('bash', [backupScript], { cwd: process.cwd() });
        
        if (result.ok) {
            res.json({ message: 'Backup completed successfully', output: result.output });
        } else {
            res.status(500).json({ error: 'Backup failed', output: result.error || result.output });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

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

export default router;
