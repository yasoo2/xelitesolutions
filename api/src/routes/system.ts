import { Router } from 'express';
import { exec } from 'child_process';
import os from 'os';
import { authenticate } from '../middleware/auth';

const router = Router();

// Get system stats (CPU, RAM, Uptime)
router.get('/stats', authenticate, async (req, res) => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpuUsage = os.loadavg()[0]; // 1 minute load average

    res.json({
        memory: {
            total: totalMem,
            free: freeMem,
            used: usedMem,
            percent: Math.round((usedMem / totalMem) * 100)
        },
        cpu: {
            load: cpuUsage,
            cores: os.cpus().length
        },
        uptime: os.uptime(),
        platform: os.platform(),
        arch: os.arch()
    });
});

// List Node/API related processes
router.get('/processes', authenticate, async (req, res) => {
    // This command works on macOS/Linux
    const cmd = "ps aux | grep -E 'node|ts-node' | grep -v grep | head -n 20";
    
    exec(cmd, (err, stdout, stderr) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to list processes' });
        }

        const lines = stdout.trim().split('\n');
        const processes = lines.map(line => {
            const parts = line.trim().split(/\s+/);
            // Basic parsing for ps aux output
            // USER PID %CPU %MEM VSZ RSS TT STAT STARTED TIME COMMAND
            return {
                user: parts[0],
                pid: parts[1],
                cpu: parseFloat(parts[2]),
                mem: parseFloat(parts[3]),
                command: parts.slice(10).join(' ')
            };
        });

        res.json({ processes });
    });
});

// Kill a process
router.delete('/processes/:pid', authenticate, async (req, res) => {
    const { pid } = req.params;
    
    // Safety check: Don't let them kill init or root easily if running as root (unlikely but safe)
    if (pid === '1') return res.status(403).json({ error: 'Cannot kill init process' });

    exec(`kill -9 ${pid}`, (err) => {
        if (err) {
            return res.status(500).json({ error: `Failed to kill process ${pid}` });
        }
        res.json({ success: true, message: `Process ${pid} killed` });
    });
});

export default router;
