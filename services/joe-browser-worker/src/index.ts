import express from 'express';
import cors from 'cors';
import { chromium, BrowserServer } from 'playwright';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 7070;
const API_KEY = process.env.WORKER_API_KEY;

let browserServer: BrowserServer | null = null;

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', worker: 'joe-browser-worker', hasServer: !!browserServer });
});

// Start Browser Server
app.post('/browser/start', async (req, res) => {
    // Auth check
    if (API_KEY && req.headers['authorization'] !== `Bearer ${API_KEY}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        if (browserServer) {
            return res.json({ wsEndpoint: browserServer.wsEndpoint() });
        }

        browserServer = await chromium.launchServer({
            headless: process.env.BROWSER_HEADLESS === 'false' ? false : true,
            port: 5050,
            wsPath: 'ws',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        console.log('Browser Server started at', browserServer.wsEndpoint());
        res.json({ wsEndpoint: browserServer.wsEndpoint() });
    } catch (e: any) {
        console.error('Failed to start browser server:', e);
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
    }
    res.json({ status: 'stopped' });
});

app.listen(PORT, async () => {
    console.log(`Browser Worker listening on port ${PORT}`);
    // Auto-start browser server
    try {
        browserServer = await chromium.launchServer({
            headless: process.env.BROWSER_HEADLESS === 'false' ? false : true,
            port: 5050,
            wsPath: 'ws',
            host: '0.0.0.0', // Critical for Docker visibility
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        console.log('Browser Server auto-started at', browserServer.wsEndpoint());
    } catch (e) {
        console.error('Failed to auto-start browser server:', e);
    }
});
