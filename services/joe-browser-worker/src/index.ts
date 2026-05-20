import express from 'express';
import cors from 'cors';
import { chromium, BrowserServer } from 'playwright';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 7070;
const API_KEY = process.env.WORKER_API_KEY;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes idle → auto-shutdown Chromium

let browserServer: BrowserServer | null = null;
let lastUsedAt = Date.now();

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        worker: 'joe-browser-worker',
        hasServer: !!browserServer,
        idleMs: browserServer ? Date.now() - lastUsedAt : null
    });
});

// Start Browser Server (on-demand)
app.post('/browser/start', async (req, res) => {
    if (API_KEY && req.headers['authorization'] !== `Bearer ${API_KEY}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    lastUsedAt = Date.now(); // Mark as used

    try {
        if (browserServer) {
            return res.json({ wsEndpoint: browserServer.wsEndpoint() });
        }

        browserServer = await chromium.launchServer({
            headless: process.env.BROWSER_HEADLESS === 'false' ? false : true,
            port: 5050,
            wsPath: 'ws',
            host: '0.0.0.0',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        console.log('[BrowserWorker] ✅ Browser started on-demand at', browserServer.wsEndpoint());
        res.json({ wsEndpoint: browserServer.wsEndpoint() });
    } catch (e: any) {
        console.error('[BrowserWorker] Failed to start browser server:', e);
        res.status(500).json({ error: e.message });
    }
});

// Stop Browser Server
app.post('/browser/stop', async (req, res) => {
    if (API_KEY && req.headers['authorization'] !== `Bearer ${API_KEY}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (browserServer) {
        await browserServer.close();
        browserServer = null;
        console.log('[BrowserWorker] Browser stopped by request');
    }
    res.json({ status: 'stopped' });
});

// Idle auto-shutdown: check every 60s, stop Chromium if idle > 5 min
setInterval(async () => {
    if (browserServer && (Date.now() - lastUsedAt > IDLE_TIMEOUT_MS)) {
        try {
            await browserServer.close();
            browserServer = null;
            console.log(`[BrowserWorker] 💤 Auto-stopped Chromium (idle for ${Math.round(IDLE_TIMEOUT_MS / 1000)}s) — saving ~300MB RAM`);
        } catch (e) {
            console.error('[BrowserWorker] Error during idle shutdown:', e);
        }
    }
}, 60000);

app.listen(PORT, () => {
    console.log(`[BrowserWorker] Listening on port ${PORT} — Chromium starts on-demand (saves ~300MB idle RAM)`);
    // NOTE: No auto-start! Chromium launches only when /browser/start is called
});
