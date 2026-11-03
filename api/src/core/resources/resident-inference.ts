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
 * inference, and admission adds it back. Only a loopback server is asked. A
 * missed probe reuses the last answer for up to a minute (a server busy
 * generating answers slowly); with no recent answer it reads as 0, which is
 * exactly the old behaviour.
 *
 * ⛔ ONLY THE RAM PART (review r21). /api/ps reports `size` (the whole model)
 * and `size_vram` (the part on the GPU). The admission floor is a RAM floor,
 * so a GPU server whose model sits in VRAM must not have that VRAM added to
 * its free RAM — that skipped the floor on exactly the machine that serves
 * many users. What is credited is size − size_vram; a reply with no
 * size_vram (an older server) is read as all RAM, which is what it was before.
 * And it is credited to a local model call only (RequestResourceManager).
 */
import * as http from 'node:http';

const CACHE_MS = 2000;
const TIMEOUT_MS = 750;
// A server busy generating can miss the probe deadline. Residency changes slowly,
// so the last answer it gave is a better estimate than 0 for a short while.
const LAST_GOOD_MS = 60_000;
let cached: { at: number; bytes: number } | null = null;
let lastGood: { at: number; bytes: number } | null = null;

function psUrl(): URL | null {
    const base = String(process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:11434/v1').trim();
    try {
        const url = new URL(base);
        if (!/^(127\.0\.0\.1|localhost|\[::1\])$/i.test(url.hostname)) return null;
        return new URL('/api/ps', `${url.protocol}//${url.host}`);
    } catch { return null; }
}

/** Test seam: forget cached and last-good readings. */
export function resetResidentInferenceForTests(): void { cached = null; lastGood = null; }

/** The RAM one /api/ps model entry holds: size − size_vram, never negative; 0 for an entry without a size. */
export function residentRamBytes(model: unknown): number {
    const size = (model as any)?.size;
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) return 0;
    const vram = (model as any)?.size_vram;
    return typeof vram === 'number' && Number.isFinite(vram) && vram > 0 ? Math.max(0, size - vram) : size;
}

/** The models the loopback server reports as loaded, or null when it did not answer. */
function loadedModels(url: URL, timeoutMs = TIMEOUT_MS): Promise<unknown[] | null> {
    return new Promise(resolve => {
        const req = http.get(url, { timeout: timeoutMs }, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', chunk => { if (body.length < 65536) body += chunk; });
            res.on('end', () => {
                try {
                    const models = JSON.parse(body)?.models;
                    resolve(res.statusCode === 200 ? (Array.isArray(models) ? models : []) : null);
                } catch { resolve(null); }
            });
        });
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.on('error', () => resolve(null));
    });
}

/** Sum of the RAM part over the models the loopback Ollama server reports as loaded; 0 on any doubt. */
export async function residentInferenceBytes(): Promise<number> {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.bytes;
    const url = psUrl();
    const models = url ? await loadedModels(url) : null;
    const measured = models === null ? null : models.reduce((sum: number, m: unknown) => sum + residentRamBytes(m), 0);
    const now = Date.now();
    if (measured !== null) lastGood = { at: now, bytes: measured };
    const bytes = measured !== null ? measured
        : lastGood && now - lastGood.at < LAST_GOOD_MS ? lastGood.bytes : 0;
    cached = { at: now, bytes };
    return bytes;
}

/** What an unload did: the RAM the unloaded models held, how many, and whether the server confirmed they are gone. */
export interface ResidentRelease {
    releasedBytes: number;
    unloadedModels: number;
    /** The server stopped listing every unloaded model: its runner has exited and handed its memory back. */
    confirmed: boolean;
}

const UNLOAD_CONFIRM_POLL_MS = 100;
// The longest the server is given to drop an unloaded model (the old blind
// wait); an unload normally confirms in well under a second.
const UNLOAD_CONFIRM_MAX_MS = 10_000;

/**
 * UNLOAD THE MODELS THE LOOPBACK SERVER HOLDS IN RAM, for heavy work that
 * allocates its own memory (RequestResourceManager decides when: only when
 * nothing else would clear the memory floor, while no model call of this
 * process runs; a model call queued behind the work loads it again).
 *
 * Ollama's own unload is a generate request with `keep_alive: 0`; the next
 * model call loads the model again. Only models with a RAM part are asked —
 * a model held in VRAM is not in the way of an install. Returns the RAM the
 * unloaded models held (0 on any doubt, which leaves the caller's refusal as
 * it was), how many were unloaded, and whether the server confirmed it.
 *
 * ⛔ Second review of round 21: the caller used to wait a blind ten seconds
 * for memory that, on some machines, never comes back (Linux maps the
 * weights from the file, so they were already counted as available; a
 * container's own limit does not see a host server's memory) — the heavy
 * lane held ~10.4 s for nothing. Ollama drops a model from /api/ps only once
 * its runner has exited, so the server's own listing says when the unload is
 * done; the caller then reads memory and judges at once.
 */
export async function releaseResidentInference(timeoutMs = 15_000): Promise<ResidentRelease> {
    const none: ResidentRelease = { releasedBytes: 0, unloadedModels: 0, confirmed: false };
    const ps = psUrl();
    const models = ps ? await loadedModels(ps) : null;
    if (!ps || !models) return none;
    let released = 0;
    const unloaded: string[] = [];
    for (const model of models) {
        const ram = residentRamBytes(model);
        const name = String((model as any)?.name || (model as any)?.model || '');
        if (!ram || !name) continue;
        const ok = await new Promise<boolean>(resolve => {
            const body = JSON.stringify({ model: name, keep_alive: 0 });
            const req = http.request(new URL('/api/generate', ps), {
                method: 'POST', timeout: timeoutMs,
                headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
            }, res => { res.resume(); res.on('end', () => resolve(res.statusCode === 200)); });
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.on('error', () => resolve(false));
            req.end(body);
        });
        if (ok) { released += ram; unloaded.push(name); }
    }
    // What the server holds has changed: the next reading asks it again.
    cached = null;
    lastGood = null;
    if (!unloaded.length) return none;
    const confirmed = await serverDropped(ps, unloaded, Math.min(timeoutMs, UNLOAD_CONFIRM_MAX_MS));
    return { releasedBytes: released, unloadedModels: unloaded.length, confirmed };
}

/** True once the server's own listing no longer names any of `names`; false at the deadline or when it stops answering. */
async function serverDropped(ps: URL, names: string[], timeoutMs: number): Promise<boolean> {
    const until = Date.now() + Math.max(0, timeoutMs);
    for (;;) {
        const listed = await loadedModels(ps);
        if (listed === null) return false;
        const still = new Set(listed.map(m => String((m as any)?.name || (m as any)?.model || '')));
        if (!names.some(name => still.has(name))) return true;
        if (Date.now() >= until) return false;
        await new Promise(resolve => setTimeout(resolve, UNLOAD_CONFIRM_POLL_MS));
    }
}
