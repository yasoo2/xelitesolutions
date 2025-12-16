"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mongoose_1 = __importDefault(require("mongoose"));
const ws_1 = require("../ws");
const registry_1 = require("../tools/registry");
const store_1 = require("../mock/store");
const toolExecution_1 = require("../models/toolExecution");
const artifact_1 = require("../models/artifact");
const approval_1 = require("../models/approval");
const run_1 = require("../models/run");
const router = (0, express_1.Router)();
function pickToolFromText(text) {
    const t = text.toLowerCase();
    const urlMatch = text.match(/https?:\/\/\S+/);
    if (t.includes('fetch') && urlMatch)
        return { name: 'http_fetch', input: { url: urlMatch[0] } };
    if (t.includes('write'))
        return { name: 'file_write', input: { filename: 'note.txt', content: text } };
    if (t.includes('browser') && urlMatch)
        return { name: 'browser_snapshot', input: { url: urlMatch[0] } };
    return { name: 'echo', input: { text } };
}
function detectRisk(text) {
    const risky = /(rm\s+-rf|delete|drop\s+table|shutdown|kill\s+process)/i;
    if (risky.test(text)) {
        return 'HIGH: instruction matches destructive pattern';
    }
    return null;
}
router.post('/start', async (req, res) => {
    const { text, sessionId } = req.body || {};
    const ev = (e) => (0, ws_1.broadcast)(e);
    const useMock = process.env.MOCK_DB === '1' || mongoose_1.default.connection.readyState !== 1;
    ev({ type: 'step_started', data: { name: 'plan' } });
    const plan = pickToolFromText(String(text || ''));
    ev({ type: 'step_done', data: { name: 'plan', plan } });
    let runId;
    if (useMock) {
        const run = store_1.store.createRun(sessionId);
        runId = run.id;
        store_1.store.addStep(runId, 'plan', 'done');
    }
    else {
        const run = await run_1.Run.create({ sessionId, status: 'running', steps: [{ name: 'plan', status: 'done' }] });
        runId = run._id.toString();
    }
    const risk = detectRisk(String(text || ''));
    if (risk) {
        if (useMock) {
            const ap = store_1.store.createApproval(runId, String(text || ''), risk, plan.name, plan.input);
            ev({ type: 'approval_required', data: { id: ap.id, runId, risk, action: text } });
            store_1.store.updateRun(runId, { status: 'blocked' });
            // store plan context for continuation
            const { planContext } = await Promise.resolve().then(() => __importStar(require('../approvals/context')));
            planContext.set(ap.id, { runId, name: plan.name, input: plan.input });
            return res.json({ runId, blocked: true, approvalId: ap.id });
        }
        else {
            const ap = await approval_1.Approval.create({ runId, action: String(text || ''), risk, status: 'pending' });
            ev({ type: 'approval_required', data: { id: ap._id.toString(), runId, risk, action: text } });
            await run_1.Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } });
            const { planContext } = await Promise.resolve().then(() => __importStar(require('../approvals/context')));
            planContext.set(ap._id.toString(), { runId, name: plan.name, input: plan.input });
            return res.json({ runId, blocked: true, approvalId: ap._id.toString() });
        }
    }
    ev({ type: 'step_started', data: { name: `execute:${plan.name}` } });
    const result = await (0, registry_1.executeTool)(plan.name, plan.input);
    if (result.logs?.length) {
        for (const line of result.logs) {
            ev({ type: 'evidence_added', data: { kind: 'log', text: line } });
        }
    }
    ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${plan.name}`, result } });
    if (useMock) {
        store_1.store.addExec(runId, plan.name, plan.input, result.output, result.ok, result.logs);
        if (result.artifacts) {
            for (const a of result.artifacts) {
                store_1.store.addArtifact(runId, a.name, a.href);
                ev({ type: 'artifact_created', data: { name: a.name, href: a.href } });
                ev({ type: 'evidence_added', data: { kind: 'artifact', name: a.name, href: a.href } });
            }
        }
        store_1.store.updateRun(runId, { status: result.ok ? 'done' : 'failed' });
    }
    else {
        await toolExecution_1.ToolExecution.create({ runId, name: plan.name, input: plan.input, output: result.output, ok: result.ok, logs: result.logs });
        if (result.artifacts) {
            for (const a of result.artifacts) {
                await artifact_1.Artifact.create({ runId, name: a.name, href: a.href });
                ev({ type: 'artifact_created', data: { name: a.name, href: a.href } });
                ev({ type: 'evidence_added', data: { kind: 'artifact', name: a.name, href: a.href } });
            }
        }
        await run_1.Run.findByIdAndUpdate(runId, { $set: { status: result.ok ? 'done' : 'failed' }, $push: { steps: { name: `execute:${plan.name}`, status: result.ok ? 'done' : 'failed' } } });
    }
    ev({ type: 'run_finished', data: { runId, ok: result.ok } });
    // persist messages if sessionId provided
    try {
        if (sessionId) {
            const useMock2 = process.env.MOCK_DB === '1' || mongoose_1.default.connection.readyState !== 1;
            if (useMock2) {
                store_1.store.addMessage(sessionId, 'user', String(text || ''));
                store_1.store.addMessage(sessionId, 'assistant', result.output ? JSON.stringify(result.output).slice(0, 512) : String(result.error || ''));
            }
            else {
                const { Message } = await Promise.resolve().then(() => __importStar(require('../models/message')));
                await Message.create({ sessionId, role: 'user', content: String(text || '') });
                await Message.create({ sessionId, role: 'assistant', content: result.output ? JSON.stringify(result.output).slice(0, 512) : String(result.error || '') });
            }
        }
    }
    catch { }
    res.json({ runId, result });
});
router.get('/', async (_req, res) => {
    const useMock = process.env.MOCK_DB === '1' || mongoose_1.default.connection.readyState !== 1;
    if (useMock) {
        res.json({ runs: store_1.store.listRuns() });
    }
    else {
        const runs = await run_1.Run.find().lean();
        res.json({ runs });
    }
});
exports.default = router;
