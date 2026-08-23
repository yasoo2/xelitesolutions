/**
 * «اجلب صوراً للنباتات» — the tool that fills a system's pictures.
 *
 * He asked for a PERMANENT answer, not a one-off: every time a system is built
 * and its owner wants pictures for what it holds, one sentence should fill
 * them. This is that sentence, and it is a real registered tool rather than a
 * step inside one builder, so it works on any system Joe has ever built,
 * before or after this commit.
 *
 * It writes through the project's OWN entities module — the same file the
 * generated server uses — so there is no second definition of a row, no HTTP
 * round trip, no token to find, and it works whether or not the server is
 * running. The script runs INSIDE the project with its own Node so the ESM
 * module loads natively; nothing here reimplements the database.
 *
 * The ladder does the choosing (`core/design/row-image.ts`), and the answer
 * says which rung each picture came from — «٤ حقيقية · ٢ مولّدة · ١ بطاقة» —
 * because «تم» is not a report.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { describePictures, picturesFor, RowPicture, Shrinker } from '../../../core/design/row-image';
import { isArabicReply } from '../../../shared/reply-language';

/** The columns that hold a picture — the same rule the app and server use. */
const IMAGE_COL = /(^|_)(image|photo|picture|img)$/;

interface TableRow { id: number; [k: string]: any }

/** Read the tables and their rows out of the project, using its own module. */
async function readTables(dir: string): Promise<Array<{ key: string; imageCol: string; nameCol: string; rows: TableRow[] }>> {
    const script = path.join(dir, '.joe-read-tables.mjs');
    const out = path.join(os.tmpdir(), `joe-tables-${Date.now()}.json`);
    fs.writeFileSync(script, `
import fs from 'node:fs';
import { entities } from './entities.js';
const out = [];
for (const key of Object.keys(entities.tables)) {
  const t = entities.tables[key];
  const fields = (t.entity && t.entity.fields) || [];
  out.push({ key, fields: fields.map(f => f.key), rows: t.list() });
}
fs.writeFileSync(process.argv[2], JSON.stringify(out));
`, 'utf-8');
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { executionEngine } = require('../../../kernel/ExecutionEngine');
        const child = executionEngine.runArgvStreaming(process.execPath, ['.joe-read-tables.mjs', out], {
            cwd: dir, env: { NODE_NO_WARNINGS: '1' },
            onLine: () => { /* the file is the answer */ },
        });
        await Promise.race([child.done, new Promise(r => setTimeout(r, 25_000))]);
        if (!fs.existsSync(out)) return [];
        const raw: any[] = JSON.parse(fs.readFileSync(out, 'utf-8'));
        return raw.map(t => {
            const imageCol = (t.fields || []).find((f: string) => IMAGE_COL.test(f)) || '';
            const nameCol = (t.fields || []).find((f: string) => !IMAGE_COL.test(f) && !/_id$/.test(f)) || 'name';
            return { key: String(t.key), imageCol, nameCol, rows: (t.rows || []) as TableRow[] };
        });
    } catch { return []; }
    finally {
        try { fs.rmSync(script, { force: true }); } catch { /* best effort */ }
        try { fs.rmSync(out, { force: true }); } catch { /* best effort */ }
    }
}

/** Write the pictures back, again through the project's own module. */
async function writePictures(dir: string, table: string, col: string, byId: Record<string, string>): Promise<number> {
    const script = path.join(dir, '.joe-write-pics.mjs');
    const payload = path.join(os.tmpdir(), `joe-pics-${Date.now()}.json`);
    fs.writeFileSync(payload, JSON.stringify(byId), 'utf-8');
    fs.writeFileSync(script, `
import fs from 'node:fs';
import { entities } from './entities.js';
const [table, col, file] = process.argv.slice(2);
const byId = JSON.parse(fs.readFileSync(file, 'utf-8'));
const t = entities.tables[table];
let n = 0;
for (const id of Object.keys(byId)) { if (t.update(Number(id), { [col]: byId[id] })) n++; }
console.log('joe-wrote ' + n);
`, 'utf-8');
    let wrote = 0;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { executionEngine } = require('../../../kernel/ExecutionEngine');
        const child = executionEngine.runArgvStreaming(process.execPath, ['.joe-write-pics.mjs', table, col, payload], {
            cwd: dir, env: { NODE_NO_WARNINGS: '1' },
            onLine: (l: string) => { const m = String(l).match(/joe-wrote (\d+)/); if (m) wrote = Number(m[1]); },
        });
        await Promise.race([child.done, new Promise(r => setTimeout(r, 40_000))]);
    } catch { /* reported as zero */ }
    finally {
        try { fs.rmSync(script, { force: true }); } catch { /* best effort */ }
        try { fs.rmSync(payload, { force: true }); } catch { /* best effort */ }
    }
    return wrote;
}

export class ImageStudioTool extends BaseTool {
    name = 'image_studio';
    version = '1.0.0';
    description = 'Fill the pictures of a built system: a real licensed photograph searched by each row\'s own name, '
        + 'a generated image when no archive matches it, and a designed card when neither is reachable. '
        + 'Works on any table that has an image column, whether or not the server is running.';
    tags = ['images', 'photos', 'system', 'design'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            table: { type: 'string' as const, description: 'One table key (plants, products…). Empty means every table that has a picture column.' },
            context: { type: 'string' as const, description: 'Words that place the subject, e.g. «مشتل نباتات».' },
            limit: { type: 'number' as const, description: 'How many rows at most (default 12).' },
            redo: { type: 'boolean' as const, description: 'Replace pictures that are already there (default false).' },
        },
        required: [] as string[],
    };
    permissions: ToolPermission[] = ['internet', 'write'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 6;
    auditFields = ['table'];

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const sessionId = String(context?.sessionId || 'default');
        const isAr = isArabicReply({ language: context?.language, text: String(input?.context || '') });
        const projects = (global as any).joeProjects || {};
        const entry = projects[sessionId] || projects[String(sessionId).replace(/[^a-zA-Z0-9._-]/g, '_')];
        const dir = String(entry?.dir || '');
        if (!dir || !fs.existsSync(path.join(dir, 'entities.js'))) {
            return {
                ok: false,
                error: isAr
                    ? 'لا يوجد نظام بجداول في هذه الجلسة — ابنِ النظام أولاً ثم قل «اجلب الصور».'
                    : 'This session has no system with tables — build one first, then ask for the pictures.',
            };
        }

        const tables = await readTables(dir);
        const withPictures = tables.filter(t => t.imageCol && (!input?.table || t.key === String(input.table)));
        if (!withPictures.length) {
            return {
                ok: false,
                error: isAr
                    ? `لا جدول فيه عمود صورة${input?.table ? ` باسم «${input.table}»` : ''} — الصور تُضاف لما يُزرع أو يُباع، لا للفواتير والأشخاص.`
                    : 'No table here has a picture column — pictures belong to things, not to invoices and people.',
            };
        }

        const limit = Math.max(1, Math.min(40, Number(input?.limit) || 12));
        const shrinker = new Shrinker();
        const logs: string[] = [];
        const lines: string[] = [];
        let filled = 0;
        const all: RowPicture[] = [];
        try {
            for (const t of withPictures) {
                const todo = t.rows
                    .filter(r => (input?.redo ? true : !String(r[t.imageCol] || '').trim()))
                    .slice(0, limit);
                if (!todo.length) {
                    lines.push(isAr ? `• ${t.key}: كل الصفوف لها صور بالفعل` : `• ${t.key}: every row already has one`);
                    continue;
                }
                const names = todo.map(r => String(r[t.nameCol] || ''));
                const pics = await picturesFor(names, {
                    context: String(input?.context || ''), shrinker,
                    onNote: (n) => { if (n) logs.push(`image: ${n}`); },
                });
                all.push(...pics);
                const byId: Record<string, string> = {};
                todo.forEach((r, i) => { if (pics[i]?.data) byId[String(r.id)] = pics[i].data; });
                const wrote = await writePictures(dir, t.key, t.imageCol, byId);
                filled += wrote;
                lines.push(`• ${t.key}: ${wrote} — ${describePictures(pics, isAr)}`);
                logs.push(`image_studio: ${t.key} ${wrote}/${todo.length} — ${describePictures(pics, false)}`);
            }
        } finally { await shrinker.close(); }

        const credits = all.map(p => p.credit).filter(Boolean).slice(0, 4);
        const message = isAr
            ? `🖼️ صور النظام — ${filled} صفّاً:\n${lines.join('\n')}`
            + (credits.length ? `\n\n📸 المصادر: ${credits.join(' · ')}` : '')
            + '\n\nالصور محفوظة داخل قاعدة البيانات نفسها — تنتقل مع النظام إلى أي دومين بلا رفع ولا مسار خارجي.'
            : `🖼️ System pictures — ${filled} row(s):\n${lines.join('\n')}`
            + (credits.length ? `\n\n📸 Credits: ${credits.join(' · ')}` : '');

        return { ok: true, output: { message, filled, tables: withPictures.map(t => t.key) }, logs };
    }
}
