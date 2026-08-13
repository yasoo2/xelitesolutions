import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import { chromium, BrowserServer } from 'playwright';

const app = express();

const PORT = process.env.PORT || 7070;
const API_KEY = process.env.WORKER_API_KEY;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes idle → auto-shutdown Chromium

/**
 * FAIL CLOSED, NOT OPEN.
 *
 * The guard here used to read `if (API_KEY && req.headers[...] !== ...)`.
 * Read it again: when WORKER_API_KEY is NOT set, the condition is false and
 * the request is allowed. So the one configuration where the operator has
 * clearly not thought about authentication — no key — was the configuration
 * with no authentication at all. A missing key must mean «refuse everything»,
 * never «allow everyone».
 *
 * The process refuses to start without one, which is louder than a 401 and
 * impossible to miss: a misconfigured worker never comes up rather than coming
 * up wide open.
 */
if (!API_KEY) {
    console.error('[BrowserWorker] FATAL: WORKER_API_KEY is not set. This process drives a real'
        + ' browser; starting it without a key would leave that browser open to anyone who can'
        + ' reach this port. Set WORKER_API_KEY and start again.');
    process.exit(1);
}

/**
 * CORS WITH A LIST, NOT `cors()`.
 *
 * `app.use(cors())` answers every origin with `Access-Control-Allow-Origin: *`,
 * so any page in any tab could talk to this control API. The only legitimate
 * callers are Joe's own API container and, in development, the local UI.
 */
const ALLOWED_ORIGINS = String(process.env.WORKER_ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin: (origin, cb) => {
        // No Origin header at all: a server-to-server call, which is the
        // normal case here — the Bearer check below is what guards it.
        if (!origin) return cb(null, true);
        return cb(null, ALLOWED_ORIGINS.includes(origin));
    },
}));
app.use(express.json());

/** Every control route, one guard — timing-safe, and never optional. */
function authorized(req: express.Request): boolean {
    const given = String(req.headers['authorization'] || '');
    const want = `Bearer ${API_KEY}`;
    if (given.length !== want.length) return false;
    return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want));
}

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
    if (!authorized(req)) {
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
    if (!authorized(req)) {
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
