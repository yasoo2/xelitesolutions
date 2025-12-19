import { Router } from 'express';
import { CouncilService } from '../services/council';
import { CodeGraphService } from '../services/graph';
import path from 'path';

const router = Router();

// Council Endpoint
router.post('/council/consult', async (req, res) => {
  const { topic } = req.body;
  try {
    const result = await CouncilService.consult(topic);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Graph Endpoint
router.get('/graph', async (req, res) => {
  try {
    const rootDir = path.resolve(__dirname, '../../..'); // Project Root
    const graph = await CodeGraphService.generateGraph(rootDir);
    res.json(graph);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
