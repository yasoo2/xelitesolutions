import { Router } from 'express';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { Deployment } from '../../shared/models/deployment';
import { deployManager } from '../../modules/services/DeployManager';
import { ExecutionGateway } from '../../kernel/ExecutionGateway';
import { User } from '../../shared/models/user';
import { executionFirewall } from '../../orchestration/AgentExecutionFirewall';
import { logger } from '../../shared/utils/logger';
import os from 'os';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { SystemConfig } from '../../shared/models/systemConfig';

const router = Router();

router.use(authenticate, requireSuperAdmin);

/**
 * THE PANEL MUST NOT HANG WHEN THERE IS NO DATABASE.
 *
 * Half of this panel is backed by Mongoose (deployments, users, settings), and
 * Joe runs locally with no MongoDB at all. Mongoose does not fail in that
 * state — it BUFFERS, so `Deployment.find()` sat for a full ten seconds and
 * then answered «buffering timed out after 10000ms» with a 500. Measured, not
 * assumed: 10013ms. The panel polls that route every 15 seconds (every 3 while
 * the log modal is open), so the Deployments tab spent its life stacking
 * ten-second requests that could only fail.
 *
 * A missing database is a normal local state, not an error. It gets an
 * immediate, named answer that the UI can explain to the user.
 */
const dbOnline = () => mongoose.connection.readyState === 1 && process.env.PERSISTENCE_MODE !== 'JSON';
const requireDb = (_req: any, res: any, next: any) => {
    if (dbOnline()) return next();
    return res.status(503).json({
        ok: false,
        error: 'db_offline',
        message: 'MongoDB غير متصلة — سجلّ النشر والمستخدمون والإعدادات تحتاجها. باقي اللوحة يعمل.',
    });
};

// ... (Deployment routes remain same)

router.get('/deployments', requireDb, async (req, res) => {
    try {
        const list = await Deployment.find().sort({ createdAt: -1 }).limit(100);
        res.json(list);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/deployments/:id', requireDb, async (req, res) => {
    try {
        await Deployment.findByIdAndDelete(req.params.id);
        res.json({ message: 'Deployment record deleted' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/deployments', requireDb, async (req, res) => {
    try {
        await Deployment.deleteMany({});
        res.json({ message: 'All deployment records deleted' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});



router.post('/rollback/:id', requireDb, async (req, res) => {
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
// GET /system/containers lived here and NOTHING called it: /system/health already
// returns the same `docker ps` list, and that is what the panel renders. A second
// copy of a shell call is a second thing to keep correct — it is gone.

router.get('/settings/notifications', requireDb, async (req, res) => {
    try {
        const config = await SystemConfig.findOne({ key: 'notification_settings' });
        res.json(config?.value || {});
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/settings/notifications', requireDb, async (req, res) => {
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
            const diskRes = await executionFirewall.runAsSystem(async () => {
                return await ExecutionGateway.execute("df -h / | awk 'NR==2{printf \"%s/%s (%s)\", $3,$2,$5}'");
            });
            if (diskRes.data?.ok) diskInfo = (diskRes.data?.output || '').trim();
        } catch { }

        // Docker stats
        let containers: any[] = [];
        try {
            const dockerRes = await executionFirewall.runAsSystem(async () => {
                return await ExecutionGateway.execute('docker', ['ps', '--format', '{{json .}}']);
            });
            if (dockerRes.data?.ok) {
                containers = (dockerRes.data?.output || '').split('\n').map((l: string) => {
                    try { return JSON.parse(l); } catch { return null; }
                }).filter(Boolean);
            }
        } catch { }

        // Systemd status
        let apiServiceStatus = 'unknown';
        try {
            const serviceRes = await executionFirewall.runAsSystem(async () => {
                return await ExecutionGateway.execute('systemctl', ['is-active', 'joe-api.service']);
            });
            apiServiceStatus = (serviceRes.data?.output || '').trim() || (serviceRes.data?.ok ? 'active' : 'inactive');
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
        const result = await executionFirewall.runAsSystem(async () => {
            return await ExecutionGateway.execute('bash', [backupScript], { cwd: process.cwd() });
        });
        
        if (result.data?.ok) {
            res.json({ message: 'Backup completed successfully', output: result.data?.output });
        } else {
            res.status(500).json({ error: 'Backup failed', output: result.data?.error || result.data?.output });
        }
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/users', requireDb, async (req, res) => {
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

router.patch('/users/:id/role', requireDb, async (req, res) => {
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

router.post('/deploy', requireDb, async (req, res) => {
    try {
        console.log('[AdminAPI] Received deploy request');
        const { deployManager } = await import('../../modules/services/DeployManager');
        
        // Start deployment process immediately without waiting for commit hash
        // We use 'manual-pending' as a placeholder until the flow resolves the real commit
        const id = await deployManager.startDeploy('manual', 'pending');
        
        console.log(`[AdminAPI] Deployment initiated with ID: ${id}`);
        res.json({ id, message: 'Deployment initiated successfully' });
    } catch (e: any) {
        console.error(`[AdminAPI] Deployment trigger failed: ${e.stack || e.message}`);
        res.status(400).json({ error: e.message });
    }
});

export default router;
