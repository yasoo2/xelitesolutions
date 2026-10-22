/**
 * Memory the local inference server already holds for its loaded models.
 *
 * ⛔ MEASURED 2026-10-22 on the owner's 16 GB laptop: once Ollama had
 * `qwen3.5:9b` resident (5.7 GiB), `os.freemem()` read ~0.9 GB and every build
 * request stopped in under a second with RESOURCE_LOW_MEMORY — "AI provider
 * unavailable" — although the model that would serve the call was already
 * loaded. The admission floor counted the model's own memory as taken.
 *
 * That memory is not taken from the next inference: Ollama either reuses the
 * resident model or evicts it to load another. So it is reclaimable for local
 * inference, and admission adds it back. Only a loopback server is asked; any
 * failure reads as 0, which is exactly the old behaviour.
 */
import * as http from 'node:http';

const CACHE_MS = 2000;
const TIMEOUT_MS = 750;
let cached: { at: number; bytes: number } | null = null;

function psUrl(): URL | null {
    const base = String(process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:11434/v1').trim();
    try {
        const url = new URL(base);
        if (!/^(127\.0\.0\.1|localhost|\[::1\])$/i.test(url.hostname)) return null;
        return new URL('/api/ps', `${url.protocol}//${url.host}`);
    } catch { return null; }
}

/** Sum of `size` over the models the loopback Ollama server reports as loaded; 0 on any doubt. */
export async function residentInferenceBytes(): Promise<number> {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.bytes;
    const url = psUrl();
    const bytes = !url ? 0 : await new Promise<number>(resolve => {
        const req = http.get(url, { timeout: TIMEOUT_MS }, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { if (body.length < 65536) body += chunk; });
            res.on('end', () => {
                try {
                    const models = JSON.parse(body)?.models;
                    const total = Array.isArray(models)
                        ? models.reduce((sum: number, m: any) => sum + (Number.isFinite(m?.size) && m.size > 0 ? m.size : 0), 0)
                        : 0;
                    resolve(res.statusCode === 200 ? total : 0);
                } catch { resolve(0); }
            });
        });
        req.on('timeout', () => { req.destroy(); resolve(0); });
        req.on('error', () => resolve(0));
    });
    cached = { at: Date.now(), bytes };
    return bytes;
}
