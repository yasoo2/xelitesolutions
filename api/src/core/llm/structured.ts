/**
 * ASK THE MODEL FOR A SHAPE, NOT FOR A PARAGRAPH.
 *
 * «لماذا يُطوَّر جو خطوة بخطوة بدل أن يملك الأدوات ويقوده الذكاء الاصطناعي؟»
 * The objection is correct, and the reason it had not been answered is not the
 * tools — Joe has eighty of them — it is that a 7B model on a 15-watt laptop
 * cannot be trusted to WRITE a server. What it can be trusted to do, when the
 * decoder itself is constrained, is DESCRIBE one.
 *
 * Ollama takes a JSON Schema in its `format` field and constrains the sampling
 * to it: no code fences, no apology paragraph, no half-written brace. The
 * published measurement is 31.84s → 4.99s on the same prompt, because a
 * constrained decoder has far less to choose from. On his machine that is the
 * difference between a model that answers and one he waits for.
 *
 * The contract here is deliberately narrow:
 *   · the local brain first, constrained — free, offline, quota-proof;
 *   · the cloud mesh second, asked for JSON and read tolerantly;
 *   · and `null` when neither produced something that VALIDATES.
 *
 * Never a partial object, never a guess. The caller falls back to whatever it
 * would have done without a model at all, which is how every model-touched
 * path in this system stays safe on a machine where every provider can fail.
 */
import { readModelJson } from '../../shared/utils/json';
import { isManagedOllamaEndpoint, managedOllamaChat } from './providers/managed-ollama-chat';
import { localInferenceFetch } from './providers/loopback-fetch';
import { admitLocalModelCall } from '../resources/local-model-call';

export interface StructuredAsk {
    /** What to ask for, in the user's own words where possible. */
    prompt: string;
    /** A JSON Schema — passed to Ollama's `format`, and described to the cloud. */
    schema: Record<string, any>;
    /** Milliseconds to wait for the local brain. A cold 7B needs room. */
    timeoutMs?: number;
    /** Called with a one-line note about which path answered. */
    onNote?: (note: string) => void;
}

/**
 * The first value in the reply of the shape the schema asks for at its top —
 * an object for an object schema, an array for an array schema. A reply that
 * shows an example list before its answer, or ends with a sentence that holds
 * a brace, is read for the answer (round 21: «the first parseable value of any
 * shape» handed back the example). Undefined when no candidate has the shape.
 */
export function answerOfSchemaShape(text: string, schema: Record<string, any>): any | undefined {
    const top = String(schema?.type || '');
    return readModelJson(text, parsed => {
        if (parsed === null || parsed === undefined) return undefined;
        if (top === 'object') return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined;
        if (top === 'array') return Array.isArray(parsed) ? parsed : undefined;
        return parsed;
    });
}

/**
 * The local Ollama server's base URL. Ollama itself reads OLLAMA_HOST with or
 * without a scheme and with or without a port («0.0.0.0», «0.0.0.0:11434»,
 * «http://127.0.0.1:11434»); a bare host was used as written, so every
 * structured call went to «0.0.0.0:11434/api/generate» and answered nothing
 * (round 22). The default port is Ollama's own.
 */
const ollamaHost = (): string => {
    const raw = String(process.env.OLLAMA_HOST || process.env.LOCAL_LLM_HOST || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(raw)) return raw;
    // A bare IPv6 address («::1») has colons and no port: it is bracketed.
    if (!raw.startsWith('[') && raw.split(':').length > 2) return `http://[${raw}]:11434`;
    const hasPort = /^\[[^\]]*\]:\d+$/.test(raw) || (!raw.startsWith('[') && /:\d+$/.test(raw));
    return `http://${hasPort ? raw : `${raw}:11434`}`;
};

/** The model Joe already picked for planning — never a hard-coded name. */
function localModel(): string {
    const explicit = String(process.env.LOCAL_LLM_MODEL || '').trim();
    if (explicit) return explicit;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getLocalBrainState } = require('./local-brain');
        const s = getLocalBrainState();
        return String(s?.chatModel || s?.codeModel || '').trim();
    } catch { return ''; }
}

/**
 * The local brain, with its decoder constrained by the schema.
 *
 * Returns undefined — not null — when there is simply no local brain, so the
 * caller can tell «nothing installed» from «answered something unusable».
 */
export async function askLocalStructured(ask: StructuredAsk): Promise<any | undefined> {
    const host = ollamaHost();
    const model = localModel();
    if (!host || !model) return undefined;
    const timeoutMs = ask.timeoutMs ?? 120_000;
    if (isManagedOllamaEndpoint(host)) {
        try {
            const completion = await managedOllamaChat({
                baseURL: host, model, messages: [{ role: 'user', content: ask.prompt }],
                format: ask.schema, temperature: 0, timeoutMs, maxCompletionTokens: 1024,
            });
            return answerOfSchemaShape(completion.content, ask.schema);
        } catch (error: any) {
            if (/^RESOURCE_/.test(String(error?.code || ''))) throw error;
            return undefined;
        }
    }
    // Another spelling of a server on this machine (OLLAMA_HOST=http://0.0.0.0:11434
    // is Ollama's own Linux server value) is still a local model call: admitted
    // for its whole run like the managed one above (second review of round 21).
    // The deadline covers the wait for admission and the call together.
    const deadlineAt = Date.now() + timeoutMs;
    const generate = async (admitted?: AbortSignal): Promise<any | undefined> => {
        const ctrl = new AbortController();
        const abort = () => ctrl.abort();
        if (admitted?.aborted) abort(); else admitted?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(abort, Math.max(1, deadlineAt - Date.now()));
        try {
            const res = await localInferenceFetch()(`${host}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: ctrl.signal,
                body: JSON.stringify({
                    model,
                    prompt: ask.prompt,
                    stream: false,
                    keep_alive: '5m',
                    // THE WHOLE POINT: the schema constrains the sampling itself.
                    format: ask.schema,
                    options: { temperature: 0 },
                }),
            });
            if (!res.ok) return undefined;
            const data: any = await res.json().catch(() => null);
            const text = String(data?.response ?? '').trim();
            if (!text) return undefined;
            // A constrained decoder returns bare JSON; parse tolerantly anyway,
            // because an older Ollama silently ignores `format` and answers prose.
            return answerOfSchemaShape(text, ask.schema);
        } catch {
            return undefined;
        } finally {
            clearTimeout(timer);
            admitted?.removeEventListener('abort', abort);
        }
    };
    // A refusal to admit is a resource decision, as on the managed path: said, not swallowed.
    return admitLocalModelCall(host, generate, { kind: 'structured-local-inference', queueTimeoutMs: timeoutMs });
}

/**
 * The cloud mesh, asked for the same shape in words.
 *
 * No provider here guarantees the shape, so the schema is described in the
 * prompt and the answer is read with the tolerant reader. Anything that does
 * not validate is discarded by the caller.
 */
export async function askCloudStructured(ask: StructuredAsk): Promise<any | undefined> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { IntelligentRouter } = require('./intelligent-router');
        const router = new IntelligentRouter();
        const prompt = `${ask.prompt}\n\nAnswer with JSON ONLY — no prose, no code fences — matching exactly this JSON Schema:\n${JSON.stringify(ask.schema)}`;
        const out = await router.generateResponse?.(prompt, { internal: true });
        const text = typeof out === 'string' ? out : String(out?.content ?? out?.text ?? '');
        if (!text.trim()) return undefined;
        return answerOfSchemaShape(text, ask.schema);
    } catch {
        return undefined;
    }
}

/**
 * Local first, cloud second, `null` when neither answered something the
 * caller's own validator accepts.
 *
 * The validator is the caller's, not this module's: a schema says what SHAPE
 * is allowed, and only the caller knows what is SENSIBLE — a table named
 * «DROP TABLE», six hundred fields, a foreign key to a table nobody declared.
 */
export async function askStructured<T>(
    ask: StructuredAsk,
    validate: (raw: any) => T | null,
): Promise<T | null> {
    const local = await askLocalStructured(ask);
    if (local !== undefined) {
        const ok = validate(local);
        if (ok) { ask.onNote?.('local brain answered, constrained by the schema'); return ok; }
        ask.onNote?.('the local brain answered something the validator refused');
    }
    if (String(process.env.LOCAL_LLM_STRICT || '').trim() === '1') {
        ask.onNote?.('the selected local path did not produce a valid result; no other model was authorized');
        return null;
    }
    const cloud = await askCloudStructured(ask);
    if (cloud !== undefined) {
        const ok = validate(cloud);
        if (ok) { ask.onNote?.('the cloud mesh answered'); return ok; }
        ask.onNote?.('the cloud mesh answered something the validator refused');
    }
    if (local === undefined && cloud === undefined) ask.onNote?.('no model answered at all');
    return null;
}
