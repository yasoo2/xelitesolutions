
import { request } from 'http';
import { Run } from '../models/run';
import { Message } from '../models/message';
import { ToolExecution } from '../models/toolExecution';
import { Session } from '../models/session';
import { broadcast } from '../ws';
import { executeTool } from '../services/ToolService';

import { getSessionRunConfig, popPendingTool, setSessionRunConfig, setSessionSecret, setUserSecretEncrypted, setPendingTool } from '../services/secrets';
import { redactToolInputForStorage, safeErrorMessage, redactSecretsFromString } from '../utils/redaction';
import { planNextStep } from '../llm';
import { summarizeBrowserOutputForChat, inferSiteLabel, extractTitleFromHtml, sanitizeToolResultForBroadcast } from '../utils/browserUtils';
import mongoose from 'mongoose';



interface ContinueResult {
    done?: boolean;
    ok?: boolean;
    blocked?: boolean;
    approvalId?: string;
    secretRequired?: boolean;
    secret?: any;
    error?: string;
    steps?: number;
}

export class AgentLoopService {

    static async handlePendingToolExecution(sessionId: string, userId: string | undefined) {
        const pending = popPendingTool(sessionId);
        if (!pending) return { ok: true, noOp: true };

        // Update Run Status
        try { await Run.findByIdAndUpdate(pending.runId, { $set: { status: 'running' } }); } catch { }

        const persistedInput = redactToolInputForStorage(pending.name, pending.input);
        broadcast({ type: 'step_started', runId: pending.runId, data: { name: `execute:${pending.name}`, input: persistedInput } });

        const callInput =
            userId && pending.input && typeof pending.input === 'object' ? { ...(pending.input as any), userId: String(userId) } : pending.input;

        console.log(`[AgentLoop] Executing ${pending.name} for session ${sessionId}`);
        const result = await executeTool(pending.name, callInput, { sessionId });

        const eventResult = sanitizeToolResultForBroadcast(pending.name, result);

        broadcast({ type: result.ok ? 'step_done' : 'step_failed', runId: pending.runId, data: { name: `execute:${pending.name}`, result: eventResult } });

        const assistantText = AgentLoopService.formatToolOutputToText(pending.name, result, pending.input);

        // Don't broadcast text immediately if it's large, maybe? Original did usage of assistantTextEmitted check. 
        // We will broadcast it for now.
        broadcast({ type: 'text', runId: pending.runId, data: assistantText });

        try {
            await ToolExecution.create({
                runId: pending.runId,
                sessionId,
                name: pending.name || 'unknown',
                input: persistedInput,
                output: result.output, // Use raw output for DB, not sanitized
                ok: result.ok,
                logs: result.logs,
            });
        } catch { }
        try {
            await Message.create({ sessionId, role: 'assistant', content: assistantText, runId: pending.runId });
        } catch { }
        try { await Run.findByIdAndUpdate(pending.runId, { $set: { status: result.ok ? 'done' : 'failed' } }); } catch { }

        broadcast({ type: 'run_finished', runId: pending.runId, data: { runId: pending.runId, ok: result.ok } });

        const runCfg = getSessionRunConfig(sessionId);
        let kind = 'chat';
        if (runCfg?.kind) kind = runCfg.kind;
        try {
            const s = await Session.findById(sessionId).select({ kind: 1 }).lean();
            if (s?.kind === 'agent') kind = 'agent';
        } catch { }


        if (kind === 'agent' && result.ok) {
            // FIRE AND FORGET - Continue Execution Background
            AgentLoopService.continueAgentLoop(sessionId, pending.runId, userId);
        }

        return { ok: true, result };
    }

    private static formatToolOutputToText(toolName: string, r: any, input: any): string {
        if (r?.ok) {
            if (toolName === 'github_create_repo') {
                return `✅ Repo created: ${r?.output?.fullName || ''}\n${r?.output?.htmlUrl || ''}`;
            }
            if (toolName === 'shell_execute') {
                const out = typeof r?.output?.stdout === 'string' ? r.output.stdout.trim() : '';
                const head = out ? out.slice(0, 500) + (out.length > 500 ? '...' : '') : '(no output)';
                return `✅ Command Executed.\nOutput:\n${head}`;
            }
            const outStr = typeof r?.output?.output === 'string' ? r.output.output :
                typeof r?.output?.text === 'string' ? r.output.text :
                    JSON.stringify(r?.output || 'Done');
            return outStr;
        } else {
            return `❌ Tool Failed: ${typeof r?.error === 'string' ? r.error : 'Unknown Error'}`;
        }
    }

    // This is the core logic recovered from sessions.ts
    static async continueAgentLoop(sessionId: string, initialRunId: string, userId?: string): Promise<ContinueResult | void> {
        console.log(`[AgentLoop] Starting recursive loop for ${sessionId}`);

        let steps = 0;
        const MAX_STEPS = 20;

        // Loop Context
        let currentRunId = initialRunId; // Logic might require creating NEW runs for each step, or reusing?
        // Original logic seemed to create ONE run for a user request, but if the agent continues autonomously,
        // it might reuse the run ID or create new ones?
        // Original continues using `pending.runId` in the recursive call.
        // Actually the original `continueAgent` function was called inside `executeTool` callback handling.
        // It creates a loop.

        // We will implement a simplified robust loop.

        while (steps < MAX_STEPS) {
            steps++;
            // 1. Fetch History
            let messages: any[] = [];
            messages = await Message.find({ sessionId }).sort({ createdAt: 1 }).lean();

            // 2. Plan Next Step (LLM)
            const msgsForLLM = messages.map(m => ({ role: m.role || 'user', content: String(m.content || '') }));

            // Check run config
            const runCfg = getSessionRunConfig(sessionId);

            broadcast({ type: 'thinking_start', runId: currentRunId, data: {} });

            let plan;
            try {
                // We need to pass the runConfig to planNextStep if needed (e.g. model selection)
                plan = await planNextStep(msgsForLLM, { model: runCfg?.model });
            } catch (e: any) {
                console.error('LLM Plan Error', e);
                broadcast({ type: 'text', runId: currentRunId, data: `Error planning next step: ${e.message}` });
                return;
            }

            if (!plan) {
                // No plan -> Done
                console.log(`[AgentLoop] No plan returned. Stopping.`);
                break;
            }

            if (plan.thought) {
                broadcast({ type: 'thought', runId: currentRunId, data: plan.thought });
            }


            // 3. Check for blocking conditions (Secrets, Approvals)

            // 4. Create New Run for this step (or reuse?)
            // It's cleaner to create a new Run for each autonomous step, or append to the same "Chain"?
            // Original logic re-used `pending.runId` if called from callback?
            // Actually, `processAgentLoop` creates a NEW run usually.

            // Let's create a new run for the autonomous step
            let newRunId: string;
            const r = await Run.create({ sessionId, status: 'running' });
            newRunId = (r as any)._id.toString();
            currentRunId = newRunId; // Update tracking context

            // 5. Execute Tool
            const persistedInput = redactToolInputForStorage(plan.name, plan.input);
            broadcast({ type: 'step_started', runId: newRunId, data: { name: `execute:${plan.name}`, input: persistedInput } });

            const callInput = userId && plan.input && typeof plan.input === 'object' ? { ...(plan.input as any), userId: String(userId) } : plan.input;

            let result;
            try {
                result = await executeTool(plan.name, callInput, { sessionId });
            } catch (e: any) {
                result = { ok: false, error: e.message };
            }

            // 6. Handle Result
            const eventResult = sanitizeToolResultForBroadcast(plan.name, result);
            broadcast({ type: result.ok ? 'step_done' : 'step_failed', runId: newRunId, data: { name: `execute:${plan.name}`, result: eventResult } });

            const assistantText = AgentLoopService.formatToolOutputToText(plan.name, result, plan.input);
            broadcast({ type: 'text', runId: newRunId, data: assistantText });

            // Save
            try {
                await ToolExecution.create({
                    runId: newRunId,
                    sessionId,
                    name: plan.name || 'unknown',
                    input: persistedInput,
                    output: result.output,
                    ok: result.ok,
                    logs: result.logs,
                });
            } catch { }
            try {
                await Message.create({ sessionId, role: 'assistant', content: assistantText, runId: newRunId });
            } catch { }
            try { await Run.findByIdAndUpdate(newRunId, { $set: { status: result.ok ? 'done' : 'failed' } }); } catch { }

            // If tool failed, maybe break?
            if (!result.ok) {
                console.log(`[AgentLoop] Tool failed. Stopping loop.`);
                break;
            }

            // If echo or final answer, done.
            if (plan.name === 'echo' || plan.name === 'job_complete') {
                break;
            }
        }
    }
}
