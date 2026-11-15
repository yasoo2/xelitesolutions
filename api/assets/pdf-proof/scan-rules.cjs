// Design v9 §3, written out (these rules run only in the scan child, scan8.mjs; never on Joe's main thread): asksPdf, speaksRtl, appIsRtl, pdfMechanismsIn — the exact regexes of the design.
// node mech6.cjs table              → every row of the design's tables (must / must not), the reviewer's 46 sentences, the held-out set
// node mech6.cjs timing             → the M5 inputs (opened-window rule and friends) on Joe's would-be main thread
// node mech6.cjs scan <root>...     → every mechanism found in real builder output (read-only), one line each
const fs = require('fs'); const path = require('path');

// ---------- the request ----------
const foldAr = s => String(s || '').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640\u200C\u200D]/gu, '').replace(/[أإآ]/gu, 'ا').replace(/[ىی]/gu, 'ي').replace(/ک/gu, 'ك').replace(/[ةۀہ]/gu, 'ه').toLowerCase();
const PDF_TOKEN = /(?<![a-z0-9])pdfs?(?![a-z0-9])|بي\s?دي\s?[اإ]ف|پي\s?(?:دي|ڈي)\s?(?:اف|ايف)/gu;
// v6: every reading word starts a word (v5 found «وقع» inside «موقع», "sign" inside "design", "read" inside "ready")
const READ_STRONG = /(?<!\p{L})(?:و|ف|ب|ل)?(?:خواندن|بخوان|ارفع|يرفع|ترفع|نرفع|رفع|قارئ|قاري|استيراد|استورد|اقرا|يقرا|تقرا|قراءه|استخرج|استخراج|دمج|ادمج|ضغط|اضغط|وقع|يوقع|توقيع)|(?<![a-z])(?:upload\w*|import\w*|read|reads|reading|parse|parses|parsing|parser|extract\w*|merge|merges|merging|compress\w*|ocr|split\w*|annotat\w*)(?![a-z])|(?<![a-z])sign(?:s|ed|ing)?(?![a-z])(?!\s*(?:up|in|on|out)(?![a-z]))/gu;
const READ_WEAK = /(?<!\p{L})(?:و|ف|ب|ل)?(?:عارض|عرض|اعرض|يعرض|تعرض|نعرض|افتح|فتح|يفتح|معاينه)(?!\s+(?:ال)?(?:سعر|اسعار))|(?<![a-z])(?:view|views|viewing|display\w*|open|opens|opening|preview\w*|show|shows|showing)(?![a-z])/gu;
const WRITE = /(?<!\p{L})(?:و|ف|ب|ل)?(?:صدر|تصدير|يصدر|تصدر|نصدر|اصدر|يطلع|تطلع|اطلع|نطلع|طلع|يخرج|تخرج|نخرج|اخرج|حمل|تحميل|يحمل|نزل|تنزيل|ينزل|انشئ|انشاء|ينشئ|اصنع|يصنع|احفظ|حفظ|يحفظ|نحفظ|ولد|توليد|يولد|صمم|تصميم|يصمم|اعمل|يعمل|سوي|اكتب|يكتب|ارسل|يرسل)|(?<![a-z])(?:export\w*|generat\w*|download\w*|save|saves|saved|saving|creat\w*|make|makes|making|produc\w*|design\w*|get|gets|send\w*|email\w*|ready|write|writes|writing|print\w*)(?![a-z])/gu;
const AS_FORMAT = /(?:(?<![a-z])(?:as|into|to|in)\s+(?:an?\s+)?\.?|بصيغه\s*|كملف\s*|(?<!\p{L})ك\s*|(?<!\p{L})الي\s+)$/u;
const READ_AFTER = /^\s*(?:viewer|reader|parser|editor|files?\s+(?:upload|viewer|reader)|uploads?|homework|عارض|قارئ|قاري|المرفوع|(?:الي|to|into)\s+(?:صور|صوره|نص|وورد|اكسل|word|images?|jpe?g|png|text|excel|docx?|html))/u;
const PAPER_COPY = /نسخه\s+ورقيه|(?<![a-z])(?:hard|paper|printed)\s+cop(?:y|ies)(?![a-z])/u;
const PRINT_WORD = /(?<![a-z])(?:re)?print(?:able|ing|ed|s|out|outs)?(?![a-z(])|(?:^|[\s،,.(«"'])(?:و|ف|ب|ل)?(?:اطبع|يطبع|تطبع|نطبع|بطبع|طباعه|للطباعه|بالطباعه|مطبوع|مطبوعه|مطبوعات|طبع|للطبع|ينطبع|تنطبع|تتطبع|يتطبع|اتطبع|انطبع|چاپ|پرنٹ)(?:ه|ها|هم|وه|وها|ي|ين|وا|ون)?(?:لي|لك|لنا|له|لها)?(?=$|[\s،,.)»"'؟!?])/gu;
const PRINT_NOT = /^\S*\s+(?:\S+\s+){0,5}?(?:to\s+(?:the\s+)?)?(?:console|terminal|stdout|stderr|log|screen|chat|الطرفيه|الكونسول|الشاشه|السجل|الشات|المحادثه|الدردشه)|^\s*(?:statement|function|debug)|^-?\s*on-demand|^\s*(?:shop|shops|store|stores|house|studio|press|presses)(?![a-z])|^\s*(?:\S+\s+){0,2}?(?:t-?shirts?|mugs?|hoodies?)(?![a-z])|^\s*(?:\S+\s+){0,2}?(?:على\s+)?(?:ال)?(?:تيشيرت|تيشرت|قمصان|ملابس|اكواب|مجات)|^\s*(?:ال)?(?:ثلاثي|ثري\s*دي|شخصيه)/u;
const PRINT_BEFORE_NOT = /(?:3d|ثلاثي\S*\s+الابعاد|finger|blue|pretty|foot|sun|screen)\s*-?\s*$/u;
const lastAt = (s, re) => { let at = -1; for (const m of s.matchAll(re)) at = m.index; return at; };
function asksPdf(request) {
  const t = foldAr(String(request || '').slice(0, 20000)); // v8 (should-fix 5)
  for (const m of t.matchAll(PDF_TOKEN)) {
    const before = t.slice(Math.max(0, m.index - 48), m.index).split(/\s+/u).slice(-6).join(' ');
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 30);
    if (READ_AFTER.test(after)) continue;
    const strong = lastAt(before, READ_STRONG), weak = lastAt(before, READ_WEAK), write = lastAt(before, WRITE);
    if (strong >= 0 && !(write > strong)) continue;               // a reading word, with no making word after it
    if (weak >= 0 && !(write > weak) && !AS_FORMAT.test(before)) continue;   // «view/عرض» is overruled by «as PDF» or a making word
    return true;
  }
  if (PAPER_COPY.test(t)) return true;
  for (const m of t.matchAll(PRINT_WORD)) {
    const at = m.index + m[0].search(/\S/u); const before = t.slice(Math.max(0, at - 12), at); const after = t.slice(m.index + m[0].length, m.index + m[0].length + 40);
    if (!PRINT_BEFORE_NOT.test(before) && !PRINT_NOT.test(after)) return true;
  }
  return false;
}
const RTL_LETTERS = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]{4}/u;
// v6: more right-to-left languages by name; and an app named as English (or another left-to-right language) is not right-to-left
const RTL_NAMED = /\b(?:arabic|hebrew|persian|farsi|urdu|pashto|sorani|kurdish|sindhi|uyghur|dari|yiddish|rtl|right-to-left)\b|عربي|العربيه|بالعربي|عبري|فارسي|اردو|كردي|كوردي/iu;
const LTR_APP = /(?<![a-z])(?:in|an?)\s+(?:english|french|german|spanish|italian|portuguese|turkish|russian|chinese|japanese)(?![a-z])|(?<![a-z])(?:english|french|german|spanish)[\s-](?:(?:language|only|version)\s+)?(?:app|site|website|invoice|interface|ui|pages?)(?![a-z])|بالانجليزي|بالانجليزيه|بالانكليزي|بالانكليزيه|باللغه الانجليزيه|بالفرنسي|بالفرنسيه|باللغه الفرنسيه/u;
const RTL_LANG = /^(?:ar|he|iw|fa|ur|ps|ckb|sd|ug|yi|dv)(?![a-z])/u;
function speaksRtl(request, language) {
  const t = foldAr(String(request || '').slice(0, 20000)); const named = RTL_NAMED.test(t);
  if (LTR_APP.test(t) && !named) return false;
  return named || RTL_LETTERS.test(String(request || '')) || RTL_LANG.test(String(language || '').toLowerCase());
}
// v6: a code file's comments do not make the app right-to-left (the scan found Arabic comments in English pdfkit apps)
const rtlFile = (text, relPath = '') => { const rel = String(relPath).replace(/\\/g, '/'); const t = String(text || '');
  return RTL_LETTERS.test(/\.py$/iu.test(rel) ? stripPy(t) : /\.(?:[cm]?jsx?|[cm]?tsx?|vue|svelte|html?|css)$/iu.test(rel) ? stripJs(t) : t); };
// v6: the look reads the language of the app as BUILT: the first delivered page's <html lang|dir> decides; with none, its text
// v8 (M3): the first «<html» tag found by indexOf and read to its «>» within 2,000 characters; the page's visible text by one pass
// v9 (should-fix 3): «<!-- … -->» is skipped (by indexOf) before the first «<html» is looked for
const skipComments = lo => { let out = '', i = 0; for (;;) { const a = lo.indexOf('<!--', i); if (a < 0) { out += lo.slice(i); break; } out += lo.slice(i, a) + ' '.repeat(4); const b = lo.indexOf('-->', a + 4); if (b < 0) { out += ' '.repeat(lo.length - a - 4); break; } out += ' '.repeat(b + 3 - a - 4); i = b + 3; } return out; };
const htmlTag = h => { const s = String(h || ''); const lo = skipComments(s.slice(0, 200000).toLowerCase()); let i = lo.indexOf('<html'); while (i >= 0 && /[a-z0-9-]/.test(lo[i + 5] || '')) i = lo.indexOf('<html', i + 5); if (i < 0) return null; const j = s.indexOf('>', i); return j < 0 || j - i > 2000 ? null : s.slice(i, j + 1); };
const visibleText = (h, cap = 200000) => { const s = String(h || ''); const lo = s.toLowerCase(); let out = '', i = 0; while (i < s.length && out.length < cap) { const lt = s.indexOf('<', i); if (lt < 0) { out += s.slice(i); break; } out += s.slice(i, lt) + ' ';
  if (lo.startsWith('<script', lt) || lo.startsWith('<style', lt)) { const close = lo.indexOf(lo.startsWith('<script', lt) ? '</script' : '</style', lt); if (close < 0) break; i = close + 8; continue; }
  const gt = s.indexOf('>', lt); if (gt < 0) break; i = gt + 1; } return out.slice(0, cap); };
function appIsRtl(pages, request, language) {
  for (const html of pages) {
    const tag0 = htmlTag(html); if (!tag0) continue; const tag = [tag0];
    const dir = /\bdir\s*=\s*["']?(rtl|ltr|auto)/iu.exec(tag[0]); const lang = /\blang\s*=\s*["']?([a-z]{2,3})/iu.exec(tag[0]);
    if (dir && dir[1].toLowerCase() !== 'auto') return dir[1].toLowerCase() === 'rtl';
    if (lang) return RTL_LANG.test(lang[1].toLowerCase());
  }
  if (pages.some(h => RTL_LETTERS.test(visibleText(h)))) return true;
  return speaksRtl(request, language);
}

// ---------- the builder's files ----------
const JS_FILE = /\.(?:[cm]?jsx?|[cm]?tsx?|vue|svelte|html?)$/iu, PY_FILE = /\.py$/iu, MARKUP = /\.(?:html?|vue|svelte)$/iu;
// v6: out/ only at the root (src/out/ is his); .mts/.cts read
const NOT_SCANNED = /(?:^|\/)(?:vendor\/joe-kit|node_modules|dist|build|\.next|coverage|__tests__|tests?|spec|e2e|cypress|__pycache__|\.venv|venv)\/|^out\/|\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)(?:test_[^/]*|[^/]*_test|conftest)\.py$|\.min\.js$|\.d\.[cm]?ts$/iu;
const blank = s => s.split('\n').map(x => ' '.repeat(x.length)).join('\n'); // spaces, keeping every newline (v7: no per-character replace)
// v7 (M1): comments are blanked in ONE linear pass (v6's three lazy regexes were quadratic on an unclosed /* or <!--: 35 s on 195 KB).
// An unclosed comment runs to the end of the file. In a script file (not markup) a '…' or "…" string is skipped to its end on the
// same line, and a `…` string to its closing backtick, so a "src/**/*.js" glob does not open a comment.
const stripJs = (t, markup = false) => {
  const n = t.length; const parts = []; let from = 0, i = 0;
  const cut = (a, b) => { parts.push(t.slice(from, a), blank(t.slice(a, b))); from = b; };
  while (i < n) {
    const c = t.charCodeAt(i);
    if (c === 60 && t.startsWith('<!--', i)) { let j = t.indexOf('-->', i + 4); j = j < 0 ? n : j + 3; cut(i, j); i = j; continue; }
    if (c === 47 && t.charCodeAt(i + 1) === 42) { let j = t.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; cut(i, j); i = j; continue; }
    if (c === 47 && t.charCodeAt(i + 1) === 47 && !(i > 0 && /[:'"`\\\w]/u.test(t[i - 1]))) { let j = t.indexOf('\n', i); j = j < 0 ? n : j; cut(i, j); i = j; continue; }
    if (!markup && (c === 39 || c === 34)) { let j = i + 1; while (j < n) { const d = t.charCodeAt(j); if (d === 92) { j += 2; continue; } if (d === c || d === 10) break; j++; } i = j + 1; continue; }
    if (!markup && c === 96) { let j = i + 1; while (j < n) { const d = t.charCodeAt(j); if (d === 92) { j += 2; continue; } if (d === 96) break; j++; } i = j + 1; continue; }
    i++;
  }
  parts.push(t.slice(from)); return parts.join('');
};
const stripPy = t => t.replace(/(^|\n)([ \t]*)#[^\n]*/g, (m, a, b) => a + b + blank(m.slice(a.length + b.length)));
const esc = s => s.replace(/[$]/g, '\\$');
const loads = (t, mod) => new RegExp(`(?:require\\(\\s*|from\\s+|import\\s+|import\\(\\s*|src\\s*=\\s*)['"\`][^'"\`]*?(?<![\\w-])${mod}(?![\\w-])[^'"\`]*['"\`]`, 'u').test(t);
const pyLoads = (t, mod) => new RegExp(`^[ \\t]*(?:import[ \\t]+${mod}\\b|from[ \\t]+${mod}\\b)`, 'mu').test(t);
// v6 (M4): a drawing call counts only on the PDF object itself: `doc.text(`, `doc.font(f).fontSize(9).text(`, or chained on the constructor
const ARGS = '\\((?:[^()]|\\([^()]{0,200}\\)){0,300}\\)';
// v8 (M2): ONE pass collects every receiver of `.method(` (a name, then any chained calls); v7 compiled one regex per variable
const receivers = (t, method) => { const s = new Set(); for (const m of t.matchAll(new RegExp(`(?<![\\w$])([\\w$]+)(?:\\s*\\.\\s*[\\w$]+\\s*${ARGS})*\\s*\\.\\s*${method}\\s*\\(`, 'gu'))) { s.add(m[1]); if (s.size >= 5000) break; } return s; };
const onObject = (t, vars, method, ctor) => { const r = receivers(t, method); return vars.slice(0, 50).some(v => r.has(v)); }
const onCtorChain = (t, method, ctor) => new RegExp(`${ctor}\\s*${ARGS}(?:\\s*\\.\\s*[\\w$]+\\s*${ARGS})*\\s*\\.\\s*${method}\\s*\\(`, 'u').test(t);
const varsOf = (t, ctor) => [...new Set([...t.matchAll(new RegExp(`(?<![\\w$])([\\w$]+)\\s*=\\s*(?:await\\s+)?${ctor}\\s*\\(`, 'gu'))].map(m => m[1]))];
// v6 (M4): hand-written PDF bytes count only outside a comparison, in a file that writes or answers something
const COMPARE_BEFORE = /(?:===?|!==?|startsWith\s*\(|startswith\s*\(|includes\s*\(|indexOf\s*\(|\.find\s*\(|\.test\s*\(|\bcase\s|\bmatch\s*\(|\bequals\s*\(|\bin\s)\s*(?:\w+\s*\(\s*)?$/u;
// v6 (after the scan of real builder output): a module that builds the bytes and hands them on (`return Buffer.from(out, 'latin1')`,
// `module.exports`) writes them too
const WRITES_JS = /\b(?:res|response|reply|ctx|stream|out)\s*\.\s*(?:send|end|write|body)\b|\bwriteFile(?:Sync)?\s*\(|\bcreateWriteStream\s*\(|\bnew\s+(?:Blob|Response|Uint8Array)\s*\(|\bBuffer\s*\.\s*from\s*\(|\bmodule\s*\.\s*exports\b|\bexport\s+(?:default|function|const|async)\b/u;
const WRITES_PY = /\.\s*write\s*\(|\b(?:Streaming|File)?Response\s*\(|\bsend_file\s*\(|\bmake_response\s*\(/u;
const bytesAt = (t, re, writes) => { if (!writes.test(t)) return -1; for (const m of t.matchAll(re)) if (!COMPARE_BEFORE.test(t.slice(Math.max(0, m.index - 40), m.index))) return m.index; return -1; };
// v6 (M5): «x = open(…) … x.print()» in two linear passes, only in a file that prints at all
function openedWindowPrint(t) {
  if (!/\.\s*print\s*\(/u.test(t)) return -1;
  const printed = new Map(); for (const m of t.matchAll(/(?<![\w$])([\w$]+)\s*(?:\?\.|\.)\s*print\s*\(\s*\)/gu)) printed.set(m[1], m.index);
  if (!printed.size) return -1;
  for (const m of t.matchAll(/(?<![\w$])([\w$]+)\s*=\s*(?:window\s*\.\s*)?open\s*\(/gu)) { const at = printed.get(m[1]); if (at !== undefined && at > m.index) return at; }
  return -1;
}
// measured: true = the lab printed Arabic with it and it came out wrong (pdfkit, pdf-lib, ReportLab and fpdf without shaping, PyMuPDF
// insert_text); the others only open the gate (brief, kit, look) and carry no claim about Arabic (v6, M4)
const RULES_JS = [
  { kind: 'print', what: 'window.print(', produce: /\b(?:window|self|top|globalThis|contentWindow|\w*(?:[wW]in(?:dow)?|[pP]opup|[fF]rame))\s*(?:\?\.|\.)\s*print\s*\(\s*\)|\bon[A-Z]\w*\s*=\s*\{\s*(?:window|self|globalThis)\s*\.\s*print\s*\}/u },
  { kind: 'print', what: 'print() of an opened window', find: openedWindowPrint },
  { kind: 'print', what: 'print() in a page', only: MARKUP, produce: /(?:\bon[a-z]+|@[a-z]+|\bv-on:[a-z]+)\s*=\s*["'][^"'<>]{0,2000}?(?<![\w.$])print\s*\(\s*\)|<script\b[^<>]{0,2000}>[^<]{0,200000}?(?<![\w.$])print\s*\(\s*\)/u },
  { kind: 'print', what: 'react-to-print', load: 'react-to-print', produce: /\buseReactToPrint\s*\(|<ReactToPrint\b/u },
  { kind: 'print', what: 'print-js', load: 'print-js', produce: /\bprintJS\s*\(/u },
  { kind: 'server-browser', what: 'page.pdf(', loadAny: ['puppeteer', 'puppeteer-core', 'playwright', 'playwright-core', 'playwright-chromium'], produce: /\.\s*pdf\s*\(/u },
  { kind: 'server-browser', what: 'printToPDF(', produce: /\.\s*printToPDF\s*\(/u },
  { kind: 'other', what: 'pdfkit', measured: true, load: 'pdfkit', produce: /\bnew\s+PDFDocument\s*\(/u, drawsOn: { ctor: 'new\\s+PDFDocument', method: 'text' } },
  { kind: 'other', what: 'jsPDF', loadAny: ['jspdf'], alsoLoad: /\bwindow\.jspdf\b|\bjspdf\.umd/u, produce: /\bnew\s+(?:[\w$]+\.)*jsPDF\s*\(/u, drawsOn: { ctor: 'new\\s+(?:[\\w$]+\\.)*jsPDF', method: 'text' } },
  { kind: 'other', what: 'pdf-lib', measured: true, load: 'pdf-lib', produce: /\bPDFDocument\s*\.\s*create\s*\(/u, draws: /\.\s*drawText\s*\(/u },
  { kind: 'other', what: 'pdfmake', loadAny: ['pdfmake'], alsoLoad: /\bwindow\.pdfMake\b|\bpdfMake\s*\.\s*vfs\b/u, produce: /\.\s*createPdf\s*\(|\bnew\s+PdfPrinter\s*\(|\.\s*createPdfKitDocument\s*\(/u },
  // v9: the v8 review's stacks the table missed (the gate opens the brief; no claim about Arabic)
  { kind: 'server-browser', what: 'browser --print-to-pdf', produce: /--print-to-pdf\b/u },
  { kind: 'server-browser', what: 'html-pdf-node', load: 'html-pdf-node', produce: /\.\s*generatePdfs?\s*\(/u },
  { kind: 'server-browser', what: 'Gotenberg', produce: /\/forms\/(?:chromium|libreoffice)\/convert\b/u },
  { kind: 'other', what: '@react-pdf/renderer', load: '@react-pdf/renderer', produce: /\brenderTo(?:Stream|Buffer|File|String)\s*\(|<PDFDownloadLink\b|<PDFViewer\b|<BlobProvider\b|\bpdf\s*\(\s*</u },
  { kind: 'other', what: 'PDF bytes written by hand', find: t => bytesAt(t, /['"`]%PDF-1\.\d/gu, WRITES_JS) },
];
const SELF_SHAPED_JS = /['"`](?:bidi-js|bidi|unicode-bidirectional|arabic-reshaper|js-arabic-reshaper|arabic-persian-reshaper|rtl-arabic|@?[\w-]*reshaper[\w-]*)['"`]|\.\s*reverse\s*\(\s*\)/u;
const SELF_SHAPED_PY = /\barabic_reshaper\b|\bbidi\b|\bshaping\s*=\s*(?:1|True)\b|\bset_text_shaping\s*\(|\buharfbuzz\b/u;
const HINTS = { 'window.print(': ['print'], 'print() of an opened window': ['print'], 'print() in a page': ['print'], 'react-to-print': ['react-to-print'], 'print-js': ['print-js'], 'page.pdf(': ['pdf'], 'printToPDF(': ['printtopdf'], 'pdfkit': ['pdfdocument'], 'jsPDF': ['jspdf'], 'pdf-lib': ['pdfdocument'], 'pdfmake': ['createpdf', 'pdfprinter'], 'browser --print-to-pdf': ['--print-to-pdf'], 'html-pdf-node': ['html-pdf-node'], 'Gotenberg': ['/forms/'], 'WeasyPrint': ['weasyprint'], 'python-pdfkit (wkhtmltopdf)': ['pdfkit'], '@react-pdf/renderer': ['@react-pdf'], 'PDF bytes written by hand': ['%pdf'], 'ReportLab': ['reportlab'], 'fpdf': ['fpdf'], 'PyMuPDF insert_text': ['insert_text'], 'xhtml2pdf': ['xhtml2pdf'] };
const RULES_PY = [
  { kind: 'server-browser', what: 'page.pdf(', pyLoadAny: ['playwright', 'pyppeteer'], produce: /\.\s*pdf\s*\(/u },
  { kind: 'other', what: 'ReportLab', measured: true, pyLoad: 'reportlab', produce: /\bcanvas\s*\.\s*Canvas\s*\(|\bCanvas\s*\(|\bSimpleDocTemplate\s*\(|\bBaseDocTemplate\s*\(/u, draws: /\.\s*draw(?:Right|Centred|Centered)?String\s*\(|\bParagraph\s*\(|\.\s*textLine\s*\(|\.\s*textLines\s*\(/u, shaped: /\barabic_reshaper\b[\s\S]*\bget_display\b|\bget_display\b[\s\S]*\barabic_reshaper\b/u },
  { kind: 'other', what: 'fpdf', measured: true, pyLoadAny: ['fpdf'], produce: /\bFPDF\s*\(|\bclass\s+\w+\s*\(\s*FPDF\s*\)/u, draws: /\.\s*(?:cell|multi_cell)\s*\(/u, drawsOn: { ctor: 'FPDF', method: '(?:cell|multi_cell|write|text)' }, shaped: /\.\s*set_text_shaping\s*\(|\barabic_reshaper\b[\s\S]*\bget_display\b/u },
  { kind: 'other', what: 'PyMuPDF insert_text', measured: true, pyLoadAny: ['fitz', 'pymupdf'], produce: /\.\s*insert_text(?:box)?\s*\(/u, shaped: /\barabic_reshaper\b[\s\S]*\bget_display\b/u },
  { kind: 'other', what: 'xhtml2pdf', pyLoad: 'xhtml2pdf', produce: /\bpisa\s*\.\s*CreatePDF\s*\(|\bCreatePDF\s*\(/u },
  { kind: 'server-browser', what: 'browser --print-to-pdf', produce: /--print-to-pdf\b/u },
  { kind: 'other', what: 'WeasyPrint', pyLoad: 'weasyprint', produce: /\.\s*write_pdf\s*\(/u },
  { kind: 'other', what: 'python-pdfkit (wkhtmltopdf)', pyLoad: 'pdfkit', produce: /\bpdfkit\s*\.\s*from_(?:string|url|file)\s*\(/u },
  { kind: 'server-browser', what: 'Gotenberg', produce: /\/forms\/(?:chromium|libreoffice)\/convert\b/u },
  { kind: 'other', what: 'PDF bytes written by hand', find: t => bytesAt(t, /b?['"]%PDF-1\.\d/gu, WRITES_PY) },
];
function pdfMechanismsIn(text, relPath) {
  const rel = String(relPath || '').replace(/\\/g, '/');
  if (NOT_SCANNED.test(rel) || String(text).length > 1048576) return [];
  const py = PY_FILE.test(rel); if (!py && !JS_FILE.test(rel)) return [];
  const t = py ? stripPy(String(text)) : stripJs(String(text), MARKUP.test(rel));
  const out = [];
  // v7 (M1): a rule runs only when its word is in the file at all (one lower-casing of the file, then a substring test per rule)
  const lower = t.toLowerCase();
  for (const r of py ? RULES_PY : RULES_JS) {
    if (r.only && !r.only.test(rel)) continue;
    if (!HINTS[r.what].some(h => lower.includes(h))) continue;
    if (r.load && !loads(t, r.load)) continue;
    if (r.loadAny && !r.loadAny.some(m => loads(t, m)) && !(r.alsoLoad && r.alsoLoad.test(t))) continue;
    if (r.pyLoad && !pyLoads(t, r.pyLoad)) continue;
    if (r.pyLoadAny && !r.pyLoadAny.some(m => pyLoads(t, m))) continue;
    let at = -1;
    if (r.find) at = r.find(t); else { const m = r.produce.exec(t); if (m) at = m.index; }
    if (at < 0) continue;
    // v8 (M2): the object test runs only when the file-wide `draws` did not already match
    if (r.drawsOn || r.draws) { const ok = (r.draws && r.draws.test(t)) || (r.drawsOn && (onObject(t, varsOf(t, r.drawsOn.ctor), r.drawsOn.method, r.drawsOn.ctor) || onCtorChain(t, r.drawsOn.method, r.drawsOn.ctor))); if (!ok) continue; }
    if (r.shaped && r.shaped.test(t)) continue;
    // v7 (should-fix 2): code that shapes or reorders the text itself (a bidi/reshaper library, ReportLab shaping, a words-reverse
    // hack) may print right: the mechanism still opens the gate, but no route line is said about it
    const selfShaped = (py ? SELF_SHAPED_PY : SELF_SHAPED_JS).test(t);
    out.push({ kind: r.kind, what: r.what, measured: !!r.measured && !selfShaped, line: t.slice(0, at).split('\n').length });
  }
  return out;
}
// v9 (should-fix 4): which written files start the scan child — no regex: the path's ending and lower-cased indexOf of hint words on the
// WHOLE written file (after an edit, the file as it now is). A Python «print(» is not a hint; a style sheet is never scanned.
const SCRIPT_ENDS = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.vue', '.svelte', '.html', '.htm', '.py'];
const TRIGGER_WORDS = ['pdf', 'print', 'canvas', 'fitz', 'weasyprint', 'wkhtml', 'gotenberg', 'reportlab', 'doctemplate', 'drawstring', 'drawrightstring', 'drawcentredstring', 'insert_text'];
function writeTrigger(text, relPath) {
  const rel = String(relPath || '').toLowerCase(); if (!SCRIPT_ENDS.some(e => rel.endsWith(e)) || rel.includes('vendor/joe-kit/') || rel.includes('node_modules/')) return false;
  const t = String(text || '').slice(0, 1048576).toLowerCase(); const py = rel.endsWith('.py');
  for (const w of TRIGGER_WORDS) for (let i = t.indexOf(w); i >= 0; i = t.indexOf(w, i + 1)) { if (py && w === 'print' && t[i + 5] === '(' && t[i - 1] !== '.') continue; return true; }
  return false;
}
module.exports = { asksPdf, speaksRtl, rtlFile, appIsRtl, pdfMechanismsIn, foldAr, NOT_SCANNED, htmlTag, visibleText, writeTrigger };

if (require.main === module) {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'table') {
    const MUST = ['شهادات PDF', 'تصدير الفاتورة بي دي إف', 'نزّل الفاتورة بي دي اف', 'تحميل التقرير PDF', 'شهادة قابلة للطباعة', 'طباعة الفاتورة', 'اطبع الوصل', 'export to PDF', 'printable certificate', 'download invoice as PDF', 'print the receipt',
      'اعمل تطبيق فواتير مع زر طباعة', 'نظام مدرسة يطلع شهادات للطلاب بصيغة pdf', 'أريد كشف حساب أطبعه', 'Build a clinic app that prints prescriptions', 'generate a PDF report of sales', 'اكتب لي تقرير PDF عن المبيعات', 'write a PDF report about our sales', 'وصل مطبوع لكل عملية', 'make the invoice printable', 'زر لطباعة الشهادة'];
    const NOT = ['ارفع ملف PDF', 'upload a PDF', 'عارض PDF', 'PDF viewer', 'قراءة ملفات PDF', 'تقرير', 'تصدير CSV', 'تصدير Excel', 'تطبيق يرفع ملفات PDF ويعرضها', 'a tool to merge PDF files', 'extract text from a PDF', 'print the result to the console', 'a 3D printing shop website', 'fingerprint login', 'a blueprint editor', 'اطبع النتيجة في الطرفية', 'an app where users upload their CV as pdf', 'debug print statements everywhere', 'متجر طابعات ثلاثية الأبعاد', 'اعرض ملفات PDF المرفوعة'];
    // the v5 reviewer's 46 sentences (regex5.cjs), [sentence, expected]
    const REVIEW = [['ابي تطبيق فواتير واقدر اطبعها', true], ['ابغى الفاتوره تطلع بي دي اف', true], ['ودي اسوي نظام شهادات تنطبع', true], ['أبي أطلع تقرير بصيغة بي دي أف', true],
      ['ابي موقع يصدر فواتير PDF', true], ['ابغى موقع لعرض سعر PDF للعملاء', true], ['سو لي نظام عروض أسعار يطلع عرض السعر PDF', true],
      ['بدي برنامج للفواتير بينطبع', true], ['بدي اطبع الإيصالات', true], ['فيني اطبع الفاتورة؟', true], ['بدي حمّل الفاتورة كـ PDF', true], ['بدي ياها تنطبع عالورق', true],
      ['عايز سيستم فواتير يطبع', true], ['عاوز اطلع الفاتورة بي دي اف', true], ['عايز زرار طباعة', true], ['عايزها تتطبع', true], ['اعمل لي برنامج يطلع الشهادات جاهزة للطبع', true],
      ['بغيت نطبع الفاتورة', true], ['نبغي نخرج الفاتورة PDF', true], ['بغيت نطبعها', true], ['بغيت نسخة ورقية ديال الفاتورة', true],
      ['أريد مطبوعات للشهادات', true], ['صمم شهادة PDF أنيقة', true], ['اعرض الفاتورة وصدّرها PDF', true], ['حفظ الفاتورة كملف PDF', true], ['أبي أحفظ الكشف بصيغة pdf', true],
      ['generate PDFs for each student', true], ['design an invoice PDF', true], ['a well designed PDF certificate', true], ["it's important to export invoices as PDF", true], ['view invoices as PDF', true],
      ['students sign up, get a PDF certificate', true], ['print-friendly receipts', true], ['reprint lost certificates', true], ['save as .pdf', true], ['the report should be ready as PDF', true],
      ['متجر طباعة على التيشيرتات', false], ['خدمة طباعة ثلاثية الأبعاد', false], ['تطبيق اختبار طبع الشخصية', false], ['طبعاً أبي التطبيق بالعربي', false], ['a website for my print shop', false],
      ['screen print t-shirts store', false], ['print-on-demand mugs store', false], ['open the PDF the user uploads and show it', false], ['students upload PDF homework', false], ['مطبعة', false]];
    // held out: written by the designer AFTER the rules were set and run once, never tuned on (results reported as they came)
    const HELD = [['أبغى نظام إيصالات قبض يطبعها المحاسب', true], ['حول الفاتورة إلى PDF', true], ['تطبيق حجز مع تذكرة قابلة للطباعة', true], ['ابي زر يطبع الكشف', true],
      ['receipts the cashier can print', true], ['monthly statements as PDF attachments', true], ['generate printable labels for shipments', true], ['أريد تقرير شهري بي دي إف يرسل بالإيميل', true],
      ['خلي الشهادة تنزل PDF', true], ['the doctor prints the prescription', true], ['نظام فواتير مع طباعة حرارية 80 ملم', true], ['Export the timetable to PDF and Excel', true],
      ['قارئ PDF للطلاب', false], ['تطبيق لضغط ملفات PDF', false], ['convert scanned PDFs to text with OCR', false], ['موقع لبيع الطابعات', false], ['a printer inventory app', false],
      ['print debugging logs', false], ['اطبع رسالة ترحيب في الكونسول', false], ['users attach PDF invoices to expenses', false], ['مطبعة لطباعة الكتب', false], ['PDF to Word converter', false],
      ['show the uploaded PDF in a modal', false], ['e-sign contracts in PDF', false]];
    let bad = 0; for (const s of MUST) if (!asksPdf(s)) { bad++; console.log('MISS  must match:', s); } for (const s of NOT) if (asksPdf(s)) { bad++; console.log('FALSE must not :', s); }
    console.log(`asksPdf design rows: ${MUST.length} must, ${NOT.length} must not, ${bad} wrong`);
    for (const [name, set] of [['reviewer 46', REVIEW], ['held-out 24', HELD]]) { let w = 0; for (const [s, want] of set) if (asksPdf(s) !== want) { w++; console.log(`  ${name} ${want ? 'MISS ' : 'FALSE'} ${s}`); } console.log(`asksPdf ${name}: ${set.length - w} of ${set.length} right`); }
    const RTL = [['اطبع الوصل', 'ar', true], ['print the receipt', 'en', false], ['an Arabic invoice app with PDF export', 'en', true], ['invoice app, RTL, printable', 'en', true], ['Hebrew school certificates', 'en', true], ['export to PDF', 'en', false],
      ['build an English invoice app for my US client, with PDF export', 'ar', false], ['ابني تطبيق فواتير بالإنجليزي لعملائي في أمريكا مع تصدير PDF', 'ar', false], ['make certificates for محمد and his class', 'en', true], ['Kurdish (Sorani) school reports', 'en', true], ['app in Pashto', 'en', true], ['تطبيق فواتير', 'en', true],
      ['an Arabic and English invoice app', 'en', true], ['تطبيق فواتير بالعربي والإنجليزي', 'ar', true]];
    let rb = 0; for (const [s, l, want] of RTL) if (speaksRtl(s, l) !== want) { rb++; console.log('RTL wrong:', s, l); } console.log(`speaksRtl: ${RTL.length} rows, ${rb} wrong`);
    const APP = [[['<html lang="en"><body>Invoice</body></html>'], 'ابني تطبيق فواتير', 'ar', false], [['<html lang="ar" dir="rtl"><body>فاتورة</body></html>'], 'invoice app', 'en', true], [['<html><body><h1>فاتورة ضريبية</h1></body></html>'], 'invoice app', 'en', true], [['<html dir="ltr" lang="ar"><body>x</body></html>'], 'فواتير', 'ar', false], [[], 'اطبع الوصل', 'ar', true]];
    let ab = 0; for (const [pages, r, l, want] of APP) if (appIsRtl(pages, r, l) !== want) { ab++; console.log('appIsRtl wrong:', pages[0], r); } console.log(`appIsRtl: ${APP.length} rows, ${ab} wrong`);
    const F = [
      ['public/app.js', "$('#printBtn').onclick = () => window.print();", 'print'], ['server/print.js', '<button onclick="window.print()">طباعة</button>', 'print'], ['public/index.html', '<button onclick="print()">طباعة</button>', 'print'],
      ['src/Invoice.jsx', "import { useReactToPrint } from 'react-to-print';\nconst p = useReactToPrint({ contentRef });", 'print'], ['src/p.js', "import printJS from 'print-js'; printJS('inv', 'html');", 'print'],
      ['public/app.js', "const w = window.open(''); w.document.write(html); w.print();", 'print'], ['public/app.js', 'frame.contentWindow.print()', 'print'],
      ['server/pdf.js', "const puppeteer = require('puppeteer');\nconst buf = await page.pdf({ format: 'A4' });", 'server-browser'], ['main.js', 'win.webContents.printToPDF({})', 'server-browser'], ['app/report.py', 'from playwright.sync_api import sync_playwright\npage.pdf(path="r.pdf")', 'server-browser'],
      ['server/certificate.js', "const PDFDocument = require('pdfkit');\nconst doc = new PDFDocument();\ndoc.text(name);", 'other'], ['src/lib/pdf.js', "import { jsPDF } from 'jspdf';\nconst pdf = new jsPDF();\npdf.text(name, 10, 10);", 'other'],
      ['s.js', "import { PDFDocument } from 'pdf-lib';\nconst d = await PDFDocument.create();\npage.drawText(name)", 'other'], ['s.js', "import pdfMake from 'pdfmake/build/pdfmake';\npdfMake.createPdf(dd).download()", 'other'],
      ['app/report.py', 'from reportlab.platypus import SimpleDocTemplate, Paragraph\ndoc = SimpleDocTemplate("r.pdf")\nParagraph(name)', 'other'], ['a.py', 'from fpdf import FPDF\npdf = FPDF()\npdf.cell(0, 10, name)', 'other'], ['a.py', 'import fitz\npage.insert_text((72, 72), name)', 'other'],
      ['src/pdf.js', "const body = '%PDF-1.4\\n1 0 obj';\nres.end(body)", 'other'],
      // v6 rows: the v5 reviewer's code (regex5.cjs) and the M4/M5/S3 cases
      ['src/App.jsx', '<button onClick={window.print}>طباعة</button>', 'print'], ['src/App.jsx', 'window?.print()', 'print'], ['src/App.vue', '<button @click="print()">طباعة</button>', 'print'],
      ['src/Print.tsx', 'const handle = () => iframe.contentWindow?.print();', 'print'], ['server/pdf.mts', "import puppeteer from 'puppeteer';\nawait page.pdf({format:'A4'})", 'server-browser'],
      ['src/report.jsx', "import { pdf, Document, Page, Text } from '@react-pdf/renderer';\nconst blob = await pdf(<Doc/>).toBlob();", 'other'], ['src/out/gen.js', "const PDFDocument = require('pdfkit'); const doc = new PDFDocument(); doc.text(x)", 'other'],
      ['server/cert.js', "const PDFDocument = require('pdfkit');\nconst doc = new PDFDocument({ size: 'A4' });\ndoc.font('Amiri')\n  .fontSize(28)\n  .text(name, { align: 'right' });", 'other'],
      ['server/cert.js', "const PDFDocument = require('pdfkit');\nthis.doc = new PDFDocument();\nthis.doc.text(name);", 'other'], ['a.py', 'from fpdf import FPDF\nclass P(FPDF):\n    pass\npdf = P()\npdf.multi_cell(0, 10, name)', 'other'],
      ['public/print.js', 'let popup;\npopup = window.open("", "_blank");\npopup.document.write(html);\nsetTimeout(() => popup.print(), 300);', 'print'],
      ['src/pdf.js', "function buildPdf(objs) {\n  let out = '%PDF-1.4\\n%\\xe2\\xe3\\xcf\\xd3\\n';\n  return Buffer.from(out, 'latin1');\n}\nmodule.exports = { buildPdf };", 'other'],
      ['server/raw.py', "def pdf():\n    body = b'%PDF-1.4\\n%...'\n    return Response(body, mimetype='application/pdf')", 'other'],
    ];
    const FN = [
      ['src/upload.js', "if (file.type !== 'application/pdf') throw new Error('PDF only')", ''], ['public/index.html', '<input type="file" accept=".pdf">', ''], ['src/read.js', "const pdf = require('pdf-parse');\nconst data = await pdf(buf);", ''],
      ['src/v.js', "import * as pdfjs from 'pdfjs-dist';", ''], ['src/m.js', "import { PDFDocument } from 'pdf-lib';\nconst d = await PDFDocument.load(bytes);", ''], ['src/merge.js', "import { PDFDocument } from 'pdf-lib';\nconst out = await PDFDocument.create();\nconst pages = await out.copyPages(src, [0]);", ''],
      ['public/index.html', '<a href="/files/terms.pdf">الشروط</a>', ''], ['public/app.js', '// call window.print() later', ''], ['public/app.js', "const opts = { media: 'print' };", ''], ['public/style.css', '@media print { .x { display:none } }', ''],
      ['vendor/joe-kit/README.md', 'window.print()', ''], ['public/vendor/joe-kit/x.js', 'window.print()', ''], ['app/main.py', 'print("server started")', ''], ['app/main.py', 'print()', ''], ['tests/conftest.py', 'import fitz\npage.insert_text((72, 72), text)', ''], ['src/x.test.js', 'window.print()', ''],
      ['src/lib/pdf.js', "import { jsPDF } from 'jspdf';\nimport html2canvas from 'html2canvas';\nconst pdf = new jsPDF();\npdf.addImage(img, 'PNG', 0, 0);", ''], ['a.py', 'import arabic_reshaper\nfrom bidi.algorithm import get_display\nfrom reportlab.pdfgen import canvas\nc = canvas.Canvas("a.pdf")\nc.drawRightString(500, 700, get_display(arabic_reshaper.reshape(name)))', ''],
      ['a.py', 'from fpdf import FPDF\npdf = FPDF()\npdf.set_text_shaping(True)\npdf.cell(0, 10, name)', ''], ['a.py', 'import fitz\npage.insert_htmlbox(rect, html)', ''], ['src/App.jsx', 'const printer = { print() { } };\nprinter.print();', ''],
      ['server/app.js', "const playwright = require('playwright');\nconst shot = await page.screenshot();", ''], ['public/app.js', 'blueprint(); fingerprint();', ''],
      // v6 rows (the v5 reviewer's false hits, M4)
      ['src/pdf.js', "import jsPDF from 'jspdf';\nimport html2canvas from 'html2canvas';\nconst r = await fetch(u).then(x => x.text());\nconst pdf = new jsPDF();\npdf.addImage(img,'PNG',0,0);", ''],
      ['src/upload.js', "if (head.toString('latin1',0,8) !== '%PDF-1.7') throw new Error('not a pdf')", ''],
      ['server/upload.js', "if (buf.slice(0, 8).toString() === '%PDF-1.4') res.send('ok')", ''],
      ['server/certificate.js', "const PDFDocument = require('pdfkit');\nconst doc = new PDFDocument();\ndoc.image('cert.png', 0, 0);\nres.type('pdf'); // no text drawn\nconst t = await r.text();", ''],
      ['e2e/print.spec.ts', 'window.print()', ''], ['out/gen.js', "const PDFDocument = require('pdfkit'); const doc = new PDFDocument(); doc.text(x)", ''],
      ['a.py', "with open('a.pdf','rb') as f:\n    if f.read(8) == b'%PDF-1.7':\n        print('ok')", ''], ['a.py', 'from fpdf import FPDF\npdf = FPDF()\npdf.image("cert.png")\nopen("log.txt","w").write("done")', ''],
    ];
    let fb = 0; for (const [rel, src, kind] of F) { const k = pdfMechanismsIn(src, rel).map(x => x.kind); if (!k.includes(kind)) { fb++; console.log('MISS  mechanism:', rel, JSON.stringify(src).slice(0, 80), '->', k); } }
    for (const [rel, src] of FN) { const k = pdfMechanismsIn(src, rel); if (k.length) { fb++; console.log('FALSE mechanism:', rel, JSON.stringify(src).slice(0, 80), '->', JSON.stringify(k)); } }
    console.log(`pdfMechanismsIn: ${F.length} must, ${FN.length} must not, ${fb} wrong`);
  }
  if (mode === 'timing') {
    const time = (label, text, rel = 'public/app.js') => { const t0 = process.hrtime.bigint(); const r = pdfMechanismsIn(text, rel); const ms = Number(process.hrtime.bigint() - t0) / 1e6; console.log(`${label.padEnd(62)} ${ms.toFixed(1).padStart(8)} ms  ${JSON.stringify(r.map(x => x.what))}`); };
    // the reviewer's redos5.cjs inputs, byte for byte in shape
    for (const [sites, kb] of [[50, 500], [200, 1000], [1000, 1000]]) {
      const filler = 'let aa = 1;\n'; const per = Math.floor(kb * 1024 / sites);
      const t = Array.from({ length: sites }, (_, i) => `w${i} = open(u${i});\n` + filler.repeat(Math.max(0, Math.floor((per - 20) / filler.length)))).join('');
      time(`${sites} "x = open(" sites in ${Math.round(t.length / 1024)} KB, no print()`, t);
      time(`same, plus one unrelated y.print() at the end`, t + '\ny.print();');
      time(`same, plus w0.print() at the end (a real hit)`, t + '\nw0.print();');
    }
    // the reviewer's regex5.cjs pathological inputs
    time('200k "(" after open(', 'w = open(' + '('.repeat(200000));
    time('opened-window rule on 500 KB', 'x=open(' + ' a'.repeat(250000) + ' y.print()');
    time('30k open( assignments, no print', (Array.from({ length: 3000 }, (_, i) => `v${i}=open(u)`).join(';') + ';').repeat(10));
    time('30k open( assignments + 30k print calls of other names', (Array.from({ length: 3000 }, (_, i) => `v${i}=open(u);z${i}.print()`).join(';') + ';').repeat(10));
    time('~1 MB of comments then window.print()', ('const a = 1; // x\n').repeat(55000) + 'window.print()');
    time('1 MB of one identifier', 'a'.repeat(1040000));
    time('pdfkit: 1000 unclosed doc.x( calls', "const PDFDocument = require('pdfkit'); const doc = new PDFDocument();\n" + 'doc.font(\n'.repeat(1000) + ' '.repeat(900000));
    time('pdfkit: 20k chained calls, no .text(', "const PDFDocument = require('pdfkit'); const doc = new PDFDocument();\ndoc" + '.fontSize(12)'.repeat(20000) + ';');
    time('%PDF: 20k comparisons in a writing file', "res.send(x);\n" + "if (h === '%PDF-1.7') {}\n".repeat(20000));
    // v7 (M1): the v6 reviewer's hostile inputs (redos6.cjs) at 1 MB, and more of the same kind
    const K = s => s.repeat(Math.floor(1e6 / s.length));
    time('[review c1] unclosed /* ×N, then window.print()', K('/* ') + '\nwindow.print()', 'a.js');
    time('[review c2] unclosed <!-- ×N, then <script>window.print()', K('<!-- ') + '\n<script>window.print()</script>', 'a.html');
    time('[review c3] <script ×N with no >, .html', K('<script '), 'a.html');
    time('[review c4] onclick=" ×N with no closing quote, .html', K('onclick="a '), 'a.html');
    time('[review c5] "src/**/*.js" glob strings ×N, then window.print()', K('x("src/**/*.js");\n') + 'window.print()', 'a.js');
    time('<!-- ×N in a .js file, then window.print()', K('<!-- ') + '\nwindow.print()', 'a.js');
    time("onclick=' ×N with no closing quote, then print(), .html", K("onclick='a ") + 'print()', 'a.html');
    time("require(' ×N unclosed, with pdfkit words", K("require('pdfkit ") + 'new PDFDocument(); doc.text(x)', 'a.js');
    time("from ' ×N unclosed", K("from 'puppeteer "), 'a.js');
    time('" ×N unclosed strings on one line', K('"a '), 'a.js');
    time('one unclosed backtick, then 1 MB', '`' + 'a'.repeat(1e6), 'a.js');
    time('@click=" ×N, .vue', K('@click="x '), 'a.vue');
    time('1 MB request-sized text through asksPdf', ''); { const big = 'نظام '.repeat(200000) + ' اطبع الفاتورة'; const t0 = Date.now(); const r = asksPdf(big); console.log(`  asksPdf on ${Math.round(big.length / 1024)} KB: ${r} in ${Date.now() - t0} ms`); }
  }
  if (mode === 'scan') {
    const SKIPDIR = new Set(['node_modules', '.joe', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'venv', 'coverage', '.joe-versions', '.checkpoints']);
    let projects = 0, files = 0; const found = new Set(); const hits = []; const byWhat = {};
    const walk = (d, root, depth) => { if (depth > 8) return; let es; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (SKIPDIR.has(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, root, depth + 1); else { const rel = path.relative(root, p).split(path.sep).join('/'); if (!JS_FILE.test(rel) && !PY_FILE.test(rel)) continue; let t; try { if (fs.statSync(p).size > 1048576) continue; t = fs.readFileSync(p, 'utf8'); } catch { continue; } files++; for (const h of pdfMechanismsIn(t, rel)) { hits.push(`${p}:${h.line} ${h.kind}/${h.what}${h.measured ? ' (measured)' : ''} rtl=${rtlFile(t, rel)} :: ${t.split('\n')[h.line - 1].trim().slice(0, 140)}`); byWhat[h.what] = (byWhat[h.what] || 0) + 1; found.add(root); } } } };
    for (const R of rest) for (const s of fs.readdirSync(R)) { const sd = path.join(R, s); let ps; try { ps = fs.readdirSync(sd); } catch { continue; } for (const pr of ps) { const pd = path.join(sd, pr); try { if (!fs.statSync(pd).isDirectory()) continue; } catch { continue; } projects++; walk(pd, pd, 0); } }
    console.log(JSON.stringify({ projects, withMechanism: found.size, files, hits: hits.length, byWhat })); console.log(hits.join('\n'));
  }
}
