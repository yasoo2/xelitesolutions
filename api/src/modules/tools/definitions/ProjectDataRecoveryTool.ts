/**
 * project_data_recovery — «رجّع بيانات تطبيقي» from the chat (review 7, B3; made safe in review 8, B1 H1 H2 M1 M3).
 *
 * On a change run Joe's checks put the owner's data files back as they were before them (verify.ts and the loops'
 * owner-data-span.ts). A record he or his customers wrote while the checks ran is erased from the app by that
 * put-back — and kept, every version of it, in Joe's recovery copies outside the project (qa-leaves-no-trace.ts ›
 * watchAppData). He is told «ask Joe in the chat to bring one back»: this is what answers him. No new menu, button,
 * tab or panel — Joe calls it when he asks.
 *
 * Bringing a copy back REPLACES his live records, so it is never done from a guess. Two steps, two turns:
 *
 *   list     the copies of the session's project, found under every folder a loop kept them by (the project, the
 *            packaged API folder, the recorded server folder, a pipeline's server folder below the project), newest
 *            first, each with a STABLE id (its time, `YYYYMMDD-HHMMSS` in UTC), its local time with the offset, the
 *            records in each file, and whether it holds records Joe's own checks marked («Joe QA», «اختبار جو»).
 *            It issues a confirmation token for this session and project.
 *   restore  only with that token, issued by a `list` in an EARLIER turn of the same session, for the same project,
 *            used once, within 30 minutes — and only when the owner's own latest message (the run's `ownerMessage`,
 *            never the model's input) names that copy's id and confirms («نعم», «أكّد», «confirm»). A number anywhere
 *            else in a message never names a copy. Then: the project's verify lock (no check runs meanwhile, none
 *            puts its snapshot back over the copy), every server of Joe's serving the project stopped, every port
 *            the app uses free — else nothing is brought back and he is told why — and what each file is now kept
 *            aside first, so bringing one back loses nothing either.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { isArabicReply } from '../../../shared/reply-language';

/** verify.ts, read when used: it imports the pipeline and the run tools, which the registry imports too. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const recovery = (): typeof import('../../../core/engine/verify') => require('../../../core/engine/verify');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const noTrace = (): typeof import('../../../core/quality/qa-leaves-no-trace') => require('../../../core/quality/qa-leaves-no-trace');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ownerWords = (): typeof import('../../../core/engine/select') => require('../../../core/engine/select');

/** A token from `list` is good for this long (one use). */
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

/** The folders a session's project may keep its copies under: the folder itself, then up to three folders above it Joe delivered (`.joe`). */
export function recoveryRoots(dir: string): string[] {
    const out: string[] = [];
    let at = path.resolve(dir);
    out.push(at);
    for (let i = 0; i < 3; i++) {
        const up = path.dirname(at);
        if (up === at) break;
        at = up;
        if (fs.existsSync(path.join(at, '.joe'))) out.push(at);
    }
    return out;
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
 * Every folder a loop may have kept this project's copies by (review 8, H2): the session's project and the folders
 * above it Joe delivered, the packaged API folder (react_project, project_repair), the recorded live server's folder,
 * and the server folders below the project (the pipeline's `serverRoot`). All of them are this project's own.
 */
export function projectRecoveryRoots(project: { dir: string; packagedInto?: string; linkedApiDir?: string; live?: { cwd?: string; projectCwd?: string } }): string[] {
    const out = new Set<string>();
    const add = (p: unknown) => {
        const s = String(p || '').trim();
        if (!s) return;
        try { if (fs.statSync(s).isDirectory()) out.add(path.resolve(s)); } catch { /* gone */ }
    };
    for (const r of recoveryRoots(project.dir)) add(r);
    add(project.packagedInto);
    add(project.linkedApiDir);
    add(project.live?.cwd);
    add(project.live?.projectCwd);
    for (const sub of serverFoldersBelow(path.resolve(project.dir))) add(sub);
    return Array.from(out);
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

/* ───────────── the confirmation: issued by a list, used once, in a later turn of the same session ───────────── */

interface PendingRestore {
    token: string;
    /** The turn (run) that showed the list. */
    turn: string;
    issuedAt: number;
    /** The session project's folder, resolved and case-folded on Windows. */
    project: string;
    /** The workspace whose copies were listed. */
    workspaceId: string;
    copies: Map<string, { root: string; runId: string; n: number; at: number; files: string[] }>;
}
const PENDING = new Map<string, PendingRestore>();
const projectIdOf = (dir: string) => { let r = path.resolve(dir); try { r = fs.realpathSync.native(r); } catch { /* as resolved */ } return process.platform === 'win32' ? r.toLowerCase() : r; };
const pendingKey = (sessionKey: string) => sessionKey;
const turnOf = (context: any) => String(context?.runId || context?.traceId || '').trim();

/** The token a list issued for this session and project, while it is still good (the planner hands it to a restore). */
export function pendingRecoveryToken(sessionId: unknown, projectDir: string, now = Date.now()): string | undefined {
    const sessionKey = String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
    const p = PENDING.get(pendingKey(sessionKey));
    if (!p || p.project !== projectIdOf(projectDir) || now - p.issuedAt > RECOVERY_CONFIRM_TTL_MS) return undefined;
    return p.token;
}

/** Tests only: forget every confirmation. */
export function _forgetRecoveryConfirmations(): void { PENDING.clear(); }

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
    version = '2.0.0';
    description = 'List the copies Joe kept of the app\'s data files (as they were before each put-back of his checks, outside the project), each with its id. Bringing one back needs the owner\'s confirmation in a later message naming that id; never call restore on your own.';
    tags = ['project', 'data', 'recovery', 'restore', 'copies'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            projectDir: { type: 'string' as const, description: 'Project folder; it must be this session\'s project (or one of its recorded folders). Defaults to it.' },
            list: { type: 'boolean' as const, description: 'List the copies (the default).' },
            restore: { type: 'string' as const, description: 'The id of the copy to bring back (YYYYMMDD-HHMMSS), only after the owner confirmed that id in his own latest message.' },
            confirmToken: { type: 'string' as const, description: 'The confirmation token the list issued in an earlier turn.' },
        },
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const };

    permissions: ToolPermission[] = ['write', 'execute'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 12;
    auditFields = ['projectDir', 'restore'];
    mockSupported = false;

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        const owner = String(context?.ownerMessage || '');
        const ar = isArabicReply({ language: context?.language, text: owner || String(input?.request || context?.request || '') });
        const say = (a: string, e: string) => (ar ? a : e);
        const refuse = (error: string, a: string, e: string, extra: Record<string, unknown> = {}) => ({ ok: false, error, output: { message: say(a, e), ...extra }, logs } as any);
        const sessionKey = String(context?.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const active = ((global as any).joeProjects || {})[sessionKey];
        const projectDir = String(active?.dir || '').trim();
        if (!projectDir || !fs.existsSync(projectDir)) return refuse('no_project', 'لا أعرف أي تطبيق تقصد: افتح المشروع أولًا.', 'I do not know which app you mean: open the project first.');
        //  M3: only this session's project — its own folder and the folders Joe recorded for it — never a folder a model names.
        const roots = projectRecoveryRoots(active);
        const { isInsideFolder } = noTrace();
        const asked = String(input?.projectDir || '').trim();
        if (asked && !roots.some(r => isInsideFolder(asked, r))) {
            return refuse('outside_project', 'هذا المجلد ليس مشروع هذه المحادثة، فلم يُعرض منه شيء ولم يُعَد شيء.', 'That folder is not this chat\'s project: nothing was listed or brought back from it.');
        }
        //  The copies are kept per workspace, as the verification kept them (verify.ts › workspaceOf).
        const workspaceId = String(context?.workspaceId || context?.joe?.workspaceId || 'default').trim() || 'default';
        const choices = await recoveryChoices(workspaceId, roots);
        const turn = turnOf(context);
        const key = pendingKey(sessionKey);
        const project = projectIdOf(projectDir);
        if (!choices.length) {
            PENDING.delete(key);
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

        /** Shows the copies and issues a fresh token for a later turn. `lead` says why the list is shown again. */
        const list = (lead: string[], focus?: RecoveryChoice) => {
            const shown = choices.slice(0, 20);
            const token = crypto.randomBytes(16).toString('hex');
            PENDING.set(key, {
                token, turn, issuedAt: Date.now(), project, workspaceId,
                copies: new Map(shown.map(c => [c.id, { root: c.root, runId: c.runId, n: c.n, at: c.at, files: c.files }])),
            });
            const lines = shown.map(c => {
                const what = copyContents(noTrace().recoveryVersionDir(workspaceId, c.root, c.runId, c.n), c.files);
                const files = what.files.map(f => f.records === undefined ? f.file : say(`${f.file} (عدد السجلات: ${f.records})`, `${f.file} (${f.records} record${f.records === 1 ? '' : 's'})`)).join(say('، ', ', '));
                const marked = what.qaMarked > 0 ? say(` — ⚠️ فيها ${what.qaMarked} من سجلات فحوص جو المعلَّمة («Joe QA» أو «اختبار جو»)`, ` — ⚠️ it holds ${what.qaMarked} of the records Joe's checks marked («Joe QA» / «اختبار جو»)`) : '';
                const before = c.why === 'before a restore' ? say(' — ملفاتك كما كانت قبل إعادة سابقة', ' — your files as they were before an earlier restore') : '';
                return `• ${c.id} — ${recoveryLocalTime(c.at)} — ${files}${marked}${before}`;
            });
            const example = (focus || shown[0]).id;
            return {
                ok: true,
                output: {
                    versions: shown.map(c => ({ id: c.id, at: c.at, files: c.files, bytes: c.bytes })),
                    confirmToken: token,
                    message: [
                        ...lead,
                        say('النسخ التي يحتفظ بها جو من ملفات بيانات تطبيقك (الأحدث أولًا):', 'The copies Joe keeps of your app\'s data files (newest first):'),
                        ...lines,
                        say(
                            `إعادة نسخة تستبدل بياناتك الحالية في التطبيق (تُحفظ الحالية جانبًا أولًا). لإعادة واحدة أرسل في رسالة جديدة: «نعم، رجّع النسخة ${example}». سيوقف جو خوادم تطبيقك أولًا.`,
                            `Bringing a copy back replaces your app's current data (the current files are kept aside first). To bring one back, send in a new message: «yes, restore copy ${example}». Joe stops your app's servers first.`),
                    ].filter(Boolean).join('\n'),
                },
                logs,
            } as any;
        };

        const wantsRestore = !input?.list && !!String(input?.restore ?? input?.version ?? '').trim();
        if (!wantsRestore) {
            const named = ownerWords().recoveryCopyIdIn(owner);
            const focus = named ? pickRecoveryChoice(choices, named) : undefined;
            return list(named && !focus ? [say(`لا توجد نسخة بالمعرّف ${named}.`, `There is no copy with the id ${named}.`)] : [], focus);
        }

        /* ── restore: every condition, or nothing is brought back ── */
        const pending = PENDING.get(key);
        const again = (a: string, e: string) => list([say(a, e)]);
        if (!turn) return again('لم يُعَد شيء: لا أستطيع التحقق من أن التأكيد جاء في رسالة لاحقة.', 'Nothing was brought back: Joe cannot tell that the confirmation came in a later message.');
        if (!pending || pending.project !== project || pending.workspaceId !== workspaceId) return again('لم يُعَد شيء بعد: هذه هي النسخ، فاختر واحدة وأكّدها في رسالتك التالية.', 'Nothing was brought back yet: these are the copies — pick one and confirm it in your next message.');
        if (Date.now() - pending.issuedAt > RECOVERY_CONFIRM_TTL_MS) { PENDING.delete(key); return again('لم يُعَد شيء: مضى على عرض النسخ أكثر من ثلاثين دقيقة، فهذه هي من جديد.', 'Nothing was brought back: the list was shown more than thirty minutes ago, so here it is again.'); }
        if (!pending.turn || pending.turn === turn) return again('لم يُعَد شيء: التأكيد يكون في رسالة منك بعد أن ترى النسخ.', 'Nothing was brought back: the confirmation comes in a message of yours after you have seen the copies.');
        if (String(input?.confirmToken || '') !== pending.token) return again('لم يُعَد شيء: هذا الطلب لا يحمل تأكيد القائمة التي عُرضت عليك.', 'Nothing was brought back: this request does not carry the confirmation of the list you were shown.');
        const named = ownerWords().recoveryCopyIdIn(owner);
        if (!named || !ownerWords().confirmsRecovery(owner)) {
            return refuse('not_confirmed',
                `لم يُعَد شيء: لإعادة نسخة اكتب معرّفها مع التأكيد، مثلًا: «نعم، رجّع النسخة ${Array.from(pending.copies.keys())[0]}».`,
                `Nothing was brought back: to bring a copy back write its id with your confirmation, e.g. «yes, restore copy ${Array.from(pending.copies.keys())[0]}».`);
        }
        const wanted = String(input?.restore ?? input?.version ?? '').trim();
        if (wanted !== named) return refuse('not_the_named_copy', `لم يُعَد شيء: النسخة المطلوبة ليست النسخة ${named} التي ذكرتها.`, `Nothing was brought back: the copy asked for is not copy ${named}, the one you named.`);
        const copy = pending.copies.get(named);
        if (!copy) return again(`لم يُعَد شيء: النسخة ${named} ليست في القائمة التي عُرضت عليك.`, `Nothing was brought back: copy ${named} is not in the list you were shown.`);
        //  Used once, whatever happens next.
        PENDING.delete(key);
        return this.restore({ workspaceId, sessionKey, roots, copy, id: named, ar, logs });
    }

    /** The restore itself: the lock, every server stopped, every port free, then the file copy. */
    private async restore(a: { workspaceId: string; sessionKey: string; roots: string[]; copy: { root: string; runId: string; n: number; at: number }; id: string; ar: boolean; logs: string[] }): Promise<ToolExecutionResult> {
        const { workspaceId, sessionKey, roots, copy, id, ar, logs } = a;
        const say = (x: string, y: string) => (ar ? x : y);
        const refuse = (error: string, x: string, y: string) => ({ ok: false, error, output: { message: say(x, y) }, logs } as any);
        const { acquireVerifyLock, addressIsFree } = noTrace();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const run = require('./ProjectRunTool') as typeof import('./ProjectRunTool');
        //  H1: no check of this project runs while its data comes back, and none puts a snapshot back over it after.
        const locks: Array<{ release(): Promise<void> }> = [];
        const releaseAll = async () => { for (const l of locks.splice(0)) await l.release().catch(() => undefined); };
        try {
            for (const root of [...roots].sort()) {
                const lock = await acquireVerifyLock(workspaceId, root, `restore-${Date.now().toString(36)}`, { waitMs: RESTORE_LOCK_WAIT_MS }).catch(() => null);
                if (!lock) {
                    return refuse('check_running', 'لم يُعَد شيء: فحص من فحوص جو لتطبيقك يعمل الآن. اطلب الإعادة بعد انتهائه.', 'Nothing was brought back: one of Joe\'s checks of your app is running now. Ask again once it has finished.');
                }
                locks.push(lock);
            }
            //  The ports the app uses, read before anything is stopped: Joe's own servers' and the ones the app names.
            const ownPort = Number(process.env.PORT) || 0;
            const ports = Array.from(new Set([...run.portsOfServersServing(roots, sessionKey), ...appDeclaredPorts(roots)])).filter(p => p !== ownPort);
            const stop = await run.stopServersServing(roots, sessionKey, logs);
            if (stop.stillRunning.length) {
                const at = stop.stillRunning.map(s => s.port).join(say('، ', ', '));
                return refuse('server_would_not_stop', `لم يُعَد شيء: خادم تطبيقك على المنفذ ${at} لم يتوقف، والخادم الذي يعمل يكتب نسخته فوق ما يُعاد.`, `Nothing was brought back: your app's server on port ${at} did not stop, and a running server writes its own copy over what is brought back.`);
            }
            const held: number[] = [];
            for (const port of ports) if (!(await addressIsFree(`http://localhost:${port}`, 3000))) held.push(port);
            if (held.length) {
                const at = held.join(say('، ', ', '));
                return refuse('port_still_answering', `لم يُعَد شيء: ما زال شيء يجيب على المنفذ ${at} الذي يستعمله تطبيقك، ولم يشغّله جو فلم يوقفه. أوقفه أنت ثم اطلب الإعادة من جديد.`, `Nothing was brought back: something still answers on port ${at}, which your app uses; Joe did not start it, so Joe did not stop it. Stop it, then ask again.`);
            }
            const done = await recovery().restoreRecoveryVersion(workspaceId, copy.root, copy.runId, copy.n);
            logs.push(`data recovery: copy ${id} (${copy.runId}/${copy.n}) → restored ${done.restored.map(r => r.file).join(', ') || 'nothing'}; skipped ${done.skipped.map(s => `${s.file} (${s.why})`).join(', ') || 'nothing'}`);
            const restart = stop.stopped.length ? say(' أوقف جو خادم تطبيقك لذلك؛ قل «شغّل المشروع» لتشغيله من جديد.', ' Joe stopped your app\'s server for it; say «run the project» to start it again.') : '';
            if (!done.restored.length) {
                return refuse(done.error || 'nothing_restored', `لم تُعَد النسخة ${id}: ${done.error || 'لا شيء فيها يمكن إعادته'}.${restart}`, `Copy ${id} was not brought back: ${done.error || 'nothing in it could be'}.${restart}`);
            }
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
                            `نسخ جو ملفات النسخة ${id} إلى تطبيقك (${files})، لكن خادمًا عاد يعمل على المنفذ ${back.join('، ')} في الحال، وقد يكتب نسخته فوقها؛ فلا تعدّها مُعادة حتى توقفه وتطلب الإعادة من جديد. ملفاتك كما كانت قبلها محفوظة جانبًا.`,
                            `Joe copied copy ${id} into your app (${files}), but a server started again on port ${back.join(', ')} at once and may write its own copy over it; do not count it as brought back until you stop that server and ask again. Your files as they were before are kept aside.`),
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
