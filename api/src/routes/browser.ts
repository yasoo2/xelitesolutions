import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { browserService } from '../services/browser';

const router = Router();

router.post('/launch', authenticate, async (req, res) => {
    try {
        await browserService.launch();
        res.json({ success: true, status: browserService.getStatus() });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/navigate', authenticate, async (req, res) => {
    try {
        const { url } = req.body;
        const result = await browserService.navigate(url);
        res.json({ success: true, ...result });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/action', authenticate, async (req, res) => {
    try {
        const { type, x, y, text, deltaY, width, height, script } = req.body;
        
        switch (type) {
            case 'click':
                await browserService.click(x, y);
                break;
            case 'type':
                await browserService.type(text);
                break;
            case 'scroll':
                await browserService.scroll(deltaY);
                break;
            case 'back':
                await browserService.goBack();
                break;
            case 'forward':
                await browserService.goForward();
                break;
            case 'reload':
                await browserService.reload();
                break;
            case 'viewport':
                await browserService.setViewport(width, height);
                break;
            case 'evaluate':
                const result = await browserService.evaluate(script);
                return res.json({ success: true, result });
            case 'inspect':
                const info = await browserService.inspect(x, y);
                return res.json({ success: true, info });
            case 'click_selector':
                await browserService.clickSelector(req.body.selector);
                break;
            case 'type_selector':
                await browserService.typeSelector(req.body.selector, req.body.text);
                break;
            case 'dom':
                const dom = await browserService.getSimplifiedDOM();
                return res.json({ success: true, dom });
            case 'audit':
                const audit = await browserService.auditPage();
                return res.json({ success: true, audit });
            default:
                return res.status(400).json({ error: 'Invalid action type' });
        }
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/screenshot', authenticate, async (req, res) => {
    try {
        const img = await browserService.screenshot();
        if (!img) return res.status(404).json({ error: 'Browser not active' });
        res.json({ image: `data:image/png;base64,${img}` });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/pdf', authenticate, async (req, res) => {
    try {
        const pdf = await browserService.pdf();
        if (!pdf) return res.status(404).json({ error: 'Browser not active' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=page.pdf');
        res.send(pdf);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/logs', authenticate, (req, res) => {
    res.json(browserService.getLogs());
});

router.get('/network', authenticate, (req, res) => {
    res.json(browserService.getNetwork());
});

router.post('/close', authenticate, async (req, res) => {
    await browserService.close();
    res.json({ success: true });
});

router.get('/status', authenticate, (req, res) => {
    res.json(browserService.getStatus());
});

export default router;
