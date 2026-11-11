/**
 * ⛔ THE PROVIDER THE USER CHOSE IS THE BRAIN OF THE WHOLE RUN.
 *
 * Measured on 2026-11-02: Claude was chosen and connected, and a follow-up
 * question sat for minutes because the step that reads the request ran on
 * the local model on a CPU. The choice reached the run, then got lost on the
 * way to the helpers: a helper that builds its own context, or passes none,
 * fell to the default mesh. Passing `modelConfig` by hand through every call
 * site is the pattern that kept losing it; there are dozens of sites.
 *
 * The choice now travels WITH the run (AsyncLocalStorage, the way request
 * scope travels in RequestResourceManager): every model call made while the
 * run is in flight reads it here unless the call names a provider itself.
 * The owner's rule: «جو لازم يشتغل على النموذج اللي اختاره المستخدم».
 *
 * And when that provider cannot answer, the run says so. It used to fall to
 * the free mesh in silence, so the button showed one brain while another one
 * wrote the answer. Cursor, Codex and Claude Code do the same thing here: retry
 * the same provider for a short wait, then show its error, never swap models.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RunModelChoice {
    provider: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
}

interface RunScope { choice?: RunModelChoice; sessionId?: string; runId?: string; language?: string }

/** Auto and its spellings are the mesh, not a provider anyone chose. */
const NOT_A_CHOICE = new Set(['', 'auto', 'free', 'default', 'mock']);

const store = new AsyncLocalStorage<RunScope>();

/** A provider the user pointed at by name. */
export function isProviderChoice(config: any): config is RunModelChoice {
    return !!config && typeof config === 'object'
        && !NOT_A_CHOICE.has(String(config.provider || '').trim().toLowerCase());
}

/** Runs `work` with the user's choice as the brain of every model call inside it. */
export function withRunModelChoice<T>(choice: any, work: () => T, run: { sessionId?: string; runId?: string; language?: string } = {}): T {
    const own = isProviderChoice(choice)
        ? { provider: String(choice.provider), model: choice.model, apiKey: choice.apiKey, baseUrl: choice.baseUrl }
        : undefined;
    return store.run({ choice: own, sessionId: run.sessionId, runId: run.runId, language: run.language }, work);
}

/** The choice of the run in flight, if the user made one. */
export function runModelChoice(): RunModelChoice | undefined {
    return store.getStore()?.choice;
}

/**
 * The provider a model call runs on. A call that names a provider keeps it
 * (the engine passes its own exact choice; Connect checks one provider on
 * purpose). A call that names none, or names Auto, inside a run the user
 * pointed at a provider runs on that provider. A health probe of the mesh
 * is a probe, not work, and keeps what it asked for.
 */
export function modelConfigFor(context: any): any {
    const own = context?.modelConfig;
    const chosen = runModelChoice();
    if (!chosen || isProviderChoice(own)) return own;
    if (context?.providerHealthProbe === true || context?.strictProviderCheck === true) return own;
    return { ...chosen };
}

/** Why the chosen provider did not answer — what the light and the sentence say. */
export type ChosenProviderCode =
    | 'PROVIDER_NEEDS_KEY'   // the provider serves its models only with a key, and none was given
    | 'PROVIDER_AUTH'        // the key was refused
    | 'PROVIDER_BILLING'     // the account has no credit
    | 'PROVIDER_QUOTA'       // a rate or daily limit, with its reset time
    | 'PROVIDER_MODEL'       // the provider does not serve this model
    | 'PROVIDER_DOWN'        // no answer: timeout, network, 5xx, empty reply
    | 'PROVIDER_COOLING'     // a failure moments ago; the breaker is closed for a short wait
    | 'PROVIDER_BUDGET'      // Joe's own spending guard stopped a paid call
    | 'PROVIDER_UNSUPPORTED';// Joe has no route to this provider, or policy excludes it

export class ChosenProviderError extends Error {
    readonly code: ChosenProviderCode;
    readonly provider: string;
    readonly model?: string;
    readonly retryAfterMs?: number;
    constructor(provider: string, model: string | undefined, code: ChosenProviderCode, reason: string, retryAfterMs?: number) {
        super(`${code}: ${provider}${model ? `/${model}` : ''} — ${reason}`);
        this.name = 'ChosenProviderError';
        this.code = code;
        this.provider = provider;
        this.model = model;
        this.retryAfterMs = retryAfterMs;
    }
}

/** A provider's words for an account with no credit. */
const NO_CREDIT = /insufficient[_ ]?(?:balance|quota|credit|funds)|payment required|billing|credit balance|exceeded your current quota|out of credits/i;
/** A provider's words for a model it does not serve. */
const NO_MODEL = /model[^.]{0,60}(?:not found|does not exist|not exist|decommissioned|deprecated|not supported|unavailable)|unknown model|invalid model|no such model/i;
/**
 * A provider's words for a refused or missing key. Measured 2026-11-02 against
 * the real vendors with no key and with a fake one: Groq, Mistral, DeepSeek,
 * OpenAI answer 401; Cerebras 403 «Not authenticated»; Gemini and xAI 400
 * «API key not valid» / «Incorrect API key provided»; OpenRouter 401
 * «Missing Authentication header».
 */
const NO_AUTH = /\b(?:401|403)\b|api[_ -]?key|unauthori[sz]ed|not authenticated|authentication|forbidden|permission denied|credentials/i;

/** Why a provider's answer was a refusal, from its status and its own words. */
export function providerErrorCode(status: number, message: string, timedOut = false, provider = ''): ChosenProviderCode {
    const text = String(message || '');
    if (timedOut) return 'PROVIDER_DOWN';
    //  Gemini refuses a key with 400 and a JSON array the OpenAI SDK cannot
    //  read, so the words arrive as «400 status code (no body)» (measured
    //  2026-11-02, both with no key and with a fake one).
    if (status === 400 && /^(?:gemini|google)$/i.test(provider) && /no body|api key|authori/i.test(text)) return 'PROVIDER_AUTH';
    //  The status speaks first; the words decide only where it is silent or
    //  ambiguous (a 400 that is a refused key, a 429 that is an empty account).
    if (status === 402 || NO_CREDIT.test(text)) return 'PROVIDER_BILLING';
    if (status === 401 || status === 403) return 'PROVIDER_AUTH';
    if (status === 429) return 'PROVIDER_QUOTA';
    if (status === 404) return 'PROVIDER_MODEL';
    if (status >= 500) return 'PROVIDER_DOWN';
    if (NO_AUTH.test(text)) return 'PROVIDER_AUTH';
    if (/rate.?limit|too many requests|tokens per day|\bTPD\b|quota/i.test(text)) return 'PROVIDER_QUOTA';
    if (NO_MODEL.test(text)) return 'PROVIDER_MODEL';
    return 'PROVIDER_DOWN';
}

/**
 * A wait worth making on the same provider before the run reports it: a
 * short rate limit, a 5xx, the breaker's minute after one. A daily limit, a
 * refused key, a timeout already spent, are said at once.
 */
export function worthWaiting(error: unknown, patienceMs: number): number | null {
    if (!(error instanceof ChosenProviderError)) return null;
    if (!['PROVIDER_QUOTA', 'PROVIDER_DOWN', 'PROVIDER_COOLING'].includes(error.code)) return null;
    if (error.retryAfterMs == null || error.retryAfterMs > patienceMs) return null;
    return Math.max(250, error.retryAfterMs);
}

/** The engine connector's codes for Claude, as the chosen-provider reasons. */
const CLAUDE_CODES: Record<string, ChosenProviderCode> = {
    MODEL_AUTH: 'PROVIDER_AUTH', MODEL_BILLING: 'PROVIDER_BILLING', MODEL_NOT_FOUND: 'PROVIDER_MODEL',
    ENGINE_BUDGET_EXHAUSTED: 'PROVIDER_BUDGET', PROVIDER_FAILURE: 'PROVIDER_DOWN',
};

/** The failure of a chosen provider, if `error` is one. */
export function chosenProviderFailure(error: any, config: any): ChosenProviderError | null {
    if (error instanceof ChosenProviderError) return error;
    const code = CLAUDE_CODES[String(error?.code || '')];
    if (!code || !isProviderChoice(config)) return null;
    return new ChosenProviderError(String(config.provider), config.model, code, String(error?.message || code).slice(0, 300));
}

/** Says, in the run's own session, that Joe waits for the provider the user chose. */
export function announceChosenProviderWait(error: ChosenProviderError, waitMs: number): void {
    const scope = store.getStore();
    if (!scope?.sessionId) return;
    const seconds = Math.max(1, Math.ceil(waitMs / 1000));
    const text = scope.language === 'ar'
        ? `⏳ ${error.provider} لا يجيب الآن؛ أنتظره ${seconds} ثانية ثم أعيد المحاولة عليه نفسه.`
        : `⏳ ${error.provider} is not answering right now; waiting ${seconds}s, then trying it again.`;
    try { require('../../api/ws').broadcastThinkingDetail(scope.sessionId, text); } catch { /* a window, never a dependency */ }
}

const announced = new Map<string, number>();

/**
 * Tells the user's own session that the provider they chose did not answer,
 * once per run and reason. Only that session: an event without a session
 * reached every connected user, and one user's daily limit moved everyone's
 * provider button to Auto.
 */
export function announceChosenProviderFailure(error: ChosenProviderError): void {
    const scope = store.getStore();
    const sessionId = scope?.sessionId;
    if (!sessionId) return;
    const key = `${scope?.runId || sessionId}:${error.provider}:${error.code}`;
    const now = Date.now();
    if ((announced.get(key) || 0) > now) return;
    announced.set(key, now + 10 * 60_000);
    if (announced.size > 2000) for (const [k, until] of announced) if (until <= now) announced.delete(k);
    try {
        const { broadcast } = require('../../api/ws');
        broadcast({
            type: 'provider_status', sessionId, runId: scope?.runId,
            data: {
                sessionId, provider: error.provider, model: error.model, ok: false, code: error.code,
                ...(error.retryAfterMs ? { until: now + error.retryAfterMs, minutes: Math.max(1, Math.ceil(error.retryAfterMs / 60_000)) } : {}),
            },
        });
    } catch { /* the light is a window, never a dependency */ }
}
