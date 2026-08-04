/**
 * THE TERMINAL, AND WHETHER JOE CAN SEE IT.
 *
 * The wiring audit proved the panel is a real shell that belongs to one user.
 * Two questions were left, and both were measured before anything was changed:
 *
 *   [1] CAN JOE READ IT? «ما آخر خطأ ظهر في الترمنال» — the planner's catalogue
 *       returned terminal_manager with a score of ZERO for every Arabic
 *       phrasing, i.e. the one tool that can read the panel was invisible to
 *       the brain. Joe could only answer such a question from imagination.
 *
 *   [2] IS IT THE SAME WORLD? The panel's shell opened in Joe's OWN source
 *       directory while shell_execute ran in the session's workspace. So
 *       `npm install` typed in the panel and a build asked of Joe happened in
 *       two different folders — and an `rm` typed in what looked like «my
 *       project» was standing inside Joe's code.
 *
 * Everything here is a real shell, a real tool call, and a real read-back.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_terminal_brain.ts
 */
export {};
import fs from 'fs';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const WS = 'session-term-brain';
const TERM = `brain-term-${Date.now()}`;

async function main() {
    const { selectToolsFor } = require('../../core/orchestrator/toolCatalog');
    const { executeTool } = require('../../modules/services/ToolService');
    const { executionFirewall } = require('../../orchestration/AgentExecutionFirewall');
    const { workspaceService } = require('../../modules/services/WorkspaceService');

    const ctx = { sessionId: WS, workspaceId: WS, userId: 'term-brain-user' };
    const run = (name: string, input: any) => executionFirewall.runAsSystem(() => executeTool(name, input, ctx));
    const history = async (): Promise<string> => {
        const r: any = await run('terminal_manager', { action: 'read', id: TERM });
        return String(r?.output?.history ?? r?.output ?? '');
    };

    console.log('\n[1] هل يعرف عقل جو أن للطرفية أداة أصلاً؟');
    const phrasings = ['اقرأ ما في الطرفية', 'ما آخر خطأ ظهر في الترمنال', 'افتح طرفية جديدة',
        'وش قال سطر الأوامر', 'what did the terminal say'];
    for (const g of phrasings) {
        const ranked = selectToolsFor(g, 12);
        const hit = ranked.find((t: any) => t.name === 'terminal_manager');
        check(`«${g}» → أداة الطرفية ضمن ما يراه المخطِّط`, !!hit, 'غائبة تماماً');
    }
    const top = selectToolsFor('ما آخر خطأ ظهر في الترمنال', 12)
        .filter((t: any) => (t.score || 0) > 0)[0];
    check('وهي الأولى ترتيباً لا مجرّد حاضرة', top?.name === 'terminal_manager', `${top?.name}:${top?.score}`);

    console.log('\n[2] عالَم واحد: اللوحة وأدوات جو في نفس المجلد');
    const wsRoot: string = workspaceService.getActiveRoot(WS);
    fs.mkdirSync(wsRoot, { recursive: true });
    const created: any = await run('terminal_manager', { action: 'create', id: TERM, shell: 'bash', workspaceId: WS });
    check('الطرفية أُنشئت', created?.ok === true, JSON.stringify(created).slice(0, 160));

    await run('terminal_manager', { action: 'write', id: TERM, command: 'pwd\n' });
    await wait(1200);
    const afterPwd = await history();
    const realRoot = (() => { try { return fs.realpathSync(wsRoot); } catch { return wsRoot; } })();
    check('الصدَفة تبدأ داخل مساحة عمل الجلسة', afterPwd.includes(wsRoot) || afterPwd.includes(realRoot),
        afterPwd.replace(/\s+/g, ' ').slice(-160));
    check('ولا تبدأ داخل شيفرة جو نفسها — حيث كان `rm` يُصيب النظام',
        !new RegExp(`${path.sep}api${path.sep}?\\s*[#$]`).test(afterPwd) || afterPwd.includes(wsRoot));

    const sh: any = await run('shell_execute', { command: 'pwd' });
    const shellCwd = String(sh?.output?.cwd || sh?.output?.stdout || '').trim();
    check('وأدوات جو تعمل في نفس الجذر — لا في عالَم آخر',
        shellCwd.includes(wsRoot) || shellCwd.includes(realRoot), `${shellCwd} ≠ ${wsRoot}`);

    // The two halves must see each other's work, which is the whole point.
    await run('terminal_manager', { action: 'write', id: TERM, command: 'echo made_in_the_panel > from-panel.txt\n' });
    await wait(1200);
    const seen: any = await run('read_file', { path: path.join(wsRoot, 'from-panel.txt') });
    check('ملف كتبته اللوحة تقرؤه أدوات جو فوراً',
        String(seen?.output?.content || '').includes('made_in_the_panel'), JSON.stringify(seen?.output).slice(0, 140));

    console.log('\n[3] وأمرٌ يفشل أمام عين المستخدم — يصل إلى جو');
    await run('terminal_manager', { action: 'write', id: TERM, command: 'ls /definitely-not-here-9d3\n' });
    await wait(1200);
    const withError = await history();
    check('نصّ الخطأ محفوظ في سجلّ الجلسة',
        /No such file|not found|cannot access/i.test(withError), withError.replace(/\s+/g, ' ').slice(-160));
    const asJoeReads: any = await run('terminal_manager', { action: 'read', id: TERM });
    check('وأداة القراءة تُعيده كنصّ يصلح أن يُبنى عليه جواب',
        /definitely-not-here-9d3/.test(String(asJoeReads?.output?.history ?? asJoeReads?.output ?? '')),
        JSON.stringify(asJoeReads?.output).slice(0, 140));

    await run('terminal_manager', { action: 'kill', id: TERM });
    try { fs.unlinkSync(path.join(wsRoot, 'from-panel.txt')); } catch { /* best effort */ }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
