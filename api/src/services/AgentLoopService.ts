
import { request } from 'http';
import { Run } from '../models/run';
import { Message } from '../models/message';
import { ToolExecution } from '../models/toolExecution';
import { Session } from '../models/session';
import { broadcast, broadcastThinkingDetail } from '../ws';
import { executeTool } from '../services/ToolService';

import { getSessionRunConfig, popPendingTool, setSessionRunConfig, setSessionSecret, setUserSecretEncrypted, setPendingTool } from '../services/secrets';
import { redactToolInputForStorage, safeErrorMessage, redactSecretsFromString } from '../utils/redaction';
import { planNextStep } from '../llm';
import { summarizeBrowserOutputForChat, inferSiteLabel, extractTitleFromHtml, sanitizeToolResultForBroadcast } from '../utils/browserUtils';
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
        const result = await executeTool(pending.name, callInput, { sessionId, workspaceId });

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
        const MAX_STEPS = isPerpetual ? 200 : 50; // Upgraded: Allow more steps for complex engineering tasks

        // Circuit Breaker State (Wakil 4.1 - Enhanced)
        let lastErrorHash: string | null = null;
        let consecutiveFailures = 0;
        let lastToolSignature: string | null = null;
        let consecutiveIdenticalTools = 0;
        const blacklist = new Set<string>(); // Wakil 4.4: Task-level blacklist
        const toolHistory: Array<{ name: string; ok: boolean; timestamp: number }> = []; // Track tool execution history for smart recovery

        let currentRunId = initialRunId;

        while (steps < MAX_STEPS) {
            steps++;
            // 1. Fetch History
            let messages: any[] = [];
            if (!offlineMode) {
                messages = await Message.find({ sessionId }).sort({ createdAt: 1 }).lean();
            }

            // 2. Plan Next Step (LLM) — with Smart Context Summarization
            let msgsForLLM = messages.map(m => ({ role: m.role || 'user', content: String(m.content || '') }));

            // Smart Context Window: Summarize old messages to prevent context overflow
            if (msgsForLLM.length > 30) {
                const userGoal = msgsForLLM.find(m => m.role === 'user');
                const recentMessages = msgsForLLM.slice(-20);
                const olderMessages = msgsForLLM.slice(0, -20);

                // Build a summary of older tool executions
                const toolActions = olderMessages
                    .filter(m => m.content.includes('execute:') || m.content.includes('Tool Call:') || m.content.includes('✅') || m.content.includes('❌'))
                    .map(m => {
                        const content = m.content.slice(0, 150);
                        return content;
                    });

                const summaryText = `## Previous Actions Summary (${olderMessages.length} messages summarized):\n` +
                    (toolActions.length > 0 ? toolActions.join('\n') : 'No significant tool actions in older messages.');

                msgsForLLM = [
                    ...(userGoal ? [userGoal] : []),
                    { role: 'assistant' as const, content: summaryText },
                    ...recentMessages
                ];
            }

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

            if (blacklist.has(currentSignature)) {
                const abortMsg = `⚠️ Blacklisted: Refusing to repeat previously forbidden/failed action \`${plan.name}\`. Pivoting strategy...`;
                broadcast({ type: 'text', runId: currentRunId, data: abortMsg });
                try {
                    if (!offlineMode) await Message.create({ sessionId, role: 'assistant', content: abortMsg, runId: currentRunId });
                } catch { }
                // Don't break — let the LLM see the blacklist message and pivot to a different approach
                continue;
            }

            // Track consecutive identical tool calls (allow 2 retries before flagging)
            if (currentSignature === lastToolSignature) {
                consecutiveIdenticalTools++;
                if (consecutiveIdenticalTools >= 3) {
                    const pivotMsg = `⚠️ Loop Detected: \`${plan.name}\` called 3 times with identical input. Forcing strategy pivot.`;
                    broadcast({ type: 'text', runId: currentRunId, data: pivotMsg });
                    try {
                        if (!offlineMode) await Message.create({ sessionId, role: 'assistant', content: pivotMsg, runId: currentRunId });
                    } catch { }
                    blacklist.add(currentSignature);
                    consecutiveIdenticalTools = 0;
                    continue;
                }
            } else {
                consecutiveIdenticalTools = 0;
            }
            lastToolSignature = currentSignature;

            // 6. Execute Tool
            const persistedInput = redactToolInputForStorage(plan.name, plan.input);
            broadcast({ type: 'step_started', runId: newRunId, data: { name: `execute:${plan.name}`, input: persistedInput } });

            const callInput = userId && plan.input && typeof plan.input === 'object' ? { ...(plan.input as any), userId: String(userId) } : plan.input;

            let result;
            try {
                result = await executeTool(plan.name, callInput, { sessionId, workspaceId });
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

                if (consecutiveFailures >= (isPerpetual ? 8 : 5)) { // Enhanced: Allow more retries for complex tasks
                    blacklist.add(currentSignature); // Wakil 4.4: Add failing signature to blacklist
                    console.error(`[AgentLoop] Blacklisted failing action: ${currentSignature}`);
                    console.error(`[AgentLoop] Circuit Breaker Tripped: Consecutive failure for ${plan.name}`);
                    const recoveryMsg = `⚠️ Tool \`${plan.name}\` failed ${consecutiveFailures} times. Blacklisting and attempting alternative approach...`;
                    broadcast({ type: 'text', runId: newRunId, data: recoveryMsg });
                    try {
                        if (!offlineMode) await Message.create({ sessionId, role: 'assistant', content: recoveryMsg, runId: newRunId });
                    } catch { }
                    // Don't break — let the LLM attempt recovery with the error context
                    continue;
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

            // Track tool execution for smart recovery
            toolHistory.push({ name: plan.name, ok: result.ok ?? false, timestamp: Date.now() });

            // If tool failed, let the LLM see the error and attempt recovery
            if (!result.ok) {
                const errorContext = typeof result.error === 'string' ? result.error : 'Unknown error';
                console.log(`[AgentLoop] Tool '${plan.name}' failed: ${errorContext.slice(0, 200)}. Letting LLM attempt self-recovery...`);

                // Inject recovery hint into the conversation
                const recentFailures = toolHistory.filter(t => !t.ok && Date.now() - t.timestamp < 60000);
                if (recentFailures.length >= 3) {
                    const recoveryHint = `🔧 Recovery Hint: ${recentFailures.length} tools failed in the last minute. Consider: 1) Check if the file/path exists, 2) Try a different approach, 3) Read error output carefully, 4) Use \`ls\` or \`project_detect\` to understand the current state.`;
                    broadcast({ type: 'text', runId: newRunId, data: recoveryHint });
                    try {
                        if (!offlineMode) await Message.create({ sessionId, role: 'assistant', content: recoveryHint, runId: newRunId });
                    } catch { }
                }
                continue;
            }

            // If echo or final answer, done.
            if (plan.name === 'echo' || plan.name === 'job_complete') {
                break;
            }
        }
    }
}
