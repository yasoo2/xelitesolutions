// MUSE wiring-audit checkpoint 22: interaction-trunk stories + LEVEL-4 live probes
// + verification-consumer completion (static partition + pure-function verdict
// table; checker-set impact recorded).
// Part A: declarations + self-grounded selection for the 8 interaction names
//   (ask_user, business_profile, central_answer, echo, form_inbox,
//   notify_user, task_lifecycle, todo_write)
//   + isVerificationTool partition (task-level + gate opt-ins).
// Part B: verificationResultFromToolResult mapping over the trunk's
//   source-grounded output shapes (pure function, no execution).
// Part C: live canonical-path execution with contained fixtures
//   (created + removed by the probe; NO network legs; NO model legs):
//   - echo: ok + missing-text
//   - ask_user: ok + options + missing-question (broadcast, non-blocking)
//   - notify_user: ok + level + missing-message (broadcast)
//   - task_lifecycle: update/complete/fail + bad-action + missing-action
//   - todo_write: replace/merge/missing-merge/missing-todos/empty
//     (returns `data`, NOT `output` — ToolService drops it; see finding)
//   - business_profile: show-empty/save/show/save-nofield/clear/show-cleared
//     (disk store redirected via JOE_CHAT_STORE_DIR into the fixture dir)
//   - form_inbox: empty + seeded-list (appendSubmission fixture, own vs
//     other session key) + english-request (dead isAr branch)
//   - central_answer: empty/missing (honest fail) + instant fast-path legs
//     (hi/thanks/arabic-greeting, no model call); LONG questions EMBARGOED
//     (would call routeToModel) — code-cited only.
// EMBARGO: no model legs (central_answer router path not executed live),
//   no network legs, no cross-session live probing beyond code-cited notes.
// Run from api/: $env:ARTIFACT_DIR='<fx>\artifacts'; <env as in 022 doc>
//   node <abs tsx> ..\tmp\wiring-audit\trunk_interaction.mts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TRUNK = [
  'ask_user', 'business_profile', 'central_answer', 'echo', 'form_inbox',
  'notify_user', 'task_lifecycle', 'todo_write',
];
const TOKEN = 'WIRING_IXN_TOKEN_9d4e';
const CALL_TIMEOUT_MS = 25000;

function shape(v: any): string {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === 'object') return `{${Object.keys(v).slice(0, 14).join(',')}}`;
  return typeof v;
}

function scrub(s: string): string {
  return String(s)
    .replace(/Bearer [A-Za-z0-9\-._~+/=]+/g, 'Bearer [REDACTED]')
    .replace(/(password|passwd|secret|token|apiKey|api_key|authorization)["']?\s*[:=]\s*["']?[^"',}\s\\]+/gi, '$1=[REDACTED]');
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  return Promise.race([
    p.then(value => ({ timedOut: false as const, value })),
    new Promise<{ timedOut: true }>(res => setTimeout(() => res({ timedOut: true }), ms)),
  ]);
}

function rankOf(picks: Array<{ name: string; score: number }>, name: string): { rank: number; score: number } | null {
  const i = picks.findIndex(p => p.name === name);
  return i < 0 ? null : { rank: i + 1, score: picks[i].score };
}

async function main() {
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  if (tools.length !== 163) {
    console.error(`TRUNK_IXN_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TRUNK) {
    if (!byName.has(n)) { console.error(`TRUNK_IXN_ABORT missing tool ${n}`); process.exit(1); }
  }

  const catalog: any = await imp(path.join(SRC, 'core', 'orchestrator', 'toolCatalog.ts'));
  const selectToolsFor = catalog.selectToolsFor as (goal: string, limit?: number) => Array<{ name: string; score: number }>;
  const excluded: Set<string> = catalog.ROUTER_EXCLUDED as Set<string>;
  let priority: Set<string> | null = null;
  try {
    const picker: any = await imp(path.join(SRC, 'core', 'llm', 'tool-picker.ts'));
    const names = picker.PRIORITY_TOOL_NAMES;
    if (Array.isArray(names)) priority = new Set(names.map(String));
  } catch { priority = null; }
  const fullLimit = tools.length;

  const ledger: any = await imp(path.join(SRC, 'core', 'quality', 'verification-ledger.ts'));
  const isVerificationTool = ledger.isVerificationTool as (t: string, a?: any, e?: boolean, x?: boolean, l?: boolean) => boolean;
  const verdictOf = ledger.verificationResultFromToolResult as (v: unknown) => string;

  // ---- Part A: declarations + selection + checker partition ----
  const decl: Record<string, any> = {};
  for (const n of TRUNK) {
    const t = byName.get(n);
    const desc: string = String(t?.description || '');
    const firstSentence = desc.split(/(?<=[.])\s/)[0].slice(0, 140).trim();
    const goals = [
      `use ${n.split('_').join(' ')} for this task`,
      firstSentence ? `I need: ${firstSentence}` : `use ${n.split('_').join(' ')}`,
    ];
    const ranks = goals.map(g => {
      const top30 = selectToolsFor(g, 30);
      const all = selectToolsFor(g, fullLimit);
      return { goal: g, rank30: rankOf(top30, n), rankFull: rankOf(all, n) };
    });
    const best30 = Math.min(...ranks.map(r => r.rank30?.rank ?? Infinity));
    const bestFull = Math.min(...ranks.map(r => r.rankFull?.rank ?? Infinity));
    decl[n] = {
      descriptionHead: desc.slice(0, 160),
      tags: Array.isArray(t?.tags) ? t.tags.map(String) : [],
      required: Array.isArray(t?.inputSchema?.required) ? t.inputSchema.required : null,
      properties: t?.inputSchema?.properties && typeof t.inputSchema.properties === 'object' ? Object.keys(t.inputSchema.properties) : null,
      permissions: Array.isArray(t?.permissions) ? t.permissions.map(String) : t?.permissions ?? null,
      sideEffects: Array.isArray(t?.sideEffects) ? t.sideEffects.map(String) : t?.sideEffects ?? null,
      rateLimitPerMinute: t?.rateLimitPerMinute ?? null,
      routerExcluded: excluded ? excluded.has(n) : null,
      priorityListed: priority ? priority.has(n) : null,
      verdict: best30 <= 30 ? 'SELECTABLE_BY_KEYWORD' : (bestFull <= fullLimit ? 'LONG_TAIL_RANKED' : 'UNSELECTABLE_EVEN_SELF_GROUNDED'),
      bestRank30: best30 === Infinity ? null : best30,
      bestRankFull: bestFull === Infinity ? null : bestFull,
      top3SelfName: selectToolsFor(goals[0], 30).slice(0, 3).map(p => `${p.name}:${p.score}`),
      checkerTaskLevel: isVerificationTool(n, {}, false, false, false),
      checkerGateExistence: isVerificationTool(n, {}, false, true, false),
      checkerGateLive: isVerificationTool(n, {}, false, false, true),
    };
  }

  // ---- Part B: pure-function verdict table (source-grounded shapes) ----
  const verdictTable: Record<string, string> = {
    'echo text': verdictOf({ ok: true, output: { text: 'ping' } }),
    'ask waiting': verdictOf({ ok: true, output: { status: 'waiting_for_user_input', message: 'Request sent. Agent loop should now pause.' } }),
    'notify ack': verdictOf({ ok: true, output: { acknowledged: true } }),
    'lifecycle success': verdictOf({ ok: true, output: { success: true } }),
    'todo ok-null-output': verdictOf({ ok: true, output: null }),
    'todo fail-no-todos': verdictOf({ ok: false, error: 'Failed to update todos: Cannot read properties of undefined' }),
    'profile saved': verdictOf({ ok: true, output: { message: 'saved', profile: { brand: 'x' } } }),
    'profile shown': verdictOf({ ok: true, output: { message: 'profile', profile: { brand: 'x' } } }),
    'profile cleared': verdictOf({ ok: true, output: { message: 'cleared' } }),
    'profile no-field': verdictOf({ ok: true, output: { message: 'no field recognized' } }),
    'inbox empty': verdictOf({ ok: true, output: { message: 'empty' } }),
    'inbox count': verdictOf({ ok: true, output: { message: 'messages', count: 2 } }),
    'central instant': verdictOf({ ok: true, output: 'Hi! Joe here.' }),
    'central empty-fail': verdictOf({ ok: false, error: 'central_answer was called without a question.' }),
    'central router-shape': verdictOf({ ok: true, output: 'A model-produced answer paragraph.' }),
  };

  // ---- Part C: live execution ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const formInbox: any = await imp(path.join(SRC, 'api', 'form-inbox.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const FX = path.join(sessionRoot, 'wiring-ixn-fx');
  const ENVSTORE = String(process.env.JOE_CHAT_STORE_DIR || '').trim();
  if (!ENVSTORE) { console.error('TRUNK_IXN_ABORT JOE_CHAT_STORE_DIR not redirected'); process.exit(1); }
  const FXOUT = path.dirname(ENVSTORE);
  const rootsBefore: Record<string, string[]> = {};
  try { rootsBefore.session = fs.existsSync(sessionRoot) ? fs.readdirSync(sessionRoot).sort() : []; }
  catch { rootsBefore.session = ['READ_FAILED']; }

  const live: Record<string, any> = {};
  const raw: Record<string, any> = {};
  const runWithCtx = async (id: string, name: string, input: any, c: any, timeoutMs = CALL_TIMEOUT_MS) => {
    try {
      const raced = await withTimeout(
        fw.executionFirewall.runInContext('audit-trace',
          () => executeTool(name, input, c),
          { userId: c.userId || 'audit-user', sessionId: c.sessionId || 'audit-sess', runId: 'audit-run' }),
        timeoutMs);
      if (raced.timedOut) { live[id] = { input: JSON.stringify(input).slice(0, 200), timeoutMs, timedOut: true }; return; }
      const r: any = (raced as any).value;
      raw[id] = r;
      const o = r?.output;
      live[id] = {
        input: scrub(JSON.stringify(input).slice(0, 200)),
        ok: !!r?.ok,
        error: r?.error ? scrub(String(r.error).slice(0, 260)) : null,
        outputShape: shape(o),
        outputPreview: typeof o === 'string' ? scrub(o.slice(0, 600))
          : (o && typeof o === 'object' ? scrub(JSON.stringify(o).slice(0, 1400)) : (o === null ? 'null' : String(o).slice(0, 200))),
        hasDataField: (r as any)?.data !== undefined ? shape((r as any).data) : null,
        log0: Array.isArray(r?.logs) && r.logs.length ? scrub(String(r.logs[0]).slice(0, 200)) : null,
        logLast: Array.isArray(r?.logs) && r.logs.length ? scrub(String(r.logs[r.logs.length - 1]).slice(0, 300)) : null,
        logN: Array.isArray(r?.logs) ? r.logs.length : null,
      };
    } catch (e: any) {
      live[id] = { input: scrub(JSON.stringify(input).slice(0, 200)), threw: scrub(String(e?.message || e).slice(0, 260)) };
    }
  };
  const run = (id: string, name: string, input: any, timeoutMs = CALL_TIMEOUT_MS) => runWithCtx(id, name, input, ctx, timeoutMs);

  // ---- fixtures ----
  for (const d of [FX, ENVSTORE]) fs.mkdirSync(d, { recursive: true });

  // ---- legs: echo ----
  await run('ec.ok', 'echo', { text: `${TOKEN} ping` });
  await run('ec.missing', 'echo', {});

  // ---- legs: ask_user (broadcast, returns waiting — never blocks) ----
  await run('au.ok', 'ask_user', { question: `${TOKEN}: proceed?` });
  await run('au.options', 'ask_user', { question: `${TOKEN}: pick one`, options: ['alpha', 'beta'] });
  await run('au.missing', 'ask_user', {});

  // ---- legs: notify_user ----
  await run('nt.ok', 'notify_user', { message: `${TOKEN} installing` });
  await run('nt.level', 'notify_user', { message: `${TOKEN} done`, level: 'success' });
  await run('nt.missing', 'notify_user', {});

  // ---- legs: task_lifecycle ----
  await run('lc.update', 'task_lifecycle', { action: 'update', taskName: `${TOKEN}-task`, taskStatus: 'Scanning files...', mode: 'EXECUTION' });
  await run('lc.complete', 'task_lifecycle', { action: 'complete', taskName: `${TOKEN}-task`, taskSummary: 'done' });
  await run('lc.fail', 'task_lifecycle', { action: 'fail', taskName: `${TOKEN}-task`, taskStatus: 'broke' });
  await run('lc.bad', 'task_lifecycle', { action: 'explode' });
  await run('lc.missing', 'task_lifecycle', {});

  // ---- legs: todo_write (returns `data`, not `output`) ----
  await run('td.replace', 'todo_write', { merge: false, todos: [{ id: 't1', status: 'completed', content: `${TOKEN} first` }, { id: 't2', status: 'in_progress', content: `${TOKEN} second` }] });
  await run('td.merge', 'todo_write', { merge: true, todos: [{ id: 't3', status: 'pending', content: `${TOKEN} third` }] });
  await run('td.nomerge', 'todo_write', { todos: [{ id: 't4', status: 'pending', content: `${TOKEN} fourth` }] });
  await run('td.notodos', 'todo_write', { merge: false });
  await run('td.empty', 'todo_write', { merge: true, todos: [] });
  live['td.compare'] = {
    replaceOk: !!raw['td.replace']?.ok,
    replaceOutput: raw['td.replace']?.output === null ? 'null' : shape(raw['td.replace']?.output),
    replaceDataDropped: (raw['td.replace'] as any)?.data === undefined,
    notodosOk: !!raw['td.notodos']?.ok,
    notodosError: raw['td.notodos']?.error ? String(raw['td.notodos'].error).slice(0, 160) : null,
    emptyCount: (() => { const m = String(raw['td.empty']?.logs?.[0] || '').match(/(\d+) todo/); return m ? m[1] : null; })(),
  };

  // ---- legs: business_profile (disk store redirected to STORE) ----
  await run('bp.show-empty', 'business_profile', { request: 'show my business profile' });
  await run('bp.save', 'business_profile', { request: `save business profile: brand ${TOKEN} Diner, phone 0500000000, email fixture@example.test` });
  await run('bp.show', 'business_profile', { request: 'what is my business profile?' });
  await run('bp.save-nofield', 'business_profile', { request: `save business profile: ${TOKEN} zzz-no-labels-here` });
  live['bp.store'] = (() => {
    try {
      const f = path.join(ENVSTORE, 'business-profile.json');
      if (!fs.existsSync(f)) return { file: 'ABSENT' };
      const all = JSON.parse(fs.readFileSync(f, 'utf-8'));
      return {
        file: 'present', slots: Object.keys(all).sort(),
        ownBrand: all['audit-sess']?.brand ?? null,
        ownPhone: all['audit-sess']?.phone ?? null,
        defaultBrand: all['default']?.brand ?? null,
      };
    } catch (e: any) { return { file: `READ_FAILED:${String(e?.message || e).slice(0, 80)}` }; }
  })();
  await run('bp.clear', 'business_profile', { request: 'clear my business profile data' });
  await run('bp.show-cleared', 'business_profile', { request: 'show my business profile' });
  live['bp.cleared'] = (() => {
    try {
      const f = path.join(ENVSTORE, 'business-profile.json');
      if (!fs.existsSync(f)) return { file: 'ABSENT' };
      const all = JSON.parse(fs.readFileSync(f, 'utf-8'));
      return { file: 'present', slots: Object.keys(all).sort() };
    } catch (e: any) { return { file: `READ_FAILED:${String(e?.message || e).slice(0, 80)}` }; }
  })();

  // ---- legs: form_inbox ----
  await run('fi.empty', 'form_inbox', { request: 'show inbox' });
  formInbox.appendSubmission('audit-sess', { name: `${TOKEN}-visitor`, message: `${TOKEN} hello` }, `${TOKEN}-page`);
  formInbox.appendSubmission('audit-sess', { name: `${TOKEN}-visitor2`, message: `${TOKEN} second` }, `${TOKEN}-page`);
  formInbox.appendSubmission('other-sess', { name: 'stranger', message: 'must not leak' }, 'other-page');
  await run('fi.list', 'form_inbox', { request: 'show inbox' });
  await run('fi.english', 'form_inbox', { request: 'list my form messages please' });
  live['fi.scope'] = {
    listCount: raw['fi.list']?.output?.count ?? null,
    ownSeen: String(raw['fi.list']?.output?.message || '').includes(`${TOKEN}-visitor`),
    otherLeaked: String(raw['fi.list']?.output?.message || '').includes('must not leak'),
    englishIsArabic: /[\u0600-\u06FF]/.test(String(raw['fi.english']?.output?.message || '')),
  };

  // ---- legs: central_answer (NO model legs; instant + refusal paths only) ----
  await run('ca.empty', 'central_answer', { question: '' });
  await run('ca.missing', 'central_answer', {});
  await run('ca.hi', 'central_answer', { question: 'hi' });
  await run('ca.thanks', 'central_answer', { question: 'thanks' });
  await run('ca.ar-greet', 'central_answer', { question: 'مرحبا' });
  live['ca.paths'] = {
    emptyOk: !!raw['ca.empty']?.ok,
    missingOk: !!raw['ca.missing']?.ok,
    hiFastPath: String((raw['ca.hi']?.logs || []).join('|')).includes('instant fast-path'),
    hiIsString: typeof raw['ca.hi']?.output === 'string',
    thanksFastPath: String((raw['ca.thanks']?.logs || []).join('|')).includes('instant fast-path'),
    arFastPath: String((raw['ca.ar-greet']?.logs || []).join('|')).includes('instant fast-path'),
    arIsArabic: /[\u0600-\u06FF]/.test(String(raw['ca.ar-greet']?.output || '')),
  };

  // ---- cleanup ----
  let cleanup = 'ok';
  const cleanupNotes: string[] = [];
  try {
    fs.rmSync(FX, { recursive: true, force: true });
    if (FXOUT.startsWith(path.join(ROOT, 'tmp', 'wiring-audit'))) fs.rmSync(FXOUT, { recursive: true, force: true });
    else cleanupNotes.push(`FXOUT_NOT_REMOVED:${FXOUT}`);
    const after = fs.existsSync(sessionRoot) ? fs.readdirSync(sessionRoot).sort() : [];
    const strays = after.filter(x => !rootsBefore.session.includes(x));
    cleanup = strays.length ? `STRAYS:${strays.join(',')}` : 'ok';
    if (cleanupNotes.length) cleanup += `|${cleanupNotes.join('|')}`;
  } catch (e: any) { cleanup = `CLEANUP_THREW:${String(e?.message || e).slice(0, 120)}`; }

  const evidence = {
    trunk: 'interaction', registered: tools.length, decl, verdictTable, live,
    cleanup, sessionRoot, storeRedirect: ENVSTORE, at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(HERE, 'trunk_interaction.json'), JSON.stringify(evidence, null, 2));
  const legIds = Object.keys(live);
  const okLegs = legIds.filter(k => live[k]?.ok === true).length;
  console.log(`EVIDENCE trunk=interaction legs=${legIds.length} ok=${okLegs} cleanup=${cleanup}`);
  for (const k of legIds) {
    const l = live[k];
    console.log(`  ${k} ok=${l?.ok} error=${l?.error || ''} out=${String(l?.outputPreview || JSON.stringify(l)?.slice(0, 160) || '').slice(0, 160)}`);
  }
  console.log(`SELECTABILITY ${TRUNK.map(n => `${n}=${decl[n].verdict}:r30=${decl[n].bestRank30}`).join(' ')}`);
  console.log(`VERDICTS ${Object.entries(verdictTable).map(([k, v]) => `${k}=>${v}`).join(' | ')}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('TRUNK_IXN_FATAL', e); process.exit(1); });
