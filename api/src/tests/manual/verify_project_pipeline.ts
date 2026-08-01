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
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_project_pipeline.ts
 */
import http from 'http';

process.env.MOCK_DB = process.env.MOCK_DB || 'true';
process.env.PERSISTENCE_MODE = process.env.PERSISTENCE_MODE || 'JSON';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const STAMP = Date.now();
const DIR_OK = `pipeline-proof-${STAMP}`;
const DIR_BAD = `pipeline-broken-${STAMP}`;

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

    const context = { sessionId: `pipeline-proof-${STAMP}`, userId: 'proof-user', workspaceId: `pipeline-proof-${STAMP}` };
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

    const checks: Array<[string, boolean]> = [
        ['working project: pipeline returned ok', good.ok === true],
        ['working project: 2/2 phases verified', good.output?.completedPhases === 2 && good.output?.verified === true],
        ['PHYSICAL PROOF: the generated app was EXECUTED (witness file written by the app itself)', witnessContent.includes('executed')],
        ['broken project: pipeline did NOT claim success', bad.ok === false],
        ['broken project: the honest partial summary is present', String(bad.output?.summary || bad.error || '').includes('توقف البناء بصدق')],
        ['broken project: phase progress reported truthfully (< 2 completed)', Number(bad.output?.completedPhases ?? 99) < 2],
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
