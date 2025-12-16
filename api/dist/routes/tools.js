"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const registry_1 = require("../tools/registry");
const ws_1 = require("../ws");
const router = (0, express_1.Router)();
router.get('/', async (_req, res) => {
    res.json({ count: registry_1.tools.length, tools: registry_1.tools });
});
router.post('/run', async (req, res) => {
    const steps = [
        { type: 'step_started', data: { name: 'plan' } },
        { type: 'step_done', data: { name: 'plan' } },
        { type: 'step_started', data: { name: 'execute:echo' } },
    ];
    steps.forEach(ev => (0, ws_1.broadcast)(ev));
    const result = await (0, registry_1.executeTool)('echo', { text: String(req.body?.text ?? 'hello') });
    (0, ws_1.broadcast)({ type: result.ok ? 'step_done' : 'step_failed', data: { name: 'execute:echo', result } });
    res.json(result);
});
router.post('/:name/execute', async (req, res) => {
    const name = String(req.params.name);
    const result = await (0, registry_1.executeTool)(name, req.body || {});
    res.json(result);
});
exports.default = router;
