/**
 * project_data_recovery — «رجّع بيانات تطبيقي» from the chat (review 7, B3; review 8; redesigned in review 9).
 *
 * On a change run Joe's checks put the owner's data files back as they were before them (verify.ts and the loops'
 * owner-data-span.ts). A record he or his customers wrote while the checks ran is erased from the app by that
 * put-back — and kept, every version of it, in Joe's recovery copies outside the project (qa-leaves-no-trace.ts ›
 * watchAppData). He is told «ask Joe in the chat to bring one back»: this is what answers him. No new menu, button,
 * tab or panel.
 *
 * Bringing a copy back REPLACES his live records, so it is safe by construction, not by reading his words:
 *
 *   list     (read-only; the model calls it when he asks about his kept copies) the copies of the session's project,
 *            newest first, each with a STABLE id (its time, `YYYYMMDD-HHMMSS` in UTC), its local time with the
 *            offset, the records in each file, and whether it holds records Joe's own checks marked. It ends with ONE
 *            line he sends back to bring a copy back («استعِد النسخة 20261117-002502» / «restore copy …»), and Joe
 *            remembers — here, on the server, for this session and project — which copies that list showed.
 *   restore  only when his own whole typed message (the run's `ownerMessage`: never a file's block, a picture's text
 *            or a model's words) IS that line (restore-reply.ts) for a copy the most recent list of this session and
 *            project showed, in an earlier turn, within thirty minutes, once. The planner routes exactly that message
 *            here with no model in the loop; nothing the model passes can make any other message restore, and there
 *            is no token for it to see or pass. Then: the project's verify lock; every port the app names that is not
 *            one of Joe's servers checked BEFORE anything is stopped; Joe's own servers of the project (and only of
 *            it: never a drive root, the home folder or a folder above the project) stopped; what each file is now
 *            kept aside; the copy written. When a step after the stop fails, the servers Joe stopped are started
 *            again and he is told — his app is never left down without his knowing.
 */
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { isArabicReply } from '../../../shared/reply-language';
import { isHomeDriveOrAbove, isWithinRoot } from '../path-containment';
import { restoreLine, restoreReplyCopyId } from '../../../core/engine/restore-reply';

/** verify.ts, read when used: it imports the pipeline and the run tools, which the registry imports too. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const recovery = (): typeof import('../../../core/engine/verify') => require('../../../core/engine/verify');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const noTrace = (): typeof import('../../../core/quality/qa-leaves-no-trace') => require('../../../core/quality/qa-leaves-no-trace');

/** A list's line brings a copy back for this long (once). */
export const RECOVERY_CONFIRM_TTL_MS = 30 * 60 * 1000;
/** How long the restore waits for a running check of the project to end. */
const RESTORE_LOCK_WAIT_MS = 5_000;

/** One kept version he may bring back, as he is shown it. */
export interface RecoveryChoice {
    /** The stable id he names: its time, `YYYYMMDD-HHMMSS` UTC, `-2`… when two share a second. */
    id: string;
    /** The folder its copies were kept by (the project, its API folder, a server folder). */
    root: string;
    runId: string; n: number; at: number; files: string[]; bytes: number; why?: string;
}

const pad = (v: number, n = 2) => String(v).padStart(n, '0');
/** The stable id of a copy made at `at`: `YYYYMMDD-HHMMSS`, in UTC, whatever the server's zone. */
export function recoveryCopyId(at: number): string {
    const d = new Date(at);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}
/** The server's local time with its offset, so a time is never read three hours off. */
export function recoveryLocalTime(at: number): string {
    const d = new Date(at);
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} (UTC${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)})`;
}

/** Every kept version under the given folders, newest first, each with its stable id. */
export async function recoveryChoices(workspaceId: string, roots: string | string[], env: NodeJS.ProcessEnv = process.env): Promise<RecoveryChoice[]> {
    const all: Array<Omit<RecoveryChoice, 'id'>> = [];
    for (const root of Array.from(new Set((Array.isArray(roots) ? roots : [roots]).map(r => path.resolve(r))))) {
        const runs = await recovery().listRecoveryVersions(workspaceId, root, env);
        for (const run of runs) for (const v of run.versions) {
            if (!(v.n > 0) || !v.files.length) continue;
            all.push({ root, runId: run.runId, n: v.n, at: v.at || run.startedAt, files: v.files, bytes: v.bytes, ...(v.why ? { why: v.why } : {}) });
        }
    }
    //  Ids by time: the oldest of a second keeps the plain id, the next ones `-2`, `-3` — never a position in the list.
    const byTime = [...all].sort((a, b) => a.at - b.at || a.runId.localeCompare(b.runId) || a.n - b.n || a.root.localeCompare(b.root));
    const seen = new Map<string, number>();
    const withIds = byTime.map(v => {
        const base = recoveryCopyId(v.at);
        const k = (seen.get(base) || 0) + 1;
        seen.set(base, k);
        return { id: k === 1 ? base : `${base}-${k}`, ...v };
    });
    return withIds.sort((a, b) => b.at - a.at || b.n - a.n);
}

/** The copy with this exact id ('' or a bare number names none). */
export function pickRecoveryChoice(choices: RecoveryChoice[], id: unknown): RecoveryChoice | undefined {
    const text = String(id ?? '').trim();
    return text ? choices.find(c => c.id === text) : undefined;
}

/**
 * The folder a session's project keeps its copies by — the folder itself, and never a folder above it (review 9, H2).
 * Review 8 climbed to any folder up to three above that held a `.joe`, and the browser's profiles make the home
 * folder hold one: a project in ~/Desktop/shop had the home folder among its roots, and a restore stopped every
 * chat's server under it. A drive root, the home folder or a folder above it is no project at all: nothing.
 */
export function recoveryRoots(dir: string): string[] {
    const at = path.resolve(String(dir || ''));
    return String(dir || '').trim() && !isHomeDriveOrAbove(at) ? [at] : [];
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.joe', '.joe-versions', '.joe-qa', 'dist', 'build', 'coverage', '.cache', '.next', '.vite', 'public', 'static', 'assets']);
const SERVER_MARK = /^(?:package\.json|server\.(?:c?js|mjs|ts)|app\.(?:c?js|mjs|ts)|index\.(?:c?js|mjs)|main\.py|app\.py|manage\.py)$/iu;
/** The folders below the project (two deep) a server runs from: where a pipeline keys its copies (`serverRoot`). */
function serverFoldersBelow(root: string): string[] {
    const out: string[] = [];
    let seen = 0;
    const walk = (dir: string, depth: number) => {
        if (depth > 2 || seen > 400) return;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (++seen > 400) return;
            if (!e.isDirectory() || e.isSymbolicLink() || SKIP_DIRS.has(e.name.toLowerCase()) || e.name.startsWith('.')) continue;
            const sub = path.join(dir, e.name);
            try { if (fs.readdirSync(sub).some(f => SERVER_MARK.test(f))) out.push(sub); } catch { /* unreadable */ }
            walk(sub, depth + 1);
        }
    };
    walk(root, 1);
    return out;
}

/**
 * Every folder a loop may have kept this project's copies by (review 8, H2; bounded in review 9, H2): the session's
 * project folder, the server folders below it (the pipeline's `serverRoot`), and the folders Joe RECORDED for this
 * project — the packaged API folder (react_project, project_repair) and the recorded live server's folder. None of
 * them is ever a drive root, the home folder, a folder above it, or a folder above the project; a recorded folder
 * outside the project is taken only when it holds no other chat's project inside it, so a restore here never stops
 * another chat's server (review 9, H2).
 */
export function projectRecoveryRoots(
    project: { dir: string; packagedInto?: string; linkedApiDir?: string; live?: { cwd?: string; projectCwd?: string } },
    others: string[] = otherChatsProjects(project.dir),
): string[] {
    const base = recoveryRoots(project.dir)[0];
    if (!base) return [];
    const out = new Set<string>([base]);
    const isDir = (p: string) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
    const recorded = (p: unknown) => {
        const s = String(p || '').trim();
        if (!s) return;
        const d = path.resolve(s);
        if (!isDir(d) || isHomeDriveOrAbove(d)) return;
        //  Under the project: its own.
        if (isWithinRoot(d, base)) { out.add(d); return; }
        //  Above the project, or holding another chat's project: never.
        if (isWithinRoot(base, d)) return;
        if (others.some(o => !samePath(o, d) && isWithinRoot(o, d))) return;
        out.add(d);
    };
    recorded(project.packagedInto);
    recorded(project.linkedApiDir);
    recorded(project.live?.cwd);
    recorded(project.live?.projectCwd);
    for (const sub of serverFoldersBelow(base)) out.add(sub);
    return Array.from(out);
}

const samePath = (a: string, b: string) => isWithinRoot(a, b) && isWithinRoot(b, a);
/** The project folders of the other chats Joe knows, but not this one's. */
function otherChatsProjects(dir: string): string[] {
    const mine = path.resolve(String(dir || ''));
    const out: string[] = [];
    for (const entry of Object.values(((global as any).joeProjects || {}) as Record<string, any>)) {
        const d = String(entry?.dir || '').trim();
        if (d && !samePath(path.resolve(d), mine)) out.push(path.resolve(d));
    }
    return out;
}

/** The records Joe's own checks write carry these marks (qa-field-cases.ts, behaviour-audit.ts). */
const QA_RECORD_MARK = /Joe[ +]?QA|JoeQA|joe\.qa\+|qa\.tester|__joeQaXss|اختبار جو/giu;
const COUNT_MAX_BYTES = 20 * 1024 * 1024;

/** What one kept copy holds, read by Joe's code (never shown to a model): records per file, and Joe's own marked records. */
export interface CopyContents { files: Array<{ file: string; records?: number }>; qaMarked: number }

function countSqlite(file: string): number | undefined {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(file, { readOnly: true });
        try {
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
            let total = 0;
            for (const t of tables.slice(0, 50)) total += Number((db.prepare(`SELECT COUNT(*) AS n FROM "${String(t.name).replace(/"/gu, '""')}"`).get() as any)?.n) || 0;
            return total;
        } finally { db.close(); }
    } catch { return undefined; }
}

export function copyContents(versionDir: string, files: string[]): CopyContents {
    const out: CopyContents = { files: [], qaMarked: 0 };
    for (const rel of files) {
        const abs = path.join(versionDir, ...rel.split('/'));
        let records: number | undefined;
        try {
            const st = fs.lstatSync(abs);
            if (st.isFile() && st.size <= COUNT_MAX_BYTES) {
                if (/\.(?:db|sqlite|sqlite3|db3)$/iu.test(rel)) {
                    records = countSqlite(abs);
                    out.qaMarked += (fs.readFileSync(abs).toString('utf8').match(QA_RECORD_MARK) || []).length;
                } else {
                    const text = fs.readFileSync(abs, 'utf8');
                    if (/\.json$/iu.test(rel)) {
                        try {
                            const data = JSON.parse(text);
                            const lists: any[][] = Array.isArray(data) ? [data] : (data && typeof data === 'object' ? Object.values(data).filter(Array.isArray) as any[][] : []);
                            if (lists.length) {
                                records = lists.reduce((sum, l) => sum + l.length, 0);
                                out.qaMarked += lists.reduce((sum, l) => sum + l.filter(item => { QA_RECORD_MARK.lastIndex = 0; return QA_RECORD_MARK.test(JSON.stringify(item)); }).length, 0);
                            } else {
                                out.qaMarked += (text.match(QA_RECORD_MARK) || []).length;
                            }
                        } catch { out.qaMarked += (text.match(QA_RECORD_MARK) || []).length; }
                    } else {
                        if (/\.(?:jsonl|ndjson)$/iu.test(rel)) records = text.split(/\r?\n/u).filter(l => l.trim()).length;
                        else if (/\.csv$/iu.test(rel)) records = Math.max(0, text.split(/\r?\n/u).filter(l => l.trim()).length - 1);
                        out.qaMarked += (text.match(QA_RECORD_MARK) || []).length;
                    }
                }
            }
        } catch { /* unreadable: no count */ }
        out.files.push({ file: rel, ...(records !== undefined ? { records } : {}) });
    }
    return out;
}

/* ───────────── what the latest list showed: on the server, per session and project, used once ───────────── */

interface ShownList {
    /** The turn (run) that showed the list. */
    turn: string;
    shownAt: number;
    /** The session project's folder, resolved and case-folded on Windows. */
    project: string;
    /** The workspace whose copies were listed. */
    workspaceId: string;
    copies: Map<string, { root: string; runId: string; n: number; at: number; files: string[] }>;
}
/** Keyed by session and project: a later list of the same project replaces the earlier one. */
const SHOWN = new Map<string, ShownList>();
const projectIdOf = (dir: string) => { let r = path.resolve(dir); try { r = fs.realpathSync.native(r); } catch { /* as resolved */ } return process.platform === 'win32' ? r.toLowerCase() : r; };
const shownKey = (sessionKey: string, project: string) => `${sessionKey}\n${project}`;
const turnOf = (context: any) => String(context?.runId || context?.traceId || '').trim();

/** Tests only: forget every list shown. */
export function _forgetRecoveryConfirmations(): void { SHOWN.clear(); }

/** The ports the app itself names: `.env` PORT, its start scripts, `listen(…)` and `PORT || …` in its server files. */
export function appDeclaredPorts(roots: string[]): number[] {
    const ports = new Set<number>();
    const add = (v: unknown) => { const n = Number(v); if (Number.isInteger(n) && n > 0 && n < 65536) ports.add(n); };
    const read = (file: string): string => { try { const st = fs.statSync(file); return st.isFile() && st.size <= 256 * 1024 ? fs.readFileSync(file, 'utf8') : ''; } catch { return ''; } };
    for (const root of roots) {
        for (const env of ['.env', '.env.local', '.env.development', '.env.production']) {
            for (const m of read(path.join(root, env)).matchAll(/^\s*(?:export\s+)?(?:PORT|APP_PORT|SERVER_PORT|API_PORT)\s*=\s*['"]?(\d{2,5})/gmu)) add(m[1]);
        }
        try {
            const pkg = JSON.parse(read(path.join(root, 'package.json')) || '{}');
            for (const script of Object.values(pkg?.scripts || {})) {
                for (const m of String(script).matchAll(/\bPORT=(\d{2,5})|--port[= ](\d{2,5})|\s-p\s+(\d{2,5})\b/gu)) add(m[1] || m[2] || m[3]);
            }
        } catch { /* no package.json */ }
        const entries = ['server.js', 'server.cjs', 'server.mjs', 'server.ts', 'index.js', 'app.js', 'main.js', 'src/server.js', 'src/server.ts', 'src/index.js', 'src/index.ts', 'src/app.js', 'main.py', 'app.py'];
        for (const rel of entries) {
            const text = read(path.join(root, rel));
            if (!text) continue;
            for (const m of text.matchAll(/\.listen\(\s*(\d{2,5})\b|\bPORT\b[^\n;]{0,40}?(?:\|\||\?\?)\s*(\d{2,5})\b|\bport\s*=\s*(\d{2,5})\b/gu)) add(m[1] || m[2] || m[3]);
        }
    }
    return Array.from(ports);
}

export class ProjectDataRecoveryTool extends BaseTool {
    name = 'project_data_recovery';
    version = '3.0.0';
    description = 'Read-only: list the copies Joe kept of the app\'s data files (as they were before each put-back of his checks, kept outside the project), each with its id. Call it with action "list" when the owner asks about the copies Joe kept of his data or how to get his data back. It never restores anything: a copy comes back only when the owner himself sends, as his whole message, the exact line the list ends with.';
    tags = ['project', 'data', 'recovery', 'copies'];
    /** Never named by a request's words (capability-match.ts): «the data table copy» is work on his app, not his copies (review 9, M1). */
    matchedByWords = false;

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: { type: 'string' as const, enum: ['list'], description: 'Always "list" (read-only).' },
            projectDir: { type: 'string' as const, description: 'Project folder; it must be this session\'s project (or one of its recorded folders). Defaults to it.' },
        },
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const };

    permissions: ToolPermission[] = ['write', 'execute'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 12;
    auditFields = ['projectDir', 'action'];
    mockSupported = false;

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        //  What he TYPED for this run (AgentOrchestrator: the run's ownerText) — nothing else ever counts as his reply.
        const owner = typeof context?.ownerMessage === 'string' ? context.ownerMessage : '';
        const ar = isArabicReply({ language: context?.language, text: owner || String(input?.request || context?.request || '') });
        const say = (a: string, e: string) => (ar ? a : e);
        const refuse = (error: string, a: string, e: string, extra: Record<string, unknown> = {}) => ({ ok: false, error, output: { message: say(a, e), ...extra }, logs } as any);
        const sessionKey = String(context?.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const active = ((global as any).joeProjects || {})[sessionKey];
        const projectDir = String(active?.dir || '').trim();
        if (!projectDir || !fs.existsSync(projectDir)) return refuse('no_project', 'لا أعرف أي تطبيق تقصد: افتح المشروع أولًا.', 'I do not know which app you mean: open the project first.');
        //  H2: the project's own folders, never a drive root, the home folder or a folder above the project.
        const roots = projectRecoveryRoots(active);
        if (!roots.length) return refuse('no_project', 'مجلد هذه المحادثة ليس مجلد مشروع واحد (هو جذر قرص أو مجلد المستخدم أو أعلى منه)، فلا يعرض جو منه نسخًا ولا يعيد إليه شيئًا.', 'This chat\'s folder is not one project\'s folder (it is a drive root, the home folder or above it): Joe lists no copies of it and brings nothing back into it.');
        //  M3 (review 8): only this session's project — its own folder and the folders Joe recorded for it.
        const { isInsideFolder } = noTrace();
        const asked = String(input?.projectDir || '').trim();
        if (asked && !roots.some(r => isInsideFolder(asked, r))) {
            return refuse('outside_project', 'هذا المجلد ليس مشروع هذه المحادثة، فلم يُعرض منه شيء ولم يُعَد شيء.', 'That folder is not this chat\'s project: nothing was listed or brought back from it.');
        }
        //  The copies are kept per workspace, as the verification kept them (verify.ts › workspaceOf).
        const workspaceId = String(context?.workspaceId || context?.joe?.workspaceId || 'default').trim() || 'default';
        const choices = await recoveryChoices(workspaceId, roots);
        const turn = turnOf(context);
        const project = projectIdOf(projectDir);
        const key = shownKey(sessionKey, project);
        if (!choices.length) {
            SHOWN.delete(key);
            return {
                ok: true,
                output: {
                    versions: [],
                    message: say(
                        'لا يحتفظ جو الآن بأي نسخة من ملفات بيانات هذا التطبيق: لم تُعِد فحوصه شيئًا فوقها خلال الأيام الأربعة عشر الماضية.',
                        'Joe keeps no copy of this app\'s data files now: his checks put nothing back over them in the last fourteen days.'),
                },
                logs,
            } as any;
        }

        /** Shows the copies and remembers, for this session and project, which ones this list showed. */
        const list = (lead: string[]) => {
            const shown = choices.slice(0, 20);
            SHOWN.set(key, {
                turn, shownAt: Date.now(), project, workspaceId,
                copies: new Map(shown.map(c => [c.id, { root: c.root, runId: c.runId, n: c.n, at: c.at, files: c.files }])),
            });
            const lines = shown.map(c => {
                const what = copyContents(noTrace().recoveryVersionDir(workspaceId, c.root, c.runId, c.n), c.files);
                const files = what.files.map(f => f.records === undefined ? f.file : say(`${f.file} (عدد السجلات: ${f.records})`, `${f.file} (${f.records} record${f.records === 1 ? '' : 's'})`)).join(say('، ', ', '));
                const marked = what.qaMarked > 0 ? say(` — ⚠️ فيها ${what.qaMarked} من سجلات فحوص جو المعلَّمة («Joe QA» أو «اختبار جو»)`, ` — ⚠️ it holds ${what.qaMarked} of the records Joe's checks marked («Joe QA» / «اختبار جو»)`) : '';
                const before = c.why === 'before a restore' ? say(' — ملفاتك كما كانت قبل إعادة سابقة', ' — your files as they were before an earlier restore') : '';
                return `• ${c.id} — ${recoveryLocalTime(c.at)} — ${files}${marked}${before}`;
            });
            const example = shown[0].id;
            return {
                ok: true,
                output: {
                    versions: shown.map(c => ({ id: c.id, at: c.at, files: c.files, bytes: c.bytes })),
                    message: [
                        ...lead,
                        say('النسخ التي يحتفظ بها جو من ملفات بيانات تطبيقك (الأحدث أولًا):', 'The copies Joe keeps of your app\'s data files (newest first):'),
                        ...lines,
                        say(
                            'إعادة نسخة تستبدل بياناتك الحالية في التطبيق، ويحفظ جو بياناتك الحالية جانبًا أولًا فلا يضيع منها شيء، ويوقف خوادم تطبيقك التي شغّلها قبل الإعادة. '
                            + 'لا يعيد جو نسخة إلا إذا أرسلت رسالة ليس فيها إلا السطر التالي كما هو (ولنسخة أخرى ضع معرّفها مكان المعرّف)، خلال ثلاثين دقيقة، مرة واحدة. '
                            + 'أي رسالة غيرها — سؤال، أو شرط، أو «بعدين»، أو «تمام»، أو هذا السطر داخل جملة — لا تعيد شيئًا.',
                            'Bringing a copy back replaces your app\'s current data; Joe keeps today\'s data aside first, so none of it is lost, and stops the servers of your app he started before it. '
                            + 'Joe brings a copy back only when you send a message that is nothing but the line below, as it is (for another copy, put its id in place of the id), within thirty minutes, once. '
                            + 'Any other message — a question, a condition, «later», «ok», or this line inside a sentence — brings nothing back.'),
                        restoreLine(example, ar),
                    ].filter(Boolean).join('\n'),
                },
                logs,
            } as any;
        };

        //  The model's call is a list, always. A restore is only his exact line, routed here by the planner.
        const lineId = restoreReplyCopyId(owner);
        const wantsRestore = String(input?.action || '').toLowerCase() === 'restore';
        if (!wantsRestore || !lineId) {
            return list(wantsRestore
                ? [say('لم يُعَد شيء: لا تُعاد نسخة إلا برسالة منك ليس فيها إلا السطر الذي في آخر هذه القائمة.', 'Nothing was brought back: a copy comes back only on a message of yours that is nothing but the line at the end of this list.')]
                : []);
        }
        if (input?.restore !== undefined && String(input.restore).trim() !== lineId) {
            return list([say(`لم يُعَد شيء: السطر الذي أرسلته يسمّي النسخة ${lineId}، لا غيرها.`, `Nothing was brought back: the line you sent names copy ${lineId}, and no other.`)]);
        }

        /* ── restore: every condition, or nothing is brought back (and the list is shown again) ── */
        const shown = SHOWN.get(key);
        const again = (a: string, e: string) => list([say(a, e)]);
        if (!turn) return again('لم يُعَد شيء: لا أستطيع التحقق من أن رسالتك جاءت بعد القائمة.', 'Nothing was brought back: Joe cannot tell that your message came after the list.');
        if (!shown || shown.project !== project || shown.workspaceId !== workspaceId) return again('لم يُعَد شيء: لم يعرض جو عليك قائمة نسخ لهذا التطبيق في هذه المحادثة بعد. هذه هي.', 'Nothing was brought back: Joe has not shown you a list of this app\'s copies in this chat yet. Here it is.');
        if (Date.now() - shown.shownAt > RECOVERY_CONFIRM_TTL_MS) return again('لم يُعَد شيء: مضى على عرض القائمة أكثر من ثلاثين دقيقة، فهذه هي من جديد.', 'Nothing was brought back: the list was shown more than thirty minutes ago, so here it is again.');
        if (!shown.turn || shown.turn === turn) return again('لم يُعَد شيء: السطر يُرسَل في رسالة منك بعد أن ترى القائمة.', 'Nothing was brought back: the line is sent in a message of yours after you have seen the list.');
        const copy = shown.copies.get(lineId);
        if (!copy) return again(`لم يُعَد شيء: النسخة ${lineId} ليست في آخر قائمة عُرضت عليك.`, `Nothing was brought back: copy ${lineId} is not in the latest list you were shown.`);
        return this.restore({ workspaceId, sessionKey, key, shown, roots, copy, id: lineId, ar, logs, context });
    }

    /** The restore itself: the lock, the ports checked, Joe's servers stopped, the file copy — and his app never left down untold. */
    private async restore(a: { workspaceId: string; sessionKey: string; key: string; shown: ShownList; roots: string[]; copy: { root: string; runId: string; n: number; at: number }; id: string; ar: boolean; logs: string[]; context: any }): Promise<ToolExecutionResult> {
        const { workspaceId, sessionKey, key, shown, roots, copy, id, ar, logs, context } = a;
        const say = (x: string, y: string) => (ar ? x : y);
        const refuse = (error: string, x: string, y: string, extra: Record<string, unknown> = {}) => ({ ok: false, error, output: { message: say(x, y), ...extra }, logs } as any);
        const { acquireVerifyLock, addressIsFree } = noTrace();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const run = require('./ProjectRunTool') as typeof import('./ProjectRunTool');
        const join = (ports: number[]) => ports.join(say('، ', ', '));
        //  H1 (review 8): no check of this project runs while its data comes back, and none puts a snapshot back over it after.
        const locks: Array<{ release(): Promise<void> }> = [];
        const releaseAll = async () => { for (const l of locks.splice(0)) await l.release().catch(() => undefined); };
        try {
            for (const root of [...roots].sort()) {
                const lock = await acquireVerifyLock(workspaceId, root, `restore-${Date.now().toString(36)}`, { waitMs: RESTORE_LOCK_WAIT_MS }).catch(() => null);
                if (!lock) {
                    return refuse('check_running', 'لم يُعَد شيء ولم يوقف جو شيئًا: فحص من فحوص جو لتطبيقك يعمل الآن. أرسل السطر من جديد بعد انتهائه.', 'Nothing was brought back and Joe stopped nothing: one of Joe\'s checks of your app is running now. Send the line again once it has finished.');
                }
                locks.push(lock);
            }
            //  Under the lock: the line is still unused (two messages with it at once bring it back once).
            if (SHOWN.get(key) !== shown || !shown.copies.has(id)) {
                return refuse('already_used', `لم يُعَد شيء: سطر النسخة ${id} استُعمل أو عُرضت بعده قائمة أحدث. اطلب من جو قائمة النسخ من جديد.`, `Nothing was brought back: the line for copy ${id} was used already, or a newer list was shown after it. Ask Joe for the list of copies again.`);
            }
            //  The copy is still kept (pruning may have removed it): checked before anything is stopped.
            try {
                const st = fs.lstatSync(noTrace().recoveryVersionDir(workspaceId, copy.root, copy.runId, copy.n));
                if (!st.isDirectory() || st.isSymbolicLink()) throw new Error('not kept');
            } catch {
                SHOWN.delete(key);
                return refuse('not_kept', `لم يُعَد شيء ولم يوقف جو شيئًا: النسخة ${id} لم تعد محفوظة. اطلب من جو قائمة النسخ من جديد.`, `Nothing was brought back and Joe stopped nothing: copy ${id} is no longer kept. Ask Joe for the list of copies again.`);
            }
            /*
             * M2 / L3 (review 9): the ports the app names that are NOT one of the servers Joe is about to stop are checked
             * BEFORE anything is stopped. Whatever answers there may be his tunnel, another tool, another chat's server or
             * a monitor on a shared server — Joe cannot tell whose — so he is asked to stop it, and nothing is touched.
             */
            const ownPort = Number(process.env.PORT) || 0;
            const joePorts = run.portsOfServersServing(roots, sessionKey).filter(p => p !== ownPort);
            const declared = appDeclaredPorts(roots).filter(p => p !== ownPort && !joePorts.includes(p));
            const foreign: number[] = [];
            for (const port of declared) if (!(await addressIsFree(`http://localhost:${port}`, 0))) foreign.push(port);
            if (foreign.length) {
                return refuse('port_answers',
                    `لم يُعَد شيء ولم يوقف جو شيئًا: يجيب برنامج على المنفذ ${join(foreign)} الذي يذكره تطبيقك، ولا أستطيع أن أعرف لمن هو — أوقفه ثم أرسل السطر من جديد.`,
                    `Nothing was brought back and Joe stopped nothing: a program answers on port ${join(foreign)}, which your app names; I can't tell whose — stop it and send the line again.`,
                    { ports: foreign });
            }
            const stop = await run.stopServersServing(roots, sessionKey, logs);
            /** After the stop, a step that fails starts again what Joe stopped, and says so. */
            const startAgain = async (): Promise<string> => {
                if (!stop.stopped.length) return '';
                const back = await run.startServersAgain(stop.stopped, context, logs);
                const up = back.filter(b => b.started).map(b => b.port);
                const down = back.filter(b => !b.started).map(b => b.port);
                return [
                    up.length ? say(` كان جو قد أوقف خادم تطبيقك على المنفذ ${join(up)} لذلك، ثم شغّله من جديد.`, ` Joe had stopped your app's server on port ${join(up)} for it, and started it again.`) : '',
                    down.length ? say(` أوقف جو خادم تطبيقك على المنفذ ${join(down)} لذلك ولم يستطع تشغيله من جديد: قل «شغّل المشروع» لتشغيله.`, ` Joe stopped your app's server on port ${join(down)} for it and could not start it again: say «run the project» to start it.`) : '',
                ].join('');
            };
            if (stop.stillRunning.length) {
                const told = await startAgain();
                return refuse('server_would_not_stop',
                    `لم يُعَد شيء: خادم تطبيقك على المنفذ ${join(stop.stillRunning.map(s => s.port))} لم يتوقف، والخادم الذي يعمل يكتب نسخته فوق ما يُعاد. أرسل السطر من جديد بعد قليل.${told}`,
                    `Nothing was brought back: your app's server on port ${join(stop.stillRunning.map(s => s.port))} did not stop, and a running server writes its own copy over what is brought back. Send the line again in a moment.${told}`);
            }
            //  Every port the app uses is free now: Joe's servers' and the ones it names.
            const ports = Array.from(new Set([...joePorts, ...declared, ...stop.stopped.map(s => s.port)])).filter(p => p > 0 && p !== ownPort);
            const held: number[] = [];
            for (const port of ports) if (!(await addressIsFree(`http://localhost:${port}`, 3000))) held.push(port);
            if (held.length) {
                const told = await startAgain();
                return refuse('port_still_answering',
                    `لم يُعَد شيء: يجيب برنامج على المنفذ ${join(held)} الذي يستعمله تطبيقك، ولا أستطيع أن أعرف لمن هو — أوقفه ثم أرسل السطر من جديد.${told}`,
                    `Nothing was brought back: a program answers on port ${join(held)}, which your app uses; I can't tell whose — stop it and send the line again.${told}`,
                    { ports: held });
            }
            //  Used once, from here on, whatever happens next.
            SHOWN.delete(key);
            let done: Awaited<ReturnType<ReturnType<typeof recovery>['restoreRecoveryVersion']>>;
            try {
                done = await recovery().restoreRecoveryVersion(workspaceId, copy.root, copy.runId, copy.n);
            } catch (e: any) {
                done = { ok: false, restored: [], skipped: [], keptAside: [], error: String(e?.message || e).slice(0, 200) };
            }
            logs.push(`data recovery: copy ${id} (${copy.runId}/${copy.n}) → restored ${done.restored.map(r => r.file).join(', ') || 'nothing'}; skipped ${done.skipped.map(s => `${s.file} (${s.why})`).join(', ') || 'nothing'}`);
            if (!done.restored.length) {
                const told = await startAgain();
                return refuse(done.error || 'nothing_restored', `لم تُعَد النسخة ${id}: ${done.error || 'لا شيء فيها يمكن إعادته'}.${told}`, `Copy ${id} was not brought back: ${done.error || 'nothing in it could be'}.${told}`);
            }
            const restart = stop.stopped.length ? say(` أوقف جو خادم تطبيقك على المنفذ ${join(stop.stopped.map(s => s.port))} لذلك؛ قل «شغّل المشروع» لتشغيله من جديد على البيانات المُعادة.`, ` Joe stopped your app's server on port ${join(stop.stopped.map(s => s.port))} for it; say «run the project» to start it again on the data brought back.`) : '';
            //  Never «brought back» while something serves on its ports again (a supervisor that restarted it).
            const back: number[] = [];
            for (const port of ports) if (!(await addressIsFree(`http://localhost:${port}`, 0))) back.push(port);
            const files = done.restored.map(r => r.file).join(say('، ', ', '));
            const skipped = done.skipped.length ? say(` ولم يُعَد: ${done.skipped.map(s => s.file).join('، ')}.`, ` Not brought back: ${done.skipped.map(s => s.file).join(', ')}.`) : '';
            if (back.length) {
                return {
                    ok: false, error: 'server_started_again',
                    output: {
                        restored: done.restored, keptAside: done.keptAside, id,
                        message: say(
                            `نسخ جو ملفات النسخة ${id} إلى تطبيقك (${files})، لكن خادمًا عاد يعمل على المنفذ ${join(back)} في الحال، وقد يكتب نسخته فوقها؛ فلا تعدّها مُعادة حتى توقفه وتطلب قائمة النسخ من جديد. ملفاتك كما كانت قبلها محفوظة جانبًا.`,
                            `Joe copied copy ${id} into your app (${files}), but a server started again on port ${join(back)} at once and may write its own copy over it; do not count it as brought back until you stop that server and ask for the list again. Your files as they were before are kept aside.`),
                    },
                    logs,
                } as any;
            }
            const none = !stop.stopped.length && !ports.length
                ? say(' لم يجد جو خادمًا يعمل لتطبيقك؛ إن كان يعمل خارج جو فأوقفه قبل أي إعادة.', ' Joe found no server of your app running; if one runs outside Joe, stop it before any restore.')
                : '';
            return {
                ok: done.ok,
                output: {
                    restored: done.restored, skipped: done.skipped, keptAside: done.keptAside, id,
                    message: say(
                        `أعاد جو نسخة البيانات ${id} (${recoveryLocalTime(copy.at)}) إلى تطبيقك: ${files}. احتفظ جو بملفاتك كما كانت قبل الإعادة، فيمكنك أن تطلب العودة إليها.`,
                        `Joe brought data copy ${id} (${recoveryLocalTime(copy.at)}) back into your app: ${files}. Joe kept your files as they were just before, so you can ask to go back to them.`) + skipped + restart + none,
                },
                logs,
            } as any;
        } finally {
            await releaseAll();
        }
    }
}
