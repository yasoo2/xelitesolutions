// MUSE wiring-audit checkpoint 26: media_images (2) trunk stories
// + LEVEL-4 live probes + verification-consumer completion (static partition +
// pure-function verdict table; checker-set impact recorded).
// Part A: declarations + self-grounded selection for the 2 names +
//   isVerificationTool partition.
// Part B: verificationResultFromToolResult mapping over the trunk's
//   source-grounded output shapes (pure function, no execution).
// Part C: live canonical-path execution with contained fixtures
//   (created + removed by the probe; execution embargo care):
//   - video_action: guard/shape legs ONLY ({}, unknown action, missing
//     input file, trim without options). NO custom-action legs (options
//     interpolates raw into a shell string -- injection embargo); NO real
//     media processing (no ffmpeg fixtures, no binary fixtures).
//   - image_studio: no-project guard + fixture-contained project legs
//     ONLY (own-session joeProjects entry -> fixture dirs under FX, entry
//     restored after). Fixture A has NO picture column (honest error,
//     picturesFor never reached); fixture B has all rows ALREADY filled
//     (ok:true filled:0, picturesFor never reached -- the `continue`
//     branch). NO empty-image legs (would reach picturesFor ->
//     network/model). NO cross-owner project-entry legs (open
//     TOOL-HTTP-OWNER scope -- own session only).
// EMBARGO: no live media processing; no options-payload legs; no
//   picturesFor/picture-network legs; no Shrinker/browser use (lazily
//   constructed, never exercised -- close() is a no-op); no cross-owner
//   entry legs; no model legs.
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const TRUNK = ['image_studio', 'video_action'];
const CALL_TIMEOUT_MS = 30000;
const CALL_TIMEOUT_IMG_MS = 45000;

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
    console.error(`TRUNK_MEDIA_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));
  for (const n of TRUNK) {
    if (!byName.has(n)) { console.error(`TRUNK_MEDIA_ABORT missing tool ${n}`); process.exit(1); }
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
    'va unknown': verdictOf({ ok: false, error: 'Unknown action' }),
    'va ffmpeg-fail': verdictOf({ ok: false, error: 'ffmpeg exited 1: No such file', output: { success: false, ffmpegLogs: 'x' } }),
    'va ok-shape': verdictOf({ ok: true, output: { success: true, savedPath: 'x/out.mp4', ffmpegLogs: '' } }),
    'is noproject': verdictOf({ ok: false, error: 'This session has no system with tables' }),
    'is nopicture': verdictOf({ ok: false, error: 'No table here has a picture column' }),
    'is allfilled-shape': verdictOf({ ok: true, output: { message: 'x', filled: 0, tables: ['plants'] } }),
    'is filled-shape': verdictOf({ ok: true, output: { message: 'x', filled: 3, tables: ['plants'] } }),
  };

  // ---- Part C: live execution ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const defaultRoot: string = ws.workspaceService.getActiveRoot();
  const FX = path.join(sessionRoot, 'wiring-media-fx');
  const FXA = path.join(FX, 'isproj-a');
  const FXB = path.join(FX, 'isproj-b');
  const rootsBefore: Record<string, string[]> = {};
  try { rootsBefore.session = fs.existsSync(sessionRoot) ? fs.readdirSync(sessionRoot).sort() : []; }
  catch { rootsBefore.session = ['READ_FAILED']; }
  try { rootsBefore.default = fs.existsSync(defaultRoot) ? fs.readdirSync(defaultRoot).sort() : []; }
  catch { rootsBefore.default = ['READ_FAILED']; }
  const apiCwd = process.cwd();
  let apiBefore: string[] = [];
  try { apiBefore = fs.existsSync(apiCwd) ? fs.readdirSync(apiCwd).sort() : []; } catch { apiBefore = ['READ_FAILED']; }

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

  // ---- fixtures: two contained image_studio projects (own session only) ----
  fs.mkdirSync(FXA, { recursive: true });
  fs.mkdirSync(FXB, { recursive: true });
  fs.writeFileSync(path.join(FXA, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(FXB, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(FXA, 'entities.js'),
`export const entities = {
  tables: {
    invoices: {
      entity: { fields: [{ key: 'id' }, { key: 'total' }] },
      list: () => [{ id: 1, total: 5 }],
      update: () => false,
    },
  },
};
`);
  fs.writeFileSync(path.join(FXB, 'entities.js'),
`export const entities = {
  tables: {
    plants: {
      entity: { fields: [{ key: 'id' }, { key: 'name' }, { key: 'image' }] },
      list: () => [{ id: 1, name: 'fx-fern', image: 'already.png' }],
      update: () => true,
    },
  },
};
`);
  const g: any = global as any;
  const prevEntry = g.joeProjects?.['audit-sess'];
  const hadPrevEntry = prevEntry !== undefined;
  if (!g.joeProjects) g.joeProjects = {};

  // ---- legs: video_action (guard/shape only; no custom, no media) ----
  const vaOut1 = path.join(FX, 'out.mp4');
  const vaOut2 = path.join(FX, 'out2.mp4');
  await run('va.empty', 'video_action', {});
  await run('va.unknown', 'video_action', { action: 'explode', inputFile: 'a.mp4', outputFile: 'b.mp4' });
  await run('va.convert-missing', 'video_action', {
    action: 'convert', inputFile: path.join(FX, 'missing.mp4'), outputFile: vaOut1,
  });
  await run('va.trim-nooptions', 'video_action', {
    action: 'trim', inputFile: path.join(FX, 'missing.mp4'), outputFile: vaOut2,
  });
  live['va.compare'] = {
    emptyOk: !!raw['va.empty']?.ok,
    emptyError: raw['va.empty']?.error ? String(raw['va.empty'].error).slice(0, 60) : null,
    unknownOk: !!raw['va.unknown']?.ok,
    unknownError: raw['va.unknown']?.error ? String(raw['va.unknown'].error).slice(0, 60) : null,
    convertMissingOk: !!raw['va.convert-missing']?.ok,
    convertMissingErrorPrefix: raw['va.convert-missing']?.error ? String(raw['va.convert-missing'].error).slice(0, 120) : null,
    convertMissingOutShape: shape((raw['va.convert-missing'] as any)?.output),
    convertMissingLogLast: Array.isArray((raw['va.convert-missing'] as any)?.logs)
      ? String((raw['va.convert-missing'] as any).logs.slice(-1)[0] || '').slice(0, 200) : null,
    trimNooptionsOk: !!raw['va.trim-nooptions']?.ok,
    trimNooptionsErrorPrefix: raw['va.trim-nooptions']?.error ? String(raw['va.trim-nooptions'].error).slice(0, 120) : null,
    trimLogHasUndefined: Array.isArray((raw['va.trim-nooptions'] as any)?.logs)
      ? (raw['va.trim-nooptions'] as any).logs.some((l: any) => String(l).includes('undefined')) : null,
    out1ExistsAfterSuccess: fs.existsSync(vaOut1),
    out2ExistsAfterSuccess: fs.existsSync(vaOut2),
  };

  // ---- legs: image_studio (contained only; never picturesFor) ----
  // Production joeProjects entries carry PLAIN paths; the sessionRoot
  // returned here is \\?\ -prefixed, and a prefixed cwd CRASHES the
  // readTables subprocess (EISDIR -- diag_media_read, filed under
  // P1-010). Strip the prefix so the fixture matches production shape.
  const stripExt = (p: string) => p.replace(/^\\\\\?\\/, '');
  delete g.joeProjects['audit-sess'];
  await run('is.noproject', 'image_studio', {}, CALL_TIMEOUT_IMG_MS);
  g.joeProjects['audit-sess'] = { dir: stripExt(FXA) };
  await run('is.nopicture', 'image_studio', { table: 'invoices' }, CALL_TIMEOUT_IMG_MS);
  await run('is.nopicture-any', 'image_studio', {}, CALL_TIMEOUT_IMG_MS);
  g.joeProjects['audit-sess'] = { dir: stripExt(FXB) };
  await run('is.allfilled', 'image_studio', {}, CALL_TIMEOUT_IMG_MS);
  const afOut = (raw['is.allfilled'] as any)?.output;
  const afLogs: any[] = Array.isArray((raw['is.allfilled'] as any)?.logs) ? (raw['is.allfilled'] as any).logs : [];
  live['is.compare'] = {
    hadPrevEntry,
    noprojectOk: !!raw['is.noproject']?.ok,
    noprojectError: raw['is.noproject']?.error ? String(raw['is.noproject'].error).slice(0, 80) : null,
    nopictureOk: !!raw['is.nopicture']?.ok,
    nopictureError: raw['is.nopicture']?.error ? String(raw['is.nopicture'].error).slice(0, 80) : null,
    nopictureAnyOk: !!raw['is.nopicture-any']?.ok,
    nopictureAnyError: raw['is.nopicture-any']?.error ? String(raw['is.nopicture-any'].error).slice(0, 80) : null,
    allfilledOk: !!raw['is.allfilled']?.ok,
    allfilledFilled: afOut?.filled ?? null,
    allfilledTables: afOut?.tables ?? null,
    allfilledMsgHasRowWord: typeof afOut?.message === 'string' ? /row\(s\)|صفّاً/.test(afOut.message) : null,
    allfilledLogN: afLogs.length,
    allfilledImageNotes: afLogs.filter(l => String(l).startsWith('image:')).length,
  };

  // ---- restore global entry ----
  if (hadPrevEntry) g.joeProjects['audit-sess'] = prevEntry;
  else delete g.joeProjects['audit-sess'];

  // ---- cleanup ----
  let cleanup = 'ok';
  const cleanupNotes: string[] = [];
  try {
    fs.rmSync(FX, { recursive: true, force: true });
    const after = fs.existsSync(sessionRoot) ? fs.readdirSync(sessionRoot).sort() : [];
    const strays = after.filter(x => !rootsBefore.session.includes(x));
    const defAfter = fs.existsSync(defaultRoot) ? fs.readdirSync(defaultRoot).sort() : [];
    const defStrays = rootsBefore.default[0] === 'READ_FAILED' ? [] : defAfter.filter(x => !rootsBefore.default.includes(x));
    const apiAfter = fs.existsSync(apiCwd) ? fs.readdirSync(apiCwd).sort() : [];
    const apiStrays = apiBefore[0] === 'READ_FAILED' ? [] : apiAfter.filter(x => !apiBefore.includes(x));
    cleanup = (strays.length || defStrays.length || apiStrays.length)
      ? `STRAYS:session[${strays.join(',')}]|default[${defStrays.join(',')}]|api[${apiStrays.join(',')}]` : 'ok';
    if (cleanupNotes.length) cleanup += `|${cleanupNotes.join('|')}`;
  } catch (e: any) { cleanup = `CLEANUP_THREW:${String(e?.message || e).slice(0, 120)}`; }

  const evidence = {
    trunk: 'media_images', registered: tools.length, decl, verdictTable, live,
    cleanup, sessionRoot, defaultRoot, apiCwd, at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(HERE, 'trunk_media.json'), JSON.stringify(evidence, null, 2));
  const legIds = Object.keys(live);
  const okLegs = legIds.filter(k => live[k]?.ok === true).length;
  console.log(`EVIDENCE trunk=media legs=${legIds.length} ok=${okLegs} cleanup=${cleanup}`);
  for (const k of legIds) {
    const l = live[k];
    console.log(`  ${k} ok=${l?.ok} error=${l?.error || ''} out=${String(l?.outputPreview || JSON.stringify(l)?.slice(0, 160) || '').slice(0, 160)}`);
  }
  console.log(`SELECTABILITY ${TRUNK.map(n => `${n}=${decl[n].verdict}:r30=${decl[n].bestRank30}`).join(' ')}`);
  console.log(`VERDICTS ${Object.entries(verdictTable).map(([k, v]) => `${k}=>${v}`).join(' | ')}`);
}

main().then(() => process.exit(0)).catch(e => { console.error('TRUNK_MEDIA_FATAL', e); process.exit(1); });
