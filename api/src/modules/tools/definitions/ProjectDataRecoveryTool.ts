/**
 * project_data_recovery — «رجّع بيانات تطبيقي» from the chat (review 7, B3).
 *
 * On a change run Joe's checks put the owner's data files back as they were before them (verify.ts). A record he or
 * his customers wrote while the checks ran is erased from the app by that put-back — and kept, every version of it,
 * in Joe's recovery copies outside the project (qa-leaves-no-trace.ts › watchAppData). He is told «ask Joe in the
 * chat to bring one back»: this is what answers him. No new menu, button, tab or panel — Joe calls it when he asks.
 *
 *   list     the kept versions of the session's project, newest first, numbered as he is shown them: when, the
 *            data files in each, their size — never their contents (the model never reads the copies);
 *   restore  one numbered version: the app's server is stopped first (a running server writes its own copy
 *            back), the files come back into the project by a file copy of Joe's code, and what each file was just
 *            before is kept aside beside the copies, so bringing one back loses nothing either.
 */
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { isArabicReply } from '../../../shared/reply-language';

/** verify.ts, read when used: it imports the pipeline and the run tools, which the registry imports too. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const recovery = (): typeof import('../../../core/engine/verify') => require('../../../core/engine/verify');

/** One version he may bring back, as he is shown it (1 = the newest). */
export interface RecoveryChoice { number: number; runId: string; n: number; at: number; files: string[]; bytes: number; why?: string }

/** Every kept version of one project, newest first, numbered from 1. */
export async function recoveryChoices(workspaceId: string, projectRoot: string, env: NodeJS.ProcessEnv = process.env): Promise<RecoveryChoice[]> {
    const runs = await recovery().listRecoveryVersions(workspaceId, projectRoot, env);
    const all = runs.flatMap(run => run.versions.map(v => ({ runId: run.runId, n: v.n, at: v.at || run.startedAt, files: v.files, bytes: v.bytes })));
    return all
        .filter(v => v.n > 0 && v.files.length)
        .sort((a, b) => b.at - a.at || b.n - a.n)
        .map((v, i) => ({ number: i + 1, ...v }));
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

const size = (bytes: number, ar: boolean) => bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} ${ar ? 'م.ب' : 'MB'}`
    : `${Math.max(1, Math.round(bytes / 1024))} ${ar ? 'ك.ب' : 'KB'}`;
const when = (at: number) => { try { return new Date(at).toISOString().slice(0, 16).replace('T', ' '); } catch { return String(at); } };

/** The version he named: «3», «رقم 3», «#3», or a «runId/n» Joe showed. */
export function pickRecoveryChoice(choices: RecoveryChoice[], version: unknown): RecoveryChoice | undefined {
    const text = String(version ?? '').trim();
    if (!text) return undefined;
    const exact = text.match(/^([A-Za-z0-9_.-]+)\/(\d+)$/u);
    if (exact) return choices.find(c => c.runId === exact[1] && c.n === Number(exact[2]));
    const digits = text.replace(/[٠-٩]/gu, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).match(/\d+/u);
    return digits ? choices.find(c => c.number === Number(digits[0])) : undefined;
}

export class ProjectDataRecoveryTool extends BaseTool {
    name = 'project_data_recovery';
    version = '1.0.0';
    description = 'List the copies Joe kept of the app\'s data files (as they were before each put-back of his checks, outside the project), or bring one numbered copy back into the project. Use when the owner asks in the chat for his data, records or a recovery copy back.';
    tags = ['project', 'data', 'recovery', 'restore', 'copies'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            projectDir: { type: 'string' as const, description: 'Project folder. Defaults to this session\'s active project.' },
            version: { type: 'string' as const, description: 'The number of the copy to bring back, as listed (1 = the newest), or «runId/n». Without it the copies are listed.' },
            list: { type: 'boolean' as const, description: 'List the copies instead of bringing one back.' },
        },
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const };

    permissions: ToolPermission[] = ['write', 'execute'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 12;
    auditFields = ['projectDir', 'version'];
    mockSupported = false;

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        const ar = isArabicReply({ language: context?.language, text: String(input?.request || context?.request || '') });
        const sessionKey = String(context?.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const active = ((global as any).joeProjects || {})[sessionKey];
        const dir = String(input?.projectDir || active?.dir || '').trim();
        if (!dir || !fs.existsSync(dir)) return { ok: false, error: 'no_project', output: { message: ar ? 'لا أعرف أي تطبيق تقصد: افتح المشروع أولًا.' : 'I do not know which app you mean: open the project first.' }, logs } as any;
        //  The copies are kept per workspace, as the verification kept them (verify.ts › workspaceOf).
        const workspaceId = String(context?.workspaceId || context?.joe?.workspaceId || 'default').trim() || 'default';
        let root = path.resolve(dir);
        let choices: RecoveryChoice[] = [];
        for (const candidate of recoveryRoots(dir)) {
            const found = await recoveryChoices(workspaceId, candidate);
            if (found.length) { root = candidate; choices = found; break; }
        }
        if (!choices.length) {
            return {
                ok: true,
                output: {
                    versions: [],
                    message: ar
                        ? 'لا يحتفظ جو الآن بأي نسخة من ملفات بيانات هذا التطبيق: لم تُعِد فحوصه شيئًا فوقها خلال الأيام الأربعة عشر الماضية.'
                        : 'Joe keeps no copy of this app\'s data files now: his checks put nothing back over them in the last fourteen days.',
                },
                logs,
            } as any;
        }
        const listed = choices.slice(0, 20).map(c => `${c.number}. ${when(c.at)} — ${c.files.join(ar ? '، ' : ', ')} (${size(c.bytes, ar)})`);
        const pick = input?.list ? undefined : pickRecoveryChoice(choices, input?.version);
        if (!pick) {
            const asked = String(input?.version ?? '').trim();
            return {
                ok: true,
                output: {
                    versions: choices.map(c => ({ number: c.number, at: c.at, files: c.files, bytes: c.bytes })),
                    message: [
                        asked && !input?.list ? (ar ? `لا توجد نسخة بالرقم ${asked}.` : `There is no copy number ${asked}.`) : '',
                        ar ? 'النسخ التي يحتفظ بها جو من ملفات بيانات تطبيقك (الأحدث أولًا):' : 'The copies Joe keeps of your app\'s data files (newest first):',
                        ...listed,
                        ar ? 'لإعادة واحدة قل مثلًا: «رجّع نسخة البيانات رقم 1». سيوقف جو خادم تطبيقك أولًا، ويحتفظ بملفاتك الحالية جانبًا.' : 'To bring one back say, for example, «bring back data copy number 1». Joe stops your app\'s server first and keeps your current files aside.',
                    ].filter(Boolean).join('\n'),
                },
                logs,
            } as any;
        }
        //  A running server writes its own copy back over a restored file: it is stopped first (ProjectRunTool's registry).
        let stopped = false;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { ProjectStopTool } = require('./ProjectRunTool');
            const stop = await new ProjectStopTool().execute({}, context);
            stopped = stop?.output?.stopped === true;
            if (stop?.output?.stopped === false && stop?.output?.port) {
                return { ok: false, error: 'server_would_not_stop', output: { message: ar ? 'لم يتوقف خادم تطبيقك، فلم تُعَد النسخة: الخادم الذي يعمل يكتب نسخته فوقها.' : 'Your app\'s server did not stop, so the copy was not brought back: a running server writes its own copy over it.' }, logs } as any;
            }
        } catch (e: any) { logs.push(`data recovery: the server could not be asked to stop: ${String(e?.message || e).slice(0, 160)}`); }
        const done = await recovery().restoreRecoveryVersion(workspaceId, root, pick.runId, pick.n);
        logs.push(`data recovery: version ${pick.runId}/${pick.n} → restored ${done.restored.map(r => r.file).join(', ') || 'nothing'}; skipped ${done.skipped.map(s => `${s.file} (${s.why})`).join(', ') || 'nothing'}`);
        const restart = stopped ? (ar ? ' أوقف جو خادم تطبيقك لذلك؛ قل «شغّل المشروع» لتشغيله من جديد.' : ' Joe stopped your app\'s server for it; say «run the project» to start it again.') : '';
        if (!done.restored.length) {
            return { ok: false, error: done.error || 'nothing_restored', output: { message: ar ? `لم تُعَد النسخة رقم ${pick.number}: ${done.error || 'لا شيء فيها يمكن إعادته'}.${restart}` : `Copy number ${pick.number} was not brought back: ${done.error || 'nothing in it could be'}.${restart}` }, logs } as any;
        }
        const files = done.restored.map(r => r.file).join(ar ? '، ' : ', ');
        const skipped = done.skipped.length ? (ar ? ` ولم يُعَد: ${done.skipped.map(s => s.file).join('، ')}.` : ` Not brought back: ${done.skipped.map(s => s.file).join(', ')}.`) : '';
        return {
            ok: done.ok,
            output: {
                restored: done.restored, skipped: done.skipped, keptAside: done.keptAside, number: pick.number,
                message: (ar
                    ? `أعاد جو نسخة البيانات رقم ${pick.number} (${when(pick.at)}) إلى تطبيقك: ${files}. احتفظ جو بنسخة ملفاتك كما كانت قبل الإعادة، فيمكنك أن تطلب العودة إليها.`
                    : `Joe brought data copy number ${pick.number} (${when(pick.at)}) back into your app: ${files}. Joe kept your files as they were just before, so you can ask to go back to them.`) + skipped + restart,
            },
            logs,
        } as any;
    }
}
