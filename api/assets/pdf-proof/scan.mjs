// Joe's scan child (design v9 §3.2, lab egm-pdf-v9/scan9.mjs: everything below these header lines is that script, word for word).
// Every reading of the builder's text (the PDF mechanisms, the app's language, the request's PDF and right-to-left words) runs here,
// in a child process that core/quality/outside-scan.ts starts through executionEngine.runArgvStreaming with a timeout. Joe's main
// thread only reads this child's result lines from a file. The rules are scan-rules.cjs (lab mech9.cjs, word for word).
//   node --max-old-space-size=256 scan.mjs <job.json>
// job.json = { rules: '<path of the rules module>', results, first?, items: [
//   { kind: 'file', path, rel }                     → { i, mechanisms: [...], rtl }        (≤ 1 MB read)
//   { kind: 'pages', paths: [..], request, language } → { i, rtl, appLang }             (≤ 5 files × 1 MB)
//   { kind: 'request', text, language }              → { i, asksPdf, speaksRtl }         (the first 20,000 characters) ] }
// One `{ i, started: true }` line before each item and one result line after it, appended to `results` (never stdout).
import fs from 'fs'; import { createRequire } from 'module'; import { Worker } from 'worker_threads';
const require = createRequire(import.meta.url);
const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); if (!job.results) process.exit(2);
// the same watchdog as the proof's (a thread that loads only fs): an item over its time writes its own line, then the child is killed;
// the parent starts a new child at the next item. ITEM_MS = job.itemMs (default 5 s).
const ITEM_MS = Number(job.itemMs) || 5000; const sab = new SharedArrayBuffer(8); const cur = new Int32Array(sab); Atomics.store(cur, 0, -1); const T0 = Date.now();
new Worker(`const { workerData: w } = require('worker_threads'); const fs = require('fs'); const cur = new Int32Array(w.sab);
setInterval(() => { const i = Atomics.load(cur, 0); if (i < 0) return; if (Date.now() - (w.t0 + Atomics.load(cur, 1)) > w.ms) { try { fs.appendFileSync(w.results, JSON.stringify({ i, timedOut: true, ms: w.ms }) + String.fromCharCode(10)); } catch {} process.kill(process.pid, 'SIGKILL'); } }, 50);`, { eval: true, workerData: { sab, t0: T0, ms: ITEM_MS, results: job.results } }).unref();
const R = require(job.rules); const line = o => fs.appendFileSync(job.results, JSON.stringify(o) + '\n');
const readCapped = (p, cap) => { const fd = fs.openSync(p, 'r'); try { const b = Buffer.alloc(Math.min(cap, fs.fstatSync(fd).size)); fs.readSync(fd, b, 0, b.length, 0); return { text: b.toString('utf8'), whole: fs.fstatSync(fd).size <= cap }; } finally { fs.closeSync(fd); } };
const MB = 1048576;
for (let i = job.first || 0; i < job.items.length; i++) {
  const it = job.items[i]; const t0 = Date.now(); line({ i, started: true }); Atomics.store(cur, 1, t0 - T0); Atomics.store(cur, 0, i);
  try {
    if (it.kind === 'file') { const { text, whole } = readCapped(it.path, MB); line(whole ? { i, mechanisms: R.pdfMechanismsIn(text, it.rel), rtl: R.rtlFile(text, it.rel), ms: Date.now() - t0 } : { i, mechanisms: [], skipped: 'over 1 MB', ms: Date.now() - t0 }); }
    else if (it.kind === 'pages') { const pages = it.paths.slice(0, 5).map(p => { try { return readCapped(p, MB).text; } catch { return ''; } }); const rtl = R.appIsRtl(pages, it.request || '', it.language || ''); const tag = pages.map(R.htmlTag).find(Boolean) || ''; const lang = (/\blang\s*=\s*["']?([a-z]{2,3})/iu.exec(tag) || [])[1] || ''; line({ i, rtl, appLang: lang.toLowerCase(), ms: Date.now() - t0 }); }
    else if (it.kind === 'request') line({ i, asksPdf: R.asksPdf(it.text), speaksRtl: R.speaksRtl(it.text, it.language), ms: Date.now() - t0 });
  } catch (e) { line({ i, failed: String(e && e.message || e).slice(0, 120), ms: Date.now() - t0 }); }
  Atomics.store(cur, 0, -1);
}
process.exit(0);
