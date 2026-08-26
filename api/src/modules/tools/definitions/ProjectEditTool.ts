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
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { buildPalette, paletteCss, darkTokenBlock, lightTokenBlock } from '../../../core/design/design-system';
import { routeToModel } from '../../../core/llm/intelligent-router';
import { broadcast, broadcastThinkingDetail } from '../../../api/ws';
import { persistJoeProjects, writeJoeProject } from '../../../api/page-store';
import { publicUrlFor } from '../../../shared/utils/publicUrl';
import { undefinedJsxComponentMismatch } from '../../../core/quality/source-contract';

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
 * THE WORD FOR «I CANNOT TELL», WHICH THIS LAYER DID NOT HAVE.
 *
 * The edit prompt ends «nothing else», so a model handed a request that names
 * nothing to change still had to emit an edit block. It did: «سوّي لي شي حلو»
 * rewrote a line of the owner's sales project, and the round reported success.
 *
 * The model is the only layer that reads BOTH the request and the file, so it
 * is the one that can actually tell. It is now allowed to say so, and this
 * reads the answer. Deliberately narrow: the verdict must OPEN the reply, so
 * the phrase inside a sentence about the edit is discussion, not a refusal.
 */
export function modelCannotTell(raw: string): string | null {
    const text = String(raw || '').trim()
        .replace(/^```[a-z]*\s*/i, '')       // a fenced reply
        .replace(/\s*```$/, '')
        .replace(/^\*+\s*/, '')              // bold, which models add to labels
        .trim();
    const m = /^cannot\s+tell\s*:?\**\s*(.*)$/i.exec(text.split('\n')[0].replace(/\*\*/g, ''));
    if (!m) return null;
    return m[1].trim() || 'the request does not say what to change';
}

/**
 * A RANKING'S PRIOR IS NOT ITS EVIDENCE.
 *
 * `content.js` is given four points before a single word of the request is
 * looked for. That is a sound tie-breaker — when several files match, wording
 * usually lives there — but it also means the ranked list is NEVER empty while
 * that file exists. The guard written below the ranker tests the list, so it
 * has never once fired, and «no evidence at all» has been indistinguishable
 * from «weak evidence» at the only place that could have noticed.
 *
 * So the two are now returned apart: `scored` is the preference, `evidence` is
 * how many files a word of the request was actually found in. The caller can
 * ask the question it meant to ask.
 */
export function rankFilesForEdit(
    request: string,
    files: Array<{ f: string; body: string }>,
): { scored: Array<{ f: string; body: string; score: number }>; evidence: number } {
    const words = String(request || '').split(/[\s،,.!؟?]+/).filter(w => w.length >= 3);
    let evidence = 0;
    const scored = files.map(({ f, body }) => {
        const prior = /content\.js$/.test(f) ? 4 : /components\//.test(f) ? 2 : 0;
        let found = 0;
        for (const w of words) if (body.includes(w)) found += 3;
        if (found > 0) evidence += 1;
        return { f, body, score: prior + found };
    }).sort((a, b) => b.score - a.score).slice(0, 2)
        .filter(x => x.body.length < 16_000);
    return { scored, evidence };
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
        const componentError = undefinedJsxComponentMismatch(file, code);
        if (componentError) return { ok: false, error: componentError };
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

/** The rows of content.js that can carry a photo, in the serializer's own
 *  single-line format — dishes carry desc, testimonials carry role. */
export function photoRows(body: string): Array<{ name: string; kind: 'dish' | 'person'; second: string; img: string }> {
    return [...String(body).matchAll(/\{ name: '([^']*)', (desc|role): '([^']*)',[^\n]*?img: (null|\{[^}]*\})/g)]
        .map(m => ({ name: m[1], kind: m[2] === 'desc' ? 'dish' as const : 'person' as const, second: m[3], img: m[4] }));
}

/** The row the request names — SCORED by matched name words, never
 *  first-match: «لطبق مشاوي مشكلة» contains «طبق», which is also the first
 *  word of «طبق اليوم», and first-match handed the photo to the wrong dish. */
export function pickPhotoRow<T extends { name: string }>(rows: T[], request: string): T | null {
    return rows
        .map(r => ({ r, hits: r.name.split(/\s+/).filter(w => w.length >= 3 && request.includes(w)).length }))
        .filter(x => x.hits > 0)
        .sort((a, b) => b.hits - a.hits)[0]?.r || null;
}

/**
 * The path of an image the user ATTACHED to this message. The run pipeline
 * appends «(raw file on disk at: …)» to the goal for every attachment; when
 * that file is a picture, it is the photograph the user means — no archive
 * search can beat the one they just handed over.
 */
export function attachedImagePath(request: string): string | null {
    const m = [...String(request || '').matchAll(/raw file on disk at:\s*([^)\n]+)\)/g)]
        .map(x => x[1].trim())
        .filter(p => /\.(jpe?g|png|webp|gif|avif)$/i.test(p));
    for (const p of m) { try { if (fs.statSync(p).isFile()) return p; } catch { /* gone */ } }
    return null;
}

/**
 * Copy an attached photograph INTO the project (public/images) under a
 * content-addressed name, exactly where the scaffolder puts archive photos,
 * and answer with the row-ready { src, alt }. The user owns this file, so
 * there is no licence line to write — inventing one would be a lie.
 */
export function adoptLocalImage(src: string, projDir: string, alt: string): { src: string; alt: string } | null {
    try {
        const buf = fs.readFileSync(src);
        if (!buf.length) return null;
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(buf).digest('hex').slice(0, 32);
        const ext = (path.extname(src) || '.jpg').toLowerCase().replace('.jpeg', '.jpg');
        const rel = `images/${hash}${ext}`;
        fs.mkdirSync(path.join(projDir, 'public', 'images'), { recursive: true });
        fs.writeFileSync(path.join(projDir, 'public', rel), buf);
        return { src: rel, alt: String(alt || '').slice(0, 80) };
    } catch { return null; }
}

const EDITABLE = /\.(jsx?|tsx?|mjs|css|html|json)$/i;
// `.joe-versions` is the project's own history. An editor that can see into it
// would offer the model yesterday's copy of App.jsx as a file to change — and a
// rewritten past is worse than no past at all.
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'build', '.joe-versions']);

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
        // The RAW text keeps the attachment block: it carries the path of the
        // photograph the user just handed over, and stripping it is exactly
        // why «قم باضافه هذه الصوره» reached for an archive instead.
        const rawRequest = String(input?.request || '');
        const request = rawRequest.trim()
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
            writeJoeProject(sessionKey, { ...(entry || {}), dir, updatedAt: Date.now(), history: kept }, context?.runId ?? null);
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

        /**
         * [APPLICATION UPGRADE] The field case this exists for: right after a
         * real React maps app was delivered, «اريد اعديل عليه بان يعمل مسارات
         * للتنقل من الى … مع ذكر المسافة وكم الوقت» asked for a CAPABILITY, not
         * for a line of CSS. Handing that to a diff editor means asking a weak
         * model to write Leaflet routing code that must compile.
         *
         * A Joe application is generated deterministically from a blueprint, so
         * the honest answer is to REGENERATE it at the current engine — the
         * brand, the storage key and therefore the user's saved data all stay
         * exactly as they were, and the build proves it compiles. Anything the
         * engine cannot do falls through to the surgical editor below.
         */
        // One flag for the whole tool: a preview only ever refreshes off a
        // build that really passed, on the upgrade path and the surgical one.
        let buildVerified: boolean | null = null;
        const appMeta = (() => {
            try {
                const src = fs.readFileSync(path.join(dir, 'src', 'content.js'), 'utf-8');
                const g = (k: string) => (src.match(new RegExp(`\\n\\s*${k}:\\s*'([^']*)'`)) || [])[1] || '';
                const kind = g('kind'), engine = g('engine'), storeKey = g('storeKey');
                if (!kind || !engine || !storeKey) return null;
                return { kind, engine, storeKey, brand: g('brand'), title: g('title'), entityOne: g('entityOne'), entityMany: g('entityMany'), api: g('api'), sourceRequest: g('sourceRequest'), isArabic: /isArabic:\s*true/.test(src) };
            } catch { return null; }
        })();
        /** What each engine can actually deliver — asked for in the user's own words. */
        const ENGINE_ABILITY: Record<string, RegExp> = {
            map: /مسار|مسارات|طريق|الطرق|اتجاه|المسافة|مسافة|الوقت|كم\s*يبعد|ملاحة|تنقّل|تنقل|route|direction|distance|duration|navigat/i,
            records: /حقل|حقول|عمود|أعمدة|تصدير|بحث|فلتر|تصفية|إحصائ|احصائ|مجموع|field|column|export|filter|search|total/i,
            social: /منشور|منشورات|خيط|إعجاب|تعليق|متابع|ملف\s*شخصي|post|feed|like|comment|follow|profile|timeline/i,
            chat: /غرف|غرفة|بحث|إشعار|مزامنة|room|search|sync/i,
            weather: /توقّع|توقع|أيام|رطوبة|رياح|فهرنهايت|مئوي|forecast|humidity|wind|fahrenheit|celsius/i,
        };
        if (appMeta && ENGINE_ABILITY[appMeta.engine]?.test(request)) {
            const { blueprintFor, columnEdit, applyColumnEdit } = require('../../../core/design/app-blueprints');
            const { buildAppFiles } = require('./react-app-templates');
            /**
             *  AN EDIT MUST NOT REBUILD HIM A DIFFERENT TABLE.
             *
             *  This passed the app's TITLE where a REQUEST belongs, so the
             *  regenerated blueprint knew nothing of the columns he had named.
             *  Measured on his own clinic table:
             *
             *      from his request  [اسم المريض · رقم تلفونه · وقت الموعد …]
             *      from the title    [الاسم · الهاتف · الخدمة · التاريخ …]
             *
             *  So «ضيف عمود الخصم» would have deleted every column he asked
             *  for and replaced them with a stock set — an edit that destroys
             *  the thing it edits.
             *
             *  The app now records the words it was built from, and the edit
             *  re-derives from those. The title is the fallback only for apps
             *  built before this existed.
             */
            const bp = blueprintFor(appMeta.kind, appMeta.sourceRequest || appMeta.title || request, appMeta.isArabic);
            // The app keeps the name it was delivered under.
            if (appMeta.title) bp.title = appMeta.title;
            if (appMeta.entityOne) bp.entityOne = appMeta.entityOne;
            if (appMeta.entityMany) bp.entityMany = appMeta.entityMany;
            /**
             *  AND THE ONE COLUMN HE ASKED FOR IS ADDED TO THE OTHERS.
             *
             *  «ضيف عمود الخصم» is not a new table and not a new app: it is
             *  one column, named, on the table already in front of him. The
             *  blueprint above re-derives his original columns; this puts the
             *  new one beside them instead of hoping the regeneration guesses
             *  it.
             *
             *  If he names no column, nothing is added — an edit that invents
             *  a column called «عمود» is worse than an edit that does nothing.
             */
            const colEdit = columnEdit(request);
            if (colEdit.add.length || colEdit.remove.length) {
                bp.fields = applyColumnEdit(bp.fields, colEdit, appMeta.isArabic);
                logs.push(`column edit: +[${colEdit.add.join(', ')}] -[${colEdit.remove.join(', ')}] → ${bp.fields.length} column(s)`);
            }
            const slugName = String(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')).name || 'app');
            const fresh: Record<string, string> = buildAppFiles(bp, {
                brand: appMeta.brand, isArabic: appMeta.isArabic, api: appMeta.api, storeKey: appMeta.storeKey,
                sourceRequest: appMeta.sourceRequest || appMeta.title,
            }, slugName);
            // The real webfont faces at the head of app.css belong to THIS
            // build's design family — they are kept, not regenerated.
            try {
                const oldCss = fs.readFileSync(path.join(dir, 'src', 'styles', 'app.css'), 'utf-8');
                const head = oldCss.split("/* An application's surface")[0];
                if (head && head.includes('@font-face')) fresh['src/styles/app.css'] = head + "/* An application's surface" + fresh['src/styles/app.css'].split("/* An application's surface")[1];
            } catch { /* no previous stylesheet — the fresh one stands */ }

            const changed: Array<{ file: string; before: string }> = [];
            // A surgical edit already reverts itself when the BUILD fails. What
            // it could never do is give him back a change that compiled fine and
            // that he simply did not want. One snapshot before the first write,
            // and «تراجع» works for projects the way it always has for pages.
            try { require('../../../core/project/versions').snapshotProject(dir, 'قبل التعديل'); }
            catch { /* protection must never break what it protects */ }

            let depsChanged = false;
            for (const [rel, body] of Object.entries(fresh)) {
                const abs = path.join(dir, rel);
                const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : '';
                if (before === body) continue;
                if (rel === 'package.json') depsChanged = true;
                fs.mkdirSync(path.dirname(abs), { recursive: true });
                fs.writeFileSync(abs, body, 'utf-8');
                changed.push({ file: rel, before });
            }
            if (changed.length) {
                const { executionEngine } = require('../../../kernel/ExecutionEngine');
                if (depsChanged) {
                    if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '📦 أثبّت الحزم الجديدة…' : '📦 Installing the new packages…');
                    await executionEngine.runArgvStreaming('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir, timeout: 240_000, env: { NO_COLOR: '1' } }).done;
                }
                if (fs.existsSync(path.join(dir, 'node_modules'))) {
                    if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🏗️ أتحقق بالبناء الحقيقي (vite build)…' : '🏗️ Verifying with the real build…');
                    buildVerified = (await executionEngine.runArgvStreaming('npm', ['run', 'build'], { cwd: dir, timeout: 240_000, env: { NO_COLOR: '1' } }).done).ok;
                    if (!buildVerified) {
                        for (const c of changed) fs.writeFileSync(path.join(dir, c.file), c.before, 'utf-8');
                        logs.push('app upgrade reverted — the rebuilt app did not compile');
                        return {
                            ok: true,
                            output: { message: isAr ? '⚠️ رفضتُ الترقية: البناء فشل بعدها فأرجعتُ كل الملفات. مشروعك سليم كما كان.' : '⚠️ Upgrade refused: the rebuild failed, every file was restored.' },
                            logs,
                        } as any;
                    }
                }
                const history = (entry?.history || []).concat(changed.map(c => ({ file: c.file, before: c.before, at: Date.now() }))).slice(-20);
                writeJoeProject(sessionKey, { ...(entry || {}), dir, updatedAt: Date.now(), history, lastRequest: request.slice(0, 80) }, context?.runId ?? null);
                persistJoeProjects();
                if (buildVerified === true) {
                    const url = publicUrlFor(`/project-preview/${sessionKey}/index.html?v=${Date.now()}`);
                    try { broadcast({ type: 'preview_ready', sessionId, data: { url, previewUrl: url, sessionId } } as any); } catch { /* UI optional */ }
                }
                const ABILITY_NOTE: Record<string, [string, string]> = {
                    map: ['المسارات: اكتب «من» و«إلى» واضغط «احسب المسار» — يُرسم الطريق الحقيقي على الخريطة مع المسافة بالكيلومترات والزمن بالدقائق (بيانات OSRM المفتوحة).',
                        'Directions: fill From and To, press "Get directions" — the real road route is drawn with distance in km and time in minutes (open OSRM data).'],
                    records: ['السجلات: إضافة وتعديل وحذف وبحث وتصفية وأرقام محسوبة وتصدير CSV.', 'Records: create, edit, delete, search, filter, computed totals and CSV export.'],
                    social: ['الخيط: نشر نصّ وصورة، إعجاب وتعليقات، متابعة تُصفّي الخيط، وملف شخصي.',
                        'The feed: post text and photos, likes and comments, following that filters, and a profile.'],
                    chat: ['المحادثة: غرف ورسائل دائمة وبحث ومزامنة مع الخادم إن وُجد.', 'Chat: rooms, durable messages, search and server sync when one exists.'],
                    weather: ['الطقس: بحث المدن، موقعك، توقّعات سبعة أيام، وتبديل الوحدة.', 'Weather: city search, your location, a seven-day forecast and a unit switch.'],
                };
                // DID THE PROGRAM ACTUALLY CHANGE? A regeneration that only
                // rewrote index.html announced «المسارات جاهزة» to a user whose
                // app already had them, and whose real complaint — a button
                // that would not work — was never even looked at. The claim now
                // follows the engine file, and a bug report gets a real browser
                // audit instead of a headline.
                const engineChanged = changed.some(c => /src\/components\/\w+App\.jsx$/.test(c.file));
                const bugReport = /(لا\s*يعمل|ما\s*(يشتغل|بيشتغل)|معطّ?ل|عطل|مشكلة|خطأ)|(not\s*working|does\s*not\s*work|doesn'?t\s*work|broken|bug|error)/i.test(request);
                let auditNote = '';
                if (!engineChanged && bugReport && buildVerified === true && !input?.skipAudit) {
                    try {
                        const { auditBuiltApp, formatAudit } = require('../../../core/quality/app-audit');
                        const a = await auditBuiltApp(path.join(dir, 'dist'));
                        if (a && !a.skipped) auditNote = '\n' + formatAudit(a, isAr);
                        logs.push(`bug report: audited the built app — ${a?.skipped ? `skipped (${a.skipped})` : `${a?.score}/100`}`);
                    } catch (e: any) { logs.push(`bug-report audit failed: ${String(e?.message || e).slice(0, 80)}`); }
                }
                const note = engineChanged
                    ? (ABILITY_NOTE[appMeta.engine] || ['', ''])[isAr ? 0 : 1]
                    : (isAr
                        ? `التطبيق يحمل هذه القدرة أصلاً — لم أغيّر منطقه، بل ${changed.length} ملفاً ثانوياً فقط.${bugReport ? ' وبما أنك تُبلغ عن عطل، فحصتُ البناء في متصفح حقيقي:' : ''}${auditNote}`
                        : `The app already carries this capability — its logic is unchanged; only ${changed.length} peripheral file(s) moved.${auditNote}`);
                logs.push(`app upgrade: ${appMeta.kind}/${appMeta.engine} — ${changed.length} file(s) regenerated, build ${buildVerified === null ? 'skipped' : buildVerified ? 'OK' : 'FAILED'}`);
                return {
                    ok: true,
                    output: {
                        message: isAr
                            ? `${engineChanged ? '⚙️ حدّثتُ التطبيق نفسه — لا صفحة جديدة عنه.' : 'ℹ️ راجعتُ التطبيق نفسه — لا صفحة جديدة عنه.'}\n\n${note}\n\n📂 ${dir}\n${changed.map(c => `   • ${c.file}`).join('\n')}\n${buildVerified === true ? '\n✅ vite build نجح بعد الترقية — والمعاينة تحدّثت.' : ''}\n💾 بياناتك المحفوظة في التطبيق لم تُمَسّ.`
                            : `${engineChanged ? '⚙️ Upgraded the application itself — not a page about it.' : 'ℹ️ Reviewed the application itself — not a page about it.'}\n\n${note}\n\n📂 ${dir}\n${changed.map(c => `   • ${c.file}`).join('\n')}${buildVerified === true ? '\n✅ vite build passed.' : ''}`,
                        dir, touched: changed.map(c => c.file), buildVerified,
                    },
                    logs,
                } as any;
            }
            logs.push('app upgrade: the engine already carries this capability — nothing to regenerate');
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
        // «قم باضافه هذه الصوره…» — the masdar form «إضافة/اضافه» and a «بـ»
        // prefix are how people actually write it; the old pattern only knew
        // the imperative «أضف» and let the field request fall to the model.
        const imageIntent = /(ضي?ف|أضف|اضف|إضاف[ةه]|اضاف[ةه]|حطّ?|ركّ?ب|غيّ?ر|بدّ?ل|استخدم|اجعل)[^.\n]{0,30}صور(ة|ه)|صور(ة|ه)\s*(جديدة|حقيقية)|\b(add|change|set|put|use)\b[^.\n]{0,30}\b(photo|image|picture)\b/i.test(request);
        const contentRel = 'src/content.js';
        const notes: string[] = [];
        const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        /** The photo the row/hero currently carries — its src, or undefined. */
        const currentSrcOf = (body: string, target: { name: string } | null): string | undefined => target
            ? (body.match(new RegExp(`\\{ name: '${reEsc(target.name)}',[^\\n]*?img: \\{ src: '([^']+)'`)) || [])[1]
            : (body.match(/heroImage: \{ src: '([^']+)'/) || [])[1];
        /** A photo file nothing references any more has no business shipping. */
        const dropUnreferenced = (body: string, src?: string) => {
            if (src && !body.includes(src)) {
                try { fs.unlinkSync(path.join(dir, 'public', src)); logs.push(`image edit: deleted unreferenced ${src}`); }
                catch { /* already gone */ }
            }
        };

        // ── deterministic fast path: «احذف الصورة …» — the mirror of adding.
        //    The row goes back to null (the components render the no-photo
        //    shape by construction), the orphaned file is deleted from
        //    public/, and removing the LAST photo also empties the credits —
        //    no licence line for pictures that left. Same gates, same undo.
        const removeImageIntent = /(احذف|امسح|شيل(?:ي|وا)?|أزل|ازل)[^.\n]{0,30}صور(ة|ه)|\b(remove|delete|drop)\b[^.\n]{0,30}\b(photo|image|picture)\b/i.test(request);
        if (!touched.length && removeImageIntent && fs.existsSync(path.join(dir, contentRel))) {
            const body = fs.readFileSync(path.join(dir, contentRel), 'utf-8');
            const target = pickPhotoRow(photoRows(body), request);
            const oldSrc = currentSrcOf(body, target);
            const where = target ? `«${target.name}»` : (isAr ? 'واجهة الصفحة' : 'the hero');
            if (!oldSrc) {
                return {
                    ok: true,
                    output: { message: isAr ? `🖼️ لا توجد صورة على ${where} أصلاً — لا شيء يُحذف.` : `🖼️ ${where} has no photo — nothing to remove.` },
                    logs,
                } as any;
            }
            let next = target
                ? body.replace(new RegExp(`(\\{ name: '${reEsc(target.name)}',[^\\n]*?img: )\\{[^}]*\\}`), '$1null')
                : body.replace(/heroImage: \{[^}]*\}/, 'heroImage: null');
            if (!/img: \{ src: /.test(next) && !/heroImage: \{ src: /.test(next)) {
                next = next.replace(/credits: \[[\s\S]*?\n  \],/, 'credits: [\n  ],');
                logs.push('image edit: last photo removed — credits emptied too');
            }
            const gate = syntaxOk(contentRel, next);
            if (gate.ok) {
                write(contentRel, next);
                dropUnreferenced(next, oldSrc);
                notes.push(isAr ? `🗑️ أزلت الصورة من ${where} — وعاد الصف نصياً نظيفاً.` : `🗑️ Removed the photo from ${where} — the row is a clean text row again.`);
                logs.push(`image edit: ${target ? target.name : 'heroImage'} photo removed`);
            } else {
                refused.push(`${contentRel}: image removal breaks the syntax (${gate.error}) — refused`);
            }
        }

        if (!touched.length && imageIntent && fs.existsSync(path.join(dir, contentRel))) {
            const body = fs.readFileSync(path.join(dir, contentRel), 'utf-8');
            const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
            const rows = photoRows(body);
            const target = pickPhotoRow(rows, request);
            // What the user asked the photo to BE, when they said it.
            let tail = (request.match(/صور(?:ة|ه)\s+([^\n.،!؟]{3,80})/) || request.match(/\b(?:photo|image|picture)\s+(?:of\s+)?([^\n.,!?]{3,80})/i) || [])[1] || '';
            tail = tail.replace(/^(لل|ل|الى|إلى|في|عن|من)\s*/, '')
                .replace(/\b(the|to|for|of|hero|banner|header|section|menu|dish|page)\b/gi, ' ')
                .replace(/(حقيقية|جديدة|أخرى|اخرى|القسم|قسم|طبق|لطبق|البطل|بطل|الواجهة|واجهة|الرئيسية|رئيسية|الترويسة|ترويسة|الغلاف|غلاف|الصفحة|صفحة|الموقع|موقع|القائمة|قائمة|الصورة|بصورة|صورة|الى|إلى)/g, ' ');
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
                // THE OWNER'S OWN PHOTOGRAPH WINS. When the message carried an
                // attached image, that file IS the answer — searching an
                // archive for a picture the user already handed over is the
                // field failure «قم باضافه هذه الصوره الى منتج البوس», where
                // Joe described the photo back instead of using it.
                const attached = attachedImagePath(rawRequest);
                let img: { src: string; alt: string } | null = null;
                let credits: Array<{ creator: string; license: string; source: string }> = [];
                if (attached) {
                    img = adoptLocalImage(attached, dir, target?.name || 'صورة');
                    logs.push(`image edit: adopted the ATTACHED file ${path.basename(attached)} → ${img?.src || 'failed'}`);
                    if (img) notes.push(isAr ? '📎 استخدمت الصورة التي أرفقتها أنت — لا حاجة لأرشيف.' : '📎 Used the photo you attached — no archive needed.');
                }
                const { fetchCardImages } = require('./ReactProjectTool');
                if (!img) {
                    const got = await fetchCardImages({
                        subjects: [subject], projDir: dir, hue: (buildPalette(request) as any).hue ?? 260,
                        artifactDir: process.env.ARTIFACT_DIR || '/tmp/joe-artifacts', slot, label: 'edit',
                    });
                    img = got.images[0];
                    credits = got.credits;
                    logs.push(`image edit: subject «${subject}» slot ${slot} → ${got.note}`);
                }
                const got = { images: [img], credits };
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
                const replacedSrc = currentSrcOf(body, target);   // a REPLACE leaves an orphan behind
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
                        dropUnreferenced(next, replacedSrc);
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

        // ── deterministic fast path: DESIGN FAMILY swap — «غيّر الطراز إلى
        //    فاخر». The scaffold wrote the family as one marker-wrapped
        //    variable block in base.css; the swap replaces exactly that
        //    block, the palette and every component stay untouched, and the
        //    usual gates, build verify, undo and live preview ride along.
        const styleIntent = /(غيّ?ر|بدّ?ل|اجعل|خلّ?ي)[^.\n]{0,25}(الطراز|طراز|النمط|نمط|الستايل|ستايل|الأسلوب|أسلوب|التصميم)|\b(change|switch|make)\b[^.\n]{0,25}\b(style|theme|look)\b/i.test(request);
        const baseCssRel = 'src/styles/base.css';
        if (!touched.length && styleIntent && fs.existsSync(path.join(dir, baseCssRel))) {
            const { familyFor, swapFamilyCss, familyOf, FAMILY_LABEL_AR } = require('../../../core/design/families');
            const wanted = familyFor(request, 'generic');
            // «غيّر الطراز» with no named family must ASK, not silently pick
            // the generic default.
            const named = wanted !== 'minimal' || /(بسيط|نظيف|مينيمال|minimal|clean)/i.test(request);
            const css = fs.readFileSync(path.join(dir, baseCssRel), 'utf-8');
            const current = familyOf(css);
            if (current && !named) {
                return { ok: true, output: { message: `🎨 الطراز الحالي: «${FAMILY_LABEL_AR[current]}». سمِّ الطراز الجديد — «غيّر الطراز إلى فاخر» أو جريء أو دافئ أو بسيط.` }, logs } as any;
            }
            if (current) {
                if (current === wanted) {
                    return { ok: true, output: { message: `🎨 الطراز الحالي هو بالفعل «${FAMILY_LABEL_AR[wanted]}» — اطلب: فاخر، جريء، دافئ، أو بسيط.` }, logs } as any;
                }
                const next = swapFamilyCss(css, wanted);
                if (next) {
                    const gate = syntaxOk(baseCssRel, next);
                    if (gate.ok) {
                        write(baseCssRel, next);
                        notes.push(isAr
                            ? `🎨 بدّلت الطراز من «${FAMILY_LABEL_AR[current]}» إلى «${FAMILY_LABEL_AR[wanted]}» — الألوان والمحتوى كما هما.`
                            : `🎨 Switched the design family to "${wanted}".`);
                        logs.push(`design family: ${current} → ${wanted} — deterministic, no model`);
                    } else {
                        refused.push(`${baseCssRel}: family swap breaks the css (${gate.error}) — refused`);
                    }
                }
            }
        }

        // ── deterministic fast path: whole-ROW add/delete — «ضف طبق كباب
        //    مشوي بسعر 55»، «احذف منتج طقم الهدية». The serializer's row
        //    format is the contract: a new row is one well-formed line
        //    inserted before the array's close (with a best-effort REAL
        //    photo), a deleted row is one line removed with its orphaned
        //    file and, when it was the last photo, the credits. These run
        //    BEFORE the text-edit branch on purpose: «بسعر 55» would
        //    otherwise read as a price edit on a row that does not exist yet.
        const rowNounM = request.match(/(?<![ء-ي])(?:ال)?(طبق|منتج)(?![ء-ي])|\b(dish|product)\b/i);
        // The field asked «تعديل على المنتجات قم بزياده عطر اسمه البوس» and
        // nothing matched: the verb was «زيادة», and the thing being added was
        // «عطر», not the word «منتج». The narrow pattern sent it to the model,
        // which invented an image path. So a SECOND, broader reading: any
        // add-verb + a named thing + a hint of WHICH list it belongs to.
        // No lookbehind here on purpose: the field wrote «بزياده» — the verb
        // carried a «بـ» prefix, and a strict word boundary refused it. The
        // pair of conditions below (a NAMED thing + the list it belongs to)
        // is what keeps this from firing on ordinary sentences.
        const addVerb = /(ضي?ف|أضف|اضف|زد|زياد[ةه]|إضاف[ةه]|اضاف[ةه]|أدرج|ادرج)|\b(add|insert)\b/i.test(request);
        const namedM = request.match(/(?:اسمه?|باسم|بعنوان|named?|called)\s+([^\n،.]{1,40})/i);
        const listHintM = request.match(/(?<![ء-ي])(المنتجات|منتجات|products)(?![ء-ي])|(?<![ء-ي])(القائمة|المنيو|الأطباق|menu|dishes)(?![ء-ي])/i);
        const addRowIntent = (!!rowNounM && /((?<![ء-ي])(ضي?ف|أضف|اضف|حطّ?)(?![ء-ي])[^.\n]{0,15}(طبق|منتج))|\badd\b[^.\n]{0,25}\b(dish|product)\b/i.test(request))
            || (addVerb && !!namedM && !!listHintM);
        const delRowIntent = !!rowNounM && !addRowIntent && !/صور|photo|image|picture/i.test(request)
            && /((احذف|امسح|شيل|أزل|ازل)[^.\n]{0,20}(طبق|منتج))|\b(remove|delete)\b[^.\n]{0,25}\b(dish|product)\b/i.test(request);
        // WHICH list: the row noun decides when it is there; otherwise the
        // list the request named («على المنتجات» → products).
        const menuArr = rowNounM
            ? (/طبق|dish/i.test(rowNounM[0]) ? 'menu' : 'products')
            : (listHintM && listHintM[2] ? 'menu' : 'products');

        if (!touched.length && addRowIntent && fs.existsSync(path.join(dir, contentRel))) {
            const body = fs.readFileSync(path.join(dir, contentRel), 'utf-8');
            const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
            // «… عطر اسمه البوس مع صورة له» → «البوس». The explicit «اسمه»
            // capture wins; the old positional read stays the fallback.
            const nameTail = (namedM?.[1] || '').trim()
                || ((request.match(/(?:(?<![ء-ي])(?:طبق|منتج)(?![ء-ي])|\b(?:dish|product)\b)\s+(.+)$/i) || [])[1] || '');
            let name = nameTail.split(/\s+(?:بسعر|بوصف|مع\s)/)[0].split(/\s+(?:price|for|at|with)\b/i)[0] || '';
            name = name.trim().replace(/^(جديد\s+|اسمه\s+|باسم\s+|called\s+|named\s+)/i, '').replace(/^[«"']|[»"'.،!؟]+$/g, '').trim();
            if (!name) {
                return { ok: true, output: { message: isAr ? '➕ سمِّ العنصر الجديد — مثال: «ضف طبق كباب مشوي بسعر 55».' : '➕ Name the new item — e.g. "add a dish Grilled kebab for 55".' }, logs } as any;
            }
            if (body.includes(`name: '${esc(name)}'`)) {
                return { ok: true, output: { message: isAr ? `➕ «${name}» موجود مسبقاً — قل «غيّر سعر ${name} إلى …» لتعديله.` : `➕ "${name}" already exists — say "change the price of ${name} to …".` }, logs } as any;
            }
            const block = (body.match(new RegExp(`${menuArr}: \\[\\n([\\s\\S]*?)\\n  \\],`)) || [])[1] || '';
            const siblingPrice = (block.match(/price: '([^']*)'/) || [])[1] || '';
            const priceRaw = ((request.match(/(?:بسعر|\bprice\b|\bfor\b|\bat\b)\s*\$?([^\n.،]{1,30})/i) || [])[1] || '')
                .split(/\s+(?:بوصف|described)/)[0].trim();
            const price = priceRaw
                ? (/^\d+([.,]\d+)?$/.test(priceRaw) && /\d/.test(siblingPrice) ? siblingPrice.replace(/\d+([.,]\d+)?/, priceRaw) : priceRaw)
                : '—';
            const desc = ((request.match(/(?:بوصف|ووصفه?)\s+(.+)$/) || request.match(/\bdescribed as\s+(.+)$/i) || [])[1] || '').trim()
                || (isAr ? (menuArr === 'menu' ? 'طبق جديد من مطبخنا' : 'إضافة جديدة إلى المتجر') : (menuArr === 'menu' ? 'A new dish from our kitchen' : 'A new addition to the store'));
            // A REAL photo for the newcomer, best-effort like every photo step.
            let img: { src: string; alt: string } | null = null;
            let addCredits: Array<{ creator: string; license: string; source: string }> = [];
            // The owner's OWN photograph, when they attached one, beats any
            // archive — «ضف منتج … مع هذه الصورة» uses the file they sent.
            const attachedForRow = attachedImagePath(rawRequest);
            if (attachedForRow) {
                img = adoptLocalImage(attachedForRow, dir, name);
                if (img) logs.push(`row add: adopted the ATTACHED file → ${img.src}`);
            }
            try {
                if (img) throw { skip: true };
                const { fetchCardImages } = require('./ReactProjectTool');
                const got = await fetchCardImages({
                    subjects: [`${name} ${desc}`], projDir: dir, hue: (buildPalette(request) as any).hue ?? 260,
                    artifactDir: process.env.ARTIFACT_DIR || '/tmp/joe-artifacts', slot: 'card', label: 'edit',
                });
                img = got.images[0];
                addCredits = got.credits;
                logs.push(`row add: photo → ${got.note}`);
            } catch (e: any) { if (!e?.skip) { /* the row ships clean without one */ } }
            // A product row carries a slug — it is the address of its own
            // page. A row added later without one would link to nowhere.
            const rowSlug = (String(name).toLowerCase()
                .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 32)) || 'item';
            // ONLY this array decides — a lazy scan would run past `menu: [`
            // straight into `products: [`, and dishes would sprout urls.
            const ownBlock = (body.match(new RegExp(`${menuArr}: \\[([\\s\\S]*?)\\n  \\],`)) || [])[1] || '';
            const wantsSlug = /slug: '/.test(ownBlock);
            const rowLine = `    { name: '${esc(name)}', desc: '${esc(desc)}', price: '${esc(price)}',${wantsSlug ? ` slug: '${esc(rowSlug)}',` : ''} img: ${img ? `{ src: '${esc(img.src)}', alt: '${esc(img.alt)}' }` : 'null'} },`;
            let next = body.replace(new RegExp(`(${menuArr}: \\[\\n[\\s\\S]*?)(\\n  \\],)`), (_m, a: string, b: string) => `${a}\n${rowLine}${b}`);
            for (const c of addCredits) {
                if (c.source && !next.includes(esc(c.source))) {
                    next = next.replace(/credits: \[\n?/, m2 => `${m2}    { creator: '${esc(c.creator)}', license: '${esc(c.license)}', source: '${esc(c.source)}' },\n`);
                }
            }
            const gate = syntaxOk(contentRel, next);
            if (gate.ok && next !== body) {
                write(contentRel, next);
                notes.push(isAr
                    ? `➕ أضفت «${name}» إلى ${menuArr === 'menu' ? 'القائمة' : 'المنتجات'} بسعر «${price}»${img ? ' مع صورة حقيقية مرخّصة' : ''}.`
                    : `➕ Added "${name}" (${price})${img ? ' with a real licensed photo' : ''}.`);
                logs.push(`row add: ${name} → ${menuArr}`);
            } else if (!gate.ok) {
                refused.push(`${contentRel}: row insert breaks the syntax (${gate.error}) — refused`);
            }
        }

        if (!touched.length && delRowIntent && fs.existsSync(path.join(dir, contentRel))) {
            const body = fs.readFileSync(path.join(dir, contentRel), 'utf-8');
            const rows = [...body.matchAll(/^ {4}\{ name: '([^']*)',[^\n]*\},$/gm)]
                .map(m => ({ name: m[1], line: m[0] }))
                .filter(r => /desc: '/.test(r.line) && /price: '/.test(r.line));   // dishes and products, not tiers/people
            const target = pickPhotoRow(rows, request);
            if (!target) {
                const names = rows.map(r => `«${r.name}»`).join('، ');
                return { ok: true, output: { message: isAr ? `🗑️ سمِّ العنصر المطلوب حذفه — العناصر: ${names || 'لا شيء'}.` : `🗑️ Name the item to delete — items: ${names || 'none'}.` }, logs } as any;
            }
            const oldSrc = (target.line.match(/img: \{ src: '([^']+)'/) || [])[1];
            let next = body.replace(target.line + '\n', '');
            if (!/img: \{ src: /.test(next) && !/heroImage: \{ src: /.test(next)) {
                next = next.replace(/credits: \[[\s\S]*?\n  \],/, 'credits: [\n  ],');
                logs.push('row delete: last photo left — credits emptied too');
            }
            const gate = syntaxOk(contentRel, next);
            if (gate.ok && next !== body) {
                write(contentRel, next);
                dropUnreferenced(next, oldSrc);
                notes.push(isAr ? `🗑️ حذفت «${target.name}» من ${menuArr === 'menu' ? 'القائمة' : 'المنتجات'}.` : `🗑️ Deleted "${target.name}".`);
                logs.push(`row delete: ${target.name}`);
            } else if (!gate.ok) {
                refused.push(`${contentRel}: row delete breaks the syntax (${gate.error}) — refused`);
            }
        }

        // ── deterministic fast path: named-row TEXT edits — «غيّر سعر طقم
        //    الهدية إلى 200»، «عدّل وصف الإصدار الفاخر إلى …»، «غيّر اسم …».
        //    The row lives in content.js in the serializer's own single-line
        //    format; the field swap is a regex on that line — no model writes
        //    code. A bare number keeps the row's currency affix («65 ر.س» +
        //    «200» → «200 ر.س»), and same gates, build verify and undo apply.
        const priceIntent = /(?<![ء-ي])(سعر|السعر|بسعر|أسعار|الأسعار)(?![ء-ي])|\bprices?\b/i.test(request);
        const descIntent = /(?<![ء-ي])(وصف|الوصف)(?![ء-ي])|\bdescription\b/i.test(request);
        const renameIntent = /(?<![ء-ي])(اسم|الاسم)(?![ء-ي])|\brename\b/i.test(request);
        if (!touched.length && (priceIntent || descIntent || renameIntent) && fs.existsSync(path.join(dir, contentRel))) {
            const body = fs.readFileSync(path.join(dir, contentRel), 'utf-8');
            const esc = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
            // Every serialized row, whole line — menu, products, tiers,
            // testimonials all share the `{ name: '…', … },` shape.
            const rowLines = [...body.matchAll(/^ {4}\{ name: '([^']*)',[^\n]*\},$/gm)]
                .map(m => ({ name: m[1], line: m[0] }))
                .filter(r => priceIntent ? /price: '/.test(r.line) : descIntent ? /desc: '/.test(r.line) : true);
            const target = pickPhotoRow(rowLines, request);
            // The new value: whatever follows إلى/ليصبح/=/to, quotes stripped.
            const val = ((request.match(/(?:(?<![ء-ي])(?:إلى|الى|ليصبح|ليصير|يصير|تصير)(?![ء-ي])|=|\bto\b)\s*(.+)$/i) || [])[1] || '')
                .trim().replace(/^[«"']|[»"'.،!؟]+$/g, '').trim();
            const field = priceIntent ? (isAr ? 'سعر' : 'price') : descIntent ? (isAr ? 'وصف' : 'description') : (isAr ? 'اسم' : 'name');
            if (!target || !val) {
                // Prices live ONLY in rows, so a rowless price request earns a
                // guided answer. A rowless اسم/وصف request may mean the brand
                // or a section — that belongs to the model path below.
                if (priceIntent) {
                    const names = rowLines.map(r => `«${r.name}»`).join('، ');
                    return {
                        ok: true,
                        output: {
                            message: isAr
                                ? `✏️ لأعدّل ${field} عنصرٍ بعينه، سمِّه واذكر القيمة الجديدة بعد «إلى» — العناصر المتاحة: ${names || 'لا صفوف قابلة للتعديل'}.\nمثال: «غيّر سعر ${rowLines[0]?.name || 'العنصر'} إلى 200»`
                                : `✏️ Name the item and the new value after "to" — available items: ${names || 'none'}.`,
                        },
                        logs,
                    } as any;
                }
            }
            if (target && val) {
                let newLine = target.line;
                if (priceIntent) {
                    const oldPrice = (target.line.match(/price: '([^']*)'/) || [])[1] || '';
                    // A bare number inherits the row's own currency affix.
                    const np = /^\d+([.,]\d+)?$/.test(val) && /\d/.test(oldPrice) ? oldPrice.replace(/\d+([.,]\d+)?/, val) : val;
                    newLine = target.line.replace(/price: '[^']*'/, `price: '${esc(np)}'`);
                } else if (descIntent) {
                    newLine = target.line.replace(/desc: '[^']*'/, `desc: '${esc(val)}'`);
                } else {
                    newLine = target.line.replace(`name: '${target.name}'`, `name: '${esc(val)}'`);
                    // The url follows the name: a renamed product keeps a
                    // working page instead of a slug pointing at its old self.
                    if (/slug: '/.test(newLine)) {
                        const s2 = (String(val).toLowerCase()
                            .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 32)) || 'item';
                        newLine = newLine.replace(/slug: '[^']*'/, `slug: '${esc(s2)}'`);
                    }
                }
                if (newLine !== target.line) {
                    const next = body.replace(target.line, newLine);
                    const gate = syntaxOk(contentRel, next);
                    if (gate.ok) {
                        write(contentRel, next);
                        notes.push(isAr
                            ? `✏️ غيّرت ${field} «${target.name}»${priceIntent || renameIntent ? ` إلى «${(newLine.match(priceIntent ? /price: '([^']*)'/ : /name: '([^']*)'/) || [])[1]}»` : ''}.`
                            : `✏️ Changed the ${field} of "${target.name}".`);
                        logs.push(`text edit: ${target.name} ${field} updated — no model call`);
                    } else {
                        refused.push(`${contentRel}: text edit breaks the syntax (${gate.error}) — refused`);
                    }
                }
            }
        }

        /**
         * THE COMMONEST EDIT OF ALL — AND IT NEEDED A MODEL TO MAKE IT.
         *
         * «غيّر اسم الموقع إلى …» is the first thing anyone says after seeing
         * their build. It had no deterministic path: the row editor above
         * looks for a NAMED row and finds none, and the comment there says
         * plainly that a rowless «اسم» request «belongs to the model path
         * below». So the simplest edit in the product was the one that
         * depended on a network, and on a machine with no key it answered
         * «لم أجد ما يطابق الطلب» — about a name that is sitting in the file
         * in one line.
         *
         * The brand lives in exactly two places and every other file reads it
         * from there: `brand:` in src/content.js, and the `<title>` of
         * index.html. Two known bytes are not a job for a language model.
         */
        if (!touched.length) {
            const siteWord = /(الموقع|موقعي|التطبيق|تطبيقي|المشروع|مشروعي|النظام|الصفحة|صفحتي|site|website|app|project|page)/i.test(request);
            const nameWord = /(?<![ء-ي])(اسم|الاسم|عنوان|العنوان|سمّه|سمه)(?![ء-ي])|\b(brand|title|rename)\b/i.test(request);
            const val = ((request.match(/(?:(?<![ء-ي])(?:إلى|الى|ليصبح|ليصير|يصير|تصير)(?![ء-ي])|=|\bto\b)\s*(.+)$/i) || [])[1] || '')
                .trim().replace(/^[«"']|[»"'.،!؟]+$/g, '').trim();
            const contentAbs = path.join(dir, contentRel);
            if (siteWord && nameWord && val && val.length <= 60 && fs.existsSync(contentAbs)) {
                const body = fs.readFileSync(contentAbs, 'utf-8');
                const oldBrand = (body.match(/\n\s*brand:\s*'([^']*)'/) || [])[1] || '';
                const safe = String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
                const next = body.replace(/(\n\s*brand:\s*)'[^']*'/, `$1'${safe}'`);
                const gate = syntaxOk(contentRel, next);
                if (next !== body && gate.ok) {
                    write(contentRel, next);
                    /**
                     * The tab title is the other half of the same fact. Leaving
                     * it behind means the header says one name and the browser
                     * tab says the old one — the kind of half-rename that looks
                     * like the edit silently failed.
                     */
                    const htmlAbs = path.join(dir, 'index.html');
                    if (oldBrand && fs.existsSync(htmlAbs)) {
                        const html = fs.readFileSync(htmlAbs, 'utf-8');
                        const swapped = html.replace(
                            /<title>([\s\S]*?)<\/title>/i,
                            (_m, inner) => `<title>${String(inner).split(oldBrand).join(val)}</title>`,
                        );
                        if (swapped !== html) write('index.html', swapped);
                    }
                    notes.push(isAr
                        ? `✏️ غيّرت اسم ${/التطبيق|تطبيقي/i.test(request) ? 'التطبيق' : 'الموقع'}${oldBrand ? ` من «${oldBrand}»` : ''} إلى «${val}» — في المحتوى وفي عنوان التبويب.`
                        : `✏️ Renamed the site${oldBrand ? ` from "${oldBrand}"` : ''} to "${val}" — in the content and in the tab title.`);
                    logs.push(`brand edit: ${oldBrand || '(unset)'} → ${val} — no model call`);
                } else if (next !== body) {
                    refused.push(`${contentRel}: renaming breaks the syntax (${gate.error}) — refused`);
                }
            }
        }

        // ── the general path: SEARCH/REPLACE from the model ─────────────────
        if (!touched.length) {
            const files = listFiles(dir);
            // Rank files by overlap with the request's words; content.js first
            // for wording changes, components for structure.
            const { scored } = rankFilesForEdit(
                request,
                files.map(f => ({ f, body: fs.readFileSync(path.join(dir, f), 'utf-8') })),
            );
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

Rules: the SEARCH text must be an exact quote of what is in the file. Keep edits minimal. ${isAr ? 'Any human-visible text you write must be Arabic.' : ''}

If the request does NOT say what to change in these files — it names no element, no text, no colour, no file, and no behaviour that is in them — then do NOT invent one. Reply with exactly one line and nothing else:
CANNOT TELL: <what you would need the user to say>
This is a correct answer, not a failure. Changing something the user did not ask for is the failure.`;
            let raw = '';
            try {
                raw = await routeToModel([
                    { role: 'system', content: prompt },
                    { role: 'user', content: `THE REQUEST: ${request}\n\n${scored.map(s => `FILE: ${s.f}\n\`\`\`\n${s.body}\n\`\`\``).join('\n\n')}` },
                ], undefined, undefined, undefined, undefined, undefined, undefined, context);
            } catch (e: any) {
                return { ok: false, error: `edit_model_failed: ${e?.message || e}`, logs } as any;
            }
            /**
             * A REQUEST THAT NAMES NOTHING DOES NOT AUTHORISE A CHANGE.
             *
             * «سوّي لي شي حلو» edited the owner's sales project and scored the
             * result 97/100. Nothing in that sentence points at that project,
             * at a file, or at anything in one. Asking costs him a sentence;
             * guessing costs him work he did not ask to have altered.
             */
            const cannot = modelCannotTell(raw);
            if (cannot) {
                logs.push(`model declined to guess: ${cannot}`);
                return {
                    ok: true,
                    output: {
                        message: isAr
                            ? `طلبك لا يخبرني بما أغيّره في هذا المشروع، فلم أغيّر شيئاً.\nقل لي ما الذي تريد تعديله — عنصراً أو نصاً أو لوناً أو ملفاً.`
                            : `Your request does not say what to change in this project, so I changed nothing.\nTell me what to edit — an element, some text, a colour, or a file.`,
                        askedFor: cannot,
                    },
                    logs,
                } as any;
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

        // ── ANTI-FABRICATION GATE ───────────────────────────────────────────
        // A model-written patch once added a product row carrying
        // `img: { src: 'images/boss.jpg' }` — a file that never existed. The
        // build was green (it is just a string) and the shipped page asked
        // the server for a photo that answered 404.
        //
        // So: every image reference this edit INTRODUCES must point at a file
        // that is really on disk. An invented one is stripped back to `null`
        // — the row survives, the lie does not — and the answer says so.
        const invented: string[] = [];
        for (const t of touched) {
            // EVERY reference in a file this edit just wrote is checked, not
            // only the new ones: a dangling path that slipped in earlier is
            // still a 404 on the shipped page, and this is the moment to heal
            // it rather than the next time someone notices.
            const refsOf = (s: string) => new Set([...s.matchAll(/src: '((?:images|assets)\/[^']+)'/g)].map(m => m[1]));
            const ghosts = [...refsOf(t.after)].filter(r => !fs.existsSync(path.join(dir, 'public', r)) && !fs.existsSync(path.join(dir, r)));
            if (!ghosts.length) continue;
            let repaired = t.after;
            for (const g of ghosts) {
                invented.push(g);
                repaired = repaired.split(`{ src: '${g}', alt: `).join('@@JOE_GHOST@@')
                    .replace(/@@JOE_GHOST@@[^}]*\}/g, 'null');
            }
            if (repaired !== t.after) {
                t.after = repaired;
                fs.writeFileSync(path.join(dir, t.file), repaired, 'utf-8');
                logs.push(`anti-fabrication: ${ghosts.length} invented image path(s) stripped: ${ghosts.join(', ')}`);
            }
        }
        if (invented.length) {
            notes.push(isAr
                ? `🚫 حذفت ${invented.length} مسار صورة مُختلَق (${invented.join('، ')}) — الملف غير موجود فعلاً. أرفق الصورة أو قل «ضف صورة لمنتج …» لأجلب واحدة حقيقية.`
                : `🚫 Removed ${invented.length} invented image path(s) (${invented.join(', ')}) — no such file. Attach a photo or say "add a photo to …".`);
        }

        // ── whole-project verification with the real build ──────────────────
        if (fs.existsSync(path.join(dir, 'node_modules'))) {
            if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🏗️ أتحقق بالبناء الحقيقي (vite build)…' : '🏗️ Verifying with the real build…');
            // Through the Single Execution Authority — a direct spawn here
            // BLOCKED STARTUP on the user's machine (ExecutionEnforcer).
            const { executionEngine } = require('../../../kernel/ExecutionEngine');
            buildVerified = (await executionEngine.runArgvStreaming('npm', ['run', 'build'], {
                cwd: dir, timeout: 180_000, env: { NO_COLOR: '1' },
            }).done).ok;
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
        writeJoeProject(sessionKey, { ...(entry || {}), dir, updatedAt: Date.now(), history, lastRequest: request.slice(0, 80) }, context?.runId ?? null);
        persistJoeProjects();

        // The verified change is VISIBLE the moment it lands — the preview
        // panel refreshes off the freshly rebuilt dist through the live
        // /project-preview route. Only a green build earns this: a skipped
        // or failed verification has no fresh dist to show.
        if (buildVerified === true) {
            const url = publicUrlFor(`/project-preview/${sessionKey}/index.html?v=${Date.now()}`);
            try { broadcast({ type: 'preview_ready', sessionId, data: { url, previewUrl: url, sessionId } } as any); } catch { /* UI optional */ }
        }

        // ── SELF-QA AFTER THE EDIT ──────────────────────────────────────────
        // A green build only proves the code compiles. The field shipped an
        // edit whose build was green and whose page asked the server for a
        // photo that answered 404 — a real browser sees that in one second.
        // Same audit the builder runs, same honest skip when it cannot.
        let audit: any = null;
        if (buildVerified === true && !input?.skipAudit) {
            if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🔎 أفحص النتيجة في متصفح حقيقي…' : '🔎 Auditing the result in a real browser…');
            try {
                const { auditBuiltApp, formatAudit } = require('../../../core/quality/app-audit');
                audit = await auditBuiltApp(path.join(dir, 'dist'));
                if (audit && !audit.skipped) notes.push(formatAudit(audit, isAr));
                logs.push(`self-QA after edit: ${audit?.skipped ? `skipped (${audit.skipped})` : `${audit?.score}/100`}`);
            } catch (e: any) { logs.push(`self-QA after edit failed: ${String(e?.message || e).slice(0, 80)}`); }
        }

        const stats = touched.map(t => {
            const d = diffSummary(t.before, t.after);
            return `   • ${t.file} (+${d.added} −${d.removed})`;
        }).join('\n');
        const message = isAr
            ? `🔬 عُدّل المشروع جراحياً — ${touched.length} ملف:\n${stats}
${notes.length ? notes.join('\n') + '\n' : ''}${buildVerified === true ? '✅ vite build نجح بعد التعديل — المشروع سليم.' : buildVerified === false ? '' : 'ℹ️ (الحزم غير مثبتة — تخطيت تحقق البناء؛ بوابة الفحص النحوي طُبّقت على كل ملف)'}${refused.length ? `\n⚠️ رُفض ${refused.length} تعديلاً غير آمن:\n${refused.map(r => `   • ${r}`).join('\n')}` : ''}

🧭 «شغّل خادم التطوير» للمعاينة الحية · «تراجع» يسترجع الملفات السابقة`
            : `🔬 Surgical edit — ${touched.length} file(s):\n${stats}\n${notes.length ? notes.join('\n') + '\n' : ''}${buildVerified === true ? '✅ vite build passed after the edit.' : ''}`;
        return { ok: true, output: { message, dir, touched: touched.map(t => t.file), refused, buildVerified, audit, invented }, logs } as any;
    }
}
