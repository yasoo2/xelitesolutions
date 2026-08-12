/**
 * THE FOUR FINDINGS FROM HIS ENGLISH RUN — MEASURED, NOT ASSERTED.
 *
 * Nothing here is a string match on source. Every check runs the real thing:
 *
 *  1. A REAL HTTP server on a REAL port speaks the OpenAI chat shape and
 *     answers exactly what the verify probe asks for — the single word `OK`.
 *     The mesh is pointed at it as the local brain, and must come back with
 *     `OK` instead of cooling the provider down for answering correctly.
 *  2. A real tool that streams its lines live runs through the real
 *     ToolService, and the terminal broadcast is watched: no line twice.
 *  3. A real `project_run` executes with `language: 'en'` and must not emit
 *     one Arabic letter.
 *  4. The real `designDataModel` reads his exact veterinary request and must
 *     return the five tables he wrote, not the three a keyword guessed.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_a_correct_answer_is_not_a_failure.ts
 */
export { };
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';

import http from 'http';
import { AddressInfo } from 'net';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const ARABIC = /[؀-ۿ]/;

/** A real provider on a real socket that answers the probe exactly as asked. */
async function startTwoCharProvider(reply = 'OK') {
    let asked = 0;
    const srv = http.createServer((req, res) => {
        if (req.url && /\/api\/tags$/.test(req.url)) {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ models: [{ name: 'probe:latest', size: 1 }] }));
            return;
        }
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            asked++;
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({
                choices: [{ message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
                model: 'probe',
            }));
        });
    });
    await new Promise<void>(r => srv.listen(0, '127.0.0.1', r));
    const port = (srv.address() as AddressInfo).port;
    return { srv, port, asked: () => asked };
}

async function main() {
    console.log('\n[1] A provider that answers the probe correctly is not a failed provider\n');

    const fake = await startTwoCharProvider('OK');
    process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${fake.port}/v1`;
    process.env.LOCAL_LLM_MODEL = 'probe:latest';
    process.env.LOCAL_LLM_TIMEOUT = '8000';

    const router = require('../../core/llm/intelligent-router');
    const { detectLocalModels } = require("../../core/llm/local-brain");

    // The shape rule itself, on the answers that used to be thrown away.
    check('«OK» — the probe\'s own answer — is an answer', router.isUsableAnswer('OK') === true);
    check('«لا» is an answer', router.isUsableAnswer('لا') === true);
    check('«[]» — no tools needed — is an answer', router.isUsableAnswer('[]') === true);
    check('«» is not', router.isUsableAnswer('') === false);
    check('«...» is not, at any length', router.isUsableAnswer('.........') === false);

    await detectLocalModels(4000).catch(() => null);
    router.resetLocalBrainBreaker?.();

    const answer = await router.routeToModel(
        [{ role: 'user', content: 'Reply with the single word: OK' }],
        undefined, undefined, undefined, undefined, undefined, undefined,
        { modelConfig: { provider: 'auto', apiKey: 'auto-mode' } },
    ).catch((e: any) => `THREW: ${e?.message}`);

    check('the mesh returned the two-character answer instead of discarding it',
        String(answer).trim() === 'OK', JSON.stringify(String(answer).slice(0, 120)));
    check('the provider that answered was NOT cooled down',
        router.isProviderCoolingDown('Local (Auto)') === false);
    check('and the fake engine really was asked (this was a live call)', fake.asked() > 0,
        `asked ${fake.asked()} time(s)`);

    console.log('\n[2+3] One real tool: its lines are said once, and in the run\'s language\n');

    const ws = require('../../api/ws');
    const { executeTool } = require('../../modules/services/ToolService');

    /**
     * `project_run` is the tool that showed BOTH defects in his log: it
     * streams each line live through `onProgress` AND returns it in `logs`
     * (so the terminal replayed the whole thing at the end), and its lines
     * were hardcoded Arabic. One real execution measures both.
     */
    /**
     * A tool that behaves exactly as the pipeline does: it SPEAKS each line
     * live through `onProgress`, and also returns it in `logs` for the record.
     * That double bookkeeping is the whole cause — nothing about it is
     * specific to `project_pipeline`, which is why the fix is in ToolService.
     */
    const { tools } = require('../../modules/tools/registry');
    const LIVE_LINE = '[proof] said once, live';
    const ONLY_IN_LOGS = '[proof] never spoken, only recorded';
    tools.push({
        name: 'proof_double_talker',
        version: '1.0.0',
        description: 'speaks one line live and records two',
        tags: ['test'],
        inputSchema: { type: 'object', properties: {} },
        outputSchema: { type: 'object', properties: {} },
        permissions: ['read'], sideEffects: [], rateLimitPerMinute: 60,
        auditFields: [], mockSupported: false,
        execute: async (_i: any, ctx: any) => {
            ctx?.onProgress?.(LIVE_LINE);
            return { ok: true, output: { done: true }, logs: [LIVE_LINE, ONLY_IN_LOGS] };
        },
    });

    const terminalLines: string[] = [];
    const stop = ws.observeBroadcasts?.((msg: any) => {
        if (msg?.type === 'terminal_output') {
            terminalLines.push(String(typeof msg?.data === 'string' ? msg.data : (msg?.data?.line ?? msg?.data?.chunk ?? '')));
        }
    });
    const liveLines: string[] = [];
    // The firewall refuses a direct executeTool — a tool must run inside a run.
    const { executionFirewall } = require('../../orchestration/AgentExecutionFirewall');
    const runRes = await executionFirewall.runInContext('proof-run', () =>
        executeTool('project_run', { cwd: '/nonexistent-proof-dir' }, {
            sessionId: 'proof-session', userId: 'proof', workspaceId: 'proof-ws', language: 'en',
            onProgress: (m: string) => liveLines.push(String(m)),
        })).catch((e: any) => ({ ok: false, error: String(e?.message), logs: [] as string[] }));
    stop?.();

    const runLines: string[] = (runRes as any)?.logs || [];
    console.log(`      live: ${liveLines.length} line(s), terminal: ${terminalLines.length} line(s)`);
    for (const l of liveLines) console.log(`        · ${l}`);

    const repeated = liveLines.filter(l => terminalLines.some(t => t.includes(l)));
    check('every line the panel already showed was NOT replayed to the terminal',
        repeated.length === 0, repeated.join(' | ').slice(0, 200));

    // …and the same mechanism on a tool built to expose it, so the check above
    // cannot pass merely because nothing was said.
    const talkTerminal: string[] = [];
    const stop2 = ws.observeBroadcasts?.((msg: any) => {
        if (msg?.type === 'terminal_output') talkTerminal.push(String(typeof msg?.data === 'string' ? msg.data : (msg?.data?.line ?? msg?.data?.chunk ?? '')));
    });
    const talkLive: string[] = [];
    await executionFirewall.runInContext('proof-run', () =>
        executeTool('proof_double_talker', {}, {
            sessionId: 'proof-session', userId: 'proof', workspaceId: 'proof-ws',
            onProgress: (m: string) => talkLive.push(String(m)),
        })).catch(() => null);
    stop2?.();
    const talkText = talkTerminal.join('\n');
    console.log(`      terminal after the talker: ${JSON.stringify(talkTerminal)}`);
    check('the tool really did speak one line live', talkLive.length === 1, `live=${talkLive.length}`);
    check('the line already on the panel is NOT echoed to the terminal',
        !talkText.includes(LIVE_LINE), talkText.slice(0, 200));
    check('but a line that was only RECORDED still reaches the terminal',
        talkText.includes(ONLY_IN_LOGS), talkText.slice(0, 200));

    const spoken = liveLines.length ? liveLines : runLines;
    check('the tool actually spoke (an empty proof proves nothing)', spoken.length > 0);
    const arabicRunLines = spoken.filter(l => ARABIC.test(l));
    check('project_run in English mode emitted no Arabic line',
        arabicRunLines.length === 0, arabicRunLines.join(' | ').slice(0, 200));

    const { ProjectPipelineTool } = require('../../modules/tools/definitions/ProjectPipelineTool');
    check('the pipeline tool still loads with the language rule wired in',
        typeof new ProjectPipelineTool().execute === 'function');

    console.log('\n[4] The tables he WROTE beat the domain we RECOGNISED\n');

    const { designDataModel } = require('../../core/design/schema-designer');
    const HIS = [
        'Build a complete system for a veterinary clinic called "Dar Al-Rifq",',
        'with a React interface and a real database:',
        '',
        'Tables: animals, vaccinations, doctors, appointments, invoices',
        'With photos for the animals, sign-in and staff permissions.',
    ].join('\n');

    const notes: string[] = [];
    const model = await designDataModel(HIS, { onNote: (n: string) => notes.push(n), timeoutMs: 1 });
    const keys = model.map((e: any) => e.key);
    console.log(`      note: ${notes[0] || '(none)'}`);
    console.log(`      keys: ${keys.join(', ')}`);
    check('all five tables he named are there',
        ['animals', 'vaccinations', 'doctors', 'appointments', 'invoices'].every(k => keys.includes(k)),
        keys.join(', '));
    check('and «patients» — which he never wrote — is not', !keys.includes('patients'));
    check('the trace says WHERE the model came from', /declares its tables/.test(notes[0] || ''), notes[0]);
    const animals = model.find((e: any) => e.key === 'animals');
    check('an animal has a photograph column', !!animals?.fields?.some((f: any) => f.key === 'image'));
    const invoices = model.find((e: any) => e.key === 'invoices');
    check('an invoice has an amount and no photograph',
        !!invoices?.fields?.some((f: any) => f.key === 'amount')
        && !invoices?.fields?.some((f: any) => f.key === 'image'));

    fake.srv.close();
    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
