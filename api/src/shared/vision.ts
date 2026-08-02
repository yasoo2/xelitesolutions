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

interface VisionTarget { baseUrl: string; model: string; apiKey: string; label: string }

function targets(userGroqKey?: string): VisionTarget[] {
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
    const groqKey = String(userGroqKey || process.env.GROQ_API_KEY || '').trim();
    if (groqKey && groqKey !== 'dummy') {
        for (const model of [
            'meta-llama/llama-4-scout-17b-16e-instruct',
            'meta-llama/llama-4-maverick-17b-128e-instruct',
        ]) {
            out.push({ baseUrl: 'https://api.groq.com/openai/v1', model, apiKey: groqKey, label: `groq:${model.split('/')[1]}` });
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
    const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
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
    const chain = targets(opts.groqApiKey);
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
