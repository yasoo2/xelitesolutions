import express from 'express';
import { MonitoringTool } from '../tools/definitions/MonitoringTool';

const router = express.Router();
const monitor = new MonitoringTool(); // Use instance to access static metrics

router.get('/metrics', async (req, res) => {
    try {
        const result = await monitor.execute({ action: 'get_metrics' });
        res.json((result as any).output?.metrics || {});
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/metrics/track', async (req, res) => {
    const { event, value, metadata } = req.body;
    try {
        const result = await monitor.execute({ action: 'track', event, value, metadata });
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
