import { Router } from 'express';
import { spawn } from 'child_process';
import os from 'os';
import { authenticate } from '../middleware/auth';

const router = Router();

function spawnWithTimeout(cmd: string, args: string[], timeoutMs: number) {
    return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const child = spawn(cmd, args, { shell: false });
        let stdout = '';
        let stderr = '';
        let done = false;

        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            try { child.kill('SIGKILL'); } catch { }
            resolve({ code: 124, stdout, stderr: stderr || 'timeout' });
        }, Math.max(1, timeoutMs));

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('close', (code) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve({ code: typeof code === 'number' ? code : 1, stdout, stderr });
        });
        child.on('error', (e: any) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve({ code: 1, stdout, stderr: String(e?.message || e || 'spawn_failed') });
        });
    });
}

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
    const r = await spawnWithTimeout('ps', ['aux'], 5000);
    if (r.code !== 0) {
        return res.status(500).json({ error: 'Failed to list processes' });
    }

    const lines = (r.stdout || '').trim().split('\n').slice(1);
    const filtered = lines.filter((line) => /\b(node|ts-node)\b/i.test(line)).slice(0, 20);
    const processes = filtered.map((line) => {
        const parts = line.trim().split(/\s+/);
        return {
            user: parts[0],
            pid: parts[1],
            cpu: parseFloat(parts[2]),
            mem: parseFloat(parts[3]),
            command: parts.slice(10).join(' '),
        };
    });

    res.json({ processes });
});

// Kill a process
router.delete('/processes/:pid', authenticate, async (req, res) => {
    const { pid } = req.params;

    // Safety check: Don't let them kill init or root easily if running as root (unlikely but safe)
    const pidNum = Number(pid);
    if (!Number.isSafeInteger(pidNum) || pidNum <= 1) return res.status(400).json({ error: 'Invalid pid' });
    if (pidNum === process.pid) return res.status(403).json({ error: 'Cannot kill self' });

    try {
        process.kill(pidNum, 'SIGKILL');
        return res.json({ success: true, message: `Process ${pidNum} killed` });
    } catch {
        return res.status(500).json({ error: `Failed to kill process ${pidNum}` });
    }
});

export default router;
