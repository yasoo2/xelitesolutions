// MUSE wiring-audit sweep batch 3 (checkpoint 7).
// Approval-risk tier survey: static transcription of classifyToolRisk +
// live canonical-path probes across low/medium/high/critical.
// SAFETY MODEL (see MUSE-WIRING-DISCOVERY-007.md):
// - delete_file {} CONTROL runs first; the batch ABORTS unless the approval
//   gate is proven active (approval_required) in THIS run. deploy_pages {}
//   is only reached through that gate (same classify+block code path).
// - Every executed probe was cleared by reading its execute() body:
//   deploy_project {}/git_ops {}/browser_run {}/read_file {}/echo {} all
//   fail honestly before any side effect; shell probes are read-only;
//   rm -rf targets a guaranteed-nonexistent path AND matches the tool's
//   own self-block ('rm -rf /'); git push probe uses a non-repo cwd.
// - No registrations, refactors, or deletions. Read-only audit + safe calls.
// Run from api/: .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\sweep3.mts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const SBX = path.join(ROOT, 'tmp', 'sbx-temp');
const imp = (p: string) => import(pathToFileURL(p).href);

// TRANSCRIPTION of classifyToolRisk (ToolService.ts:142-203 @ adf02775).
// Labeled model, not the function itself (audit-first: no source edits).
// Live probes below validate its predictions; mismatches are findings.
function tierModel(name: string, input: any): string {
  const n = String(name || '').trim();
  const s = (() => { try { return JSON.stringify(input || {}); } catch { return String(input || ''); } })();
  if (n === 'deploy_project') {
    const action = String((input as any)?.action || '').trim().toLowerCase();
    return action === 'expose_port' ? 'high' : 'medium';
  }
  if (n === 'shell_execute') {
    const cmd = String((input as any)?.command || '').toLowerCase();
    if (/(rm\s+-rf|drop\s+table|shutdown|kill\s+process|\bsudo\b)/i.test(cmd)) return 'critical';
    if (/(chmod\s+777|chown\s+root|mkfs|dd\s+if=|:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;:)/i.test(cmd)) return 'critical';
    if (/(curl|wget|scp|ssh|docker|systemctl|service\s+|kubectl|terraform|ansible|git\s+push|npm\s+publish)/i.test(cmd)) return 'high';
    const readOnlyDiagnostic = /^(?:pwd|ls(?:\s+[-\w./]+)*|git\s+(?:status|diff)(?:\s+[-\w./]+)*|node\s+(?:--version|-v)|npm\s+(?:--version|-v)|echo\s+[A-Za-z0-9_.:/=-]+)$/i;
    if (!/[;&|`$><\n\r]/.test(cmd) && readOnlyDiagnostic.test(cmd.trim())) return 'low';
    if (/(^|[;&|])\s*(node|npm|npx|pnpm|yarn|ts-node|tsc)\b/i.test(cmd)) return 'medium';
    return 'high';
  }
  if (n === 'git_ops') {
    const op = String((input as any)?.operation || '').toLowerCase();
    if (op === 'push' || op === 'commit') return 'high';
    return 'medium';
  }
  if (n === 'browser_run') {
    const acts = Array.isArray((input as any)?.actions) ? (input as any).actions : [];
    const txt = String((input as any)?.instructionText || '');
    const mode = String((input as any)?.mode || '').trim().toLowerCase();
    const allowedActions = new Set(['goto', 'extract_text', 'get_elements', 'screenshot', 'wait', 'scroll']);
    const sensitive = /(password|cvv|iban|ssn|card|otp|2fa|payment|checkout|pay|delete|drop|remove|submit|login|sign\s*in|حذف|دفع|بطاقة|كلمة المرور|تحقق|إرسال|تسجيل)/iu;
    const isLoopback = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/iu;
    if (mode === 'browser_test' && acts.length && acts.every((a: any) => allowedActions.has(String(a?.type || '').trim().toLowerCase()))
      && !sensitive.test(txt) && acts.map((a: any) => String(a?.url || '').trim()).filter(Boolean).every((u: string) => isLoopback.test(u))) return 'medium';
    if (/(password|cvv|iban|ssn|card|otp|2fa|payment|checkout|pay|delete|drop|remove|حذف|دفع|بطاقة|كلمة المرور|تحقق)/i.test(txt)) return 'high';
    for (const a of acts) {
      const t = String(a?.type || '').toLowerCase();
      if (t === 'uploadfile' || t === 'fillform' || t === 'evaluate') return 'high';
      if (t === 'type' && /\{\{\s*SECRET\s*:/i.test(String(a?.text || ''))) return 'high';
      if (t === 'click' && /(delete|remove|drop|pay|checkout|submit|login|sign\s*in|حذف|دفع|ارسال|تسجيل)/i.test(`${String(a?.text || '')} ${String(a?.selector || '')} ${String(a?.name || '')} ${String(a?.role || '')}`.toLowerCase())) return 'high';
    }
    return 'medium';
  }
  if (/(delete|deploy)/.test(n)) return 'high';
  if (/(write_file|file_edit|scaffold_project|npm_manager|auto_tester|java_builder)/.test(n)) return 'medium';
  if (/(read_file|inspect_directory|inspect_symbol|grep_search|codebase_navigator|project_detect|analyze_codebase)/.test(n)) return 'low';
  if (/(http_fetch|payments_create_checkout_session)/.test(n)) return 'medium';
  if (/(echo|central_answer|task_lifecycle)/.test(n)) return 'low';
  if (/(rm\s+-rf|drop\s+table|shutdown|kill\s+process|\bsudo\b)/i.test(s)) return 'critical';
  return 'medium';
}

const PROBES: Array<{ n: string; i: any; pred: string }> = [
  { n: 'delete_file', i: {}, pred: 'high/block CONTROL' },
  { n: 'search_text', i: {}, pred: 'medium/pass CONTROL' },
  { n: 'task_lifecycle', i: {}, pred: 'low/pass CONTROL' },
  { n: 'deploy_pages', i: {}, pred: 'high/block' },
  { n: 'remove_file', i: {}, pred: 'high/block alias->delete_file' },
  { n: 'deploy_project', i: { action: 'expose_port', projectPath: 'no-such-dir-xyz' }, pred: 'high/block' },
  { n: 'deploy_project', i: {}, pred: 'medium/pass honest path-required' },
  { n: 'shell_execute', i: {}, pred: 'high/block' },
  { n: 'shell_execute', i: { command: 'pwd' }, pred: 'low/pass' },
  { n: 'shell_execute', i: { command: 'echo risk-tier-probe-7' }, pred: 'low/pass' },
  { n: 'shell_execute', i: { command: 'git status' }, pred: 'low/pass' },
  { n: 'shell_execute', i: { command: 'rm -rf /tmp/joe-audit-nonexistent-xyz' }, pred: 'critical/block' },
  { n: 'echo', i: { text: 'note: rm -rf never run' }, pred: 'critical/block input-scan' },
  { n: 'echo', i: {}, pred: 'low/pass' },
  { n: 'git_ops', i: { operation: 'push', cwd: SBX }, pred: 'high/block' },
  { n: 'git_ops', i: {}, pred: 'medium/pass honest git error' },
  { n: 'browser_run', i: {}, pred: 'medium/pass honest sessionId_required' },
  { n: 'browser_run', i: { instructionText: 'delete everything now' }, pred: 'high/block' },
  { n: 'read_file', i: {}, pred: 'low/pass honest' },
];
const CALL_TIMEOUT_MS = 20000;

function shape(v: any): string {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === 'object') return `{${Object.keys(v).slice(0, 8).join(',')}}`;
  return typeof v;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  return Promise.race([
    p.then(value => ({ timedOut: false as const, value })),
    new Promise<{ timedOut: true }>(res => setTimeout(() => res({ timedOut: true }), ms)),
  ]);
}

async function main() {
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  if (tools.length !== 163) {
    console.error(`SWEEP3_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  if (process.env.AUTO_APPROVE_ALL === '1' || process.env.ENABLE_AUTH_BYPASS === 'true') {
    console.error('SWEEP3_ABORT approval gate disabled by env');
    process.exit(1);
  }
  const names = tools.map(t => String(t.name)).sort();
  const census: Record<string, string[]> = { low: [], medium: [], high: [], critical: [] };
  for (const nm of names) census[tierModel(nm, {})].push(nm);

  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const live: Record<string, any> = {};
  for (const p of PROBES) {
    const key = `${p.n} ${JSON.stringify(p.i).slice(0, 90)}`;
    try {
      const raced = await withTimeout(
        fw.executionFirewall.runInContext('audit-trace',
          () => executeTool(p.n, { ...p.i }, { ...ctx }),
          { userId: 'audit-user', sessionId: 'audit-sess', runId: 'audit-run' }),
        CALL_TIMEOUT_MS);
      if (raced.timedOut) { live[key] = { pred: p.pred, timeoutMs: CALL_TIMEOUT_MS }; continue; }
      const r: any = (raced as any).value;
      const o = r?.output;
      live[key] = {
        pred: p.pred,
        ok: !!r?.ok,
        error: r?.error ? String(r.error).slice(0, 200) : null,
        risk: o && typeof o === 'object' && typeof (o as any).risk === 'string' ? (o as any).risk : null,
        outputShape: shape(o),
        outputPreview: typeof o === 'string' ? o.slice(0, 160) : (o && typeof o === 'object' && typeof (o as any).message === 'string' ? String((o as any).message).slice(0, 160) : (o && typeof o === 'object' && typeof (o as any).stdout === 'string' ? String((o as any).stdout).slice(0, 160) : (o && typeof o === 'object' && typeof (o as any).output === 'string' ? String((o as any).output).slice(0, 160) : (o && typeof o === 'object' && typeof (o as any).content === 'string' ? String((o as any).content).slice(0, 200) : null)))),
        log0: Array.isArray(r?.logs) && r.logs.length ? String(r.logs[0]).slice(0, 160) : null,
      };
    } catch (e: any) {
      live[key] = { pred: p.pred, threw: String(e?.message || e).slice(0, 200) };
    }
    if (p.n === 'delete_file') {
      const c = live[key];
      if (c?.error !== 'approval_required') {
        console.error(`SWEEP3_ABORT control failed: delete_file -> ${JSON.stringify(c)}; gate inactive, stopping before deploy_pages`);
        process.exit(1);
      }
    }
  }

  const out = { generatedAt: new Date().toISOString(), tierCensusEmptyInput: { low: census.low.length, medium: census.medium.length, high: census.high.length, critical: census.critical.length, lowNames: census.low, highNames: census.high }, liveRiskTiers: live };
  const jsonPath = path.join(ROOT, 'tmp', 'wiring-audit', 'sweep3.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
  console.log(`wrote ${jsonPath}`);
  process.exit(0);
}

main().catch(e => { console.error('SWEEP3_FAILED', e); process.exit(1); });
