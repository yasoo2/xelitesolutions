"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const store_1 = require("../mock/store");
const run_1 = require("../models/run");
const toolExecution_1 = require("../models/toolExecution");
const artifact_1 = require("../models/artifact");
const router = (0, express_1.Router)();
router.get('/:id', async (req, res) => {
    const id = String(req.params.id);
    const useMock = process.env.MOCK_DB === '1' || mongoose_1.default.connection.readyState !== 1;
    if (useMock) {
        const run = store_1.store.listRuns().find(r => r.id === id);
        if (!run)
            return res.status(404).json({ error: 'Run not found' });
        const execs = store_1.store.listExecs(id);
        const artifacts = store_1.store.listArtifacts(id);
        return res.json({ run, execs, artifacts });
    }
    else {
        const run = await run_1.Run.findById(id).lean();
        if (!run)
            return res.status(404).json({ error: 'Run not found' });
        const execs = await toolExecution_1.ToolExecution.find({ runId: id }).lean();
        const artifacts = await artifact_1.Artifact.find({ runId: id }).lean();
        return res.json({ run, execs, artifacts });
    }
});
exports.default = router;
