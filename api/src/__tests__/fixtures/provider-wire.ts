/**
 * FAKE PROVIDERS THAT SPEAK THE REAL WIRE, ON 127.0.0.1 ONLY.
 *
 * Each server answers in the shape its vendor documents (and, where noted,
 * the shape measured from the real server), so Joe's own transport code is
 * what reads it: no client is mocked.
 *
 *  - Gemini: the OpenAI-compatible endpoint Joe uses
 *    (/v1beta/openai/chat/completions, /v1beta/openai/models), errors as the
 *    JSON ARRAY Google returns there, Gemini 3's thought_signature rule for
 *    function calling (extra_content.google.thought_signature must come back
 *    with the call it was given on), and the native generateContent /
 *    streamGenerateContent / models.list endpoints.
 *  - OpenRouter: /api/v1/chat/completions and /api/v1/models (public), its
 *    error envelope {error:{code,message,metadata}}, SSE with its
 *    «: OPENROUTER PROCESSING» comment lines.
 *  - Ollama: /api/tags, /api/show, /api/chat (NDJSON when streaming), and the
 *    OpenAI-compatible /v1/chat/completions and /v1/models. The refusals are
 *    the real server's words (measured on Ollama 0.40.16, 2026-11-17).
 *
 * A test scripts the next answers with `script`; every request is kept in
 * `hits` so a test can read exactly what Joe sent.
 */
import http from 'http';
import type { AddressInfo } from 'net';

export interface Hit { method: string; path: string; headers: http.IncomingHttpHeaders; body: any }
export type Scripted = (hit: Hit) => { status: number; headers?: Record<string, string>; body?: any; sse?: string[]; ndjson?: any[] } | undefined;

export interface FakeServer {
    base: string;
    hits: Hit[];
    /** Answers taken in order before the default behaviour; undefined falls through. */
    script: Scripted[];
    close(): Promise<void>;
}

async function readBody(req: http.IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text) return undefined;
    try { return JSON.parse(text); } catch { return text; }
}

function send(res: http.ServerResponse, out: NonNullable<ReturnType<Scripted>>): void {
    if (out.sse) {
        res.writeHead(out.status, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', ...(out.headers || {}) });
        for (const line of out.sse) res.write(line);
        res.end();
        return;
    }
    if (out.ndjson) {
        res.writeHead(out.status, { 'content-type': 'application/x-ndjson', ...(out.headers || {}) });
        for (const rec of out.ndjson) res.write(JSON.stringify(rec) + '\n');
        res.end();
        return;
    }
    const body = out.body === undefined ? '' : typeof out.body === 'string' ? out.body : JSON.stringify(out.body);
    res.writeHead(out.status, { 'content-type': 'application/json', ...(out.headers || {}) });
    res.end(body);
}

async function serve(handler: (hit: Hit) => NonNullable<ReturnType<Scripted>>): Promise<FakeServer> {
    const hits: Hit[] = [];
    const script: Scripted[] = [];
    const server = http.createServer(async (req, res) => {
        const hit: Hit = { method: String(req.method), path: String(req.url), headers: req.headers, body: await readBody(req) };
        hits.push(hit);
        let out: ReturnType<Scripted>;
        while (script.length && !out) out = script.shift()!(hit);
        send(res, out || handler(hit));
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const { port } = server.address() as AddressInfo;
    return {
        base: `http://127.0.0.1:${port}`, hits, script,
        close: () => new Promise<void>(r => { server.closeAllConnections?.(); server.close(() => r()); }),
    };
}

/**
 * The agent the fakes play: plan_update first, then task_finish, then text.
 * Returns the tool to call next and its arguments, or null to answer in text.
 */
export function nextAgentCall(tools: any[], messages: any[]): { name: string; args: any } | null {
    const names = (tools || []).map((t: any) => t?.function?.name);
    const results = (messages || []).filter((m: any) => m?.role === 'tool').length;
    if (results === 0 && names.includes('plan_update')) return { name: 'plan_update', args: { steps: [{ title: 'build it', status: 'in_progress' }] } };
    if (results <= 1 && names.includes('task_finish')) return { name: 'task_finish', args: { summary: 'done', how_to_run: 'open index.html' } };
    if (results === 0 && names.length) return { name: names[0], args: {} };
    return null;
}

const bearer = (hit: Hit) => String(hit.headers.authorization || '').replace(/^Bearer\s+/i, '');

/* ----------------------------------- GEMINI ----------------------------------- */

export const GEMINI_KEY = 'AIzaFAKE-test-key-0000000000000000000';
/** Google's errors on the OpenAI-compatible endpoint: a JSON array of one error. */
export const geminiError = (code: number, status: string, message: string, details?: any[]) =>
    [{ error: { code, message, status, ...(details ? { details } : {}) } }];
export const GEMINI_BAD_KEY = geminiError(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.',
    [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID', domain: 'googleapis.com', metadata: { service: 'generativelanguage.googleapis.com' } }]);
export const geminiQuota = (retryDelay = '17s') => geminiError(429, 'RESOURCE_EXHAUSTED',
    'You exceeded your current quota, please check your plan and billing details. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 10',
    [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests', quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] },
     { '@type': 'type.googleapis.com/google.rpc.Help', links: [{ description: 'Learn more about Gemini API quotas', url: 'https://ai.google.dev/gemini-api/docs/rate-limits' }] },
     { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay }]);
export const GEMINI_OVERLOADED = geminiError(503, 'UNAVAILABLE', 'The model is overloaded. Please try again later.');
export const GEMINI_MODELS = ['models/gemini-3.8-flash', 'models/gemini-3.6-flash', 'models/gemini-3.5-flash-lite', 'models/text-embedding-005', 'models/imagen-4.0-generate-001', 'models/gemini-3.8-flash-preview-tts'];

export interface GeminiFake extends FakeServer { signatures: Map<string, string> }

export async function geminiFake(): Promise<GeminiFake> {
    const signatures = new Map<string, string>();
    let n = 0;
    const fake = await serve(hit => {
        const path = hit.path.split('?')[0];
        const url = new URL(hit.path, 'http://x');
        const key = bearer(hit) || String(hit.headers['x-goog-api-key'] || '') || url.searchParams.get('key') || '';
        if (path.startsWith('/v1beta/openai/')) {
            if (!key) return { status: 400, body: geminiError(400, 'INVALID_ARGUMENT', 'Missing or invalid Authorization header.') };
            if (!key.startsWith(GEMINI_KEY)) return { status: 400, body: GEMINI_BAD_KEY };
            if (path === '/v1beta/openai/models' && hit.method === 'GET') {
                return { status: 200, body: { object: 'list', data: GEMINI_MODELS.map(id => ({ id, object: 'model', owned_by: 'google' })) } };
            }
            if (path === '/v1beta/openai/chat/completions' && hit.method === 'POST') {
                const b = hit.body || {};
                const model = String(b.model || '').replace(/^models\//, '');
                if (!GEMINI_MODELS.includes(`models/${model}`)) {
                    return { status: 404, body: geminiError(404, 'NOT_FOUND', `models/${model} is not found for API version v1main, or is not supported for generateContent. Call ListModels to see the list of available models and their supported methods.`) };
                }
                //  Gemini 3: every function call it made must come back with its signature.
                if (/^gemini-3/.test(model)) {
                    for (const m of b.messages || []) {
                        for (const tc of m?.tool_calls || []) {
                            const want = signatures.get(String(tc.id));
                            if (want && tc?.extra_content?.google?.thought_signature !== want) {
                                return { status: 400, body: geminiError(400, 'INVALID_ARGUMENT', `Function call is missing a thought_signature in functionCall parts. This is required for tools to work correctly, and missing thought_signature may lead to degraded model performance. Additional data, function call \`default_api:${tc?.function?.name}\` , position 2. Please refer to https://ai.google.dev/gemini-api/docs/thought-signatures for more details.`) };
                            }
                        }
                    }
                }
                const created = Math.floor(Date.now() / 1000);
                const usage = { completion_tokens: 7, prompt_tokens: 42, total_tokens: 49 };
                const tools: any[] = Array.isArray(b.tools) ? b.tools : [];
                const lastTool = [...(b.messages || [])].reverse().find((m: any) => m.role === 'tool');
                const next = nextAgentCall(tools, b.messages);
                if (next) {
                    const name = next.name;
                    const id = `function-call-${++n}`;
                    const sig = `SIG-${n}-` + 'Q'.repeat(24);
                    signatures.set(id, sig);
                    const call = { function: { arguments: JSON.stringify(next.args), name }, id, type: 'function', extra_content: { google: { thought_signature: sig } } };
                    if (b.stream) {
                        return { status: 200, sse: [
                            `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant', tool_calls: [{ ...call, index: 0 }] }, index: 0 }], created, id: 'g1', model, object: 'chat.completion.chunk' })}\n\n`,
                            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }], created, id: 'g1', model, object: 'chat.completion.chunk', usage })}\n\n`,
                            'data: [DONE]\n\n',
                        ] };
                    }
                    return { status: 200, body: { choices: [{ finish_reason: 'tool_calls', index: 0, message: { role: 'assistant', tool_calls: [call] } }], created, id: `resp-${n}`, model, object: 'chat.completion', usage } };
                }
                const text = lastTool ? 'Done: the plan is set.' : 'OK';
                if (b.stream) {
                    return { status: 200, sse: [
                        ...['O', 'K'].map(p => `data: ${JSON.stringify({ choices: [{ delta: { content: p, role: 'assistant' }, index: 0 }], created, id: 'g2', model, object: 'chat.completion.chunk' })}\n\n`),
                        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop', index: 0 }], created, id: 'g2', model, object: 'chat.completion.chunk', usage })}\n\n`,
                        'data: [DONE]\n\n',
                    ] };
                }
                return { status: 200, body: { choices: [{ finish_reason: 'stop', index: 0, message: { content: text, role: 'assistant' } }], created, id: 'resp-t', model, object: 'chat.completion', usage } };
            }
            return { status: 404, body: geminiError(404, 'NOT_FOUND', 'Not found') };
        }
        //  The native API: x-goog-api-key or ?key=.
        if (path.startsWith('/v1beta/models')) {
            if (!key.startsWith(GEMINI_KEY)) return { status: 400, body: { error: GEMINI_BAD_KEY[0].error } };
            if (path === '/v1beta/models' && hit.method === 'GET') {
                return { status: 200, body: { models: GEMINI_MODELS.map(name => ({ name, displayName: name, inputTokenLimit: 1048576, outputTokenLimit: 65536, supportedGenerationMethods: /embed/.test(name) ? ['embedContent'] : ['generateContent', 'countTokens'] })) } };
            }
            const m = /^\/v1beta\/models\/([^:]+):(generateContent|streamGenerateContent)$/.exec(path);
            if (m && hit.method === 'POST') {
                const cand = { content: { parts: [{ text: 'OK' }], role: 'model' }, finishReason: 'STOP', index: 0 };
                const usageMetadata = { promptTokenCount: 4, candidatesTokenCount: 1, totalTokenCount: 5 };
                if (m[2] === 'streamGenerateContent' && url.searchParams.get('alt') === 'sse') {
                    return { status: 200, sse: [`data: ${JSON.stringify({ candidates: [cand], usageMetadata, modelVersion: m[1] })}\r\n\r\n`] };
                }
                return { status: 200, body: { candidates: [cand], usageMetadata, modelVersion: m[1] } };
            }
        }
        return { status: 404, body: geminiError(404, 'NOT_FOUND', `no route ${path}`) };
    });
    return Object.assign(fake, { signatures });
}

/* --------------------------------- OPENROUTER --------------------------------- */

export const OPENROUTER_KEY = 'sk-or-v1-fake0000000000000000000000000000000000000000000000000000000000';
export const orError = (code: number, message: string, metadata?: any) => ({ error: { code, message, ...(metadata ? { metadata } : {}) } });
export const OPENROUTER_MODELS = [
    { id: 'google/gemma-4-31b-it:free', name: 'Google: Gemma 4 31B (free)', context_length: 131072, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools', 'tool_choice', 'max_tokens', 'response_format'] },
    { id: 'openai/gpt-oss-120b', name: 'OpenAI: gpt-oss-120b', context_length: 131072, pricing: { prompt: '0.00000009', completion: '0.00000045' }, supported_parameters: ['tools', 'tool_choice', 'reasoning'] },
    { id: 'openai/text-embedding-3-small', name: 'embeddings', context_length: 8192, pricing: { prompt: '0.00000002', completion: '0' }, supported_parameters: [] },
];

export async function openRouterFake(): Promise<FakeServer> {
    let n = 0;
    return serve(hit => {
        const path = hit.path.split('?')[0];
        if (path === '/api/v1/models' && hit.method === 'GET') return { status: 200, body: { data: OPENROUTER_MODELS } };
        //  «Get current API key»: what the key is allowed, spending nothing.
        if (path === '/api/v1/key' && hit.method === 'GET') {
            const key = bearer(hit);
            if (!key) return { status: 401, body: orError(401, 'No auth credentials found') };
            if (!key.startsWith(OPENROUTER_KEY)) return { status: 401, body: orError(401, 'User not found.') };
            return { status: 200, body: { data: { label: 'sk-or-v1-fak...000', limit: null, usage: 0, usage_daily: 0, is_free_tier: true, is_provisioning_key: false, limit_remaining: null } } };
        }
        if (path === '/api/v1/chat/completions' && hit.method === 'POST') {
            const key = bearer(hit);
            if (!key) return { status: 401, body: orError(401, 'No auth credentials found') };
            if (!key.startsWith(OPENROUTER_KEY)) return { status: 401, body: orError(401, 'User not found.') };
            const b = hit.body || {};
            if (!OPENROUTER_MODELS.some(m => m.id === b.model)) return { status: 400, body: orError(400, `${b.model} is not a valid model ID`) };
            const id = `gen-${Date.now()}-${++n}`;
            const created = Math.floor(Date.now() / 1000);
            const usage = { prompt_tokens: 40, completion_tokens: 6, total_tokens: 46, cost: 0, is_byok: false, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 0 } };
            const tools: any[] = Array.isArray(b.tools) ? b.tools : [];
            const msgs: any[] = b.messages || [];
            //  OpenAI's rule, which OpenRouter's providers enforce: every tool result answers a call made just before it.
            for (let i = 0; i < msgs.length; i++) {
                if (msgs[i].role !== 'tool') continue;
                const ids = new Set<string>();
                for (let j = i - 1; j >= 0 && (msgs[j].role === 'tool' || msgs[j].role === 'assistant'); j--) {
                    if (msgs[j].role === 'assistant') { for (const tc of msgs[j].tool_calls || []) ids.add(String(tc.id)); break; }
                }
                if (!ids.has(String(msgs[i].tool_call_id))) return { status: 400, body: orError(400, 'Provider returned error', { provider_name: 'Chutes', raw: `Invalid parameter: messages with role 'tool' must be a response to a preceeding message with 'tool_calls'.` }) };
            }
            const lastTool = [...msgs].reverse().find(m => m.role === 'tool');
            const next = nextAgentCall(tools, msgs);
            if (next) {
                const call = { index: 0, id: `call_${n}abc`, type: 'function', function: { name: next.name, arguments: JSON.stringify(next.args) } };
                return { status: 200, body: { id, provider: 'Chutes', model: b.model, object: 'chat.completion', created, choices: [{ logprobs: null, finish_reason: 'tool_calls', native_finish_reason: 'tool_calls', index: 0, message: { role: 'assistant', content: '', refusal: null, reasoning: null, tool_calls: [call] } }], usage } };
            }
            const text = lastTool ? 'Done: the plan is set.' : 'OK';
            if (b.stream) {
                const chunk = (delta: any, finish: string | null) => `data: ${JSON.stringify({ id, provider: 'Chutes', model: b.model, object: 'chat.completion.chunk', created, choices: [{ index: 0, delta, finish_reason: finish, native_finish_reason: finish, logprobs: null }] })}\n\n`;
                return { status: 200, sse: [': OPENROUTER PROCESSING\n\n', chunk({ role: 'assistant', content: 'O' }, null), ': OPENROUTER PROCESSING\n\n', chunk({ role: 'assistant', content: 'K' }, null), chunk({ role: 'assistant', content: '' }, 'stop'), `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: b.model, choices: [], usage })}\n\n`, 'data: [DONE]\n\n'] };
            }
            return { status: 200, body: { id, provider: 'Chutes', model: b.model, object: 'chat.completion', created, choices: [{ logprobs: null, finish_reason: 'stop', native_finish_reason: 'stop', index: 0, message: { role: 'assistant', content: text, refusal: null, reasoning: null } }], usage } };
        }
        return { status: 404, body: orError(404, 'Not Found') };
    });
}

/* ----------------------------------- OLLAMA ----------------------------------- */

/** The laptop's real model (no tools), and a stand-in for a server model that has them. */
export const OLLAMA_MODELS: Record<string, { family: string; caps: string[]; ctx: number }> = {
    'moondream:latest': { family: 'phi2', caps: ['completion', 'vision'], ctx: 2048 },
    'toolful:latest': { family: 'qwen3', caps: ['completion', 'tools', 'thinking'], ctx: 40960 },
};

export async function ollamaFake(): Promise<FakeServer> {
    const ollamaName = (m: string) => (m.includes(':') ? m : `${m}:latest`);
    return serve(hit => {
        const path = hit.path.split('?')[0];
        const b = hit.body || {};
        if (path === '/api/tags') {
            return { status: 200, body: { models: Object.entries(OLLAMA_MODELS).map(([name, m]) => ({ name, model: name, modified_at: '2026-11-04T15:36:01.5634991+03:00', size: 1738451197, digest: 'x'.repeat(64), details: { parent_model: '', format: 'gguf', family: m.family, families: [m.family], parameter_size: '1B', quantization_level: 'Q4_0', context_length: m.ctx }, capabilities: m.caps })) } };
        }
        if (path === '/api/version') return { status: 200, body: { version: '0.40.16' } };
        if (path === '/api/show') {
            const m = OLLAMA_MODELS[ollamaName(String(b.model || b.name || ''))];
            if (!m) return { status: 404, body: { error: `model '${b.model}' not found` } };
            return { status: 200, body: { capabilities: m.caps, model_info: { [`${m.family}.context_length`]: m.ctx }, details: { family: m.family } } };
        }
        if (path === '/api/chat') {
            const name = ollamaName(String(b.model || ''));
            const m = OLLAMA_MODELS[name];
            if (!m) return { status: 404, body: { error: `model '${b.model}' not found` } };
            if (Array.isArray(b.tools) && b.tools.length && !m.caps.includes('tools')) {
                return { status: 400, body: { error: `registry.ollama.ai/library/${name} does not support tools` } };
            }
            const base = { model: name, created_at: new Date().toISOString() };
            const done = { done: true, done_reason: 'stop', total_duration: 1_000_000, load_duration: 1000, prompt_eval_count: 30, prompt_eval_duration: 1000, eval_count: 5, eval_duration: 1000 };
            const lastTool = [...(b.messages || [])].reverse().find((x: any) => x.role === 'tool');
            const next = nextAgentCall(b.tools, b.messages);
            if (next) {
                const message = { role: 'assistant', content: '', tool_calls: [{ id: `call_ol${(b.messages || []).length}`, function: { index: 0, name: next.name, arguments: next.args } }] };
                return b.stream ? { status: 200, ndjson: [{ ...base, message, done: false }, { ...base, message: { role: 'assistant', content: '' }, ...done }] }
                    : { status: 200, body: { ...base, message, ...done } };
            }
            const text = b.format ? JSON.stringify({ ok: true }) : lastTool ? 'Done: the plan is set.' : 'OK';
            return b.stream ? { status: 200, ndjson: [...text.split('').map(c => ({ ...base, message: { role: 'assistant', content: c }, done: false })), { ...base, message: { role: 'assistant', content: '' }, ...done }] }
                : { status: 200, body: { ...base, message: { role: 'assistant', content: text }, ...done } };
        }
        if (path === '/v1/models') return { status: 200, body: { object: 'list', data: Object.keys(OLLAMA_MODELS).map(id => ({ id, object: 'model', created: 1762000000, owned_by: 'library' })) } };
        if (path === '/v1/chat/completions') {
            const name = ollamaName(String(b.model || ''));
            const m = OLLAMA_MODELS[name];
            if (!m) return { status: 404, body: { error: { message: `model "${b.model}" not found, try pulling it first`, type: 'api_error', param: null, code: null } } };
            if (Array.isArray(b.tools) && b.tools.length && !m.caps.includes('tools')) {
                return { status: 400, body: { error: { message: `registry.ollama.ai/library/${name} does not support tools`, type: 'invalid_request_error', param: null, code: null } } };
            }
            return { status: 200, body: { id: 'chatcmpl-1', object: 'chat.completion', created: 1762000000, model: name, system_fingerprint: 'fp_ollama', choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } } };
        }
        return { status: 404, body: '404 page not found' };
    });
}

/**
 * Sends a vendor's own address to its fake, through the global fetch (the
 * OpenAI SDK's transport). Any other address that is not this machine is
 * refused, so nothing in a test can reach the internet.
 */
export function routeVendorsTo(map: Record<string, string>): () => void {
    const original: typeof fetch = (globalThis as any).__realFetch ?? globalThis.fetch;
    const previous = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input?.url);
        let target = raw;
        for (const [from, to] of Object.entries(map)) if (raw.startsWith(from)) target = to + raw.slice(from.length);
        if (!/^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(target)) throw Object.assign(new TypeError(`fetch failed: refused non-local ${raw}`), { cause: { code: 'ENOTFOUND' } });
        if (typeof input !== 'string' && !(input instanceof URL) && input?.url) {
            return original(new Request(target, input), init);
        }
        return original(target, init);
    }) as typeof fetch;
    return () => { globalThis.fetch = previous; };
}
