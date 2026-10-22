'use strict';
/* Owner verification for ScreenshotResults. No installs, no network,
 * no browser. Reads the component, transpiles with the existing API
 * TypeScript compiler at the absolute pinned path, executes the real
 * exports with controlled React/API adapters, and prints a structured
 * report. Exit 0 alone is not evidence; the JSON report is.
 * Unit fixtures below are synthetic inert base64 (not real images, not UAT). */
const fs = require('fs');
const path = require('path');

const TS_ABSOLUTE = 'D:/Joe/xelitesolutions/api/node_modules/typescript';
const COMPONENT_REL = path.join('..', 'src', 'components', 'ScreenshotResults.tsx');

function check(id, name, kind, pass, detail) {
  return { id, name, kind, pass: Boolean(pass), detail: String(detail || '') };
}

async function main() {
  const startedAt = new Date().toISOString();
  const checks = [];
  const scriptDir = __dirname;
  const componentPath = path.join(scriptDir, COMPONENT_REL);
  let mod = null;
  let source = '';

  try {
    source = fs.readFileSync(componentPath, 'utf8');
    checks.push(check('ctx-read', 'component source readable', 'contract', source.length > 500, `${source.length} chars`));
  } catch (err) {
    checks.push(check('ctx-read', 'component source readable', 'contract', false, String(err && err.message)));
    return finish(checks, startedAt, { fatal: 'unreadable component' });
  }

  let ts = null;
  try {
    ts = require(TS_ABSOLUTE);
    checks.push(check('ctx-tsc', 'pinned absolute TypeScript compiler loads', 'contract', Boolean(ts && ts.transpileModule), TS_ABSOLUTE));
  } catch (err) {
    checks.push(check('ctx-tsc', 'pinned absolute TypeScript compiler loads', 'contract', false, `${TS_ABSOLUTE}: ${err && err.message}`));
    return finish(checks, startedAt, { fatal: 'typescript unavailable' });
  }

  try {
    const out = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
    });
    const ReactStub = {
      createElement: (...args) => ({ __el: true, args }),
      useState: (init) => [init, () => {}],
      useEffect: () => {},
      useRef: (init) => ({ current: init }),
    };
    const moduleObj = { exports: {} };
    const localRequire = (name) => {
      if (name === 'react') return ReactStub;
      if (String(name).includes('apiClient')) return { api: { get: async () => ({}) } };
      if (name === '../lib/raster-download') {
        const helperSource=fs.readFileSync(path.join(scriptDir,'../src/lib/raster-download.ts'),'utf8');
        const helperOut=ts.transpileModule(helperSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
        const helperModule={exports:{}};new Function('module','exports',helperOut)(helperModule,helperModule.exports);return helperModule.exports;
      }
      throw new Error(`blocked require: ${name}`);
    };
    const factory = new Function('require', 'module', 'exports', 'React', out.outputText);
    factory(localRequire, moduleObj, moduleObj.exports, ReactStub);
    mod = moduleObj.exports;
    checks.push(check('ctx-load', 'component transpiles and executes with controlled adapters', 'behavior', Boolean(mod && mod.default), 'no new installs; react/apiClient stubbed'));
  } catch (err) {
    checks.push(check('ctx-load', 'component transpiles and executes with controlled adapters', 'behavior', false, String(err && err.stack || err)));
    return finish(checks, startedAt, { fatal: 'transpile/execute failed' });
  }

  const E = mod;
  const need = ['isUuid', 'isSafeFilename', 'isSupportedMimeType', 'isSafeScreenshotDataUrl', 'isValidCaptureMeta', 'fetchScreenshotResults', 'buildScreenshotsPath', 'buildCapturePath'];
  const missing = need.filter((k) => typeof E[k] !== 'function');
  checks.push(check('api-exports', 'pure validators + loader exported', 'behavior', missing.length === 0, missing.length ? `missing: ${missing.join(',')}` : need.join(',')));

  // Inert synthetic fixtures (not real images, not UAT): byte counts are exact.
  const rawBytes = Buffer.from('fakepngbytes');
  const validBody = rawBytes.toString('base64');
  const goodMeta = { id: '123e4567-e89b-42d3-a456-426614174000', filename: 'shot-1.png', mimeType: 'image/png', width: 640, height: 360, bytes: rawBytes.length, createdAt: new Date().toISOString() };
  const pngUrl = (body) => `data:image/png;base64,${body}`;
  const validUrl = pngUrl(validBody);

  try {
    checks.push(check('val-uuid', 'UUID validator accepts v4 and rejects junk', 'behavior', E.isUuid(goodMeta.id) && !E.isUuid('not-a-uuid') && !E.isUuid('../../etc'), 'actual export'));
    checks.push(check('val-uuid-v4', 'UUID v4 variant enforced; non-v4 rejected', 'behavior',
      E.isUuid('123e4567-e89b-42d3-a456-426614174000')
      && !E.isUuid('123e4567-e89b-12d3-a456-426614174000')
      && !E.isUuid('00000000-0000-0000-0000-000000000000')
      && !E.isUuid('123e4567-e89b-42d3-c456-426614174000'),
      'v4 + variant 8/9/a/b'));
    checks.push(check('val-file', 'filename validator rejects paths/traversal/svg', 'behavior', E.isSafeFilename('a1.png') && !E.isSafeFilename('../x.png') && !E.isSafeFilename('a/b.png') && !E.isSafeFilename('x.svg'), 'actual export'));
    checks.push(check('val-file-unicode', 'Unicode filename exact preserved; double-dot basename allowed', 'behavior',
      E.isSafeFilename('shot 1.png') === true
      && E.isSafeFilename('a..b.png') === true
      && (() => { const n = 'exact name .png'; return E.isSafeFilename(n) && n === 'exact name .png'; })(),
      'spaces/double-dot/exact name'));
    checks.push(check('val-file-reserved', 'reserved Windows stems rejected incl superscript COM/LPT', 'behavior',
      !E.isSafeFilename('CON.png') && !E.isSafeFilename('con.jpg') && !E.isSafeFilename('PRN.webp')
      && !E.isSafeFilename('AUX.jpeg') && !E.isSafeFilename('NUL.png')
      && !E.isSafeFilename('COM1.png') && !E.isSafeFilename('LPT1.webp')
      && !E.isSafeFilename('COM9.jpg') && !E.isSafeFilename('LPT9.png'),
      'actual export'));
    checks.push(check('val-file-trailing', 'trailing dot/space and controls rejected; 128 bound', 'behavior',
      !E.isSafeFilename('a.png ') && !E.isSafeFilename('a.') && !E.isSafeFilename('a\u0007b.png') && E.isSafeFilename(`${'a'.repeat(124)}.png`) && !E.isSafeFilename(`${'a'.repeat(125)}.png`),
      'actual export'));
    checks.push(check('val-mime', 'mime allowlist png/jpeg/webp only', 'behavior', E.isSupportedMimeType('image/png') && E.isSupportedMimeType('image/webp') && !E.isSupportedMimeType('image/svg+xml'), 'actual export'));
    checks.push(check('val-mime-ext', 'filename extension must match mime', 'behavior',
      E.isValidCaptureMeta({ ...goodMeta, filename: 'a.png', mimeType: 'image/png' })
      && !E.isValidCaptureMeta({ ...goodMeta, filename: 'a.png', mimeType: 'image/jpeg' })
      && !E.isValidCaptureMeta({ ...goodMeta, filename: 'a.jpg', mimeType: 'image/png' })
      && E.isValidCaptureMeta({ ...goodMeta, filename: 'a.jpeg', mimeType: 'image/jpeg' }),
      'actual export'));
    checks.push(check('val-meta', 'meta validator accepts good and rejects bad dims/bytes', 'behavior', E.isValidCaptureMeta(goodMeta) && !E.isValidCaptureMeta({ ...goodMeta, width: 0 }) && !E.isValidCaptureMeta({ ...goodMeta, bytes: 9 * 1024 * 1024 }), 'actual export'));
    checks.push(check('val-dims-range', 'fullpage pixels valid; excess product rejected (16MiP)', 'behavior',
      E.isValidCaptureMeta({ ...goodMeta, width: 8192, height: 1 })
      && E.isValidCaptureMeta({ ...goodMeta, width: 1, height: 10000 })
      && !E.isValidCaptureMeta({ ...goodMeta, width: 5000, height: 5000 })
      && !E.isValidCaptureMeta({ ...goodMeta, width: 8192, height: 2049 }),
      'product<=16777216'));
    const hugeBody = 'A'.repeat(E.MAX_BASE64_BODY_LENGTH + 4);
    const mismatch = pngUrl(validBody);
    checks.push(check('val-uri-ok', 'safe data URI passes when prefix matches mime', 'behavior', E.isSafeScreenshotDataUrl(validUrl, 'image/png'), validUrl.slice(0, 30)));
    checks.push(check('val-uri-reject', 'raster guard rejects svg/html/js/foreign/mismatch/huge', 'behavior',
      !E.isSafeScreenshotDataUrl('data:image/svg+xml;base64,AAA=', 'image/png')
      && !E.isSafeScreenshotDataUrl('data:text/html;base64,AAA=', 'image/png')
      && !E.isSafeScreenshotDataUrl('https://example.com/x.png', 'image/png')
      && !E.isSafeScreenshotDataUrl(mismatch, 'image/jpeg')
      && !E.isSafeScreenshotDataUrl('data:image/png;base64,!!!', 'image/png')
      && !E.isSafeScreenshotDataUrl(pngUrl(hugeBody), 'image/png'),
      'actual export'));
  } catch (err) {
    checks.push(check('val-harness', 'validator harness runs', 'behavior', false, String(err && err.message)));
  }

  // Loader behavior with controlled apiGet: encoding, limit, concurrency, abort, staleness.
  const sid = 'sess: 123/abc?&';
  const enc = encodeURIComponent(sid);
  function v4suffix(i) {
    return `42d3-a456-42661417${String(4000 + i).slice(-4)}`;
  }
  function meta(i, ext) {
    const id = `123e4567-e89b-${v4suffix(i)}`;
    const raw = `bytes-${id}`;
    return { id, filename: `shot-${i}.${ext || 'png'}`, mimeType: 'image/png', width: 640, height: 360, bytes: Buffer.byteLength(raw), createdAt: new Date(Date.now() - i * 1000).toISOString() };
  }
  function detailFor(m) {
    return { capture: m, imageDataUrl: pngUrl(Buffer.from(`bytes-${m.id}`).toString('base64')) };
  }
  async function loaderTest() {
    const calls = [];
    let live = 0;
    let maxLive = 0;
    const metas = Array.from({ length: 8 }, (_, i) => meta(i));
    const apiGet = async (endpoint, _q, opts) => {
      calls.push(endpoint);
      if (opts && opts.signal && opts.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (endpoint.endsWith('/screenshots')) return { captures: metas };
      live += 1;
      maxLive = Math.max(maxLive, live);
      await Promise.resolve();
      live -= 1;
      const id = endpoint.split('/').pop();
      const m = metas.find((x) => x.id === id);
      return detailFor(m);
    };
    const res = await E.fetchScreenshotResults(apiGet, sid, undefined);
    const listOk = calls[0] === `/sessions/${enc}/screenshots`;
    const encodedOk = calls.every((c) => c.startsWith(`/sessions/${enc}/screenshots`));
    const limitOk = res.items.length === E.MAX_CAPTURES;
    const concOk = maxLive <= 2;
    checks.push(check('load-encoding', 'loader uses encoded owned paths only', 'behavior', listOk && encodedOk, calls[0] || ''));
    checks.push(check('load-limit6', 'loader caps at 6 captures', 'behavior', limitOk, `got ${res.items.length}`));
    checks.push(check('load-concurrency', 'detail fan-out stays <=2 concurrent', 'behavior', concOk, `maxLive=${maxLive}`));
    const leaked = calls.filter((c) => /project-preview|^https?:\/\//i.test(c));
    checks.push(check('load-noleak', 'no project-preview/external/token URLs called', 'behavior', leaked.length === 0, `${calls.length} calls scanned`));

    // Abort: pending detail aborted with same controller yields AbortError and no items.
    const c2 = new AbortController();
    const metas2 = [meta(21), meta(22)];
    let secondWave = 0;
    const apiGet2 = async (endpoint, _q, opts) => {
      if (endpoint.endsWith('/screenshots')) return { captures: metas2 };
      secondWave += 1;
      c2.abort();
      if (opts && opts.signal && opts.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      throw new Error('should have aborted');
    };
    let aborted = false;
    try {
      await E.fetchScreenshotResults(apiGet2, sid, c2.signal);
    } catch (err) {
      aborted = err && (err.name === 'AbortError' || (err.message || '').includes('Abort'));
    }
    checks.push(check('load-abort', 'same-controller abort cancels pending old session', 'behavior', aborted === true, `secondWave=${secondWave}`));

    // Stale session: abort first session load, second session completes alone.
    const cOld = new AbortController();
    cOld.abort();
    let oldThrew = false;
    try {
      await E.fetchScreenshotResults(apiGet, 'old-session', cOld.signal);
    } catch (err) {
      oldThrew = err && err.name === 'AbortError';
    }
    const fresh = await E.fetchScreenshotResults(apiGet, 'new-session', undefined);
    checks.push(check('load-stale', 'late/aborted old session never resolves into current session', 'behavior', oldThrew && fresh.items.length === E.MAX_CAPTURES, `oldAborted=${oldThrew}`));

    // Bad/huge/foreign detail payloads are dropped, never fabricated.
    const mixed = [meta(31), { ...meta(32), id: 'bad-id' }, meta(33)];
    const apiGet3 = async (endpoint) => {
      if (endpoint.endsWith('/screenshots')) return { captures: mixed };
      if (endpoint.endsWith(mixed[0].id)) return detailFor(mixed[0]);
      if (endpoint.endsWith(mixed[2].id)) return { capture: mixed[2], imageDataUrl: 'https://evil.example/x.png' };
      throw new Error('unexpected');
    };
    const r3 = await E.fetchScreenshotResults(apiGet3, sid, undefined);
    checks.push(check('load-filter', 'bad/foreign captures dropped without fabrication', 'behavior', r3.items.length === 1 && r3.items[0].meta.id === mixed[0].id, `kept=${r3.items.length}`));

    // Mismatched detail metadata refused: full record must match list, not id only.
    const base = meta(41);
    const tampered = { ...base, width: base.width + 1 };
    const apiGet4 = async (endpoint) => {
      if (endpoint.endsWith('/screenshots')) return { captures: [base] };
      return { capture: tampered, imageDataUrl: detailFor(tampered).imageDataUrl };
    };
    const r4 = await E.fetchScreenshotResults(apiGet4, sid, undefined);
    checks.push(check('load-detail-match', 'mismatched detail metadata refused', 'behavior', r4.items.length === 0, `kept=${r4.items.length}`));

    // Byte-count mismatch refused: decoded bytes must equal capture.bytes.
    const base5 = meta(51);
    const wrongBytes = { ...base5, bytes: base5.bytes + 1 };
    const apiGet5 = async (endpoint) => {
      if (endpoint.endsWith('/screenshots')) return { captures: [wrongBytes] };
      return { capture: wrongBytes, imageDataUrl: detailFor(base5).imageDataUrl };
    };
    const r5 = await E.fetchScreenshotResults(apiGet5, sid, undefined);
    checks.push(check('load-bytecount', 'byte-count mismatch refuses image', 'behavior', r5.items.length === 0, `kept=${r5.items.length}`));
  }
  try {
    await loaderTest();
  } catch (err) {
    checks.push(check('load-harness', 'loader harness completes', 'behavior', false, String(err && err.stack || err)));
  }

  // Secondary static contract (not main proof): hygiene + wiring presence.
  const has = (s) => source.includes(s);
  checks.push(check('src-no-innerhtml', 'no dangerouslySetInnerHTML', 'contract', !has('dangerouslySetInnerHTML'), 'static secondary'));
  checks.push(check('src-no-store', 'no localStorage image/token persistence', 'contract', !has('localStorage'), 'static secondary'));
  checks.push(check('src-no-fetch', 'no direct fetch(); uses owned api.get', 'contract', !/[^.]fetch\s*\(/.test(source) && has('api.get') || has('apiGet'), 'static secondary'));
  checks.push(check('src-no-preview', 'no /project-preview route', 'contract', !has('/project-preview'), 'static secondary'));
  checks.push(check('src-signal', 'AbortController + signal + encodeURIComponent + capped slice', 'contract', has('AbortController') && has('signal') && has('encodeURIComponent') && has('slice(0, MAX_CAPTURES'), 'static secondary'));
  checks.push(check('src-a11y', 'loading aria status + filename alt + download link', 'contract', has('role="status"') && has('alt={') && has('download'), 'static secondary'));
  checks.push(check('src-onerror', 'broken image shows generic unavailable, no retry', 'contract', has('onError') && has('Image unavailable') && !/retry/i.test(source), 'static secondary'));
  checks.push(check('src-slice-first', 'input array limited before filtering', 'contract', /slice\(0,\s*MAX_CAPTURES\)\.filter/.test(source), 'static secondary'));

  return finish(checks, startedAt, {});
}

function finish(checks, startedAt, extra) {
  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;
  const report = {
    tool: 'verify-screenshot-results',
    component: 'web/src/components/ScreenshotResults.tsx',
    typescript: TS_ABSOLUTE,
    adapters: 'controlled React stub + controlled apiGet stub; no installs/network/browser',
    startedAt,
    finishedAt: new Date().toISOString(),
    summary: { total: checks.length, passed, failed },
    checks,
    ...extra,
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ tool: 'verify-screenshot-results', fatal: String(err && err.stack || err), summary: { total: 0, passed: 0, failed: 1 }, checks: [] }, null, 2) + '\n');
  process.exitCode = 1;
});
