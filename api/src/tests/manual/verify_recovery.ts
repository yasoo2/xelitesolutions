/**
 * LIVE PROOF — the error-recovery loop, end to end on the real orchestrator.
 *
 * The scene: a stub LLM plans one step — read a file that does not exist.
 * The step FAILS with "File not found". The proof then watches four promises:
 *
 *   1. the recovery planning call happens (attemptRecovery fired);
 *   2. its prompt CONTAINS the actual error text — the planner sees the
 *      symptom, not just the task title;
 *   3. its prompt carries the FAILURE-RECOVERY rules (diagnose -> repair ->
 *      re-run, never blind re-run);
 *   4. the repair node the stub proposes (write the missing file) executes,
 *      the failed step is retried, and the WHOLE RUN ends ok — with the
 *      healed file on disk as the physical witness.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_recovery.ts
 */
import http from 'http';

process.env.MOCK_DB = process.env.MOCK_DB || 'true';
process.env.PERSISTENCE_MODE = process.env.PERSISTENCE_MODE || 'JSON';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Unique per run: a leftover file from an earlier run would make the read step
// SUCCEED and the whole fault-injection silently evaporate (it happened).
const PROOF_FILE = `joe-recovery-proof-${Date.now()}.txt`;

// ---------- the stub brain ----------
const seen = {
    initialPlanCalls: 0,
    recoveryPlanCalls: 0,
    recoveryPromptHadError: false,
    recoveryPromptHadRules: false,
};

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

        if (body.includes('Professional Software Architecture Planner')) {
            if (body.includes('FAILURE-RECOVERY plan')) {
                seen.recoveryPlanCalls++;
                seen.recoveryPromptHadError = body.includes('File not found');
                seen.recoveryPromptHadRules = body.includes('NEVER just re-run the failed step unchanged');
                // The repair: create the missing file. The orchestrator will retry
                // the original read step on its own after this node completes.
                send(JSON.stringify([{
                    id: 'write_proof',
                    task: 'create the missing ledger file so the read can succeed',
                    tool: 'write_file', agent: 'Dev',
                    input: { path: PROOF_FILE, content: 'healed by recovery' },
                    dependsOn: [],
                }]));
            } else {
                seen.initialPlanCalls++;
                send(JSON.stringify([{
                    id: 'read_ledger',
                    task: 'read the internal ledger file',
                    tool: 'read_file', agent: 'Dev',
                    input: { path: PROOF_FILE },
                    dependsOn: [],
                }]));
            }
            return;
        }
        // Any other call (intent analysis, semantic router): answer uselessly so
        // deterministic fallbacks engage and no fast-path is gifted a route.
        send('UNKNOWN');
    });
});

async function main() {
    await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
    const port = (stub.address() as any).port;
    const modelConfig = { provider: 'openai', model: 'stub', apiKey: 'sk-stub', baseUrl: `http://127.0.0.1:${port}/v1` };

    const { AgentOrchestrator } = await import('../../orchestration/AgentOrchestrator');

    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.execute({
        id: `recovery-proof-${Date.now()}`,
        goal: 'process the internal ledger records and merge the quarterly totals for verification',
        context: { sessionId: `recovery-proof-${Date.now()}`, userId: 'proof-user', modelConfig },
    });

    // The physical witness: the RETRIED read step returned the exact content the
    // repair node wrote — a real read of a real file the failed step needed.
    // (The tool auto-assigns a per-session workspace, so the retried read's own
    // result IS the disk proof; hunting the path from outside guesses wrong.)
    const retriedRead = (result as any)?.result?.read_ledger;
    const repairRan = (result as any)?.result?.write_proof?.success === true;
    const healedContent = String(retriedRead?.content || '').includes('healed by recovery');

    const checks: Array<[string, boolean]> = [
        ['initial plan was requested once', seen.initialPlanCalls === 1],
        ['recovery plan was requested (attemptRecovery fired)', seen.recoveryPlanCalls === 1],
        ['recovery prompt CONTAINED the real error text ("File not found")', seen.recoveryPromptHadError],
        ['recovery prompt carried the FAILURE-RECOVERY rules', seen.recoveryPromptHadRules],
        ['repair node executed (write_proof succeeded)', repairRan],
        ['the FAILED step was retried and read the healed file from disk', healedContent],
        ['the whole run ended ok after recovery', result.ok === true],
    ];

    let failed = 0;
    for (const [name, ok] of checks) {
        console.log(`${ok ? '✅' : '❌'} ${name}`);
        if (!ok) failed++;
    }
    console.log(failed === 0
        ? '\nPROOF COMPLETE: a failed step was diagnosed from its error, repaired, retried, and the run finished.'
        : `\n${failed} CHECK(S) FAILED — result: ${JSON.stringify(result).slice(0, 600)}`);

    stub.close();
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
