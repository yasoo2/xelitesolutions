// Joe's PDF proof (design v9 §4, lab egm-pdf-v9/prove9.mjs: everything below these header lines is that script, word for word).
// A CHILD PROCESS, started only by core/quality/outside-proof.ts through executionEngine.runArgvStreaming; never imported by Joe:
//   node --max-old-space-size=384 prove.mjs <job.json>
// job.json = { list: Job[], nodeModules: string, results: string, noCanvas?: boolean, limits?: {...}, first?: number, deadlineAt?: number }
// Each job's time is its fair share of what the CALL has left, so one bomb cannot starve the files after it.
// One line per job is APPENDED to `results` (never stdout) as each job finishes: { i, told, notMeasured, ... }.
// A watchdog thread (no pdf.js in it) stops the whole child when memory or one job's time runs over, after
// writing that job's «not measured» line.
import fs from 'fs'; import path from 'path'; import zlib from 'zlib';
import { pathToFileURL } from 'url'; import { createRequire } from 'module'; import { Worker } from 'worker_threads';
const require = createRequire(import.meta.url);
const jobFile = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const RESULTS = jobFile.results; if (!RESULTS) process.exit(2);
const LIM = { memMB: 768, jobMs: 25000, readMs: 20000, pageOps: 1500000, pageGlyphs: 150000, depth: 1000, fileBytes: 50 * 1048576, ...(jobFile.limits || {}) };
const JOBS = jobFile.list || []; const FIRST = jobFile.first || 0; const CALL_DEADLINE = Number(jobFile.deadlineAt) || 0;
const line = o => fs.appendFileSync(RESULTS, JSON.stringify(o) + '\n');
const T0 = Date.now();

// ---------- the watchdog: a thread that only reads the clock and the process's memory ----------
const sab = new SharedArrayBuffer(12); const cur = new Int32Array(sab); Atomics.store(cur, 0, -1);
const WD = `const { workerData: w } = require('worker_threads'); const fs = require('fs'); const cur = new Int32Array(w.sab);
setInterval(() => { const i = Atomics.load(cur, 0); const rss = process.memoryUsage.rss() / 1048576; const ms = Date.now() - (w.t0 + Atomics.load(cur, 1)); const lim = Atomics.load(cur, 2) || w.jobMs;
  const why = rss > w.memMB ? 'the file needs more than ' + w.memMB + ' MB to read (' + Math.round(rss) + ' MB when stopped)' : (i >= 0 && ms > lim ? 'reading this file took longer than ' + Math.round(lim / 1000) + ' s' : '');
  if (!why) return; try { if (i >= 0) fs.appendFileSync(w.results, JSON.stringify({ i, told: [], notMeasured: [{ what: 'everything', why }], stopped: rss > w.memMB ? 'memory' : 'time', rssMB: Math.round(rss) }) + String.fromCharCode(10)); } catch {}
  process.kill(process.pid, 'SIGKILL'); }, 100);`;
new Worker(WD, { eval: true, workerData: { sab, t0: T0, memMB: LIM.memMB, jobMs: LIM.jobMs, results: RESULTS } }).unref();

// ---------- pure helpers (the SAME text as outside-proof.ts exports; the selfTest job compares them) ----------
const STRIP = /[ـً-ٰٟ​-‏‪-‮⁦-⁩\u0000�]/gu;
const DIG = '٠١٢٣٤٥٦٧٨٩', PDIG = '۰۱۲۳۴۵۶۷۸۹';
const fold = s => String(s).normalize('NFKC').replace(STRIP, '').replace(/[­‐‑]/gu, '-').replace(/[٠-٩]/gu, d => DIG.indexOf(d)).replace(/[۰-۹]/gu, d => PDIG.indexOf(d)).replace(/[یى]/gu, 'ي').replace(/ک/gu, 'ك').replace(/[ۀہھ]/gu, 'ه').replace(/[آأإ]/gu, 'ا').toLowerCase();
const codesOf = m => String(m || '').trim().split(/\s+/u).filter(w => /^[A-Za-z]{2,}-?\d{3,}$/u.test(w));
const numberForms = n => { const [i, f = ''] = String(n).split(/[.,]/u); const ft = f.replace(/0+$/u, ''); return { exact: [i + f, i + ft].filter((v, k, a) => v.length >= 4 && a.indexOf(v) === k), whole: i, fraction: ft }; };
const fontKey = n => String(n || '').replace(/^[A-Z]{6}\+/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const isAr = c => /[֐-ࣿ]/u.test(c);
const isArLetter = c => isAr(c) && /\p{L}/u.test(c);
const isHeLetter = c => /[\u05D0-\u05EA]/u.test(c);
// v7 (M3): fonts found on every machine; a foreign font outside this list is «not measured», never «not from the project»
const MACHINE_FONTS = ['timesnewroman', 'times', 'arial', 'segoeui', 'tahoma', 'couriernew', 'courier', 'helvetica', 'calibri', 'cambria', 'verdana', 'georgia', 'trebuchet', 'lucidasans', 'lucidagrande', 'microsoftsansserif', 'dejavu', 'liberation', 'freeserif', 'freesans', 'freemono', 'notonaskharabic', 'notosansarabic', 'notokufiarabic', 'notosanshebrew', 'notoserifhebrew', 'droidarabic', 'kacst', 'traditionalarabic', 'trado', 'simplifiedarabic', 'arabictypesetting', 'sakkalmajalla', 'majalla', 'andalus', 'aldhabi', 'microsoftuighur', 'uighur', 'urdutypesetting', 'geezapro', 'damascus', 'baghdad', 'kufistandard', 'nadeem', 'alnile', 'farah', 'diwan', 'mshtakan', 'sfarabic', 'sfns', 'sfpro', 'davidlibre', 'frankruehl', 'narkisim', 'miriam', 'aharoni', 'gisha', 'levenim', 'rod', 'david'];
const STATIC_PAGES = 10;
const BIG_PICTURE = 64e6; // pixels (should-fix 7): ink is never drawn on a page holding a larger picture, so pdf.js never decodes it; «not measured»
const rev = s => [...s].reverse().join('');
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const pt = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];

// ---------- libraries: from the folder Joe names, never a path written here ----------
const NM = jobFile.nodeModules;
let pdfjs = null, canvasLib = null, loadError = '';
try { pdfjs = await import(pathToFileURL(path.join(NM, 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).href); } catch (e) { loadError = String(e && e.message || e).slice(0, 120); }
if (!jobFile.noCanvas) try { canvasLib = require(path.join(NM, '@napi-rs', 'canvas')); } catch { canvasLib = null; }

// ---------- §6.4 the names a font file gives itself ----------
// v9 (M6): a «font» over 20 MB is skipped before it is read (an 800 MB file killed every child in v8); names are cached per file
const NAMES = new Map();
function fontNames(file) { if (NAMES.has(file)) return NAMES.get(file); let r = []; try { if (fs.statSync(file).size <= 20 * 1048576) r = fontNamesBuf(fs.readFileSync(file)); } catch { r = []; } NAMES.set(file, r); return r; }
// v7 (M4): the same reader runs on the font program embedded in the PDF (pdf.js fontExtraProperties → font.data)
function fontNamesBuf(b) {
  try {
    let name = null; const sig = b.toString('latin1', 0, 4);
    if (b.length > 20 * 1048576) return [];
    if (sig === 'wOF2') {
      const TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];
      const n = b.readUInt16BE(12); let p = 48; const tabs = [];
      const b128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const c = b[p++]; v = (v << 7) | (c & 0x7f); if (!(c & 0x80)) break; } return v >>> 0; };
      for (let i = 0; i < n; i++) { const fl = b[p++]; let tag = TAGS[fl & 0x3f]; if ((fl & 0x3f) === 63) { tag = b.toString('latin1', p, p + 4); p += 4; } const ver = fl >> 6; const orig = b128(); let len = orig; if (((tag === 'glyf' || tag === 'loca') && ver === 0) || (tag !== 'glyf' && tag !== 'loca' && ver !== 0)) len = b128(); tabs.push({ tag, len }); }
      const data = zlib.brotliDecompressSync(b.subarray(p, p + b.readUInt32BE(20)), { maxOutputLength: 64 * 1048576 }); let off = 0;
      for (const t of tabs) { if (t.tag === 'name') name = data.subarray(off, off + t.len); off += t.len; }
    } else if (sig === 'wOFF') {
      const n = b.readUInt16BE(12);
      for (let i = 0; i < n; i++) { const e = 44 + i * 20; if (b.toString('latin1', e, e + 4) === 'name') { const o = b.readUInt32BE(e + 4), cl = b.readUInt32BE(e + 8), ol = b.readUInt32BE(e + 12); name = cl < ol ? zlib.inflateSync(b.subarray(o, o + cl), { maxOutputLength: 4 * 1048576 }) : b.subarray(o, o + cl); } }
    } else {
      const n = b.readUInt16BE(4);
      for (let i = 0; i < n; i++) { const e = 12 + i * 16; if (b.toString('latin1', e, e + 4) === 'name') name = b.subarray(b.readUInt32BE(e + 8), b.readUInt32BE(e + 8) + b.readUInt32BE(e + 12)); }
    }
    if (!name) return [];
    const count = name.readUInt16BE(2), so = name.readUInt16BE(4); const out = new Set();
    for (let i = 0; i < count; i++) {
      const r = 6 + i * 12; const pid = name.readUInt16BE(r), nid = name.readUInt16BE(r + 6), len = name.readUInt16BE(r + 8), o = so + name.readUInt16BE(r + 10);
      if (![1, 4, 6, 16].includes(nid)) continue; const raw = name.subarray(o, o + len);
      const s = pid === 1 ? raw.toString('latin1') : Buffer.from(raw).swap16().toString('utf16le'); const k = fontKey(s); if (k.length >= 3) out.add(k);
    }
    return [...out];
  } catch { return []; }
}

class Done extends Error { }
async function prove(job, i) {
  const t0 = Date.now(); const DEADLINE = t0 + (job.readMs || LIM.readMs);
  const out = { i, told: [], notMeasured: [], producer: '', creator: '', browserMade: false, pages: 0, pagesRead: 0, ms: 0 };
  const tell = (id, detail = '') => { if (!out.told.some(t => t.id === id)) out.told.push({ id, detail }); };
  const skip = (what, why) => out.notMeasured.push({ what, why });
  const finish = () => { out.ms = Date.now() - t0; line(out); throw new Done(); };
  if (job.selfTest) { out.selfTest = (job.strings || []).map(s => ({ s, fold: fold(s), codes: codesOf(s), numberForms: /^\d+[.,]\d+$/u.test(s) ? numberForms(s) : null, fontKey: fontKey(s) })); finish(); }
  if (!pdfjs) { skip('everything', 'the PDF reader could not be loaded: ' + loadError); finish(); }
  let size = 0; try { size = fs.statSync(job.pdf).size; } catch (e) { skip('everything', 'the file is not there: ' + String(e.code || e.message)); finish(); }
  if (size > LIM.fileBytes) { skip('everything', `the file is ${Math.round(size / 1048576)} MB, over the ${Math.round(LIM.fileBytes / 1048576)} MB Joe reads`); finish(); }
  const shipped = job.fontFiles ? [...new Set(job.fontFiles.flatMap(fontNames))] : null;
  // v7 (M4): a PDF font is the project's when its label OR the names inside its embedded program match a shipped font's names
  const keysOf = f => [fontKey(f && f.name), ...((f && f.own) || [])].filter(k => k && k.length >= 3);
  const ownFont = f => !!shipped && keysOf(f).some(k => shipped.some(s => k.startsWith(s) || s.startsWith(k)));
  // v7 (M3): «not from the project» is told only for a font every machine has; any other unknown font is «not measured»
  const machineFont = f => keysOf(f).some(k => MACHINE_FONTS.some(m => k.startsWith(m)));
  let doc; const raw = fs.readFileSync(job.pdf);
  // v8 (should-fix 1): browser-made when ANY revision says Skia/PDF (a later save by pdf-lib rewrites only the last Info)
  const skiaAnywhere = raw.indexOf('Skia/PDF') >= 0;
  try { doc = await pdfjs.getDocument({ data: new Uint8Array(raw), useSystemFonts: false, verbosity: 0, isEvalSupported: false, disableFontFace: true, fontExtraProperties: true }).promise; }
  catch (e) { skip('everything', 'the file is not a PDF Joe can read: ' + String(e.message).slice(0, 80)); finish(); }
  const meta = await doc.getMetadata().catch(() => ({ info: {} }));
  out.producer = String(meta.info?.Producer || ''); out.creator = String(meta.info?.Creator || ''); out.pages = doc.numPages;
  // the producer only decides whether INK can be measured (pdf.js draws other producers' fonts unreliably); it is never told
  const browserMade = skiaAnywhere || out.producer.startsWith('Skia/PDF') || /^(Chromium|Mozilla\/5\.0.*(Chrome|HeadlessChrome))/u.test(out.creator); out.browserMade = browserMade;

  const O = pdfjs.OPS; const FILLS = new Set([O.fill, O.eoFill, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke].filter(x => x !== undefined));
  const tooBig = [];
  async function readPage(pn) {
    const page = await doc.getPage(pn); const ops = await page.getOperatorList();
    const glyphs = [], fonts = {}, covers = []; let ctm = [1, 0, 0, 1, 0, 0]; const stack = []; let order = 0;
    if (ops.fnArray.length > LIM.pageOps) { tooBig.push(pn); return { pn, glyphs, fonts, covers, view: page.view, page, tooBig: true }; }
    let tm = [1, 0, 0, 1, 0, 0], tlm = tm, font = null, size = 0, cs = 0, ws = 0, hs = 1, lead = 0, rise = 0, mode = 0, fm = 0.001, alpha = 1, fill = 'solid', blend = 'source-over', smask = false;
    const snap = () => ({ ctm, font, size, cs, ws, hs, lead, rise, mode, fm, alpha, fill, blend, smask }); const back = s => { if (s) ({ ctm, font, size, cs, ws, hs, lead, rise, mode, fm, alpha, fill, blend, smask } = s); };
    // v6: a picture is soft-masked when a soft mask is active as it is drawn, when it is drawn inside a transparency group, or when a
    // soft mask is set within the next 8 operations (Chromium's text-shadow: a group holding the blurred picture, then SMask on)
    let groups = 0; let galpha = 1; const gstack = []; // v8 (M4): a transparency group's own opacity multiplies everything inside it
    const softAt = k => smask || groups > 0 || [1, 2, 3, 4, 5, 6, 7, 8].some(d => ops.fnArray[k + d] === O.setGState && (ops.argsArray[k + d][0] || []).some(([kk, v]) => kk === 'SMask' && v));
    const boxOf = (M, x0, y0, x1, y1) => { const q = [pt(M, x0, y0), pt(M, x1, y0), pt(M, x0, y1), pt(M, x1, y1)]; const xs = q.map(v => v[0]), ys = q.map(v => v[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
    for (let k = 0; k < ops.fnArray.length; k++) {
      const fn = ops.fnArray[k], a = ops.argsArray[k]; order++;
      if (fn === O.save || fn === O.paintFormXObjectBegin) { if (stack.length >= LIM.depth) { tooBig.push(pn); return { pn, glyphs: [], fonts, covers: [], view: page.view, page, tooBig: true }; } stack.push(snap()); if (fn === O.paintFormXObjectBegin && a[0]) ctm = mul(ctm, Array.from(a[0])); }
      else if (fn === O.restore || fn === O.paintFormXObjectEnd) back(stack.pop());
      else if (fn === O.transform) ctm = mul(ctm, a);
      else if (fn === O.beginGroup) { groups++; gstack.push(galpha); galpha *= alpha; }
      else if (fn === O.endGroup) { groups = Math.max(0, groups - 1); galpha = gstack.length ? gstack.pop() : 1; }
      else if (fn === O.setFillColorN || fn === O.shadingFill) fill = 'pattern';
      else if (fn === O.setFillRGBColor || fn === O.setFillGray || fn === O.setFillCMYKColor || fn === O.setFillColor) fill = 'solid';
      else if (fn === O.setFillTransparent) fill = 'none';
      else if (fn === O.setGState) { for (const [kk, v] of a[0] || []) { if (kk === 'ca') alpha = v; if (kk === 'BM') blend = String(v); if (kk === 'SMask') smask = !!v; } }
      else if (fn === O.constructPath) { if (FILLS.has(a[0]) && a[2] && alpha * galpha >= 0.9 && (blend === 'source-over' || blend === 'normal')) covers.push({ order, kind: fill, box: boxOf(ctm, a[2][0], a[2][1], a[2][2], a[2][3]) }); }
      else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || fn === O.paintImageXObjectRepeat) covers.push({ order, kind: 'solid', box: boxOf(ctm, 0, 0, 1, 1), picture: true, soft: softAt(k), big: (Number(a[1]) || 0) * (Number(a[2]) || 0) > BIG_PICTURE });
      else if (fn === O.beginText) { tm = [1, 0, 0, 1, 0, 0]; tlm = tm; }
      else if (fn === O.setFont) { font = a[0]; size = a[1]; if (fonts[font]) fm = fonts[font].fm; else try { const fo = page.commonObjs.get(font); fm = (fo.fontMatrix && fo.fontMatrix[0]) || 0.001; let own = []; try { if (fo.data && fo.data.length) own = fontNamesBuf(Buffer.from(fo.data.buffer, fo.data.byteOffset, fo.data.byteLength)); } catch { own = []; } fonts[font] = { name: fo.name, missingFile: !!fo.missingFile, fm, own }; } catch { fonts[font] = { name: String(font), missingFile: true, fm: 0.001 }; } }
      else if (fn === O.setTextMatrix) { tm = Array.from(a.length === 1 ? a[0] : a); tlm = tm; }
      else if (fn === O.setLeading) lead = a[0];
      else if (fn === O.moveText || fn === O.setLeadingMoveText) { if (fn === O.setLeadingMoveText) lead = -a[1]; tlm = mul(tlm, [1, 0, 0, 1, a[0], a[1]]); tm = tlm; }
      else if (fn === O.nextLine) { tlm = mul(tlm, [1, 0, 0, 1, 0, -lead]); tm = tlm; }
      else if (fn === O.setCharSpacing) cs = a[0];
      else if (fn === O.setWordSpacing) ws = a[0];
      else if (fn === O.setHScale) hs = a[0] / 100;
      else if (fn === O.setTextRise) rise = a[0];
      else if (fn === O.setTextRenderingMode) mode = a[0];
      else if (fn === O.showText) {
        let x = 0; const M = mul(ctm, tm);
        for (const g of a[0]) {
          if (typeof g === 'number') { x -= g * size / 1000 * hs; continue; }
          if (!g || typeof g !== 'object') continue;
          if (glyphs.length >= LIM.pageGlyphs) { tooBig.push(pn); return { pn, glyphs: [], fonts, covers: [], view: page.view, page, tooBig: true }; }
          const adv = (g.width * fm * size + cs + (g.isSpace ? ws : 0)) * hs;
          const box = boxOf(M, x, rise - 0.25 * size, x + adv, rise + 0.85 * size); const c = pt(M, x + adv / 2, rise + 0.3 * size);
          glyphs.push({ u: g.unicode ?? '', font, box, cx: c[0], cy: c[1], em: Math.abs(size) * Math.hypot(M[2], M[3]), mode, order, alpha: alpha * galpha, fill, sm: smask, det: (M[0] * M[3] - M[1] * M[2]) * hs, ax: M[0] * hs, bx: M[1] * hs });
          x += adv;
        }
        tm = mul(tm, [1, 0, 0, 1, x, 0]);
      }
    }
    return { pn, glyphs, fonts, covers, view: page.view, page, rot: ((Number(page.rotate) || 0) % 360 + 360) % 360 };
  }

  // ---------- what Joe typed ----------
  const marker = job.marker || ''; const words = marker.trim().split(/\s+/u).filter(Boolean);
  const codes = codesOf(marker); const arWords = words.filter(w => [...w].every(isAr)).map(fold);
  const number = job.number || '';
  const nf = number ? numberForms(number) : null;
  const first = codes[0] || null, last = codes.length > 1 ? codes[codes.length - 1] : null;
  const order = []; for (let a = 1, b = doc.numPages; a <= b; a++, b--) { order.push(a); if (b !== a) order.push(b); }
  let tooMany = false;
  const pages = [];
  const streamOf = p => { const chars = []; p.glyphs.forEach((g, gi) => { for (const c of fold(g.u)) if (!/\s/u.test(c)) chars.push({ c, gi }); }); return { chars, glyphs: p.glyphs, text: chars.map(x => x.c).join(''), digits: null }; };
  // the digit view: digits kept, the separators . , ٫ ٬ ' ’ dropped, every other letter a bar — and a bar wherever two
  // neighbours in the stream stand apart on the page (another baseline, or a gap over 0.6 em: another cell, another column)
  // v6: U+060C «،» between two digits is a thousands separator too (it is a bar anywhere else); the LOOSE view (tried only
  // when the strict one finds nothing) keeps digits and separators on one baseline together across gaps up to 2.5 em:
  // one box per digit (a cheque), a separator in its own cell
  const SEP = /[.,٬٫'’]/u; const digitOrSep = c => /[0-9]/.test(c) || SEP.test(c) || c === '،';
  const viewOf = (st, loose) => { const idx = []; let s = ''; let prev = null, prevC = '';
    st.chars.forEach((ch, k) => { const g = st.glyphs[ch.gi];
      if (prev && prev !== g) { const em = Math.max(g.em, prev.em, 0.1); const dy = Math.abs(g.cy - prev.cy), dx = Math.max(g.box[0] - prev.box[2], prev.box[0] - g.box[2]);
        const apart = dy > 0.5 * em || dx > 0.6 * em; const tight = loose && dy <= 0.5 * em && dx <= 2.5 * em && digitOrSep(ch.c) && digitOrSep(prevC);
        if (apart && !tight) { s += '|'; idx.push(k); } }
      prev = g;
      if (/[0-9]/.test(ch.c)) { s += ch.c; idx.push(k); }
      else if (SEP.test(ch.c)) { /* dropped */ }
      else if (ch.c === '،' && /[0-9]/.test(prevC) && /[0-9]/.test((st.chars[k + 1] || {}).c || '')) { /* dropped */ }
      else { s += '|'; idx.push(k); }
      prevC = ch.c; });
    return { s, idx }; };
  const digitView = st => st.digits || (st.digits = viewOf(st, false));
  const looseView = st => st.loose || (st.loose = viewOf(st, true));
  const findAll = (hay, needle) => { const o = []; if (!needle) return o; for (let k = hay.indexOf(needle); k >= 0; k = hay.indexOf(needle, k + 1)) o.push(k); return o; };
  const standalone = (s, at, len) => !/[0-9]/.test(s[at - 1] || '') && !/[0-9]/.test(s[at + len] || '');
  const standaloneZeros = (s, at, len) => { let j = at + len; while (s[j] === '0') j++; return !/[0-9]/.test(s[at - 1] || '') && !/[0-9]/.test(s[j] || ''); };
  function codeHits(st, token) {
    const t = fold(token); const hits = findAll(st.text, t).map(k => ({ idx: [...t].map((_, j) => k + j) }));
    if (!hits.length && !/[^a-z0-9]/u.test(t)) for (let c1 = 1; c1 < t.length && !hits.length; c1++) for (let c2 = c1; c2 < t.length && !hits.length; c2++) {
      const parts = c2 === c1 ? [t.slice(0, c1), t.slice(c1)] : [t.slice(0, c1), t.slice(c1, c2), t.slice(c2)]; if (!parts.some(p => p.length >= 4)) continue;
      const m = new RegExp(parts.join('(.{0,80}?)'), 'u').exec(st.text); if (!m) continue;
      const idx = []; let at = m.index; parts.forEach((p, k) => { for (let j = 0; j < p.length; j++) idx.push(at + j); at += p.length + (m[k + 1] ? [...m[k + 1]].length : 0); }); hits.push({ idx, broken: true });
    }
    return hits;
  }
  // a number: as typed (digits in order, separators dropped); or its whole part and its fraction apart («5293 ريال و 48 هللة»)
  function numberHits(st) {
    const dv = digitView(st);
    for (const f of nf.exact) { const h = findAll(dv.s, f).filter(k => standaloneZeros(dv.s, k, f.length)).map(k => ({ idx: [...f].map((_, j) => dv.idx[k + j]) })); if (h.length) return { hits: h, whole: [] }; }
    const lv = looseView(st);
    for (const f of nf.exact) { const h = findAll(lv.s, f).filter(k => standaloneZeros(lv.s, k, f.length)).map(k => ({ idx: [...f].map((_, j) => lv.idx[k + j]), loose: true })); if (h.length) return { hits: h, whole: [] }; }
    const whole = findAll(dv.s, nf.whole).filter(k => standalone(dv.s, k, nf.whole.length));
    const apart = nf.fraction ? whole.filter(k => { const lo = Math.max(0, k - 24), win = dv.s.slice(lo, k + nf.whole.length + 24); return findAll(win, nf.fraction).some(j => (lo + j + nf.fraction.length <= k || lo + j >= k + nf.whole.length) && standaloneZeros(win, j, nf.fraction.length)); }) : [];
    if (apart.length) return { hits: apart.map(k => ({ idx: [...nf.whole].map((_, j) => dv.idx[k + j]) })), whole: [] };
    return { hits: [], whole };
  }
  let foundFirst = false, foundLast = !last, timedOut = false, wholeSeen = false;
  // v8 (should-fix 2) was tried and dropped: a getTextContent pass over every page before the walk cost more than it saved
  // (the v7 review's 109-page reports under a 55 s call: 15 and 28 pages walked instead of 60 and 109). The walk keeps v7's order.
  for (const pn of order) {
    if (!first && !nf && pages.length >= STATIC_PAGES) { tooMany = true; break; } // v8 (should-fix 3): a door with no marker reads its first 10 pages
    if (Date.now() > DEADLINE) { timedOut = true; break; }
    const p = await readPage(pn); p.stream = streamOf(p); pages.push(p); out.pagesRead++;
    if (first) { p.a = codeHits(p.stream, first); p.z = last ? codeHits(p.stream, last) : []; if (p.a.length) foundFirst = true; if (p.z.length) foundLast = true; }
    else if (nf) { const r = numberHits(p.stream); p.a = r.hits; p.z = []; if (r.whole.length) wholeSeen = true; if (p.a.length) foundFirst = true; }
    else { p.a = []; p.z = []; }
    if ((first || nf) && foundFirst && foundLast && pages.length >= 2) break;
  }
  pages.sort((x, y) => x.pn - y.pn);
  // v7 (M8): a Hebrew app (its pages hold at least 12 Hebrew letters, and at least 30 % of their right-to-left letters, or Joe says so) is not judged on an Arabic font
  const letters = pages.flatMap(p => p.glyphs.flatMap(g => [...fold(g.u)]));
  const heLetters = letters.filter(isHeLetter).length;
  const appHebrew = /^(?:he|iw|yi)$/u.test(String(job.appLang || '')) || heLetters >= Math.max(12, 0.3 * (heLetters + letters.filter(isArLetter).length));
  if (tooBig.length) skip('pages ' + tooBig.slice(0, 5).join(','), 'a page holds more drawing than Joe reads (' + LIM.pageOps + ' operations, ' + LIM.pageGlyphs + ' letters or ' + LIM.depth + ' nested states)');
  const allRead = !timedOut && out.pagesRead === out.pages && !tooBig.length;
  if (tooMany) skip('pages after ' + STATIC_PAGES, 'Joe reads the first ' + STATIC_PAGES + ' pages of a PDF it typed nothing into');
  if (!pages.some(p => p.glyphs.length) && !timedOut && !tooBig.length && !tooMany) { tell('pdf_text_is_image', 'the file holds no text, only pictures: Joe cannot read it and nobody can search or copy it'); skip('typed text, font, ink', 'no text in the file'); finish(); }

  async function inkOf(p, boxes, scale = 2) {
    const full = p.page.getViewport({ scale }); let top = Infinity, bottom = -Infinity;
    for (const b of boxes) for (const [x, y] of [[b[0], b[1]], [b[2], b[3]], [b[0], b[3]], [b[2], b[1]]]) { const v = full.convertToViewportPoint(x, y)[1]; top = Math.min(top, v); bottom = Math.max(bottom, v); }
    top = Math.max(0, Math.floor(top) - 6); bottom = Math.min(Math.ceil(full.height), Math.ceil(bottom) + 6);
    if (full.width * Math.max(1, bottom - top) > 40e6) throw new Error('the band to draw is too large');
    const vp = p.page.getViewport({ scale, offsetY: -top });
    const canvas = canvasLib.createCanvas(Math.ceil(full.width), Math.max(1, bottom - top)); const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await p.page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return boxes.map(b => {
      const [x0, y0] = vp.convertToViewportPoint(b[0], b[3]), [x1, y1] = vp.convertToViewportPoint(b[2], b[1]);
      const ax = Math.max(0, Math.floor(Math.min(x0, x1))), bx = Math.min(img.width - 1, Math.ceil(Math.max(x0, x1))), ay = Math.max(0, Math.floor(Math.min(y0, y1))), by = Math.min(img.height - 1, Math.ceil(Math.max(y0, y1)));
      if (bx <= ax || by <= ay) return { ink: 0, contrast: 0, lum: 0 };
      const hist = new Map(); for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) { const o = (y * img.width + x) * 4; const k = (img.data[o] >> 4) << 8 | (img.data[o + 1] >> 4) << 4 | (img.data[o + 2] >> 4); hist.set(k, (hist.get(k) || 0) + 1); }
      const k = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0]; const bg = [((k >> 8) & 15) * 17, ((k >> 4) & 15) * 17, (k & 15) * 17];
      let ink = 0, n = 0, far = 0, farL = 0;
      for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) { const o = (y * img.width + x) * 4; const d = Math.max(Math.abs(img.data[o] - bg[0]), Math.abs(img.data[o + 1] - bg[1]), Math.abs(img.data[o + 2] - bg[2])); n++; if (d > 32) ink++; if (d > far) far = d; const l = Math.abs(0.299 * (img.data[o] - bg[0]) + 0.587 * (img.data[o + 1] - bg[1]) + 0.114 * (img.data[o + 2] - bg[2])); if (l > farL) farL = l; }
      return { ink: ink / n, contrast: far, lum: farL };
    });
  }
  // a soft picture under a glyph matters only when no opaque fill is drawn between them over the glyph (a card's box-shadow
  // lies under the card's own background, which hides pdf.js's opaque box; a text-shadow lies right under the letters)
  const softUnder = (p, g) => g.sm || p.covers.some(c => c.picture && c.soft && c.order < g.order && overlapShare(g.box, c.box) >= 0.3
    && !p.covers.some(f => !f.picture && f.kind === 'solid' && f.order > c.order && f.order < g.order && overlapShare(g.box, f.box) >= 0.9));
  const overlapShare = (a, b) => { const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); const area = (a[2] - a[0]) * (a[3] - a[1]); return w > 0 && h > 0 && area > 0 ? (w * h) / area : 0; };

  const places = [];
  for (const p of pages) for (const h of p.a) {
    const st = p.stream; const gset = new Map(); for (const k of h.idx) gset.set(st.chars[k].gi, p.glyphs[st.chars[k].gi]);
    const span = 3 * [...fold(marker || number)].length + 10;
    const lo = Math.max(0, Math.min(...h.idx) - span), hi = Math.min(st.chars.length, Math.max(...h.idx) + span);
    const wordsHere = [];
    for (const w of arWords.slice(0, 3)) {
      const seg = st.text.slice(lo, hi); const mid = Math.min(...h.idx) - lo; const cands = []; for (const [needle, r] of [[rev(w), true], [w, false]]) for (let k = seg.indexOf(needle); k >= 0; k = seg.indexOf(needle, k + 1)) cands.push({ k, r }); if (!cands.length) continue; cands.sort((x, y) => Math.abs(x.k - mid) - Math.abs(y.k - mid)); const at = cands[0].k, reversedInStream = cands[0].r;
      const ks = [...w].map((_, j) => lo + at + j); const gl = ks.map(k => p.glyphs[st.chars[k].gi]); if (gl.some(g => Math.abs(g.cy - gl[0].cy) > 0.5 * gl[0].em)) continue; const gis = ks.map(k => st.chars[k].gi); if (gis.some((v, j) => j && Math.abs(v - gis[j - 1]) > 1)) continue; wordsHere.push({ w, glyphs: reversedInStream ? gl.reverse() : gl });
    }
    // v6: the font is judged on Arabic LETTERS only: Arabic-Indic digits and the separators ٫ ٬ often come from a fallback font by design
    const near = []; for (let k = lo; k < hi; k++) if (isArLetter(st.chars[k].c)) near.push(p.glyphs[st.chars[k].gi]);
    places.push({ p, h, glyphs: [...gset.values()], wordsHere, near, em: Math.max(...[...gset.values()].map(g => g.em)) });
  }

  if (first || nf) {
    if (!places.length) {
      // the code's digits alone, standalone, next to one of the marker's Arabic words, drawn tiny: the code IS printed, too small
      const digits = first ? (first.match(/\d{3,}$/u) || [''])[0] : '';
      const tiny = digits ? pages.flatMap(p => { const dv = digitView(p.stream); return findAll(dv.s, digits).filter(k => standalone(dv.s, k, digits.length)).map(k => ({ p, gl: [...digits].map((_, j) => p.glyphs[p.stream.chars[dv.idx[k + j]].gi]), at: dv.idx[k] })); }).filter(x => { const seg = x.p.stream.text.slice(Math.max(0, x.at - 40), x.at + 40); return arWords.some(w => seg.includes(w) || seg.includes(rev(w))); }) : [];
      // v6: a picture big enough to hold a word (20 × 6 pt or more) on a read page: a canvas, a CSS filter, html2canvas
      const pictured = [...new Set(pages.filter(p => p.covers.some(c => c.picture && c.box[2] - c.box[0] >= 20 && c.box[3] - c.box[1] >= 6)).map(p => p.pn))];
      if (!allRead) skip('typed text', `${out.pagesRead} of ${out.pages} pages were read in the time allowed and what Joe typed was not on them`);
      else if (tiny.length && tiny.every(x => x.gl.every(g => g.em < 4))) tell('pdf_text_tiny', `what Joe typed is printed ${Math.round(10 * Math.max(...tiny.flatMap(x => x.gl.map(g => g.em)))) / 10} pt high (ordinary print is 9 to 12 pt)`);
      else if (tiny.length) skip('typed text', `the digits of «${first}» are in the file; the code as Joe typed it is not`);
      else if (nf && wholeSeen) tell('pdf_number_not_as_typed', `Joe typed ${number}; the file shows ${nf.whole} and not ${number}`);
      else if (pictured.length) skip('typed text', `what Joe typed is not in the file as text, and page ${pictured.slice(0, 5).join(', ')} holds a picture: it may be printed as a picture, which Joe cannot read`);
      else tell('pdf_typed_text_missing', nf ? `Joe typed ${number} into the app and these digits are not in the file in this order` : `Joe typed «${first}» into the app and it is not in the file`);
    } else {
      if (last && !pages.some(p => p.z.length)) {
        if (!allRead) skip('long name whole', 'not every page was read');
        else { const pl = places[0]; const k0 = Math.min(...pl.h.idx); const around = pl.p.stream.text.slice(Math.max(0, k0 - 120), k0 + 160); tell('pdf_text_cut', `the long name starts («${first}») and its end («${last}») is not in the file` + (/\.\.\.|…/u.test(around) ? ' — an ellipsis is beside it: the app may shorten long names on purpose' : '')); }
      }
      const shown = places.filter(pl => !pl.glyphs.some(g => g.mode === 3 || g.em < 2 || g.alpha < 0.05 || g.fill === 'none'));
      // v8 (M5): invisible text over a picture that covers it is a scan's or OCR's text layer: the name is on paper as a picture
      const overPicture = pl => pl.glyphs.filter(g => pl.p.covers.some(c => c.picture && c.order < g.order && overlapShare(g.box, c.box) >= 0.9)).length >= 0.7 * pl.glyphs.length;
      if (!shown.length && places.every(overPicture)) skip('typed text visible', 'the text is a picture with an invisible text layer over it (a scan or an OCR layer): Joe cannot read the picture');
      else if (!shown.length) tell('pdf_text_hidden', 'the text is in the file only as invisible or sub-2-point text');
      const judged = shown.length ? shown : places;
      if (shown.length && judged.every(pl => pl.em < 4)) tell('pdf_text_tiny', `what Joe typed is printed ${Math.round(10 * Math.max(...judged.map(pl => pl.em))) / 10} pt high (ordinary print is 9 to 12 pt)`);
      if (judged.every(pl => pl.glyphs.some(g => g.det < 0))) tell('pdf_text_mirrored', 'the letters are drawn as in a mirror');
      // v9 (should-fix 2): the page's /Rotate turns everything on it; text upright on a page shown at 180° reads upside down
      else if (judged.every(pl => pl.glyphs.every(g => { const ang = (Math.atan2(g.bx, g.ax) * 180 / Math.PI - (pl.p.rot || 0) + 720) % 360; return Math.abs(ang - 180) < 17; }))) tell('pdf_text_upside_down', 'the text is drawn upside down' + (judged.some(pl => pl.p.rot) ? ' (the page itself is turned ' + judged[0].p.rot + '°)' : ''));
      if (judged.every(pl => pl.glyphs.some(g => { const v = pl.p.view; return g.box[2] < v[0] - 1 || g.box[0] > v[2] + 1 || g.box[3] < v[1] - 1 || g.box[1] > v[3] + 1; }))) tell('pdf_text_off_page', 'the text is drawn outside the paper');
      const fontOf = pl => { const gl = pl.wordsHere.length ? pl.wordsHere.flatMap(w => w.glyphs) : pl.near; return [...new Set(gl.map(g => pl.p.fonts[g.font]).filter(Boolean))]; };
      if (!judged.some(pl => fontOf(pl).length)) skip('font', 'no Arabic letter beside what Joe typed');
      else {
        if (judged.every(pl => fontOf(pl).some(f => f.missingFile))) tell('pdf_font_not_embedded', fontOf(judged[0]).filter(f => f.missingFile).map(f => f.name).join(', '));
        if (appHebrew) skip('font is the project\'s', 'the app writes Hebrew; Joe typed Arabic, which the app\'s own font need not carry');
        else if (!shipped || !shipped.length) skip('font is the project\'s', 'the project ships no font file Joe could read');
        else if (!judged.some(pl => fontOf(pl).length && fontOf(pl).every(f => ownFont(f)))) {
          const foreign = [...new Set(judged.flatMap(pl => fontOf(pl).filter(f => !ownFont(f))))];
          const names = [...new Set(foreign.map(f => fontKey(f.name)))].join(', ');
          if (foreign.every(machineFont)) tell('pdf_font_not_from_project', `the Arabic letters beside what Joe typed are drawn in ${names}, a font of the machine; the project's fonts are ${shipped.slice(0, 6).join(', ')}`);
          else skip('font is the project\'s', `the Arabic letters are drawn in ${names}: not a font file Joe found in the project, and not a font of the machine, so Joe cannot say where it came from`);
        }
      }
      const geo = judged.filter(pl => pl.wordsHere.length && pl.glyphs.every(g => Math.abs(g.bx) < 0.1 * Math.abs(g.ax) && g.ax > 0 && g.det > 0));
      if (!geo.length) { if (arWords.length) skip('letter and word order', 'the marker\'s Arabic words were not found level on the page'); }
      else {
        const revWord = pl => pl.wordsHere.some(w => { const a = w.glyphs[0], z = w.glyphs[w.glyphs.length - 1]; return a !== z && a.cx < z.cx - 0.05 * a.em; });
        const swapped = pl => { if (pl.wordsHere.length < 2 || pl.wordsHere[0].w !== arWords[0] || pl.wordsHere[1].w !== arWords[1]) return false; const a = pl.wordsHere[0].glyphs[0], b = pl.wordsHere[1].glyphs[0]; return Math.abs(a.cy - b.cy) < 0.5 * a.em && a.cx < b.cx; };
        if (geo.every(revWord)) tell('pdf_letters_reversed', 'inside each word the letters run left to right: the word reads backwards');
        else if (geo.every(swapped)) tell('pdf_words_reversed', 'the first word of the name is drawn to the LEFT of the second: the words are in reverse order');
      }
      // covers: geometry only NOMINATES; the drawn picture decides (a transparent frame, a seal ring, a signature leave the letters visible)
      const coveredPl = pl => { const under = g => { const cs = pl.p.covers.filter(c => c.kind === 'solid' && c.order > g.order); if (!cs.length) return false; let hit = 0; for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { const x = g.box[0] + (a + 0.5) / 4 * (g.box[2] - g.box[0]), y = g.box[1] + (b + 0.5) / 4 * (g.box[3] - g.box[1]); if (cs.some(c => x >= c.box[0] && x <= c.box[2] && y >= c.box[1] && y <= c.box[3])) hit++; } return hit >= 14; }; return pl.glyphs.filter(under).length >= 0.7 * pl.glyphs.length; };
      const overlappedPl = pl => { const mine = new Set(pl.glyphs); const n = pl.glyphs.filter(g => pl.p.glyphs.some(o => !mine.has(o) && o.alpha >= 0.3 && o.fill !== 'none' && o.mode !== 3 && o.box[2] - o.box[0] > 0.1 * o.em && !/^\s*$/u.test(o.u) && !(o.u === g.u && overlapShare(g.box, o.box) >= 0.5) && overlapShare(g.box, o.box) >= 0.5 && overlapShare(o.box, g.box) >= 0.3)).length; return n >= 0.6 * pl.glyphs.length; };
      const nominatedCover = judged.every(coveredPl);
      if (!nominatedCover && judged.every(overlappedPl)) tell('pdf_text_overlapped', 'other text is drawn on top of it');
      let inkWhy = '';
      if (!browserMade) inkWhy = 'ink is measured on browser-made files only';
      else if (!canvasLib) inkWhy = 'the picture library is not on this server';
      else if (Date.now() > DEADLINE + 5000) inkWhy = 'no time left';
      else if (judged.every(pl => pl.glyphs.some(g => g.fill === 'pattern' || g.mode >= 4 || pl.p.covers.some(c => c.kind === 'pattern' && c.order > g.order && overlapShare(g.box, c.box) >= 0.95)))) inkWhy = 'the text is filled with a gradient or used as a clipping shape';
      // v6: pdf.js draws a soft-masked picture (Chromium's text-shadow, a CSS filter) as an opaque box: ink under one is not measured
      else if (judged.some(pl => pl.p.covers.some(c => c.big))) inkWhy = 'a picture on this page is larger than Joe draws (64 megapixels)';
      else if (judged.some(pl => pl.glyphs.some(g => softUnder(pl.p, g)))) inkWhy = 'a shadow or filter picture is drawn under the text, and Joe cannot draw such pictures faithfully';
      if (inkWhy) { skip('ink', inkWhy); if (nominatedCover) skip('covered', 'something is drawn over the text and Joe could not draw the page to see whether it hides it'); }
      else try {
        let best = null;
        for (const pl of judged.slice(0, 6)) { const r = await inkOf(pl.p, pl.glyphs.map(g => g.box)); const seen = r.filter(v => v.ink >= 0.03).length / r.length; const c = Math.max(...r.map(v => v.contrast)); const s = { seen, c, l: Math.max(...r.map(v => v.lum)) }; if (!best || (s.seen >= 0.7 && (best.seen < 0.7 || s.c > best.c)) || (best.seen < 0.7 && s.seen > best.seen)) best = s; }
        out.ink = best;
        if (best.seen < 0.7) { if (nominatedCover) tell('pdf_text_painted_over', `something drawn after the text covers it: ${Math.round(best.seen * 100)}% of its letters show on the paper`); else tell('pdf_no_ink', `${Math.round(best.seen * 100)}% of the letters leave a mark on the paper`); }
        else if (best.c < 70 || best.l < 40) tell('pdf_text_very_faint', `the text is ${Math.round(Math.min(best.c, best.l))} of 255 away from what is behind it`);
        else if (best.c < 110) tell('pdf_text_light', `the text prints light: ${Math.round(best.c)} of 255 away from its background`);
      } catch (e) { skip('ink', 'the page could not be drawn: ' + String(e.message).slice(0, 60)); if (nominatedCover) skip('covered', 'the page could not be drawn'); }
      if (places.some(pl => pl.h.broken)) out.codeBroken = true;
    }
  } else {
    skip('typed text, cut, order', 'the door types nothing');
    const ar = pages.flatMap(p => p.glyphs.filter(g => [...fold(g.u)].some(isArLetter) && g.mode !== 3 && g.em >= 2).map(g => ({ g, p })));
    if (!ar.length) skip('font, ink', 'no Arabic text in the file');
    else {
      if (appHebrew) skip('font is the project\'s', 'the app writes Hebrew');
      else if (!shipped || !shipped.length) skip('font is the project\'s', 'the project ships no font file Joe could read');
      else { const foreign = ar.filter(x => !ownFont(x.p.fonts[x.g.font])); if (foreign.length > 0.5 * ar.length) { const fs2 = [...new Set(foreign.map(x => x.p.fonts[x.g.font]).filter(Boolean))]; const names = [...new Set(fs2.map(f => fontKey(f.name)))].slice(0, 4).join(', '); if (fs2.every(machineFont)) tell('pdf_font_not_from_project', `${Math.round(100 * foreign.length / ar.length)}% of the Arabic letters are drawn in ${names}, a font of the machine`); else skip('font is the project\'s', `the Arabic letters are drawn in ${names}: not a font file Joe found in the project, and not a font of the machine`); } }
      if (ar.filter(x => x.p.fonts[x.g.font]?.missingFile).length > 0.5 * ar.length) tell('pdf_font_not_embedded', '');
      if (canvasLib && browserMade) try { if (pages.some(p => p.covers.some(c => c.big))) throw new Error('big'); /* v7 (M2): the page's own text, not a background pattern: letters at least the median Arabic size and 8 pt, opaque */ const ems = ar.map(x => x.g.em).sort((a, b) => a - b); const minEm = Math.max(8, ems[ems.length >> 1] || 0); const body = ar.filter(x => x.g.em >= minEm && x.g.alpha >= 0.3 && x.g.fill !== 'none'); const step = Math.max(1, Math.floor(body.length / 40)); const sample = body.filter((_, k) => k % step === 0).slice(0, 40).filter(x => !softUnder(x.p, x.g)); if (!sample.length) throw new Error('shadow'); if (sample.some(x => x.g.fill === 'pattern' || x.p.covers.some(c => c.kind === 'pattern' && c.order > x.g.order && overlapShare(x.g.box, c.box) >= 0.5))) throw new Error('gradient'); const byPage = new Map(); for (const x of sample) { if (!byPage.has(x.p)) byPage.set(x.p, []); byPage.get(x.p).push(x.g.box); } let seen = 0, n = 0, c = 0; for (const [p, boxes] of byPage) for (const v of await inkOf(p, boxes)) { n++; if (v.ink >= 0.03) seen++; c = Math.max(c, v.contrast); } if (seen < 0.5 * n) tell('pdf_no_ink', `${seen} of ${n} sampled Arabic letters leave a mark`); else if (c < 70) tell('pdf_text_very_faint', ''); } catch { skip('ink', 'the page could not be drawn'); }
      else skip('ink', browserMade ? 'the picture library is not on this server' : 'ink is measured on browser-made files only');
    }
  }
  finish();
}
// v8: what a restart costs, from this child's own start, between 1.5 s and 8 s (on a fully busy machine a start measured 10–19 s and
// shrank every share; a later restart rarely costs that much again)
const START_COST = Math.min(8000, Math.max(1500, Math.round(process.uptime() * 1000)));
for (let k = FIRST; k < JOBS.length; k++) {
  // v6: the job's share of what the call has left, between 5 s and LIM.jobMs; v7: the time kept for each later job's possible restart is
  // what THIS child took to start (process.uptime() at its first job), at least 1.5 s — on a busy machine a restart costs more
  const n = JOBS.length - k; const left = CALL_DEADLINE ? CALL_DEADLINE - Date.now() : Infinity;
  const share = Math.max(5000, Math.min(LIM.jobMs, Math.floor((left - START_COST * (n - 1)) / n)));
  JOBS[k] = { ...JOBS[k], readMs: Math.max(2000, Math.min(JOBS[k].readMs || LIM.readMs, share - 4000)) };
  Atomics.store(cur, 2, share); Atomics.store(cur, 1, Date.now() - T0); Atomics.store(cur, 0, k);
  line({ i: k, started: true });
  try { await prove(JOBS[k], k); } catch (e) { if (!(e instanceof Done)) line({ i: k, told: [], notMeasured: [{ what: 'everything', why: 'the proof stopped: ' + String(e && e.message).slice(0, 120) }], failed: true }); }
  Atomics.store(cur, 0, -1);
}
process.exit(0);
