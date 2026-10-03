// Muse independent Batch-2 / verification-contract probe — cycle 2026-10-03
// Method: extract EXACT source spans from NVIDIA dirty bytes, transpile types
// with local typescript (semantics-preserving), execute red/green matrices.
// No writes to the NVIDIA tree. Read-only source inspection + local execution.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ts = require('D:/Joe/muse-worktree/api/node_modules/typescript/lib/typescript.js');

const NV = 'D:/Joe/xelitesolutions/api/src';
const SOURCES = {
  ledger: NV + '/core/quality/verification-ledger.ts',
  visual: NV + '/modules/tools/definitions/VisualQATool.ts',
  bulk: NV + '/modules/tools/definitions/BulkFileGeneratorTool.ts',
  containment: NV + '/modules/tools/path-containment.ts',
};
for (const [k, p] of Object.entries(SOURCES)) {
  const b = fs.readFileSync(p);
  console.log(`SRC ${k} sha256=${crypto.createHash('sha256').update(b).digest('hex')} mtime=${fs.statSync(p).mtime.toISOString()}`);
}

// Extract a function span: skip the parameter list (which may contain braces in
// default values like `= {}`), then match the body braces after the signature.
function extract(src, startMarker, open, close) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error('marker missing: ' + startMarker);
  const p0 = src.indexOf('(', i);
  let pd = 0, pEnd = -1;
  for (let j = p0; j < src.length; j++) {
    if (src[j] === '(') pd++;
    if (src[j] === ')') { pd--; if (pd === 0) { pEnd = j; break; } }
  }
  if (pEnd < 0) throw new Error('unbalanced params: ' + startMarker);
  const o = src.indexOf(open, pEnd);
  let depth = 0;
  for (let j = o; j < src.length; j++) {
    if (src[j] === open) depth++;
    if (src[j] === close) { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  throw new Error('unbalanced: ' + startMarker);
}
function jsts(extracted) {
  return ts.transpileModule(extracted, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
}

let pass = 0, fail = 0;
function check(id, actual, expected, note) {
  const ok = actual === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}${note ? ' // ' + note : ''}`);
}

// ---------- LEDGER GATE (exact extracted functions) ----------
const ledgerSrc = fs.readFileSync(SOURCES.ledger, 'utf8');
const fnSingle = extract(ledgerSrc, 'export function isSingleOutputObservationPath', '{', '}');
const fnGate = extract(ledgerSrc, 'export function isVerificationTool', '{', '}');
if (!ledgerSrc.includes(fnSingle) || !ledgerSrc.includes(fnGate)) throw new Error('extract mismatch');
const gateJs = jsts(fnSingle + '\n' + fnGate + '\nmodule.exports={isSingleOutputObservationPath,isVerificationTool};');
const gateMod = new module.constructor();
gateMod._compile(gateJs, 'ledger-extract.js');
const { isSingleOutputObservationPath, isVerificationTool } = gateMod.exports;

check('L1 prose-substituted read_file accepted', isVerificationTool('read_file', { path: 'dist/app.js' }, false, true), true);
check('L2 structured read_file still rejected', isVerificationTool('read_file', { path: 'dist/app.js' }, false, false), false);
check('L3 traversal path rejected', isVerificationTool('read_file', { path: '../secrets/x' }, false, true), false);
check('L4 multi-path args rejected', isVerificationTool('read_file', { path: 'a.txt', file: 'b.txt' }, false, true), false);
check('L5 empty args rejected', isVerificationTool('read_file', {}, false, true), false);
check('L6 leading ./ stripped+accepted', isVerificationTool('read_file', { filePath: './a.txt' }, false, true), true);
check('L7 tool name case-insensitive', isVerificationTool('READ_FILE', { path: 'a.txt' }, false, true), true);
check('L8 project_detect leg still stops', isVerificationTool('project_detect', {}, false, true), false);
check('L9 shell npm-test still accepted', isVerificationTool('shell_execute', { command: 'npm run test:unit' }), true);
check('L10 shell npm-install still rejected', isVerificationTool('shell_execute', { command: 'npm install' }), false);
check('L11 custom checker still rejected', isVerificationTool('custom_checker', {}, true), false);
check('L12a visual_qa in gate set', isVerificationTool('visual_qa', {}), true);
check('L12b quality_run in gate set', isVerificationTool('quality_run', {}), true);
check('L13 dotdot-mid-path conservatively rejected', isVerificationTool('read_file', { path: 'sub/../ok.txt' }, false, true), false);
check('L14 absolute path accepted-at-gate', isVerificationTool('read_file', { path: 'C:\\ws\\a.txt' }, false, true), true, 'execution containment stays with ToolService');
check('L15 final-gate 2-arg read rejected', isVerificationTool('read_file', { path: 'a.txt' }), false);

// ---------- SHARED PRIMITIVE (exact) vs INLINE PREDICATE (exact) ----------
const contSrc = fs.readFileSync(SOURCES.containment, 'utf8');
const fnWithin = extract(contSrc, 'export function isWithinRoot', '{', '}');
const withinJs = jsts(fnWithin + '\nmodule.exports={isWithinRoot};');
const withinMod = new module.constructor();
withinMod._compile(withinJs, 'within-extract.js');
const { isWithinRoot } = withinMod.exports;

const visualSrc = fs.readFileSync(SOURCES.visual, 'utf8');
// Exact predicate lines from VisualQATool execute (workspaceRoot/resolvedFilePath/if-cond).
const mRoot = 'const workspaceRoot = path.resolve(workspaceService.getActiveRoot(context?.workspaceId)';
const iRoot = visualSrc.indexOf(mRoot);
const iIf = visualSrc.indexOf('if (!resolvedFilePath.startsWith', iRoot);
const oParen = visualSrc.indexOf('(', iIf);
let d = 0, jEnd = -1;
for (let j = oParen; j < visualSrc.length; j++) {
  if (visualSrc[j] === '(') d++;
  if (visualSrc[j] === ')') { d--; if (d === 0) { jEnd = j; break; } }
}
const spanConsts = visualSrc.slice(iRoot, visualSrc.indexOf('if (!resolvedFilePath.startsWith', iRoot));
const spanCond = visualSrc.slice(oParen, jEnd + 1);
if (!visualSrc.includes(spanConsts) || !visualSrc.includes(spanCond)) throw new Error('predicate extract mismatch');
console.log('PREDICATE-SPAN sha256=' + crypto.createHash('sha256').update(spanConsts + spanCond).digest('hex'));
const predJs = jsts(`function inlineEscapes(filePath, context, workspaceService, path) {\n${spanConsts}\nreturn ${spanCond};\n}\nmodule.exports={inlineEscapes};`);
const predMod = new module.constructor();
predMod._compile(predJs, 'pred-extract.js');
const { inlineEscapes } = predMod.exports;

// Bulk uses the identical predicate shape on targetPath/cwd — verify textually.
const bulkSrc = fs.readFileSync(SOURCES.bulk, 'utf8');
const bulkHasSame = bulkSrc.includes('const workspaceRoot = path.resolve(workspaceService.getActiveRoot(context?.workspaceId)');
check('B0 bulk predicate shape identical', bulkHasSame, true);

const ROOT = 'D:\\probe-ws-20261003';
const stubWS = { getActiveRoot: () => ROOT };
const ctx = { workspaceId: 'ws1' };
// escapes=true means tool DENIES; escapes=false means tool ALLOWS.
check('C1 inside allowed', inlineEscapes('D:\\probe-ws-20261003\\shots\\a.png', ctx, stubWS, path), false);
check('C2 traversal denied', inlineEscapes('D:\\probe-ws-20261003\\..\\escape.txt', ctx, stubWS, path), true);
check('C3 absolute-outside denied', inlineEscapes('C:\\Windows\\Temp\\x.png', ctx, stubWS, path), true);
check('C4 sibling-prefix denied', inlineEscapes('D:\\probe-ws-20261003-backup\\a.png', ctx, stubWS, path), true);
const caseVariant = 'd:\\PROBE-WS-20261003\\a.png';
const inlineCase = inlineEscapes(caseVariant, ctx, stubWS, path);
const sharedCase = isWithinRoot(caseVariant, ROOT);
check('C5a inline case-variant denied (false refusal)', inlineCase, true);
check('C5b shared primitive case-variant allowed', sharedCase, true);
check('C5c DIVERGENCE proven (deny-vs-allow)', inlineCase === true && sharedCase === true, true, `platform=${process.platform}`);
process.chdir('C:\\Windows\\Temp');
check('C6 relative-from-foreign-cwd denied', inlineEscapes('shots\\a.png', ctx, stubWS, path), true, 'anchored at process.cwd, not workspace root');
check('C7 root-equal allowed', inlineEscapes(ROOT, ctx, stubWS, path), false);
check('C8 empty path fail-closed', inlineEscapes('', ctx, stubWS, path), true);
check('C9 shared: traversal denied', isWithinRoot('D:\\probe-ws-20261003\\..\\escape.txt', ROOT), false);
check('C10 shared: sibling denied', isWithinRoot('D:\\probe-ws-20261003-backup\\a.png', ROOT), false);

// ---------- TS2554 language-rule pin (why committed HEAD arity matters) ----------
const tsMiniDir = 'D:/Joe/muse-worktree/tmp/batch011-verify-20261003';
const miniPath = tsMiniDir + '/arity-mini.ts';
fs.writeFileSync(miniPath, 'declare function f(a: string, b: object, c: boolean): boolean;\nf("x", {}, true, true);\n');
const prog = ts.createProgram([miniPath], { strict: true, noEmit: true, types: [] });
const diags = ts.getPreEmitDiagnostics(prog).map(x => x.code);
check('T1 extra-arg call is TS2554', diags.includes(2554), true, 'codes=' + JSON.stringify(diags));

console.log(`\nTOTAL pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
