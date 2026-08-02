/**
 * Vision — the attached image stops being a filename and becomes a scene.
 *
 * The attachment chain delivered every TEXT format to the model, but an
 * image arrived as «(binary image file — no text content)». The user
 * attaches screenshots of broken layouts and design references; answering
 * those without seeing the pixels is answering blind — the one gap left
 * after the paperclip repairs, and the user asked for it closed.
 *
 * The image is described ONCE, at run start, by a vision-capable model, and
 * the description rides the attachment block like extracted text does. That
 * fits the existing architecture (every provider downstream stays text-only)
 * and costs one bounded call per image instead of re-sending pixels on every
 * agent step.
 *
 * Providers, in order:
 *   1. an explicit override — JOE_VISION_BASE_URL / JOE_VISION_MODEL /
 *      JOE_VISION_API_KEY — any OpenAI-compatible endpoint, which is also
 *      how a local Ollama llava or LM Studio serves vision with no cloud;
 *   2. Groq's free llama-4 vision models with the user's existing
 *      GROQ_API_KEY (scout first, maverick if scout is exhausted).
 *
 * No provider reachable → the honest declaration stays; nothing invents a
 * description it never computed.
 */
import fs from 'fs';
import type { AttachmentInput } from './attachments';

/** Groq rejects base64 image URLs over ~4MB; keep headroom under it. */
export const VISION_MAX_IMAGE_BYTES = 2_800_000;
const CALL_TIMEOUT_MS = 30_000;
/** Enough for a thorough description, small enough to stay snappy. */
const MAX_DESC_TOKENS = 900;

interface VisionTarget { baseUrl: string; model: string; apiKey: string; label: string; timeoutMs?: number }

/**
 * LOCAL EYES FIRST. The field log that forced this: the user's Groq plan
 * lists 15 models and ZERO vision-capable ones, and the daily quota was
 * exhausted anyway — cloud vision simply does not exist on that machine.
 * But Ollama does (the local brain runs qwen2.5-coder). A local vision
 * model (moondream/llava/…-vl) answers through Ollama's OpenAI endpoint
 * with no key, no quota and no internet, so it is tried FIRST. A CPU
 * laptop needs minutes, not seconds — hence the long per-target timeout.
 */
const OLLAMA_VISION_ID = /llava|moondream|bakllava|minicpm|vision|[-_.]vl\b|vl[-_.:]|qwen.*vl/i;

function ollamaRoot(): string | null {
    const raw = String(process.env.LOCAL_LLM_BASE_URL || '').trim();
    if (!raw) return null;
    try {
        const u = new URL(raw.endsWith('/') ? raw.slice(0, -1) : raw);
        return `${u.protocol}//${u.host}`;
    } catch { return null; }
}

async function ollamaVisionTargets(): Promise<VisionTarget[]> {
    const host = ollamaRoot();
    if (!host) return [];
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2500);
        const res = await fetch(`${host}/api/tags`, { signal: ctrl.signal });
        clearTimeout(t);
        if (!res.ok) return [];
        const data: any = await res.json().catch(() => ({}));
        const models: string[] = (data?.models || []).map((m: any) => String(m?.name || m?.model || '')).filter(Boolean);
        const vis = models.filter(m => OLLAMA_VISION_ID.test(m));
        if (!vis.length) {
            console.info('[Vision] Ollama is running but has no vision model — run once: ollama pull moondream  (~1.7GB, then images work fully offline)');
            return [];
        }
        return vis.slice(0, 2).map(m => ({
            baseUrl: `${host}/v1`, model: m, apiKey: 'ollama', label: `ollama:${m}`,
            timeoutMs: 180_000,   // a 1.8B vision model on a CPU laptop takes its time — let it finish
        }));
    } catch { return []; }
}

const GROQ_BASE = 'https://api.groq.com/openai/v1';
/** Last resort when the catalog cannot be listed. */
const GROQ_STATIC_FALLBACK = [
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'meta-llama/llama-4-maverick-17b-128e-instruct',
];
/** What a vision-capable model id looks like, across catalog generations. */
const VISION_ID = /scout|maverick|vision|llava|pixtral|[-_]vl\b|vl[-_]|gemma-?3/i;

let groqCatalogCache: { at: number; ids: string[] } | null = null;

/**
 * ASK GROQ WHAT IT SERVES TODAY. The first release pinned two llama-4 model
 * ids and both answered 404 on the user's machine — providers rename and
 * retire models faster than any hardcoded list survives. The catalog is
 * listed live (cached 10 minutes), filtered to vision-capable ids, and the
 * static names remain only as the fallback when /models itself is
 * unreachable. JOE_VISION_GROQ_MODELS (comma-separated) overrides both.
 */
async function groqVisionModels(apiKey: string): Promise<string[]> {
    const override = String(process.env.JOE_VISION_GROQ_MODELS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (override.length) return override;
    if (groqCatalogCache && Date.now() - groqCatalogCache.at < 600_000) return groqCatalogCache.ids;
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10_000);
        const res = await fetch(`${GROQ_BASE}/models`, { signal: ctrl.signal, headers: { 'Authorization': `Bearer ${apiKey}` } });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`models list ${res.status}`);
        const data: any = await res.json();
        const all: string[] = (data?.data || []).map((m: any) => String(m?.id || '')).filter(Boolean);
        const vision = all.filter(id => VISION_ID.test(id))
            // Prefer the larger/newer families first: maverick > scout > the rest.
            .sort((a, b) => {
                const rank = (id: string) => /maverick/i.test(id) ? 0 : /scout/i.test(id) ? 1 : 2;
                return rank(a) - rank(b);
            });
        console.info(`[Vision] Groq catalog: ${all.length} models, ${vision.length} vision-capable${vision.length ? ` (${vision.slice(0, 3).join(', ')}${vision.length > 3 ? ', …' : ''})` : ''}`);
        // When NONE match, print what DOES exist — the field log that led here
        // said "0 vision-capable" and left us guessing which ids were there.
        if (!vision.length) console.warn(`[Vision] no vision ids in the Groq catalog. It lists: ${all.join(', ')}`);
        groqCatalogCache = { at: Date.now(), ids: vision.length ? vision.slice(0, 4) : GROQ_STATIC_FALLBACK };
    } catch (e: any) {
        console.warn(`[Vision] could not list Groq models (${e?.message || e}) — using static fallback names`);
        groqCatalogCache = { at: Date.now(), ids: GROQ_STATIC_FALLBACK };
    }
    return groqCatalogCache.ids;
}

async function targets(userGroqKey?: string): Promise<VisionTarget[]> {
    const out: VisionTarget[] = [];
    const oBase = String(process.env.JOE_VISION_BASE_URL || '').trim().replace(/\/+$/, '');
    if (oBase) {
        out.push({
            baseUrl: oBase,
            model: String(process.env.JOE_VISION_MODEL || 'llava').trim(),
            apiKey: String(process.env.JOE_VISION_API_KEY || 'none'),
            label: 'override',
        });
    }
    // Local Ollama vision: free, offline, quota-proof — ahead of any cloud.
    out.push(...await ollamaVisionTargets());
    const groqKey = String(userGroqKey || process.env.GROQ_API_KEY || '').trim();
    if (groqKey && groqKey !== 'dummy') {
        for (const model of await groqVisionModels(groqKey)) {
            out.push({ baseUrl: GROQ_BASE, model, apiKey: groqKey, label: `groq:${model.split('/').pop()}` });
        }
    }
    return out;
}

function describePrompt(language: string): string {
    return language === 'ar'
        ? 'صِف هذه الصورة بدقة وشمول: التخطيط والعناصر والألوان، وانسخ حرفياً كل نص ظاهر فيها (بلغته الأصلية). إن كانت لقطة شاشة لواجهة أو تصميم، صِف البنية والمكوّنات وأي مشاكل بصرية ظاهرة. أجب بالوصف فقط.'
        : 'Describe this image precisely and completely: layout, elements, colors, and transcribe ALL visible text verbatim (in its original language). If it is a UI screenshot or a design, describe the structure, the components, and any visible defects. Answer with the description only.';
}

async function callVision(t: VisionTarget, dataUrl: string, language: string): Promise<string | null> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), t.timeoutMs || CALL_TIMEOUT_MS);
    try {
        const res = await fetch(`${t.baseUrl}/chat/completions`, {
            method: 'POST',
            signal: ctrl.signal,
            headers: { 'Authorization': `Bearer ${t.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: t.model,
                temperature: 0.2,
                max_tokens: MAX_DESC_TOKENS,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: describePrompt(language) },
                        { type: 'image_url', image_url: { url: dataUrl } },
                    ],
                }],
            }),
        });
        if (!res.ok) {
            console.warn(`[Vision] ${t.label} answered ${res.status}`);
            return null;
        }
        const data: any = await res.json().catch(() => null);
        const text = String(data?.choices?.[0]?.message?.content || '').trim();
        return text.length >= 10 ? text : null;
    } catch (e: any) {
        console.warn(`[Vision] ${t.label} failed: ${e?.name === 'AbortError' ? 'timeout' : e?.message || e}`);
        return null;
    } finally { clearTimeout(timer); }
}

/**
 * Fill in `content` for every image attachment that a vision model could
 * see. Mutates in place and reports how many were described — the caller
 * logs the honest count. Never throws; a run must not die for a picture.
 */
export async function describeImageAttachments(
    attachments: AttachmentInput[],
    opts: { language?: string; groqApiKey?: string } = {},
): Promise<{ described: number; skipped: number }> {
    const language = String(opts.language || 'ar').split('-')[0];
    const list = (attachments || []).filter(a => /^image\//i.test(a.mimeType || '') && !String(a.content || '').trim());
    if (!list.length) return { described: 0, skipped: 0 };
    const chain = await targets(opts.groqApiKey);
    if (!chain.length) {
        console.info('[Vision] no vision provider configured (set GROQ_API_KEY or JOE_VISION_BASE_URL) — images stay declared, not described');
        return { described: 0, skipped: list.length };
    }

    let described = 0, skipped = 0;
    for (const att of list) {
        try {
            const stat = fs.statSync(att.path);
            if (!stat.isFile() || stat.size > VISION_MAX_IMAGE_BYTES) {
                // An 8MB photo is beyond what the endpoints accept as base64;
                // saying so beats a silent skip the user reads as a bug.
                if (stat.size > VISION_MAX_IMAGE_BYTES) {
                    att.content = language === 'ar'
                        ? `(الصورة أكبر من حد التحليل البصري — ${(stat.size / 1024 / 1024).toFixed(1)}MB والحد ${(VISION_MAX_IMAGE_BYTES / 1024 / 1024).toFixed(1)}MB. الملف على القرص في: ${att.path})`
                        : `(image exceeds the vision size limit — ${(stat.size / 1024 / 1024).toFixed(1)}MB vs ${(VISION_MAX_IMAGE_BYTES / 1024 / 1024).toFixed(1)}MB. The file is on disk at: ${att.path})`;
                }
                skipped++;
                continue;
            }
            const mime = String(att.mimeType || 'image/png').split(';')[0];
            const dataUrl = `data:${mime};base64,${fs.readFileSync(att.path).toString('base64')}`;
            let desc: string | null = null;
            for (const t of chain) {
                desc = await callVision(t, dataUrl, language);
                if (desc) { console.info(`[Vision] ${att.name} described via ${t.label} (${desc.length} chars)`); break; }
            }
            if (desc) {
                att.content = desc;
                (att as any).visionDescribed = true;
                described++;
            } else skipped++;
        } catch (e: any) {
            console.warn(`[Vision] could not read ${att.name}: ${e?.message || e}`);
            skipped++;
        }
    }
    return { described, skipped };
}
