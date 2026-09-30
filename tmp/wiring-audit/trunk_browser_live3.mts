// MUSE wiring-audit checkpoint 11: browser_ui (a)-family LEVEL-4 live batch.
// 22 context-derived tools + browser_vision via canonical ToolService.executeTool
// (firewall runInContext), one probe-owned loopback fixture server, one owned
// session, ephemeral headless only. Read-before-call: BrowserSmartTools.ts
// executes for all 22 + BrowserVisionTool.ts (see MUSE-WIRING-DISCOVERY-011).
// Run from api/ with the live1/live2 env + BROWSER_EXECUTABLE_PATH.
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const FX = path.join(HERE, 'fx-browselive3');
const imp = (p: string) => import(pathToFileURL(p).href);

const LEG_TIMEOUT_MS = 90000;
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  return Promise.race([
    p.then(value => ({ timedOut: false as const, value })),
    new Promise<{ timedOut: true }>(res => setTimeout(() => res({ timedOut: true }), ms)),
  ]);
}
function envFlag(name: string): string { return String(process.env[name] ?? '').trim(); }
function assertEphemeral(tag: string) {
  const bad: string[] = [];
  if (envFlag('BROWSER_HEADLESS') !== 'true') bad.push('BROWSER_HEADLESS!=true');
  for (const k of ['USE_USER_BROWSER_PROFILE', 'USE_SYSTEM_CHROME', 'BROWSER_PERSISTENT_PROFILE']) {
    const v = envFlag(k);
    if (v !== '' && v !== '0' && v.toLowerCase() !== 'false') bad.push(`${k}=${v}`);
  }
  if (envFlag('AUTO_APPROVE_ALL') === '1') bad.push('AUTO_APPROVE_ALL=1');
  if (envFlag('AUTO_APPROVE_SAFE') === '1') bad.push('AUTO_APPROVE_SAFE=1');
  if (envFlag('ENABLE_AUTH_BYPASS') === 'true') bad.push('ENABLE_AUTH_BYPASS=true');
  if (bad.length) { console.error(`BROWSELIVE3_ABORT ${tag}: ${bad.join('; ')}`); process.exit(1); }
}

// Deliberately flawed fixture: no lang/viewport/charset, 2x h1, dup ids,
// tabindex, aria-hidden focusable, h1->h3 skip, 1 no-alt img, 1 missing img,
// unlabeled input, empty link, low-contrast text, console error, table, form.
function auditPage(): string {
  return `<!DOCTYPE html><html><head><title>AuditEight Fixture Page</title>
<meta property="og:title" content="AuditEight">
<script type="application/ld+json">{"@type":"WebPage","name":"AuditEight"}</script>
</head><body>
<a href="#main">SkipEight</a>
<header><h1>AuditEight Fixture Page</h1></header>
<main id="main">
<h1>Second Heading One</h1>
<h3>Skipped Level Three</h3>
<span id="dup">DupOne</span><span id="dup">DupTwo</span>
<span tabindex="3">TabThree</span>
<div aria-hidden="true"><a href="/okpage">HiddenLink</a></div>
<p>First meaningful paragraph with more than forty characters for readability and autofix description mining work.</p>
<p>Second paragraph keeps the word count healthy for the readability leg and the translate block list non-empty.</p>
<span style="color:#777777;background:#ffffff;font-size:14px">LowContrastSeed</span>
<a href="/okpage">OkPage</a> <a href="/gone">GonePage</a> <a href="#">EmptyHash</a>
<img src="/img-ok.png" alt="Ok image"><img src="/img-noalt.png"><img src="/img-missing.png" alt="Missing">
<table id="seedtable"><tr><th>Name</th><th>Value</th></tr><tr><td>alpha</td><td>1</td></tr><tr><td>beta</td><td>2</td></tr></table>
<ul><li>Uno</li><li>Duo</li><li>Tres</li></ul>
<button id="flipbtn" onclick="document.getElementById('flipout').textContent='FLIPPED-EIGHT-MARKER-CONFIRMED'">FlipMarker</button>
<span id="flipout"></span>
<form id="seedform"><input name="cityname" value=""><label for="ageseed">AgeSeed</label><input id="ageseed" value="3"><button type="submit">SaveSeed</button></form>
</main>
<script>console.error('SeedConsoleErrorEight');</script>
</body></html>`;
}
function okPage(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>OkPage</title></head><body><main><h1>OkPage</h1><p>Healthy loopback page.</p></main></body></html>`;
}
function cmpPage(which: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Cmp${which}</title></head><body><main><h1>Cmp${which} Heading</h1><p>Compare fixture ${which} with stable text.</p></main></body></html>`;
}
function searchPage(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>FxSearch</title></head><body><main><h1>FxSearch</h1><form action="/fx-results" method="get"><input type="search" name="q" aria-label="FxSearch box"></form></main></body></html>`;
}
function resultsPage(q: string): string {
  const safe = q.replace(/[<>&"]/g, '').slice(0, 40);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Results ${safe}</title></head><body><main><h1>Results for ${safe}</h1><ul><li><h3>SeedResult One for ${safe}</h3><p>First contained result text.</p></li><li><h3>SeedResult Two for ${safe}</h3><p>Second contained result text.</p></li></ul></main></body></html>`;
}

async function main() {
  assertEphemeral('startup');
  fs.mkdirSync(FX, { recursive: true });
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  if (tools.length !== 163) { console.error(`BROWSELIVE3_ABORT registered=${tools.length}`); process.exit(1); }
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const manager: any = await imp(path.join(SRC, 'modules', 'browser', 'manager.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const live: Record<string, any> = {};
  const CTX = { sessionId: 'audit-live3', userId: 'audit-user', traceId: 'audit-trace3' };
  const ART = String(process.env.ARTIFACT_DIR || '');

  async function canon(id: string, name: string, input: any, check: (r: any) => any) {
    assertEphemeral(`pre-${id}`);
    const raced = await withTimeout(
      fw.executionFirewall.runInContext('audit-trace3', () => executeTool(name, input, CTX),
        { userId: CTX.userId, sessionId: CTX.sessionId, runId: 'audit-run3' }),
      LEG_TIMEOUT_MS);
    if (raced.timedOut) { live[id] = { timedOut: true }; return null; }
    const r: any = raced.value;
    try { live[id] = { ok: r?.ok ?? null, error: String(r?.error ?? '').slice(0, 200) || null, ...check(r) }; }
    catch (e: any) { live[id] = { ok: r?.ok ?? null, error: String(r?.error ?? '').slice(0, 200) || null, checkFailed: String(e?.message || e).slice(0, 200) }; }
    return r;
  }
  const has = (v: any, s: string) => JSON.stringify(v ?? '').includes(s);
  function diskProof(href: string | undefined, want: string): any {
    if (!href || !ART) return { href: href || null, onDisk: false };
    const p = path.join(ART, path.basename(String(href)));
    if (!fs.existsSync(p)) return { href, onDisk: false };
    const buf = fs.readFileSync(p);
    const found = want ? buf.includes(Buffer.from(want)) : true;
    const size = buf.length;
    try { fs.rmSync(p); } catch { /* keep evidence if delete fails */ }
    return { href, onDisk: true, size, containsWant: found, cleaned: !fs.existsSync(p) };
  }

  const server = http.createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://127.0.0.1');
    const send = (code: number, type: string, body: string | Buffer) => {
      res.writeHead(code, { 'content-type': type }); res.end(body);
    };
    if (u.pathname === '/gone' || u.pathname === '/img-missing.png' || u.pathname === '/favicon.ico') return send(404, 'text/plain', 'gone');
    if (u.pathname === '/img-ok.png' || u.pathname === '/img-noalt.png') return send(200, 'image/png', PNG1);
    if (u.pathname === '/okpage') return send(200, 'text/html', okPage());
    if (u.pathname === '/cmp-a') return send(200, 'text/html', cmpPage('Alpha'));
    if (u.pathname === '/cmp-b') return send(200, 'text/html', cmpPage('Beta'));
    if (u.pathname === '/fx-search') return send(200, 'text/html', searchPage());
    if (u.pathname === '/fx-results') return send(200, 'text/html', resultsPage(u.searchParams.get('q') || ''));
    return send(200, 'text/html', auditPage());
  });
  await new Promise<void>((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', () => res()); });
  const port = (server.address() as any).port;
  const LOOP = `http://127.0.0.1:${port}`;
  live['fixture_server'] = { host: '127.0.0.1', port };
  const A = `${LOOP}/audit`;

  // Snapshot artifact dir to attribute + clean probe-created files.
  const beforeFiles = new Set<string>();
  try { if (ART && fs.existsSync(ART)) for (const f of fs.readdirSync(ART)) beforeFiles.add(f); } catch { /* ignore */ }

  try {
    await canon('seo', 'browser_seo_audit', { url: A }, r => ({
      score: r?.output?.score, issues: (r?.output?.issues || []).length,
      hasLang: has(r?.output, 'lang'), hasCanonical: has(r?.output, 'canonical'), hasHttps: has(r?.output, 'HTTPS'),
    }));
    await canon('a11y', 'browser_a11y_deep', { url: A }, r => ({
      score: r?.output?.score, focusables: r?.output?.focusables,
      hasDup: has(r?.output, 'مكرّرة'), hasTabindex: has(r?.output, 'tabindex'), hasAria: has(r?.output, 'aria-hidden'),
      hasSkipOrder: has(r?.output, 'يتخطّى'), hasNav: has(r?.output, 'nav'),
    }));
    await canon('contrast', 'browser_contrast_audit', { url: A }, r => ({
      score: r?.output?.score, checked: r?.output?.checked, fails: (r?.output?.fails || []).length,
      hasLowCon: has(r?.output?.fails, 'LowContrastSeed'), hasShot: !!r?.output?.screenshot,
    }));
    await canon('console', 'browser_console_scan', { url: A }, r => ({
      errorCount: r?.output?.errorCount,
      hasSeedErr: has(r?.output?.consoleErrors, 'SeedConsoleErrorEight'),
      hasMissing: has(r?.output?.netFails, 'img-missing'), netFails: (r?.output?.netFails || []).length,
    }));
    await canon('links', 'browser_check_links', { url: A }, r => ({
      total: r?.output?.total, brokenCount: r?.output?.brokenCount,
      hasGone: has(r?.output?.broken, '/gone'),
    }));
    await canon('perf', 'browser_performance', { url: A }, r => ({
      wallMs: r?.output?.wallMs, resourceCount: r?.output?.resourceCount,
    }));
    await canon('readability', 'browser_readability', { url: A }, r => ({
      words: r?.output?.words, title: String(r?.output?.title || '').slice(0, 40),
    }));
    await canon('meta', 'browser_extract_meta', { url: A }, r => ({
      title: String(r?.output?.title || '').slice(0, 40), lang: r?.output?.lang ?? null,
      jsonld: (r?.output?.jsonld || []).length, ogKeys: Object.keys(r?.output?.openGraph || {}).length,
      outline: (r?.output?.outline || []).length,
    }));
    await canon('extract', 'browser_extract_data', { url: A }, r => ({
      kind: r?.output?.kind, count: r?.output?.count, firstName: r?.output?.rows?.[0]?.Name ?? null,
      csv: diskProof(r?.output?.csv, 'alpha'),
    }));
    await canon('tokens', 'browser_design_tokens', { url: A }, r => ({
      backgrounds: (r?.output?.backgrounds || []).length, fonts: (r?.output?.fonts || []).length,
      typeScale: (r?.output?.typeScale || []).length, hasShot: !!r?.output?.screenshot,
    }));
    await canon('responsive', 'browser_responsive_check', { url: A }, r => ({
      score: r?.output?.score, viewports: (r?.output?.viewports || []).length,
      mobileNoViewport: r?.output?.viewports?.[0]?.hasViewportMeta === false,
      hasViewportIssue: has(r?.output?.issues, 'viewport'), shots: (r?.output?.viewports || []).filter((v: any) => v.screenshot).length,
    }));
    await canon('uiaudit', 'browser_ui_audit', { url: A }, r => ({
      score: r?.output?.score, issues: (r?.output?.issues || []).length,
      hasViewport: has(r?.output, 'viewport'), hasConsole: has(r?.output, 'console'),
      reused: r?.output?.reused === true,
    }));
    await canon('uiaudit_empty', 'browser_ui_audit', {}, r => ({ errLen: String(r?.error || '').length }));
    await canon('summarize', 'browser_summarize', { url: A }, r => ({
      sumLen: String(r?.output?.summary || '').length, fallback: has(r?.output?.summary, 'unavailable'),
      hasTitle: has(r?.output?.summary, 'AuditEight'), hasShot: !!r?.output?.screenshot,
    }));
    await canon('translate', 'browser_translate', { url: A, target: 'fr' }, r => ({
      target: r?.output?.target, blocks: r?.output?.blocks,
      fallback: has(r?.output?.translation, 'unavailable'), hasTitle: has(r?.output?.translation, 'AuditEight'),
    }));
    await canon('smartagent', 'browser_smart_agent', { url: A }, r => ({
      overall: r?.output?.scores?.overall, ui: r?.output?.scores?.ui, seo: r?.output?.scores?.seo,
      findings: (r?.output?.findings || []).length, hasTitle: has(r?.output?.summary, 'AuditEight'),
    }));
    await canon('compare_pair', 'browser_compare', { before: `${LOOP}/cmp-a`, after: `${LOOP}/cmp-b` }, r => ({
      changes: (r?.output?.changes || []).length, pctChanged: r?.output?.pctChanged,
      hasBeta: has(r?.output?.changes, 'CmpBeta'), hasComposite: !!r?.output?.composite,
    }));
    await canon('compare_base1', 'browser_compare', { url: `${LOOP}/cmp-a` }, r => ({ baseline: r?.output?.baseline === true }));
    await canon('compare_base2', 'browser_compare', { url: `${LOOP}/cmp-a` }, r => ({
      baseline: r?.output?.baseline === true, pctChanged: r?.output?.pctChanged,
      changes: (r?.output?.changes || []).length,
    }));
    await canon('fill', 'browser_fill_form', { url: A, fields: { cityname: 'LyonEight', nosuchfield: 'x' } }, r => ({
      filled: r?.output?.filled, missed: r?.output?.missed, submitted: r?.output?.submitted,
    }));
    await canon('fill_submit', 'browser_fill_form', { url: A, fields: { cityname: 'ZedEight' }, submit: true }, r => ({
      filled: r?.output?.filled, submitted: r?.output?.submitted, url: String(r?.output?.url || '').slice(0, 80),
    }));
    await canon('click', 'browser_click', { url: A, text: 'FlipMarker' }, r => ({
      clicked: String(r?.output?.clicked || '').slice(0, 30), tag: r?.output?.tag,
      urlChanged: r?.output?.urlChanged, contentChanged: r?.output?.contentChanged,
    }));
    await canon('click_notarget', 'browser_click', { url: A }, r => ({}));
    await canon('fullpage', 'browser_fullpage_shot', { url: A }, r => ({
      height: r?.output?.height, title: String(r?.output?.title || '').slice(0, 40),
      hasShot: !!r?.output?.screenshot,
    }));
    await canon('savepdf', 'browser_save_pdf', { url: A }, r => ({ pdf: diskProof(r?.output?.pdf, '%PDF') }));
    await canon('autofix', 'browser_autofix', { url: A }, r => ({
      count: r?.output?.count,
      hasLangFix: has(r?.output?.fixes, 'lang='), hasViewportFix: has(r?.output?.fixes, 'viewport'),
      fixed: diskProof(r?.output?.fixedFile, 'lang="en"'),
    }));
    await canon('vision', 'browser_vision', { url: A }, r => {
      const p = String(r?.output?.screenshotPath || '');
      const exists = p ? fs.existsSync(p) : false;
      const size = exists ? fs.statSync(p).size : 0;
      if (exists) { try { fs.rmSync(p); } catch { /* ignore */ } }
      return { pathGiven: !!p, onDisk: exists, size, cleaned: p ? !fs.existsSync(p) : false };
    });
    await canon('findtext', 'browser_find_text', { url: A, query: 'AuditEight' }, r => ({
      count: r?.output?.count, snippets: (r?.output?.snippets || []).length,
      highlighted: r?.output?.highlighted, hasShot: !!r?.output?.screenshot,
    }));
    await canon('findtext_noquery', 'browser_find_text', { url: A }, r => ({}));
    await canon('search', 'browser_search', { query: 'seedquery', engine: `${LOOP}/fx-search` }, r => ({
      typedLive: r?.output?.typedLive, submitted: r?.output?.submitted,
      resultsUrl: String(r?.output?.url || '').slice(0, 100),
      results: (r?.output?.results || []).length, hasSeed: has(r?.output?.results, 'SeedResult'),
      answerLen: String(r?.output?.answer || '').length,
    }));
  } finally {
    try { await manager.stopStreaming('browser:audit-live3'); await manager.stopSession('browser:audit-live3'); live['closedSession'] = true; }
    catch (e: any) { live['closedSession'] = `close_failed:${String(e?.message || e).slice(0, 80)}`; }
    await new Promise<void>(res => server.close(() => res()));
    live['fixture_server_closed'] = true;
    // Attribute + remove probe-created artifact files (screenshots etc.).
    const created: string[] = [];
    try {
      if (ART && fs.existsSync(ART)) {
        for (const f of fs.readdirSync(ART)) {
          if (!beforeFiles.has(f)) { created.push(f); try { fs.rmSync(path.join(ART, f)); } catch { /* ignore */ } }
        }
      }
    } catch { /* ignore */ }
    live['artifact_sweep'] = { created: created.length, sample: created.slice(0, 8) };
    try { fs.rmSync(FX, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  fs.writeFileSync(path.join(HERE, 'trunk_browser_live3.json'), JSON.stringify({ generated: new Date().toISOString(), live }, null, 2));
  const legs = Object.keys(live).filter(k => !['fixture_server', 'fixture_server_closed', 'closedSession', 'artifact_sweep'].includes(k));
  const timed = legs.filter(k => (live[k] as any)?.timedOut);
  console.log(`BROWSELIVE3_DONE legs=${legs.length} timeouts=${timed.length}${timed.length ? ' ' + timed.join(',') : ''}`);
}

main().catch(e => { console.error(`BROWSELIVE3_ABORT uncaught:${String(e?.stack || e).slice(0, 500)}`); process.exit(1); });

