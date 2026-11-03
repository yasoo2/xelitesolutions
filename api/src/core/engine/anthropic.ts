/**
 * THE CLAUDE CONNECTOR: the engine's loop driven by a Claude model through
 * the official SDK, with tools, prompt caching and a hard budget.
 *
 * Why its own path, and not the router's 'anthropic' route:
 *  - The router reads ANTHROPIC_API_KEY from the environment and, with
 *    AI_COST_POLICY=allow_paid, spends it on calls nothing here can see.
 *    This connector takes its key from JOE_ENGINE_ANTHROPIC_KEY_FILE (or
 *    JOE_ENGINE_ANTHROPIC_API_KEY), names no other part of Joe reads, so
 *    the only spender is this file, and every call it makes passes the
 *    budget guard first (budget.ts).
 *  - The loop needs what only the native API gives: tool_use blocks, the
 *    model's thinking replayed unchanged, cache counts and the billed usage.
 *
 * How the conversation is sent, and why:
 *  - The system prompt is a block with a cache breakpoint. Tools render
 *    before it, so tools and system are one cached prefix. A top-level
 *    cache_control moves a second breakpoint to the end of the conversation
 *    on every call, so each step reads the previous steps from the cache
 *    (about a tenth of the input price) instead of paying for them again.
 *  - Each assistant turn is replayed as the API returned it (`native`),
 *    thinking blocks included. A thinking block stays valid only while every
 *    message before it is unchanged. When the history is edited (the loop
 *    compacts it), every thinking block already in it is dropped once, the
 *    documented recovery, and the turns after that keep theirs.
 *  - Consecutive tool results go back as one user message, results first,
 *    and a status line or screenshot the loop adds follows them in it.
 */
import { promises as fsp } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { estimateTokens } from './context';
import { costOf, keyLedger, ledgerFromEnv, priceRule, promptTokensOf, worstCaseCost, type BilledUsage, type SpendLedger } from './budget';
import type { ChatMessage, ContentPart, EngineModel, ModelStep, ToolCall, ToolSchema } from './types';

/** The part of the SDK client this file uses, so a test can hand in a fake. */
export interface AnthropicClientLike {
    messages: {
        stream(params: any, options?: { signal?: AbortSignal; timeout?: number }): {
            finalMessage(): Promise<any>;
            on(event: 'streamEvent', listener: (event: any) => void): unknown;
        };
    };
}

/**
 * The Claude models this connector runs, cheapest first. Each has a checked
 * price in budget.ts, and takes the request this file builds: adaptive
 * thinking, no forced tool choice, no prefill, no sampling parameters. A
 * model the account offers outside this list is shown but not run.
 */
export const CLAUDE_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1'] as const;

/** The model id, or its dated form, is one this connector runs. */
export function claudeModelRuns(id: string): boolean {
    const m = String(id || '').trim();
    return CLAUDE_MODELS.some(c => m === c || (m.startsWith(`${c}-`) && /^\d{8}$/.test(m.slice(c.length + 1))));
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AnthropicSettings {
    model: string;
    apiKey: string;
    /** Output room per call. Thinking counts against it. */
    maxTokens: number;
    /** The window the loop compacts within. */
    contextTokens: number;
    effort?: Effort;
    /** false turns thinking off where the model allows it. */
    thinking: boolean;
    cacheTtl: '5m' | '1h';
    vision: boolean;
}

const DEFAULT_MAX_TOKENS = 32_000;
/** Haiku 5.5 bills a whole request at five times the price once its prompt passes 100,000 tokens. */
const HAIKU_WINDOW = 90_000;
const DEFAULT_WINDOW = 128_000;
/** An image's input tokens, at most, for the worst-case price. */
const IMAGE_TOKENS_WORST = 10_000;
/** The estimate counts UTF-8 bytes over three; JSON and code can tokenise denser. */
const ESTIMATE_MARGIN = 1.25;

function positiveInt(v: string | undefined): number | undefined {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

/** `ANTHROPIC_API_KEY=...` (or the bare key) from a file the owner keeps outside the repository. */
export function keyFromFileText(text: string): string {
    for (const raw of String(text || '').replace(/^﻿/, '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const m = /^(?:export\s+)?(?:ANTHROPIC_API_KEY|JOE_ENGINE_ANTHROPIC_API_KEY)\s*=\s*(.*)$/.exec(line);
        const value = (m ? m[1] : line).trim().replace(/^(['"])(.*)\1$/, '$2').trim();
        if (value) return value;
    }
    return '';
}

/**
 * The connector's settings from the deployment, or why it cannot run. Reads
 * the key file, never logs the key.
 */
export async function anthropicSettings(env: NodeJS.ProcessEnv = process.env): Promise<AnthropicSettings | { error: string }> {
    const model = String(env.JOE_ENGINE_MODEL || '').trim();
    if (!model) return { error: 'JOE_ENGINE_PROVIDER is anthropic but JOE_ENGINE_MODEL is empty.' };
    if (!priceRule(model)) return { error: `No price is known for ${model}, so its spending cannot be guarded. Add it to the price table in budget.ts first.` };
    const apiKey = await serverClaudeKey(env);
    if (typeof apiKey !== 'string') return apiKey;
    const effortRaw = String(env.JOE_ENGINE_EFFORT || '').trim().toLowerCase();
    const effort = (['low', 'medium', 'high', 'xhigh', 'max'] as const).find(e => e === effortRaw);
    if (effortRaw && !effort) return { error: `JOE_ENGINE_EFFORT is ${effortRaw}; it takes low, medium, high, xhigh or max.` };
    const haiku = /^claude-haiku-5-5/.test(model);
    const contextTokens = positiveInt(env.JOE_ENGINE_CONTEXT_TOKENS) ?? (haiku ? HAIKU_WINDOW : DEFAULT_WINDOW);
    return {
        model, apiKey,
        maxTokens: positiveInt(env.JOE_ENGINE_MAX_TOKENS) ?? DEFAULT_MAX_TOKENS,
        contextTokens,
        effort,
        thinking: !/^(?:off|none|0|false)$/i.test(String(env.JOE_ENGINE_THINKING || '')),
        cacheTtl: /^1h$/i.test(String(env.JOE_ENGINE_CACHE_TTL || '').trim()) ? '1h' : '5m',
        vision: env.JOE_ENGINE_VISION == null ? true : /^(?:1|true|on|yes)$/i.test(env.JOE_ENGINE_VISION),
    };
}

/**
 * The server's own Claude key: JOE_ENGINE_ANTHROPIC_API_KEY, or the key file
 * JOE_ENGINE_ANTHROPIC_KEY_FILE names. Never ANTHROPIC_API_KEY, which the
 * router would spend outside the budget guard.
 */
export async function serverClaudeKey(env: NodeJS.ProcessEnv = process.env): Promise<string | { error: string }> {
    const direct = String(env.JOE_ENGINE_ANTHROPIC_API_KEY || '').trim();
    if (direct) return direct;
    const keyFile = String(env.JOE_ENGINE_ANTHROPIC_KEY_FILE || '').trim();
    if (!keyFile) return { error: 'The server has no Claude key (JOE_ENGINE_ANTHROPIC_KEY_FILE is not set).' };
    let key = '';
    try { key = keyFromFileText(await fsp.readFile(keyFile, 'utf8')); }
    catch (e: any) { return { error: `The key file ${keyFile} cannot be read (${e?.code || 'error'}).` }; }
    return key || { error: `The key file ${keyFile} holds no key. It needs one line: ANTHROPIC_API_KEY=...` };
}

/** What the interface sends when no key was typed: none of these is a key. */
const NOT_A_KEY = new Set(['', 'auto-mode', 'free-mode', 'free', 'dummy', 'ollama']);

/** Whose key a Claude call spends, and the ledger that guards it. */
export interface ClaudeAccount {
    apiKey: string;
    ledger: SpendLedger;
    whose: 'server' | 'user';
}

/**
 * THE KEY AND THE BUDGET FOR ONE CLAUDE CHOICE.
 *
 * Claude is paid: every call spends credit someone bought. So a call is made
 * only on a key someone chose to spend, and always through a ledger:
 *  - the key the user typed: their consent and their credit, on a ledger of
 *    its own (budget.ts keyLedger);
 *  - the server's key, only when asked for by name ('server-key'), on the
 *    deployment's budget, which is the owner's consent (ledgerFromEnv).
 * A typed key that IS the server's key is the server's, so the owner's
 * total holds whichever way it arrives.
 */
export async function claudeAccount(typedKey: string | undefined, env: NodeJS.ProcessEnv = process.env): Promise<ClaudeAccount | { error: string }> {
    const typed = String(typedKey || '').trim();
    const noKey = 'Claude was chosen without a key. Claude is paid: add your Claude API key in the provider settings.';
    if (typed !== 'server-key' && (NOT_A_KEY.has(typed) || /[^\x21-\x7E]/.test(typed))) return { error: noKey };
    const server = await serverClaudeKey(env);
    const serverKey = typeof server === 'string' ? server : '';
    if (typed !== 'server-key' && typed !== serverKey) return { apiKey: typed, ledger: keyLedger(typed, env), whose: 'user' };
    if (!serverKey) return { error: `${noKey} (${(server as { error: string }).error})` };
    const ledger = ledgerFromEnv(env);
    if ('error' in ledger) return { error: `Claude on the server's key needs the server's budget: ${ledger.error}` };
    return { apiKey: serverKey, ledger, whose: 'server' };
}

/**
 * The thinking setting the model accepts. Opus 5.5 cannot turn thinking off;
 * Sonnet 5.5 turns it off with `between_tools`; Haiku 5.5 with `disabled`.
 * Both refuse "off" at effort xhigh or max, so it stays on there.
 */
export function thinkingFor(model: string, on: boolean, effort?: Effort): Record<string, unknown> {
    const offAllowed = effort !== 'xhigh' && effort !== 'max';
    if (!on && offAllowed) {
        if (/^claude-sonnet-5-5/.test(model)) return { type: 'between_tools' };
        if (/^claude-haiku-5-5/.test(model)) return { type: 'disabled' };
    }
    return { type: 'adaptive' };
}

function dataUrlImage(url: string): { media_type: string; data: string } | undefined {
    const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/s.exec(String(url || ''));
    return m ? { media_type: m[1], data: m[2] } : undefined;
}

function argsObject(text: string): unknown {
    try {
        const v = JSON.parse(text || '{}');
        return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch { return {}; }
}

function isThinking(block: any): boolean {
    return block?.type === 'thinking' || block?.type === 'redacted_thinking';
}

/**
 * Joe's conversation in the Messages API's shape. Pure: the same input
 * always gives the same bytes, so the cached prefix stays the prefix.
 */
export function toAnthropicRequest(
    history: readonly ChatMessage[],
    opts: { dropThinking?: (m: ChatMessage) => boolean; cacheTtl?: '5m' | '1h' } = {},
): { system: any[]; messages: any[] } {
    const cache = opts.cacheTtl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' };
    const systemTexts: string[] = [];
    const out: { role: 'user' | 'assistant'; content: any[] }[] = [];
    const add = (role: 'user' | 'assistant', blocks: any[]) => {
        if (!blocks.length) return;
        const last = out[out.length - 1];
        if (last && last.role === role) last.content.push(...blocks);
        else out.push({ role, content: [...blocks] });
    };
    history.forEach((m, i) => {
        if (m.role === 'system') {
            //  The first system message is the cached system prompt. One that
            //  arrives later is an instruction in the conversation's place.
            if (i === 0 || !out.length) systemTexts.push(m.content);
            else add('user', [{ type: 'text', text: `<system-reminder>\n${m.content}\n</system-reminder>` }]);
            return;
        }
        if (m.role === 'user') {
            const parts: ContentPart[] = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
            const blocks: any[] = [];
            for (const p of parts) {
                if (p.type === 'text') { if (p.text) blocks.push({ type: 'text', text: p.text }); continue; }
                const img = dataUrlImage(p.image_url?.url);
                if (img) blocks.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
                else blocks.push({ type: 'text', text: '(An image was attached here in a form that cannot be shown.)' });
            }
            add('user', blocks.length ? blocks : [{ type: 'text', text: '(empty message)' }]);
            return;
        }
        if (m.role === 'tool') {
            add('user', [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content || '(no output)' }]);
            return;
        }
        //  assistant
        const native = Array.isArray(m.native) ? m.native as any[] : undefined;
        let blocks: any[];
        if (native && native.length) {
            blocks = opts.dropThinking?.(m) ? native.filter(b => !isThinking(b)) : native;
        } else {
            blocks = [];
            if (m.content) blocks.push({ type: 'text', text: m.content });
            for (const tc of m.tool_calls ?? []) blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: argsObject(tc.function.arguments) });
        }
        add('assistant', blocks.length ? blocks : [{ type: 'text', text: '(no reply)' }]);
    });
    //  The API's conversation starts with the user, and a conversation that
    //  ends on an assistant turn would be read as a prefill (refused by the
    //  newest models), so it always ends with the user too.
    if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', content: [{ type: 'text', text: '(start)' }] });
    if (out[out.length - 1].role === 'assistant') out.push({ role: 'user', content: [{ type: 'text', text: 'Continue.' }] });
    const system = systemTexts.length ? [{ type: 'text', text: systemTexts.join('\n\n'), cache_control: cache }] : [];
    return { system, messages: out };
}

export function toAnthropicTools(tools: ToolSchema[], streaming = true): any[] {
    return tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
        ...(streaming ? { eager_input_streaming: true } : {}),
    }));
}

/** The usage block as billed token counts. */
export function billedUsage(usage: any): BilledUsage {
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
    const created = n(usage?.cache_creation_input_tokens);
    const split = usage?.cache_creation;
    let w5 = n(split?.ephemeral_5m_input_tokens);
    let w1 = n(split?.ephemeral_1h_input_tokens);
    if (!w5 && !w1 && created) w5 = created;
    return { inputTokens: n(usage?.input_tokens), outputTokens: n(usage?.output_tokens), cacheReadTokens: n(usage?.cache_read_input_tokens), cacheWrite5mTokens: w5, cacheWrite1hTokens: w1 };
}

function requestTokens(request: { system: any[]; messages: any[]; tools?: any[] }): number {
    let images = 0;
    const json = JSON.stringify(request, (key, value) => {
        if (key === 'data' && typeof value === 'string' && value.length > 256) { images++; return ''; }
        return value;
    });
    return Math.ceil(estimateTokens(json) * ESTIMATE_MARGIN) + images * IMAGE_TOKENS_WORST;
}

function coded(message: string, code: string, extra: Record<string, unknown> = {}): Error {
    return Object.assign(new Error(message), { code, ...extra });
}

const CONTEXT_OVERFLOW = /prompt is too long|too many (?:input )?tokens|context (?:window|length)|maximum context/i;
const BOUND_ELSEWHERE = /bound to a different conversation|Invalid `signature` in `thinking` block/i;
const NO_CREDIT = /credit balance is too low|billing|purchase credits/i;

/** The API's refusal of a request, in the codes the loop acts on. */
export function mapApiError(e: any): Error {
    const status = Number(e?.status);
    const text = String(e?.error?.error?.message || e?.message || e || '').slice(0, 400);
    if (e?.code && /^(?:ENGINE_|MODEL_|RESOURCE_)/.test(String(e.code))) return e;
    if (status === 401 || status === 403) return coded(`The Claude API refused the key (${status}): ${text}`, 'MODEL_AUTH');
    if (status === 404) return coded(`The Claude API does not know this model (${status}): ${text}`, 'MODEL_NOT_FOUND');
    if (status === 400 && NO_CREDIT.test(text)) return coded(`The Claude account has no credit left: ${text}`, 'MODEL_BILLING');
    if ((status === 400 || status === 413) && CONTEXT_OVERFLOW.test(text)) return coded(`The prompt does not fit the model's window: ${text}`, 'RESOURCE_CONTEXT_OVERFLOW');
    if (status === 400 && BOUND_ELSEWHERE.test(text)) return coded(text, 'MODEL_THINKING_BOUND');
    return coded(`The Claude API call failed${Number.isFinite(status) ? ` (${status})` : ''}: ${text}`, 'PROVIDER_FAILURE', { status });
}

export interface AnthropicModelDeps {
    settings: AnthropicSettings;
    ledger: SpendLedger;
    runId: string;
    /** A test hands in a fake; production builds the SDK client. */
    client?: AnthropicClientLike;
    now?: () => number;
}

export function anthropicClient(apiKey: string): AnthropicClientLike {
    //  Rate limits and overloads are retried by the SDK with backoff before
    //  the loop sees a failure.
    return new Anthropic({ apiKey, maxRetries: 6 }) as unknown as AnthropicClientLike;
}

interface CallResult {
    message: any;
    costUsd: number;
    usage: BilledUsage;
}

/**
 * What a call that broke mid-answer is charged. The answer's first event
 * (message_start) states the prompt exactly: its tokens, cache reads and
 * writes. Only the output is unknown, so it is charged in full (max_tokens),
 * unless the final usage (message_delta) already arrived. Measured on
 * 2026-11-01: a call stopped by the owner was charged its whole worst case,
 * $0.28, where this charges about $0.02.
 */
export function brokenCallUsage(startUsage: any, finalUsage: any, maxTokens: number): BilledUsage | null {
    if (!startUsage || typeof startUsage !== 'object') return null;
    const prompt = billedUsage(startUsage);
    const finalOut = Number(finalUsage?.output_tokens);
    return { ...prompt, outputTokens: Number.isFinite(finalOut) && finalOut > 0 ? finalOut : Math.max(0, Number(maxTokens) || 0) };
}

/**
 * One streamed call behind the budget guard: hold the worst case, call,
 * charge what was billed. A call that broke after the API started answering
 * is charged its known prompt and its whole output allowance (see
 * brokenCallUsage), never less than it may have cost.
 */
async function guardedCall(deps: AnthropicModelDeps, client: AnthropicClientLike, params: any, purpose: string, signal: AbortSignal, deadlineAt: number): Promise<CallResult> {
    const now = deps.now ?? Date.now;
    const worst = worstCaseCost(deps.settings.model, requestTokens(params), params.max_tokens);
    const hold = await deps.ledger.reserve(deps.runId, worst);
    let answered = false;
    let startUsage: any = null;
    let finalUsage: any = null;
    try {
        const stream = client.messages.stream(params, { signal, timeout: Math.max(60_000, Math.min(20 * 60_000, deadlineAt - now())) });
        stream.on('streamEvent', (event: any) => {
            if (event?.type === 'message_start') { answered = true; startUsage = event?.message?.usage ?? null; }
            else if (event?.type === 'message_delta' && event?.usage) finalUsage = event.usage;
        });
        const message = await stream.finalMessage();
        const usage = billedUsage(message?.usage);
        const priced = priceRule(String(message?.model || '')) ? String(message.model) : deps.settings.model;
        const costUsd = costOf(priced, usage);
        await hold.charge({ at: now(), model: priced, costUsd, usage, purpose });
        return { message, costUsd, usage };
    } catch (e: any) {
        if (answered) {
            const partial = brokenCallUsage(startUsage, finalUsage, params.max_tokens);
            const charged = partial ? Math.min(worst, costOf(deps.settings.model, partial)) : worst;
            await hold.charge({
                at: now(), model: deps.settings.model, costUsd: charged,
                usage: partial ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 },
                purpose: `${purpose} (broke mid-answer; ${partial ? 'its prompt and full output allowance charged' : 'worst case charged'})`,
            }).catch(() => undefined);
        } else {
            hold.release();
        }
        if (signal.aborted) throw e;
        throw mapApiError(e);
    }
}

function baseParams(s: AnthropicSettings, maxTokens: number): Record<string, unknown> {
    return {
        model: s.model,
        max_tokens: maxTokens,
        thinking: thinkingFor(s.model, s.thinking, s.effort),
        ...(s.effort ? { output_config: { effort: s.effort } } : {}),
        cache_control: s.cacheTtl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' },
    };
}

/** The stop reasons that make a turn unusable, after its cost is charged. */
function checkStop(message: any): void {
    const reason = String(message?.stop_reason || '');
    if (reason === 'refusal') {
        const detail = message?.stop_details ? ` ${JSON.stringify(message.stop_details).slice(0, 200)}` : '';
        throw coded(`The model declined to continue (stop_reason refusal).${detail}`, 'MODEL_REFUSAL');
    }
    if (reason === 'max_tokens') throw coded('The reply was cut off at the output limit, so none of it was used.', 'COMPLETION_LIMIT');
    if (reason === 'model_context_window_exceeded') throw coded('The reply ran out of context window.', 'RESOURCE_CONTEXT_OVERFLOW');
}

function toolCallsOf(content: any[]): ToolCall[] {
    const calls: ToolCall[] = [];
    for (const b of content) {
        if (b?.type !== 'tool_use') continue;
        //  With eager input streaming the SDK fills `input` with a tolerant
        //  parse that can hide a cut or broken argument. The raw text it
        //  streamed is checked strictly by the loop instead.
        const raw = typeof b.__json_buf === 'string' ? b.__json_buf : undefined;
        calls.push({ id: String(b.id), name: String(b.name), arguments: raw && raw.trim() ? raw : JSON.stringify(b.input ?? {}) });
    }
    return calls;
}

/** The response blocks as plain data, for replay and the transcript. */
function nativeOf(content: any[]): unknown[] {
    return JSON.parse(JSON.stringify(content ?? []));
}

export function anthropicModel(deps: AnthropicModelDeps): EngineModel {
    const s = deps.settings;
    const client = deps.client ?? anthropicClient(s.apiKey);
    const now = deps.now ?? Date.now;
    //  Assistant turns whose thinking is no longer bound to the history before them.
    const unbound = new WeakSet<object>();
    let previous: readonly ChatMessage[] = [];
    let spentUsd = 0;
    let calls = 0;

    const markAllUnbound = (messages: readonly ChatMessage[]) => {
        for (const m of messages) if (m.role === 'assistant') unbound.add(m);
    };

    return {
        label: `anthropic:${s.model}`,
        vision: s.vision,
        contextTokens: () => s.contextTokens,
        get spentUsd() { return spentUsd; },
        async step(messages, tools, { signal, deadlineAt }): Promise<ModelStep> {
            const started = now();
            //  An edit anywhere before the end (compaction) unbinds every
            //  thinking block already in the history.
            const appendOnly = previous.length <= messages.length && previous.every((m, i) => messages[i] === m);
            if (!appendOnly) markAllUnbound(messages);
            previous = [...messages];

            const call = async () => {
                const req = toAnthropicRequest(messages, { dropThinking: m => unbound.has(m), cacheTtl: s.cacheTtl });
                const params = { ...baseParams(s, s.maxTokens), system: req.system, messages: req.messages, tools: toAnthropicTools(tools) };
                return guardedCall(deps, client, params, 'engine step', signal, deadlineAt);
            };
            let result: CallResult;
            try { result = await call(); }
            catch (e: any) {
                if (e?.code !== 'MODEL_THINKING_BOUND') throw e;
                //  The API says a replayed thinking block no longer matches its
                //  history. Drop them all once and ask again.
                markAllUnbound(messages);
                result = await call();
            }
            calls++;
            spentUsd += result.costUsd;
            checkStop(result.message);
            const content: any[] = Array.isArray(result.message?.content) ? result.message.content : [];
            const text = content.filter(b => b?.type === 'text').map(b => String(b.text || '')).join('\n').trim();
            return {
                text,
                toolCalls: toolCallsOf(content),
                native: nativeOf(content),
                usage: {
                    promptTokens: promptTokensOf(result.usage),
                    promptEvaluated: result.usage.inputTokens + result.usage.cacheWrite5mTokens + result.usage.cacheWrite1hTokens,
                    completionTokens: result.usage.outputTokens,
                    cacheReadTokens: result.usage.cacheReadTokens,
                    costUsd: result.costUsd,
                },
                durationMs: now() - started,
            };
        },
    };
}

/** A plain question to the same model for the readers and judges, on the same budget. */
export function anthropicTextAsk(deps: AnthropicModelDeps, signal: AbortSignal, deadlineAt: number): (prompt: string) => Promise<string> {
    const client = deps.client ?? anthropicClient(deps.settings.apiKey);
    return async (prompt: string) => {
        const params = {
            ...baseParams(deps.settings, Math.min(deps.settings.maxTokens, 16_000)),
            messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        };
        const { message } = await guardedCall(deps, client, params, 'reader', signal, deadlineAt);
        checkStop(message);
        const content: any[] = Array.isArray(message?.content) ? message.content : [];
        return content.filter(b => b?.type === 'text').map(b => String(b.text || '')).join('\n').trim();
    };
}

/**
 * One question about one picture (a screenshot of the built page), on the
 * run's model and the same budget: the eyes of the acceptance judge for a
 * requirement about how the page looks (core/quality/appearance.ts).
 */
export function anthropicLook(deps: AnthropicModelDeps, signal: AbortSignal, deadlineAt: number): (prompt: string, image: { mime: string; data: string }) => Promise<string> {
    const client = deps.client ?? anthropicClient(deps.settings.apiKey);
    return async (prompt, image) => {
        const params = {
            ...baseParams(deps.settings, Math.min(deps.settings.maxTokens, 16_000)),
            messages: [{
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: image.mime, data: image.data } },
                    { type: 'text', text: prompt },
                ],
            }],
        };
        const { message } = await guardedCall(deps, client, params, 'look', signal, deadlineAt);
        checkStop(message);
        const content: any[] = Array.isArray(message?.content) ? message.content : [];
        return content.filter(b => b?.type === 'text').map(b => String(b.text || '')).join('\n').trim();
    };
}

/**
 * Claude for the rest of Joe (the chat answer, the planner), when the user
 * chose Claude in the interface: the key they typed (or the server's key,
 * asked for by name), the chosen model, and the same budget guard as the
 * engine. A run's own id keeps its spend on that run's line in the ledger.
 */
export async function serverClaudeChat(
    messages: Array<{ role: string; content: unknown }>,
    model: string | undefined,
    runId: string,
    signal?: AbortSignal,
    env: NodeJS.ProcessEnv = process.env,
    client?: AnthropicClientLike,
    typedKey?: string,
): Promise<string> {
    const account = await claudeAccount(typedKey ?? 'server-key', env);
    if ('error' in account) throw coded(account.error, /budget/i.test(account.error) ? 'ENGINE_BUDGET_EXHAUSTED' : 'MODEL_AUTH');
    const settings = await anthropicSettings({ ...env, ...(model ? { JOE_ENGINE_MODEL: model } : {}), JOE_ENGINE_ANTHROPIC_API_KEY: account.apiKey });
    if ('error' in settings) throw coded(`Claude was chosen, but it cannot run: ${settings.error}`, 'MODEL_AUTH');
    const deps: AnthropicModelDeps = { settings, ledger: account.ledger, runId: runId || 'chat', client };
    const history = (messages || []).map(m => ({
        role: m.role === 'system' || m.role === 'assistant' ? m.role : 'user',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
    })) as ChatMessage[];
    const req = toAnthropicRequest(history, { cacheTtl: settings.cacheTtl });
    const params = { ...baseParams(settings, Math.min(settings.maxTokens, 16_000)), system: req.system, messages: req.messages };
    const { message } = await guardedCall(deps, client ?? anthropicClient(settings.apiKey), params, 'chat', signal ?? new AbortController().signal, Date.now() + 10 * 60_000);
    checkStop(message);
    const content: any[] = Array.isArray(message?.content) ? message.content : [];
    return content.filter(b => b?.type === 'text').map(b => String(b.text || '')).join('\n').trim();
}

/** One model the Claude account offers. `runs`: this connector runs it (CLAUDE_MODELS). */
export interface ClaudeModelInfo {
    id: string;
    name: string;
    runs: boolean;
    lifecycle: string;
}

/** The part of the SDK client that lists models, so a test can hand in a fake. */
export interface ModelsClientLike {
    models: { list(params?: any, options?: any): AsyncIterable<any> };
}

/**
 * THE MODELS THE USER'S CLAUDE ACCOUNT OFFERS, asked of Anthropic with the
 * key (the Models API; listing spends nothing). Retired models are left out.
 * The models this connector runs come first, cheapest first; the others
 * follow, newest first, marked as not run.
 */
export async function listClaudeModels(apiKey: string, client?: ModelsClientLike): Promise<ClaudeModelInfo[]> {
    const c = client ?? (new Anthropic({ apiKey, maxRetries: 1, timeout: 10_000 }) as unknown as ModelsClientLike);
    const all: Array<ClaudeModelInfo & { createdAt: string }> = [];
    for await (const m of c.models.list()) {
        const id = String(m?.id || '').trim();
        if (!id || m?.lifecycle === 'retired') continue;
        all.push({ id, name: String(m?.display_name || id), runs: claudeModelRuns(id), lifecycle: String(m?.lifecycle || 'active'), createdAt: String(m?.created_at || '') });
    }
    const rank = (id: string) => CLAUDE_MODELS.findIndex(c => id === c || id.startsWith(`${c}-`));
    const runs = all.filter(m => m.runs).sort((a, b) => rank(a.id) - rank(b.id));
    const others = all.filter(m => !m.runs).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return [...runs, ...others].map(({ createdAt: _c, ...m }) => m);
}
