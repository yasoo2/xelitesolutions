
import { request } from 'http';
import { Run } from '../../shared/models/run';
import { Message } from '../../shared/models/message';
import { ToolExecution } from '../../shared/models/toolExecution';
import { Session } from '../../shared/models/session';
import { broadcast, broadcastThinkingDetail } from '../../api/ws';
import { executeTool } from './ToolService';

import { getSessionRunConfig, popPendingTool, setSessionRunConfig, setSessionSecret, setUserSecretEncrypted, setPendingTool } from './secrets';
import { redactToolInputForStorage, safeErrorMessage, redactSecretsFromString } from '../../shared/utils/redaction';
import { planNextStep } from '../../core/llm';
import { summarizeBrowserOutputForChat, inferSiteLabel, extractTitleFromHtml, sanitizeToolResultForBroadcast } from '../../shared/utils/browserUtils';
import mongoose from 'mongoose';


function useMock(): boolean {
    return String(process.env.USE_MOCK || '').trim().toLowerCase() === 'true';
}

const offlineMode = process.env.OFFLINE_MODE === 'true';



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

const calculateHash = (text: string) => {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(text).digest('hex');
};

async function isMessageDuplicate(sessionId: string, text: string): Promise<boolean> {
    if (offlineMode) return false;
    try {
        const history = await Message.find({ sessionId, role: 'assistant' })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();
        if (!history.length) return false;
        const newHash = calculateHash(text);
        return history.some(m => calculateHash(String(m.content || '')) === newHash);
    } catch {
        return false;
    }
}

export class AgentLoopService {

    static async handlePendingToolExecution(sessionId: string, userId: string | undefined) {
        const pending = await popPendingTool(sessionId);
        if (!pending) return { ok: true, noOp: true };

        // Update Run Status
        try { if (!offlineMode) await Run.findByIdAndUpdate(pending.runId, { $set: { status: 'running' } }); } catch { }

        const persistedInput = redactToolInputForStorage(pending.name, pending.input);
        broadcast({ type: 'step_started', runId: pending.runId, data: { name: `execute:${pending.name}`, input: persistedInput } });

        const callInput =
            userId && pending.input && typeof pending.input === 'object' ? { ...(pending.input as any), userId: String(userId) } : pending.input;

        console.log(`[AgentLoop] Executing ${pending.name} for session ${sessionId}`);
        const cfg = getSessionRunConfig(sessionId);
        const workspaceId =
            typeof pending.workspaceId === 'string' && pending.workspaceId.trim()
                ? pending.workspaceId.trim()
                : typeof cfg?.workspaceId === 'string' && cfg.workspaceId.trim()
                    ? cfg.workspaceId.trim()
                    : undefined;
        const result = await executeTool(pending.name, callInput, { sessionId, workspaceId, userId: userId ? String(userId) : undefined });

        const eventResult = sanitizeToolResultForBroadcast(pending.name, result);

        broadcast({ type: result.ok ? 'step_done' : 'step_failed', runId: pending.runId, data: { name: `execute:${pending.name}`, result: eventResult } });

        const assistantText = AgentLoopService.formatToolOutputToText(pending.name, result, pending.input);

        const isDup = await isMessageDuplicate(sessionId, assistantText);
        if (!isDup) {
            broadcast({ type: 'text', runId: pending.runId, data: assistantText });
        }

        try {
            if (!offlineMode) {
                await ToolExecution.create({
                    runId: pending.runId,
                    sessionId,
                    name: pending.name || 'unknown',
                    input: persistedInput,
                    output: result.output, // Use raw output for DB, not sanitized
                    ok: result.ok,
                    logs: result.logs,
                });
            }
        } catch { }
        if (!isDup) {
            try {
                if (!offlineMode) await Message.create({ sessionId, role: 'assistant', content: assistantText, runId: pending.runId });
            } catch { }
        }
        try { if (!offlineMode) await Run.findByIdAndUpdate(pending.runId, { $set: { status: result.ok ? 'done' : 'failed' } }); } catch { }

        broadcast({ type: 'run_finished', runId: pending.runId, data: { runId: pending.runId, ok: result.ok } });

        const runCfg = getSessionRunConfig(sessionId);
        let kind = 'chat';
        if (runCfg?.kind) kind = runCfg.kind;
        try {
            if (!offlineMode) {
                const s = await Session.findById(sessionId).select({ kind: 1 }).lean();
                if (s?.kind === 'agent') kind = 'agent';
            }
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
            if (toolName === 'shell_execute' || toolName === 'run_command') {
                const out = typeof r?.output?.stdout === 'string' ? r.output.stdout.trim() :
                    typeof r?.output === 'string' ? r.output : '';
                const head = out ? out.slice(0, 1000) + (out.length > 1000 ? '... [Truncated]' : '') : '(no output)';
                return `✅ Command Executed.\nOutput:\n${head}`;
            }
            if (toolName === 'grep_search' || toolName === 'search_files') {
                const count = r?.output?.count || 0;
                const matches = Array.isArray(r?.output?.matches) ? r.output.matches.join('\n') : '';
                if (count === 0) return `🔍 No matches found for your search.`;
                return `🔍 Found ${count} match(es):\n${matches.slice(0, 1000)}${matches.length > 1000 ? '\n... [Remaining results hidden]' : ''}`;
            }
            if (toolName === 'ls' || toolName === 'inspect_directory') {
                const items = Array.isArray(r?.output?.items) ? r.output.items.join(', ') :
                    typeof r?.output === 'string' ? r.output : '';
                return `📂 Directory Listing:\n${items.slice(0, 500)}${items.length > 500 ? '... [Truncated]' : ''}`;
            }

            const outStr = typeof r?.output?.output === 'string' ? r.output.output :
                typeof r?.output?.text === 'string' ? r.output.text :
                    r?.output && typeof r.output === 'object' ? JSON.stringify(r.output, null, 2).slice(0, 1000) :
                        'Done';
            return outStr;
        } else {
            const err = typeof r?.error === 'string' ? r.error : 'Execution failed';
            return `❌ ${toolName}: ${err}`;
        }
    }

    // This is the core logic recovered from sessions.ts
    static async continueAgentLoop(sessionId: string, initialRunId: string, userId?: string): Promise<ContinueResult | void> {
        console.log(`[AgentLoop] Starting recursive loop for ${sessionId}`);

        let steps = 0;
        const runCfg = getSessionRunConfig(sessionId);
        const isPerpetual = runCfg?.kind === 'agent' || runCfg?.perpetual === true;
        const MAX_STEPS = isPerpetual ? 50 : 10; // Reduced from 500 to prevent runaway loops

        // Circuit Breaker State (Wakil 4.1)
        let lastErrorHash: string | null = null;
        let consecutiveFailures = 0;
        let lastToolSignature: string | null = null;
        const blacklist = new Set<string>(); // Wakil 4.4: Task-level blacklist

        let currentRunId = initialRunId;

        while (steps < MAX_STEPS) {
            steps++;
            // 1. Fetch History
            let messages: any[] = [];
            if (!offlineMode) {
                messages = await Message.find({ sessionId }).sort({ createdAt: 1 }).lean();
            }

            // 2. Plan Next Step (LLM)
            const msgsForLLM = messages.map(m => ({ role: m.role || 'user', content: String(m.content || '') }));

            // Check run config
            const runCfg = getSessionRunConfig(sessionId);
            let workspaceId =
                typeof runCfg?.workspaceId === 'string' && runCfg.workspaceId.trim() ? runCfg.workspaceId.trim() : undefined;
            if (!workspaceId && !useMock() && !offlineMode) {
                try {
                    const s = await Session.findById(sessionId).select({ workspaceId: 1 }).lean();
                    const wsObj: any = (s as any)?.workspaceId;
                    const wsStr = wsObj ? String(wsObj) : '';
                    if (wsStr.trim()) workspaceId = wsStr.trim();
                } catch { }
            }

            let plan;
            try {
                // Pass full context to planNextStep
                plan = await planNextStep(msgsForLLM, {
                    model: runCfg?.model,
                    userId,
                    sessionId,
                    workspaceId,
                    onProgress: (p) => {
                        broadcastThinkingDetail(sessionId, `> ${p}`);
                    },
                    onThought: (t) => {
                        broadcastThinkingDetail(sessionId, t);
                    }
                });
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

            // 3. Check for blocking conditions (Secrets, Approvals)

            // 4. Create New Run for this step (or reuse?)
            // It's cleaner to create a new Run for each autonomous step, or append to the same "Chain"?
            // Original logic re-used `pending.runId` if called from callback?
            // Actually, `processAgentLoop` creates a NEW run usually.

            // Let's create a new run for the autonomous step
            let newRunId: string;
            if (offlineMode) {
                newRunId = `offline-run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            } else {
                const r = await Run.create({ sessionId, status: 'running' });
                newRunId = (r as any)._id.toString();
            }
            currentRunId = newRunId; // Update tracking context

            // 5. State-Change & Blacklist Protection (Wakil 4.4)
            const inputStr = JSON.stringify(plan.input || {});
            const currentSignature = `${plan.name}:${inputStr}`;

            if (blacklist.has(currentSignature) || currentSignature === lastToolSignature) {
                const abortMsg = blacklist.has(currentSignature)
                    ? `⚠️ Blacklisted: Refusing to repeat previously forbidden/failed action \`${plan.name}\`.`
                    : `⚠️ No State Change: Refusing to repeat \`${plan.name}\` with identical input.`;

                broadcast({ type: 'text', runId: currentRunId, data: abortMsg });
                try {
                    if (!offlineMode) await Message.create({ sessionId, role: 'assistant', content: abortMsg, runId: currentRunId });
                } catch { }
                break;
            }
            lastToolSignature = currentSignature;

            // 6. Execute Tool
            const persistedInput = redactToolInputForStorage(plan.name, plan.input);
            broadcast({ type: 'step_started', runId: newRunId, data: { name: `execute:${plan.name}`, input: persistedInput } });

            const callInput = userId && plan.input && typeof plan.input === 'object' ? { ...(plan.input as any), userId: String(userId) } : plan.input;

            let result;
            try {
                result = await executeTool(plan.name, callInput, { sessionId, workspaceId, userId: userId ? String(userId) : undefined });
            } catch (e: any) {
                result = { ok: false, error: e.message };
            }

            // [Wakil] Construct final context-aware text (Include Reasoning)
            let assistantText = AgentLoopService.formatToolOutputToText(plan.name, result, plan.input);
            if (plan.reasoning) {
                assistantText = `> Thought: ${plan.reasoning}\n\n${assistantText}`;
            }

            // 6. Circuit Breaker Logic
            if (!result.ok) {
                const currentError = typeof result.error === 'string' ? result.error : 'Unknown Error';
                const errorHash = calculateHash(`${plan.name}:${currentError}`);

                if (errorHash === lastErrorHash) {
                    consecutiveFailures++;
                } else {
                    consecutiveFailures = 1;
                    lastErrorHash = errorHash;
                }

                if (consecutiveFailures >= (isPerpetual ? 5 : 3)) { // Allow 3 retries before tripping (was 1)
                    blacklist.add(currentSignature); // Wakil 4.4: Add failing signature to blacklist
                    console.error(`[AgentLoop] Blacklisted failing action: ${currentSignature}`);
                    console.error(`[AgentLoop] Circuit Breaker Tripped: Consecutive failure for ${plan.name}`);
                    const abortMsg = `⚠️ Max retries exceeded for \`${plan.name}\`. Aborting to prevent infinite loop.`;
                    broadcast({ type: 'text', runId: newRunId, data: abortMsg });
                    try {
                        if (!offlineMode) await Message.create({ sessionId, role: 'assistant', content: abortMsg, runId: newRunId });
                    } catch { }
                    break;
                }
            } else {
                lastErrorHash = null;
                consecutiveFailures = 0;
            }

            // 7. Handle Result & Deduplication
            const eventResult = sanitizeToolResultForBroadcast(plan.name, result);
            broadcast({ type: result.ok ? 'step_done' : 'step_failed', runId: newRunId, data: { name: `execute:${plan.name}`, result: eventResult } });

            const isDup = await isMessageDuplicate(sessionId, assistantText);

            if (isDup) {
                console.log(`[AgentLoop] Skipping duplicate response: ${calculateHash(assistantText)}`);
            } else {
                broadcast({ type: 'text', runId: newRunId, data: assistantText });
            }

            // Save
            try {
                if (!offlineMode) {
                    await ToolExecution.create({
                        runId: newRunId,
                        sessionId,
                        name: plan.name || 'unknown',
                        input: persistedInput,
                        output: result.output,
                        ok: result.ok,
                        logs: result.logs,
                    });
                }
            } catch { }
            if (!isDup) {
                try {
                    if (!offlineMode) await Message.create({ sessionId, role: 'assistant', content: assistantText, runId: newRunId });
                } catch { }
            }
            try { if (!offlineMode) await Run.findByIdAndUpdate(newRunId, { $set: { status: result.ok ? 'done' : 'failed' } }); } catch { }

            // If tool failed, let the LLM see the error and attempt recovery
            // DO NOT break immediately — the error is now in the message history
            // The LLM will analyze it and decide whether to fix or abort
            if (!result.ok) {
                console.log(`[AgentLoop] Tool '${plan.name}' failed. Letting LLM attempt self-recovery...`);
                // Continue the loop — the next iteration will call planNextStep
                // with the error in the conversation, allowing the LLM to diagnose and fix
                continue;
            }

            // If echo or final answer, done.
            if (plan.name === 'echo' || plan.name === 'job_complete') {
                break;
            }
        }
    }
}
