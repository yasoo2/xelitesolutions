/**
 * THE MODEL BEHIND THE LOOP.
 *
 * Two routes, both through code Joe already trusts:
 *
 *  - LOCAL (Ollama on this machine): `managedOllamaChat`, the only local
 *    transport that carries tools, tool history and images. It is admitted
 *    through the resource manager like every other local model call. It is
 *    called directly rather than through routeToModel for two reasons. The
 *    router drops the text the model writes next to its tool calls. And only
 *    the transport reports `prompt_eval_count`, which shows whether the
 *    server reused the conversation prefix from the step before. That is the
 *    measurement that decides how fast a long loop runs.
 *
 *  - A NAMED PROVIDER (JOE_ENGINE_PROVIDER): routeToModel's custom route with
 *    an explicit model and strict checking. Native tool calls work there, and
 *    a failure is an error rather than a fall into the mesh, whose adapters
 *    drop tool calls. Joe's cost policy still applies: the router enforces it.
 *
 *  - CLAUDE, when the user chooses it: the native connector in
 *    anthropic.ts, never the router, and only behind the budget guard in
 *    budget.ts. Claude is paid, so it is never what Auto means.
 *
 * Nothing here names a model. The model is whatever the deployment
 * configured: the laptop's 9B today, a large open model on the GPU server
 * tomorrow.
 */
import { managedOllamaChat, managedContextCeilingTokens, isManagedOllamaEndpoint } from '../llm/providers/managed-ollama-chat';
import { routeToModel, isProviderFailure } from '../llm/intelligent-router';
import { readModelTurn, withoutReasoning } from './toolcalls';
import { anthropicModel, anthropicSettings, anthropicTextAsk, claudeAccount, CLAUDE_MODELS } from './anthropic';
import type { ChatMessage, EngineModel, ModelStep, ToolSchema } from './types';

export interface ModelChoice {
    provider: string;          // 'local' or a provider name the router knows
    model: string;
    baseUrl?: string;
    apiKey?: string;
    /** Turn the model's thinking off ('none') or leave the model's default. */
    reasoning?: 'none';
    vision?: boolean;
    contextTokens?: number;
}

const PROVIDER_KEY_ENV: Record<string, string> = {
    groq: 'GROQ_API_KEY', gemini: 'GEMINI_API_KEY', openrouter: 'OPENROUTER_API_KEY', cerebras: 'CEREBRAS_API_KEY',
    mistral: 'MISTRAL_API_KEY', deepseek: 'DEEPSEEK_API_KEY', openai: 'OPENAI_API_KEY',
};

function positiveInt(v: string | undefined): number | undefined {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

/**
 * What Auto means: the deployment's choice. JOE_ENGINE_PROVIDER and
 * JOE_ENGINE_MODEL name a provider explicitly; otherwise the engine uses the
 * local model Joe is configured with. Returns why it cannot choose, rather
 * than guessing.
 *
 * Auto sits with the free providers, so it is never Claude. Measured on
 * 2026-11-01: JOE_ENGINE_PROVIDER=anthropic made Auto run on Claude while the
 * button showed it under «free», and the owner said so: Claude needs credit
 * bought for the key. Claude runs only when the user chooses it
 * (engineModelChoiceFor); a deployment that names it here gets its local
 * model for Auto.
 */
export function engineModelChoice(env: NodeJS.ProcessEnv = process.env): ModelChoice | { error: string } {
    const reasoning = /^(?:off|none|0|false)$/i.test(String(env.JOE_ENGINE_THINKING || '')) ? 'none' as const : undefined;
    const vision = env.JOE_ENGINE_VISION == null ? undefined : /^(?:1|true|on|yes)$/i.test(env.JOE_ENGINE_VISION);
    const contextTokens = positiveInt(env.JOE_ENGINE_CONTEXT_TOKENS);
    const named = String(env.JOE_ENGINE_PROVIDER || '').trim().toLowerCase();
    if (named === 'anthropic' || named === 'claude') {
        return engineModelChoice({ ...env, JOE_ENGINE_PROVIDER: '', JOE_ENGINE_MODEL: '' });
    }
    if (named && named !== 'local') {
        const model = String(env.JOE_ENGINE_MODEL || '').trim();
        if (!model) return { error: `JOE_ENGINE_PROVIDER is ${named} but JOE_ENGINE_MODEL is empty.` };
        const keyName = PROVIDER_KEY_ENV[named];
        const apiKey = keyName ? String(env[keyName] || '').trim() : '';
        if (keyName && !apiKey) return { error: `JOE_ENGINE_PROVIDER is ${named} but ${keyName} is not set.` };
        return { provider: named, model, apiKey: apiKey || undefined, baseUrl: env.JOE_ENGINE_BASE_URL || undefined, reasoning, vision: vision ?? false, contextTokens };
    }
    const model = String(env.JOE_ENGINE_MODEL || env.LOCAL_LLM_MODEL || '').trim();
    const baseUrl = String(env.JOE_ENGINE_BASE_URL || env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:11434/v1').trim();
    if (!model) return { error: 'No model is configured: set LOCAL_LLM_MODEL (or JOE_ENGINE_PROVIDER and JOE_ENGINE_MODEL).' };
    if (!isManagedOllamaEndpoint(baseUrl)) return { error: `The local model address ${baseUrl} is not the managed Ollama endpoint (http://127.0.0.1:11434).` };
    return { provider: 'local', model, baseUrl, reasoning, vision, contextTokens };
}

/** Keys the interface sends when the user chose a provider without typing a key of their own. */
const PLACEHOLDER_KEYS = new Set(['', 'auto-mode', 'free-mode', 'free', 'dummy', 'ollama', 'server-key']);

/**
 * THE MODEL THE USER CHOSE, OR THE HONEST REASON IT CANNOT RUN.
 *
 * The interface's provider button sends { provider, model, apiKey } with
 * every run. Measured on 2026-11-01: the engine ignored it and ran on the
 * deployment's model while the button said «Auto (free)»; and elsewhere in
 * Joe a provider chosen without a key silently became whichever free
 * provider answered. Here the choice binds:
 *
 *  - Auto (or nothing chosen): the deployment's own choice (JOE_ENGINE_*),
 *    which is never a paid Claude.
 *  - Local: that local model, on the managed endpoint.
 *  - Anthropic / Claude: that model through the native connector, always
 *    behind the budget guard, on the key the user typed, or on the server's
 *    key when the user asked for it by name ('server-key'). Claude is paid,
 *    so without either the run is refused and says to add the key.
 *  - Any other provider: that provider and model, through the router's
 *    strict route, with the user's key or the server's key for it. Without
 *    a key the run is refused and says which key is missing; it never runs
 *    on a provider the user did not choose.
 */
export function engineModelChoiceFor(modelConfig: any, env: NodeJS.ProcessEnv = process.env): ModelChoice | { error: string } {
    const provider = String(modelConfig?.provider || '').trim().toLowerCase();
    const model = String(modelConfig?.model || '').trim();
    if (!provider || provider === 'auto' || provider === 'default' || provider === 'free' || provider === 'mock' || model === 'auto') return engineModelChoice(env);
    const base = engineModelChoice(env);
    const reasoning = 'error' in base ? undefined : base.reasoning;
    const userKey = String(modelConfig?.apiKey || '').trim();
    const realKey = PLACEHOLDER_KEYS.has(userKey) || /[^\x00-\x7F]/.test(userKey) ? '' : userKey;
    if (provider === 'local' || provider === 'ollama') {
        const baseUrl = String(modelConfig?.baseUrl || env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:11434/v1').trim();
        if (!model) return { error: 'The local provider was chosen without a model name.' };
        if (!isManagedOllamaEndpoint(baseUrl)) return { error: `The local model address ${baseUrl} is not the managed Ollama endpoint (http://127.0.0.1:11434).` };
        return { provider: 'local', model, baseUrl, reasoning };
    }
    if (provider === 'anthropic' || provider === 'claude') {
        if (!realKey && userKey !== 'server-key') {
            return { error: 'Claude was chosen without a key. Claude is paid: add your Claude API key in the provider settings, or choose Auto, which is free.' };
        }
        return { provider: 'anthropic', model: model || CLAUDE_MODELS[0], apiKey: realKey || 'server-key', reasoning, vision: true };
    }
    const keyName = PROVIDER_KEY_ENV[provider];
    const apiKey = realKey || (keyName ? String(env[keyName] || '').trim() : '');
    if (!model) return { error: `${provider} was chosen without a model name.` };
    if (!apiKey) {
        return { error: `${provider} was chosen, but no key for it was given${keyName ? ` and the server has no ${keyName}` : ''}. Add the key in the provider settings, or choose Auto.` };
    }
    return { provider, model, apiKey, baseUrl: String(modelConfig?.baseUrl || '').trim() || undefined, reasoning, vision: false };
}

/** Ask the local server whether the model takes images. One cheap metadata call, no inference. */
export async function localModelHasVision(baseUrl: string, model: string, signal?: AbortSignal): Promise<boolean> {
    try {
        const root = baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
        const res = await fetch(`${root}/api/show`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model }), signal: signal ?? AbortSignal.timeout(10_000),
        });
        if (!res.ok) return false;
        const body: any = await res.json();
        return Array.isArray(body?.capabilities) && body.capabilities.includes('vision');
    } catch { return false; }
}

function toolNames(tools: ToolSchema[]): Set<string> {
    return new Set(tools.map(t => t.function.name));
}

/** The transport accepts only these keys; anything else is refused as unsupported input. */
function forManaged(messages: ChatMessage[]): unknown[] {
    return messages.map(m => {
        if (m.role === 'assistant') {
            return m.tool_calls?.length
                ? { role: 'assistant', content: m.content || '', tool_calls: m.tool_calls }
                : { role: 'assistant', content: m.content || '' };
        }
        if (m.role === 'tool') return { role: 'tool', content: m.content || '(no output)', tool_call_id: m.tool_call_id };
        return { role: m.role, content: m.content };
    });
}

export function managedModel(choice: ModelChoice, vision: boolean): EngineModel {
    let calls = 0;
    return {
        label: `local:${choice.model}`,
        vision,
        contextTokens: () => choice.contextTokens ?? managedContextCeilingTokens(),
        async step(messages, tools, { signal, deadlineAt }): Promise<ModelStep> {
            const started = Date.now();
            calls++;
            const result = await managedOllamaChat({
                baseURL: choice.baseUrl!,
                model: choice.model,
                messages: forManaged(messages),
                tools,
                signal,
                timeoutMs: Math.max(60_000, deadlineAt - Date.now()),
                reasoningEffort: choice.reasoning,
            });
            const durationMs = Date.now() - started;
            const usage = {
                promptTokens: result.metrics.promptEstimatedTokens,
                promptEvaluated: result.metrics.prompt_eval_count,
                completionTokens: result.metrics.eval_count,
            };
            if (result.tool_calls?.length) {
                return {
                    text: withoutReasoning(result.content || ''),
                    toolCalls: result.tool_calls.map(tc => ({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments || '{}' })),
                    usage, durationMs,
                };
            }
            return { ...readModelTurn(result.content || '', toolNames(tools), calls, durationMs), usage };
        },
    };
}

/**
 * A plain text question to the same model, for the readers and judges the
 * checks use (the requirement reader, the acceptance judge). Same route,
 * same admission, no tools.
 */
export function textAsk(choice: ModelChoice, joe: any, signal: AbortSignal, deadlineAt: number): (prompt: string) => Promise<string> {
    if (choice.provider === 'local') {
        return async (prompt: string) => {
            const result = await managedOllamaChat({
                baseURL: choice.baseUrl!, model: choice.model,
                messages: [{ role: 'user', content: prompt }],
                signal, timeoutMs: Math.max(60_000, deadlineAt - Date.now()),
                reasoningEffort: choice.reasoning,
            });
            return withoutReasoning(result.content || '');
        };
    }
    return async (prompt: string) => {
        const context: any = {
            modelConfig: { provider: choice.provider, model: choice.model, apiKey: choice.apiKey, baseUrl: choice.baseUrl },
            engineeringPipeline: true, strictProviderCheck: true, signal,
            providerTimeoutMs: Math.max(30_000, deadlineAt - Date.now()),
            runId: joe?.runId, sessionId: joe?.sessionId, userId: joe?.userId, workspaceId: joe?.workspaceId,
        };
        const raw = await routeToModel([{ role: 'user', content: prompt }], undefined, undefined, undefined, undefined, undefined, undefined, context);
        if (isProviderFailure(raw)) throw Object.assign(new Error(String(raw).slice(0, 300)), { code: 'PROVIDER_FAILURE' });
        return String(raw ?? '');
    };
}

export function routedModel(choice: ModelChoice, joe: any): EngineModel {
    let calls = 0;
    return {
        label: `${choice.provider}:${choice.model}`,
        vision: choice.vision ?? false,
        contextTokens: () => choice.contextTokens ?? 32_768,
        async step(messages, tools, { signal, deadlineAt }): Promise<ModelStep> {
            const started = Date.now();
            calls++;
            const context: any = {
                modelConfig: { provider: choice.provider, model: choice.model, apiKey: choice.apiKey, baseUrl: choice.baseUrl },
                engineeringPipeline: true,
                strictProviderCheck: true,
                signal,
                providerTimeoutMs: Math.max(30_000, deadlineAt - Date.now()),
                runId: joe?.runId, traceId: joe?.traceId, sessionId: joe?.sessionId, userId: joe?.userId, workspaceId: joe?.workspaceId,
            };
            const raw = await routeToModel(messages as any[], undefined, undefined, undefined, undefined, undefined, tools, context);
            if (isProviderFailure(raw)) throw Object.assign(new Error(String(raw).slice(0, 300)), { code: 'PROVIDER_FAILURE' });
            return readModelTurn(String(raw ?? ''), toolNames(tools), calls, Date.now() - started);
        },
    };
}

/** The model a run drives and the plain-question reader its checks use, on the same route. */
export interface EngineBrain {
    model: EngineModel;
    ask: (prompt: string) => Promise<string>;
}

/**
 * Build the run's model from the deployment's choice. A paid model is built
 * only with a budget; the reader shares the model's budget, so the checks
 * cannot spend around it.
 */
export async function engineBrain(
    choice: ModelChoice, joe: any, signal: AbortSignal, deadlineAt: number, env: NodeJS.ProcessEnv = process.env,
): Promise<EngineBrain | { error: string }> {
    if (choice.provider === 'anthropic') {
        //  Whose key, and which ledger guards it: the user's own, or the server's budget.
        const account = await claudeAccount(choice.apiKey, env);
        if ('error' in account) return account;
        const settings = await anthropicSettings({
            ...env,
            ...(choice.model ? { JOE_ENGINE_MODEL: choice.model } : {}),
            JOE_ENGINE_ANTHROPIC_API_KEY: account.apiKey,
        });
        if ('error' in settings) return settings;
        const deps = { settings, ledger: account.ledger, runId: String(joe?.runId || 'run') };
        return { model: anthropicModel(deps), ask: anthropicTextAsk(deps, signal, deadlineAt) };
    }
    if (choice.provider === 'local') {
        const vision = choice.vision ?? await localModelHasVision(choice.baseUrl!, choice.model, signal);
        return { model: managedModel(choice, vision), ask: textAsk(choice, joe, signal, deadlineAt) };
    }
    return { model: routedModel(choice, joe), ask: textAsk(choice, joe, signal, deadlineAt) };
}
