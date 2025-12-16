"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const approval_1 = require("../models/approval");
const ws_1 = require("../ws");
const store_1 = require("../mock/store");
const context_1 = require("../approvals/context");
const registry_1 = require("../tools/registry");
const run_1 = require("../models/run");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.post('/:id/decision', auth_1.authenticate, async (req, res) => {
    const id = String(req.params.id);
    const { decision } = req.body || {};
    if (!['approved', 'denied'].includes(String(decision)))
        return res.status(400).json({ error: 'Invalid decision' });
    const useMock = process.env.MOCK_DB === '1' || mongoose_1.default.connection.readyState !== 1;
    const ctx = context_1.planContext.get(id);
    if (useMock) {
        const a = store_1.store.updateApproval(id, { status: decision });
        if (!a || !ctx)
            return res.status(404).json({ error: 'Approval not found' });
        (0, ws_1.broadcast)({ type: 'approval_result', data: { id, decision } });
        if (decision === 'approved') {
            (0, ws_1.broadcast)({ type: 'step_started', data: { name: `execute:${ctx.name}` } });
            const result = await (0, registry_1.executeTool)(ctx.name, ctx.input);
            (0, ws_1.broadcast)({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${ctx.name}`, result } });
            if (result.artifacts) {
                for (const a of result.artifacts) {
                    store_1.store.addArtifact(ctx.runId, a.name, a.href);
                    (0, ws_1.broadcast)({ type: 'artifact_created', data: { name: a.name, href: a.href } });
                }
            }
            store_1.store.updateRun(ctx.runId, { status: result.ok ? 'done' : 'failed' });
            (0, ws_1.broadcast)({ type: 'run_finished', data: { runId: ctx.runId, ok: result.ok } });
            context_1.planContext.delete(id);
            return res.json({ ok: true, result });
        }
        else {
            store_1.store.updateRun(ctx.runId, { status: 'denied' });
            (0, ws_1.broadcast)({ type: 'run_finished', data: { runId: ctx.runId, ok: false } });
            context_1.planContext.delete(id);
            return res.json({ ok: true, denied: true });
        }
    }
    else {
        const a = await approval_1.Approval.findByIdAndUpdate(id, { $set: { status: decision } }, { new: true });
        if (!a || !ctx)
            return res.status(404).json({ error: 'Approval not found' });
        (0, ws_1.broadcast)({ type: 'approval_result', data: { id, decision } });
        if (decision === 'approved') {
            (0, ws_1.broadcast)({ type: 'step_started', data: { name: `execute:${ctx.name}` } });
            const result = await (0, registry_1.executeTool)(ctx.name, ctx.input);
            (0, ws_1.broadcast)({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${ctx.name}`, result } });
            if (result.artifacts) {
                // Persist artifacts in DB using Artifact model if needed
            }
            await run_1.Run.findByIdAndUpdate(ctx.runId, { $set: { status: result.ok ? 'done' : 'failed' } });
            (0, ws_1.broadcast)({ type: 'run_finished', data: { runId: ctx.runId, ok: result.ok } });
            context_1.planContext.delete(id);
            return res.json({ ok: true, result });
        }
        else {
            await run_1.Run.findByIdAndUpdate(ctx.runId, { $set: { status: 'denied' } });
            (0, ws_1.broadcast)({ type: 'run_finished', data: { runId: ctx.runId, ok: false } });
            context_1.planContext.delete(id);
            return res.json({ ok: true, denied: true });
        }
    }
});
exports.default = router;
