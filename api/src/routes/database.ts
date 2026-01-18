
import { Router, Request, Response } from 'express';
import { DbSchemaMigratorTool, LargeDataSeederTool, QueryOptimizerTool } from '../tools/definitions/DatabaseEnterpriseTools';
import { authenticate } from '../middleware/auth';

const router = Router();
const migrator = new DbSchemaMigratorTool();
const seeder = new LargeDataSeederTool();
const optimizer = new QueryOptimizerTool();

router.post('/migrate', authenticate as any, async (req: Request, res: Response) => {
    try {
        const result = await migrator.execute(req.body);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/seed', authenticate as any, async (req: Request, res: Response) => {
    try {
        const result = await seeder.execute(req.body);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/optimize', authenticate as any, async (req: Request, res: Response) => {
    try {
        const result = await optimizer.execute(req.body);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
