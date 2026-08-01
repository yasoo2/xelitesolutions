/**
 * LIVE PROOF — a delivered project is an EXECUTED project.
 *
 * Act 1 (delivery must be earned): a stub brain plans a 2-phase project whose
 * files are real; phase verification RUNS the generated entry file with node.
 * The entry file, when executed, writes a witness file — so «تحقق» here means
 * the code demonstrably ran, not that files merely exist. The pipeline must
 * report 2/2 verified.
 *
 * Act 2 (honesty when broken): the same plan but the generated code CRASHES.
 * The pipeline must NOT say done — it must stop with the honest partial
 * summary after the self-fix attempt fails.
 *
 * Act 3 (the canonical loop heals AND learns): a phase fails on a missing
 * file; the repair ticket routes to missing_file_fix, the placeholder is
 * written, the phase reruns and passes — and the PROVEN cure lands in the
 * shared repair-memory store, where a plan for the same disease now finds it.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_project_pipeline.ts
 */
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MOCK_DB = process.env.MOCK_DB || 'true';
process.env.PERSISTENCE_MODE = process.env.PERSISTENCE_MODE || 'JSON';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
// Isolated repair-memory store — Act 3 proves a cure lands here.
const MEMORY_DIR = path.join(os.tmpdir(), `joe-repair-mem-${Date.now()}`);
process.env.JOE_MEMORY_DIR = MEMORY_DIR;

const STAMP = Date.now();
const DIR_OK = `pipeline-proof-${STAMP}`;
const DIR_BAD = `pipeline-broken-${STAMP}`;
const DIR_HEAL = `pipeline-heal-${STAMP}`;

// Act 3's app: refuses to run until config.txt exists at the WORKSPACE root
// (../ from the project dir). The error text is exactly what missing_file_fix
// knows how to cure — and the placeholder it writes lands at that root.
const APP_HEAL = `const fs=require('fs'),p=require('path');`
    + `if(!fs.existsSync(p.join(__dirname,'..','config.txt'))){console.error('Missing file: config.txt');process.exit(1);}`
    + `console.log('HEALED_APP_OK');`;

function planForHeal() {
    return {
        projectName: 'proof-heal',
        projectVibe: 'self-healing',
        totalPhases: 1,
        estimatedDuration: '1 minute',
        phases: [
            {
                phaseNumber: 1,
                name: 'App that needs config.txt',
                description: 'Write the app, then run it — it fails until the config exists',
                tasks: [
                    { task: 'write the app', tool: 'write_file', args: { path: `${DIR_HEAL}/index.js`, content: APP_HEAL }, priority: 'high' },
                    { task: 'run the app', tool: 'shell_execute', args: { command: `node ${DIR_HEAL}/index.js` }, priority: 'high' },
                ],
                deliverables: ['index.js'],
                estimatedTime: '1 minute',
            },
        ],
        dependencies: {},
    };
}

// The generated app writes a witness file NEXT TO ITSELF when executed —
// existence of the witness is physical proof the pipeline ran the code.
const APP_OK = `require('fs').writeFileSync(require('path').join(__dirname, 'ran.txt'), 'executed'); console.log('APP_OK');`;
const APP_BAD = `throw new Error('deliberately broken app');`;

function planFor(dir: string, appSource: string) {
    return {
        projectName: `proof-${dir}`,
        projectVibe: 'verification',
        totalPhases: 2,
        estimatedDuration: '2 minutes',
        phases: [
            {
                phaseNumber: 1,
                name: 'Write the application',
                description: 'Create the entry file',
                tasks: [
                    { task: 'write entry file', tool: 'write_file', args: { path: `${dir}/index.js`, content: appSource }, priority: 'high' },
                ],
                verificationTask: { task: 'EXECUTE the generated app', tool: 'shell_execute', args: { command: `node ${dir}/index.js` } },
                deliverables: ['index.js'],
                estimatedTime: '1 minute',
            },
            {
                phaseNumber: 2,
                name: 'Re-run as QA',
                description: 'Run the app again as the QA pass',
                tasks: [
                    { task: 'run the app', tool: 'shell_execute', args: { command: `node ${dir}/index.js` }, priority: 'high' },
                ],
                deliverables: ['runtime proof'],
                estimatedTime: '1 minute',
            },
        ],
        dependencies: { phase2: ['phase1'] },
    };
}

let currentPlan = planFor(DIR_OK, APP_OK);

const stub = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
        const send = (content: string) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                id: 'stub', object: 'chat.completion',
                choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
            }));
        };
        if (body.includes('software engineering execution plan')) {
            send(JSON.stringify(currentPlan));
        } else {
            send('UNKNOWN');
        }
    });
});

async function main() {
    await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
    const port = (stub.address() as any).port;
    // The planner's callLLM has no per-call modelConfig — it rides the router.
    // LOCAL_LLM_* points the router's local provider at the stub, STRICT keeps
    // it from wandering to free providers.
    process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${port}`;
    process.env.LOCAL_LLM_MODEL = 'stub';
    process.env.LOCAL_LLM_STRICT = '1';

    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');

    // The live voice: everything the pipeline would say to the panel lands
    // here — the proof that a long build is never mute.
    const progress: string[] = [];
    const context = {
        sessionId: `pipeline-proof-${STAMP}`, userId: 'proof-user', workspaceId: `pipeline-proof-${STAMP}`,
        onProgress: (m: string) => progress.push(m),
    };
    const run = (tool: string, input: any) =>
        executionFirewall.runAsSystem(() => executeTool(tool, input, context));

    // ---- ACT 1: a working project must be executed and reported 2/2 ----
    const good = await run('project_pipeline', { request: 'build the proof project' });

    // Physical witness: the app wrote ran.txt when the pipeline EXECUTED it.
    const witness = await run('read_file', { path: `${DIR_OK}/ran.txt` });
    const witnessContent = String((witness as any)?.output?.content ?? (witness as any)?.output ?? '');

    // ---- ACT 2: a crashing project must NOT be called done ----
    currentPlan = planFor(DIR_BAD, APP_BAD);
    const bad = await run('project_pipeline', { request: 'build the broken proof project' });

    // ---- ACT 3: the canonical loop heals a missing-file failure AND learns ----
    currentPlan = planForHeal();
    const healed = await run('project_pipeline', { request: 'build the self-healing proof project' });

    // The cure must be ON DISK in the shared store, recorded as PROVEN.
    // recordRepair is fire-and-forget BY DESIGN (memory never blocks the
    // pipeline) — give the atomic tmp+rename a moment to land.
    await new Promise((r) => setTimeout(r, 800));
    let storedCure: any = null;
    try {
        const store = JSON.parse(fs.readFileSync(path.join(MEMORY_DIR, 'repairs.json'), 'utf-8'));
        storedCure = store.find((r: any) => String(r.repair || '').includes('missing_file_fix')) || null;
    } catch { /* absence fails the check below */ }

    // And a NEW plan for the same disease must find it (in-process recall).
    const { SelfFixService } = await import('../../modules/services/SelfFixService');
    const { RepairTicketService } = await import('../../modules/services/RepairTicketService');
    const sameDiseaseTicket = RepairTicketService.build({
        projectName: 'recheck',
        phase: { phaseNumber: 1, name: 'recheck' },
        phaseStatus: 'failed',
        phaseResult: { error: 'Missing file: config.txt', output: { status: 'failed', results: [{ task: 'run', tool: 'shell_execute', ok: false, error: 'Missing file: config.txt' }] } },
    });
    const recallPlan = SelfFixService.plan(sameDiseaseTicket);

    const checks: Array<[string, boolean]> = [
        ['working project: pipeline returned ok', good.ok === true],
        ['working project: 2/2 phases verified', good.output?.completedPhases === 2 && good.output?.verified === true],
        ['PHYSICAL PROOF: the generated app was EXECUTED (witness file written by the app itself)', witnessContent.includes('executed')],
        ['broken project: pipeline did NOT claim success', bad.ok === false],
        ['broken project: the honest partial summary is present', String(bad.output?.summary || bad.error || '').includes('توقف البناء بصدق')],
        ['broken project: phase progress reported truthfully (< 2 completed)', Number(bad.output?.completedPhases ?? 99) < 2],
        // ---- the live voice: a long build must never be mute ----
        ['the pipeline announced each phase live («المرحلة 1/2», «المرحلة 2/2»)',
            progress.some(m => m.includes('المرحلة 1/2')) && progress.some(m => m.includes('المرحلة 2/2'))],
        ['phase completion was announced live', progress.some(m => m.includes('اكتملت المرحلة'))],
        ['the broken build announced its self-heal attempt and honest stop',
            progress.some(m => m.includes('تذكرة إصلاح')) && progress.some(m => m.includes('أتوقف بصدق'))],
        ['per-task tool progress flowed through (phase executor voice)',
            progress.some(m => m.includes('[pipeline] planning')) || progress.some(m => m.includes('[pipeline]'))],
        // ---- Act 3: the canonical loop heals and LEARNS ----
        ['missing-file failure was healed by the canonical loop (pipeline ok after self-fix)', healed.ok === true],
        ['the self-heal was announced live', progress.some(m => m.includes('نجح الإصلاح الذاتي'))],
        ['the PROVEN cure landed in the shared repair-memory store on disk', !!storedCure && storedCure.wins >= 1],
        ['a new plan for the same disease FINDS the remembered cure', !!recallPlan.rememberedCure && String(recallPlan.rememberedCure).includes('missing_file_fix')],
    ];

    let failed = 0;
    for (const [name, ok] of checks) {
        console.log(`${ok ? '✅' : '❌'} ${name}`);
        if (!ok) failed++;
    }
    console.log(failed === 0
        ? '\nPROOF COMPLETE: delivery is earned by execution; failure is reported honestly.'
        : `\n${failed} CHECK(S) FAILED\n good=${JSON.stringify(good).slice(0, 500)}\n bad=${JSON.stringify(bad).slice(0, 500)}`);

    stub.close();
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
