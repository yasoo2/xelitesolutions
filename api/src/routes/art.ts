
import { Router, Request, Response } from 'express';
import { ImageGenerationTool } from '../tools/definitions/ImageGenerationTool';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/generate', authenticate as any, async (req: Request, res: Response) => {
    try {
        const { prompt, size } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt required' });

        const result = await ImageGenerationTool.execute({ prompt, size });
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
