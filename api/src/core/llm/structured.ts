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
import { parseFirstJson } from '../../shared/utils/json';

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

const ollamaHost = (): string =>
    String(process.env.OLLAMA_HOST || process.env.LOCAL_LLM_HOST || 'http://127.0.0.1:11434').replace(/\/+$/, '');

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
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(`${host}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: ctrl.signal,
            body: JSON.stringify({
                model,
                prompt: ask.prompt,
                stream: false,
                keep_alive: -1,
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
        return parseFirstJson(text) ?? undefined;
    } catch {
        return undefined;
    } finally {
        clearTimeout(timer);
    }
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
        return parseFirstJson(text) ?? undefined;
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
    const cloud = await askCloudStructured(ask);
    if (cloud !== undefined) {
        const ok = validate(cloud);
        if (ok) { ask.onNote?.('the cloud mesh answered'); return ok; }
        ask.onNote?.('the cloud mesh answered something the validator refused');
    }
    if (local === undefined && cloud === undefined) ask.onNote?.('no model answered at all');
    return null;
}
