/**
 * STAGE 3 OF THE WORLD-CLASS ROADMAP — surgical, diff-based project editing.
 *
 * What Cursor and Aider got right: an edit to a real project touches LINES,
 * not files. Regenerating a whole component to change one heading is how
 * content gets lost — the exact failure the page builder spent months
 * defending against. This tool edits the way a senior engineer does:
 *
 *   1. Common edits are DETERMINISTIC — a colour change rewrites tokens.css
 *      from Joe's palette engine; no model is asked, nothing else can break.
 *   2. Everything else goes through SEARCH/REPLACE blocks: the model must
 *      quote the exact lines it wants changed and what replaces them. A
 *      block whose SEARCH text is not in the file is refused — the model
 *      cannot invent code it never read.
 *   3. Every edited JS/JSX file passes an esbuild SYNTAX GATE before it is
 *      kept; a file that no longer parses is reverted on the spot.
 *   4. When node_modules exists, the REAL `vite build` verifies the whole
 *      project afterwards — and a red build reverts every file, honestly.
 *
 * Each touched file keeps a per-file history (undo works here too).
 */
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { buildPalette, paletteCss, darkTokenBlock, lightTokenBlock } from '../../../core/design/design-system';
import { routeToModel } from '../../../core/llm/intelligent-router';
import { broadcast, broadcastThinkingDetail } from '../../../api/ws';
import { persistJoeProjects } from '../../../api/page-store';

/** One parsed SEARCH/REPLACE block. */
export interface EditBlock { file: string; search: string; replace: string }

/**
 * Parse the model's reply into blocks. Format (Aider-style, fenced per file):
 *
 *   FILE: src/components/Hero.jsx
 *   <<<<<<< SEARCH
 *   exact current lines
 *   =======
 *   replacement lines
 *   >>>>>>> REPLACE
 */
export function parseEditBlocks(raw: string): EditBlock[] {
    const out: EditBlock[] = [];
    const text = String(raw || '');
    const re = /FILE:\s*([^\n]+)\n<{5,}\s*SEARCH\n([\s\S]*?)\n={5,}\n([\s\S]*?)\n>{5,}\s*REPLACE/g;
    for (const m of text.matchAll(re)) {
        const file = m[1].trim().replace(/^["'`]|["'`]$/g, '');
        if (!file || /\.\./.test(file)) continue;   // no path escapes
        out.push({ file, search: m[2], replace: m[3] });
    }
    return out;
}

/**
 * Apply one block to a file's contents. Exact match first; then a
 * whitespace-tolerant match (models re-indent what they quote). Returns null
 * when the SEARCH text simply is not there — the caller refuses the block.
 */
export function applyEditBlock(content: string, block: EditBlock): string | null {
    if (block.search === block.replace) return null;
    if (content.includes(block.search)) {
        return content.replace(block.search, block.replace);
    }
    // Whitespace-tolerant: match the quoted lines with flexible indentation.
    const lines = block.search.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return null;
    const pattern = lines.map(l => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*\\n\\s*');
    try {
        const re = new RegExp(pattern.replace(/\s+/g, '\\s+'));
        const m = content.match(re);
        if (m && m.index !== undefined) {
            return content.slice(0, m.index) + block.replace + content.slice(m.index + m[0].length);
        }
    } catch { /* pattern too wild — refuse */ }
    return null;
}

/** The esbuild syntax gate: does this file still parse after the edit? */
export function syntaxOk(file: string, code: string): { ok: boolean; error?: string } {
    const ext = path.extname(file).toLowerCase();
    if (!['.js', '.jsx', '.ts', '.tsx', '.mjs'].includes(ext)) {
        // CSS/HTML/JSON get cheap structural checks instead.
        if (ext === '.json') { try { JSON.parse(code); return { ok: true }; } catch (e: any) { return { ok: false, error: e.message }; } }
        if (ext === '.css') {
            const open = (code.match(/\{/g) || []).length, close = (code.match(/\}/g) || []).length;
            return open === close ? { ok: true } : { ok: false, error: `unbalanced braces (${open} vs ${close})` };
        }
        return { ok: true };
    }
    try {
        const esbuild = require('esbuild');
        esbuild.transformSync(code, { loader: ext === '.tsx' ? 'tsx' : ext === '.ts' ? 'ts' : 'jsx' });
        return { ok: true };
    } catch (e: any) {
        return { ok: false, error: String(e?.message || e).split('\n')[0].slice(0, 160) };
    }
}

/** A compact ±diff summary for the report. */
export function diffSummary(before: string, after: string): { added: number; removed: number } {
    const a = before.split('\n'), b = after.split('\n');
    const setA = new Map<string, number>(), setB = new Map<string, number>();
    for (const l of a) setA.set(l, (setA.get(l) || 0) + 1);
    for (const l of b) setB.set(l, (setB.get(l) || 0) + 1);
    let removed = 0, added = 0;
    for (const [l, n] of setA) removed += Math.max(0, n - (setB.get(l) || 0));
    for (const [l, n] of setB) added += Math.max(0, n - (setA.get(l) || 0));
    return { added, removed };
}

const EDITABLE = /\.(jsx?|tsx?|mjs|css|html|json)$/i;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'build']);

function listFiles(dir: string, base = ''): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
            if (!SKIP_DIRS.has(e.name)) out.push(...listFiles(path.join(dir, e.name), path.join(base, e.name)));
        } else if (EDITABLE.test(e.name)) {
            out.push(path.join(base, e.name).replace(/\\/g, '/'));
        }
        if (out.length > 60) break;
    }
    return out;
}

export class ProjectEditTool extends BaseTool {
    name = 'project_edit';
    description = 'Surgically edit files of a scaffolded project via SEARCH/REPLACE diffs, with a syntax gate, build verification, and automatic revert.';
    version = '1.0.0';
    tags = ['edit', 'project', 'react', 'diff'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            request: { type: 'string', description: 'The change, in the user\'s words' },
            dir: { type: 'string', description: 'Project directory (defaults to the session\'s active project)' },
        },
        required: ['request'],
    };
    permissions: ToolPermission[] = ['execute', 'write'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 12;
    auditFields = ['request'];

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        const request = String(input?.request || '').trim()
            .replace(/\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)[\s\S]*$/i, '').trim();
        if (!request) return { ok: false, error: 'no_request', logs };
        const sessionId = context?.sessionId;
        const sessionKey = String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const isAr = /[؀-ۿ]/.test(request);
        try { broadcast({ type: 'build_started', sessionId, data: { tool: 'project_edit', sessionId } } as any); } catch { /* UI optional */ }

        const projects: Record<string, any> = (global as any).joeProjects || ((global as any).joeProjects = {});
        const entry = projects[sessionKey];
        const dir = String(input?.dir || entry?.dir || '');
        if (!dir || !fs.existsSync(path.join(dir, 'package.json'))) {
            return {
                ok: true,
                output: { message: isAr ? 'لا يوجد مشروع نشط لهذه الجلسة — ابنِ مشروعاً أولاً («ابن لي مشروع React …»).' : 'No active project in this session — scaffold one first.' },
                logs,
            } as any;
        }

        /**
         * [UNDO — the integration the audit found missing] Every surgical
         * edit records the files it replaced into the project's history, but
         * nothing ever READ that history: «تراجع» on a project session fell
         * through to the model path and produced noise. Now it is what it
         * says: the last edit batch is restored byte-for-byte, instantly.
         */
        const undoIntent = /(تراجع|ارجع|أرجع|رجّع)[^.\n]{0,25}(تعديل|تغيير|نسخ|سابق|قبل)|\b(undo|rollback|revert)\b|النسخة السابقة/i.test(request);
        if (undoIntent) {
            const history: Array<{ file: string; before: string; at: number }> = entry?.history || [];
            if (!history.length) {
                return { ok: true, output: { message: isAr ? 'لا يوجد تعديل سابق مسجّل على هذا المشروع للتراجع عنه.' : 'No recorded edit to undo on this project.' }, logs } as any;
            }
            // The last BATCH: everything recorded at the newest timestamp.
            const newest = history[history.length - 1].at;
            const batch = history.filter(h => newest - h.at < 5_000);
            const kept = history.filter(h => newest - h.at >= 5_000);
            const restored: string[] = [];
            for (const h of batch) {
                try { fs.writeFileSync(path.join(dir, h.file), h.before, 'utf-8'); restored.push(h.file); }
                catch (e: any) { logs.push(`undo failed for ${h.file}: ${e?.message || e}`); }
            }
            projects[sessionKey] = { ...(entry || {}), dir, updatedAt: Date.now(), history: kept };
            persistJoeProjects();
            logs.push(`undo: restored ${restored.length} file(s) from the last edit batch`);
            return {
                ok: true,
                output: {
                    message: isAr
                        ? `↩️ تراجعت عن آخر تعديل — استُرجع ${restored.length} ملف:\n${restored.map(f => `   • ${f}`).join('\n')}\n🗂️ المتبقي في السجل: ${kept.length} تعديل أقدم.`
                        : `↩️ Undid the last edit — restored ${restored.length} file(s).`,
                    restored,
                },
                logs,
            } as any;
        }

        const touched: Array<{ file: string; before: string; after: string }> = [];
        const refused: string[] = [];
        const write = (rel: string, body: string) => {
            const abs = path.join(dir, rel);
            const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : '';
            fs.writeFileSync(abs, body, 'utf-8');
            touched.push({ file: rel, before, after: body });
        };

        // ── deterministic fast paths — no model, nothing else can break ─────
        const colourChange = /(غير|غيّر|بدل|بدّل|خلي|خلّي|اجعل)[^.\n]{0,25}(لون|ألوان|الوان)|\b(change|make)\b[^.\n]{0,25}\bcolou?rs?\b/i.test(request);
        if (colourChange && fs.existsSync(path.join(dir, 'src', 'styles', 'tokens.css'))) {
            const palette = buildPalette(request);
            write('src/styles/tokens.css', `${paletteCss(palette)}
:root[data-theme="dark"]{${darkTokenBlock(palette)}}
:root[data-theme="light"]{${lightTokenBlock(palette)}}
:root[data-theme="dark"]{color-scheme:dark}
:root[data-theme="light"]{color-scheme:light}`);
            logs.push(`deterministic edit: tokens.css rebuilt around ${palette.primary} — no model call`);
            if (sessionId) broadcastThinkingDetail(sessionId, isAr
                ? `🎨 أعدت بناء لوحة الألوان حول ${palette.primary} — تعديل حتمي بلا نموذج`
                : `🎨 Rebuilt the palette around ${palette.primary} — deterministic, no model`);
        }

        // ── deterministic fast path: «ضف صورة …» — a REAL photo where the
        //    app already knows how to show one. The target row lives in
        //    content.js (heroImage / a dish's img / a testimonial's img, all
        //    rendered conditionally by construction), and the photo comes
        //    through the SAME engine and licence bookkeeping every build
        //    uses. No model writes code; the row edit is a regex on the
        //    serializer's own single-line format, gated and build-verified
        //    like every other edit — and «تراجع» undoes it.
        const imageIntent = /(ضي?ف|أضف|اضف|حطّ?|ركّ?ب|غيّ?ر|بدّ?ل)[^.\n]{0,30}صور(ة|ه)|صور(ة|ه)\s*(جديدة|حقيقية)|\b(add|change|set|put)\b[^.\n]{0,30}\b(photo|image|picture)\b/i.test(request);
        const contentRel = 'src/content.js';
        const notes: string[] = [];
        if (!touched.length && imageIntent && fs.existsSync(path.join(dir, contentRel))) {
            const body = fs.readFileSync(path.join(dir, contentRel), 'utf-8');
            const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
            const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // The rows that can carry a photo, read from the project's OWN content.
            const rows = [...body.matchAll(/\{ name: '([^']*)', (desc|role): '([^']*)',[^\n]*?img: (null|\{[^}]*\})/g)]
                .map(m => ({ name: m[1], kind: m[2] === 'desc' ? 'dish' as const : 'person' as const, second: m[3] }));
            // The row the request names — scored, not first-match: «لطبق مشاوي
            // مشكلة» contains «طبق», which is also the first word of «طبق
            // اليوم», and first-match handed the photo to the wrong dish.
            const target = rows
                .map(r => ({ r, hits: r.name.split(/\s+/).filter(w => w.length >= 3 && request.includes(w)).length }))
                .filter(x => x.hits > 0)
                .sort((a, b) => b.hits - a.hits)[0]?.r || null;
            // What the user asked the photo to BE, when they said it.
            let tail = (request.match(/صور(?:ة|ه)\s+([^\n.،!؟]{3,80})/) || request.match(/\b(?:photo|image|picture)\s+(?:of\s+)?([^\n.,!?]{3,80})/i) || [])[1] || '';
            tail = tail.replace(/^(لل|ل|الى|إلى|في|عن|من)\s*/, '')
                .replace(/\b(the|to|for|of|hero|banner|header|section|menu|dish|page)\b/gi, ' ')
                .replace(/(حقيقية|جديدة|القسم|قسم|طبق|لطبق|البطل|بطل|الواجهة|واجهة|الرئيسية|رئيسية|الترويسة|ترويسة|الغلاف|غلاف|الصفحة|صفحة|الموقع|موقع|القائمة|قائمة)/g, ' ');
            if (target) for (const w of target.name.split(/\s+/)) tail = tail.split(w).join(' ');
            tail = tail.replace(/\s+/g, ' ').trim();
            if (tail.length < 4) tail = '';
            const tagline = (body.match(/tagline: '([^']*)'/) || [])[1] || (body.match(/brand: '([^']*)'/) || [])[1] || '';
            const subject = target
                ? (tail || (target.kind === 'person' ? 'professional headshot portrait' : `${target.name} ${target.second}`))
                : (tail || tagline);
            const slot = target ? (target.kind === 'person' ? 'avatar' as const : 'card' as const) : 'hero' as const;
            if (subject) {
                if (sessionId) broadcastThinkingDetail(sessionId, isAr
                    ? `🖼️ أجلب صورة حقيقية مرخّصة: ${subject.slice(0, 60)}`
                    : `🖼️ Fetching a real licensed photo: ${subject.slice(0, 60)}`);
                const { fetchCardImages } = require('./ReactProjectTool');
                const got = await fetchCardImages({
                    subjects: [subject], projDir: dir, hue: (buildPalette(request) as any).hue ?? 260,
                    artifactDir: process.env.ARTIFACT_DIR || '/tmp/joe-artifacts', slot, label: 'edit',
                });
                const img = got.images[0];
                logs.push(`image edit: subject «${subject}» slot ${slot} → ${got.note}`);
                if (!img) {
                    return {
                        ok: true,
                        output: {
                            message: isAr
                                ? `🖼️ لم أجد صورة مرخّصة مناسبة لـ«${subject.slice(0, 50)}» في الأرشيفات — لم أغيّر شيئاً. جرّب وصفاً آخر للصورة.`
                                : `🖼️ The archives had no suitable licensed photo for "${subject.slice(0, 50)}" — nothing was changed. Try another description.`,
                        },
                        logs,
                    } as any;
                }
                let next = target
                    ? body.replace(
                        new RegExp(`(\\{ name: '${reEsc(target.name)}',[^\n]*?img: )(null|\\{[^}]*\\})`),
                        `$1{ src: '${esc(img.src)}', alt: '${esc(img.alt)}' }`)
                    : body.replace(/heroImage: (?:null|\{[^}]*\})/, `heroImage: { src: '${esc(img.src)}', alt: '${esc(img.alt)}' }`);
                if (next === body) {
                    logs.push('image edit: no photo-capable row found in content.js — falling through');
                } else {
                    // The licence line rides along, once per source.
                    for (const c of got.credits) {
                        if (c.source && !next.includes(esc(c.source))) {
                            next = next.replace(/credits: \[\n?/, m => `${m}    { creator: '${esc(c.creator)}', license: '${esc(c.license)}', source: '${esc(c.source)}' },\n`);
                        }
                    }
                    const gate = syntaxOk(contentRel, next);
                    if (gate.ok) {
                        write(contentRel, next);
                        const where = target ? `«${target.name}»` : (isAr ? 'واجهة الصفحة' : 'the hero');
                        notes.push(isAr
                            ? `🖼️ أضفت صورة حقيقية مرخّصة إلى ${where} (${img.src}) — والاعتماد في التذييل.`
                            : `🖼️ Added a real licensed photo to ${where} (${img.src}), credited in the footer.`);
                        logs.push(`image edit: ${target ? target.name : 'heroImage'} ← ${img.src}`);
                    } else {
                        refused.push(`${contentRel}: image edit breaks the syntax (${gate.error}) — refused`);
                    }
                }
            }
        }

        // ── the general path: SEARCH/REPLACE from the model ─────────────────
        if (!touched.length) {
            const files = listFiles(dir);
            // Rank files by overlap with the request's words; content.js first
            // for wording changes, components for structure.
            const words = request.split(/[\s،,.!؟?]+/).filter(w => w.length >= 3);
            const scored = files.map(f => {
                const body = fs.readFileSync(path.join(dir, f), 'utf-8');
                let score = /content\.js$/.test(f) ? 4 : /components\//.test(f) ? 2 : 0;
                for (const w of words) if (body.includes(w)) score += 3;
                return { f, body, score };
            }).sort((a, b) => b.score - a.score).slice(0, 2)
                .filter(x => x.body.length < 16_000);
            if (!scored.length) {
                return { ok: true, output: { message: isAr ? 'لم أستطع تحديد الملف المقصود — سمِّ الملف أو الجزء المطلوب تعديله.' : 'Could not locate the file to edit — name the file or the part to change.' }, logs } as any;
            }
            if (sessionId) broadcastThinkingDetail(sessionId, isAr
                ? `🔬 تعديل جراحي: ${scored.map(s => s.f).join('، ')}`
                : `🔬 Surgical edit: ${scored.map(s => s.f).join(', ')}`);
            const prompt = `You edit code SURGICALLY. Change ONLY what the request asks; never rewrite whole files.
Reply with one or more blocks in EXACTLY this format — nothing else:

FILE: <relative path>
<<<<<<< SEARCH
<the exact lines as they are now — copied verbatim from the file>
=======
<the replacement lines>
>>>>>>> REPLACE

Rules: the SEARCH text must be an exact quote of what is in the file. Keep edits minimal. ${isAr ? 'Any human-visible text you write must be Arabic.' : ''}`;
            let raw = '';
            try {
                raw = await routeToModel([
                    { role: 'system', content: prompt },
                    { role: 'user', content: `THE REQUEST: ${request}\n\n${scored.map(s => `FILE: ${s.f}\n\`\`\`\n${s.body}\n\`\`\``).join('\n\n')}` },
                ], undefined, undefined, undefined, undefined, undefined, undefined, context);
            } catch (e: any) {
                return { ok: false, error: `edit_model_failed: ${e?.message || e}`, logs } as any;
            }
            const blocks = parseEditBlocks(raw);
            logs.push(`model returned ${blocks.length} edit block(s)`);
            for (const b of blocks.slice(0, 8)) {
                const abs = path.join(dir, b.file);
                if (!fs.existsSync(abs)) { refused.push(`${b.file}: no such file`); continue; }
                const current = touched.find(t => t.file === b.file)?.after ?? fs.readFileSync(abs, 'utf-8');
                const next = applyEditBlock(current, b);
                if (next === null) { refused.push(`${b.file}: SEARCH text not found — refused (the model quoted code that is not there)`); continue; }
                const gate = syntaxOk(b.file, next);
                if (!gate.ok) { refused.push(`${b.file}: edit breaks the syntax (${gate.error}) — refused`); continue; }
                write(b.file, next);
            }
            for (const r of refused) logs.push(`refused: ${r}`);
        }

        if (!touched.length) {
            return {
                ok: true,
                output: {
                    message: isAr
                        ? `لم يتغير أي ملف${refused.length ? ` — رفضت ${refused.length} تعديلاً غير آمن:\n${refused.map(r => `   • ${r}`).join('\n')}` : ' — لم أجد ما يطابق الطلب في ملفات المشروع.'}`
                        : `No file changed${refused.length ? ` — ${refused.length} unsafe edit(s) refused.` : '.'}`,
                },
                logs,
            } as any;
        }

        // ── whole-project verification with the real build ──────────────────
        let buildVerified: boolean | null = null;
        if (fs.existsSync(path.join(dir, 'node_modules'))) {
            if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🏗️ أتحقق بالبناء الحقيقي (vite build)…' : '🏗️ Verifying with the real build…');
            buildVerified = await new Promise<boolean>((resolve) => {
                const child = spawn('npm', ['run', 'build'], { cwd: dir, shell: process.platform === 'win32', env: { ...process.env, NO_COLOR: '1' } });
                const t = setTimeout(() => { try { child.kill(); } catch { /* gone */ } resolve(false); }, 180_000);
                child.on('error', () => { clearTimeout(t); resolve(false); });
                child.on('close', (code) => { clearTimeout(t); resolve(code === 0); });
            });
            if (!buildVerified) {
                for (const t of touched) fs.writeFileSync(path.join(dir, t.file), t.before, 'utf-8');
                logs.push('build FAILED after the edit — every file reverted');
                return {
                    ok: true,
                    output: { message: isAr ? '⚠️ رفضتُ هذا التعديل: البناء فشل بعده، فأرجعت كل الملفات كما كانت. مشروعك سليم. جرّب صياغة أدق.' : '⚠️ Edit refused: the build failed afterwards, so every file was reverted. Your project is intact.' },
                    logs,
                } as any;
            }
        }

        // Per-file history so «تراجع» works on projects too.
        const history = (entry?.history || []).concat(touched.map(t => ({ file: t.file, before: t.before, at: Date.now() }))).slice(-20);
        projects[sessionKey] = { ...(entry || {}), dir, updatedAt: Date.now(), history, lastRequest: request.slice(0, 80) };
        persistJoeProjects();

        const stats = touched.map(t => {
            const d = diffSummary(t.before, t.after);
            return `   • ${t.file} (+${d.added} −${d.removed})`;
        }).join('\n');
        const message = isAr
            ? `🔬 عُدّل المشروع جراحياً — ${touched.length} ملف:\n${stats}
${notes.length ? notes.join('\n') + '\n' : ''}${buildVerified === true ? '✅ vite build نجح بعد التعديل — المشروع سليم.' : buildVerified === false ? '' : 'ℹ️ (الحزم غير مثبتة — تخطيت تحقق البناء؛ بوابة الفحص النحوي طُبّقت على كل ملف)'}${refused.length ? `\n⚠️ رُفض ${refused.length} تعديلاً غير آمن:\n${refused.map(r => `   • ${r}`).join('\n')}` : ''}

🧭 «شغّل خادم التطوير» للمعاينة الحية · «تراجع» يسترجع الملفات السابقة`
            : `🔬 Surgical edit — ${touched.length} file(s):\n${stats}\n${notes.length ? notes.join('\n') + '\n' : ''}${buildVerified === true ? '✅ vite build passed after the edit.' : ''}`;
        return { ok: true, output: { message, dir, touched: touched.map(t => t.file), refused, buildVerified }, logs } as any;
    }
}
