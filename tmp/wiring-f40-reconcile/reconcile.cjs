// Static IMPLEMENTED-vs-REGISTERED reconciliation on exact f40 bytes.
// Read-only: parses extracted f40 sources, writes report only.
// Usage: node reconcile.cjs
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'f40', 'api', 'src', 'modules', 'tools');
const DEF_DIR = path.join(ROOT, 'definitions');
const REGISTRY = path.join(ROOT, 'registry.ts');

function read(p) { return fs.readFileSync(p, 'utf8'); }

// 1. Exported tool-ish symbols per definition file.
const implByFile = {};   // file -> [symbols]
const symbolToFile = {}; // symbol -> file
for (const f of fs.readdirSync(DEF_DIR)) {
  if (!f.endsWith('.ts')) continue;
  const src = read(path.join(DEF_DIR, f));
  const syms = new Set();
  for (const m of src.matchAll(/export\s+(?:default\s+)?(?:class|const|function)\s+([A-Za-z0-9_]+)/g)) {
    syms.add(m[1]);
  }
  // export { A, B } re-export lists
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (/^[A-Za-z0-9_]+$/.test(name) && name !== 'default') syms.add(name);
    }
  }
  implByFile[f] = [...syms].sort();
  for (const s of syms) {
    if (!symbolToFile[s]) symbolToFile[s] = [];
    symbolToFile[s].push(f);
  }
}

// 2. Symbols referenced by registry.ts (registration positions).
const reg = read(REGISTRY);
const referenced = new Set();
// new X(), createTool(X), safeNew('label', () => new X())
for (const m of reg.matchAll(/\bnew\s+([A-Za-z0-9_]+)\s*\(/g)) referenced.add(m[1]);
for (const m of reg.matchAll(/\bcreateTool\s*\(\s*([A-Za-z0-9_]+)\s*\)/g)) referenced.add(m[1]);
for (const m of reg.matchAll(/\bnew\s+EliteTools\.([A-Za-z0-9_]+)\s*\(/g)) referenced.add('EliteTools.' + m[1]);
// bare identifiers / spreads inside baseTools & revivedTools arrays
const arrayBlobs = [];
for (const m of reg.matchAll(/(?:const\s+(?:revivedTools|baseTools)[^=]*=\s*\[)([\s\S]*?)\n\];/g)) arrayBlobs.push(m[1]);
for (const blob of arrayBlobs) {
  for (const m of blob.matchAll(/^\s*(?:\.\.\.)?([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?)\s*,?\s*(?:\/\/.*)?$/gm)) {
    const tok = m[1];
    if (/^(new|safeNew|createTool|const|return|if|for|function)$/.test(tok)) continue;
    referenced.add(tok);
  }
}
// import bindings (to resolve namespace members like EliteTools.X)
const importBindings = {};
for (const m of reg.matchAll(/import\s*\{([^}]+)\}\s*from\s*'\.\/definitions\/([^']+)'/g)) {
  for (const part of m[1].split(',')) {
    const name = part.trim().split(/\s+as\s+/).pop().trim();
    if (name) importBindings[name] = m[2];
  }
}
for (const m of reg.matchAll(/import\s*\*\s*as\s+([A-Za-z0-9_]+)\s*from\s*'\.\/definitions\/([^']+)'/g)) {
  importBindings[m[1] + '.*'] = m[2];
}

// 3. Classify.
const implSymbols = new Set(Object.keys(symbolToFile));
// A symbol counts as registered if referenced directly, or (namespace member)
// if its namespace file's member is referenced.
const eliteMembers = new Set(
  (implByFile['EliteTools.ts'] || []).map(s => 'EliteTools.' + s)
);
const registered = [];
const implementedNotRegistered = [];
for (const sym of [...implSymbols].sort()) {
  const files = symbolToFile[sym];
  const directRef = referenced.has(sym);
  const nsRef = files.some(f => f === 'EliteTools.ts' && referenced.has('EliteTools.' + sym));
  if (directRef || nsRef) registered.push(sym);
  else implementedNotRegistered.push(sym);
}
// Referenced but no export found (possible missing implementation).
const referencedNotImplemented = [...referenced]
  .filter(r => !r.includes('.') && !implSymbols.has(r) && r !== 'revivedTools' && r !== 'baseTools')
  .sort();
const eliteReferencedMissing = [...referenced]
  .filter(r => r.startsWith('EliteTools.'))
  .filter(r => !eliteMembers.has(r))
  .sort();

// 4. Tool-name level: extract `name = '...'` / `name: '...'` from each definition class.
// A symbol is a TOOL CLASS only if its block declares a tool `name` AND an execute member.
const toolClass = {}; // symbol -> tool name
for (const f of Object.keys(implByFile)) {
  const src = read(path.join(DEF_DIR, f));
  // Split on every top-level declaration so const blocks cannot bleed into
  // following helpers/classes (fixes PROJECT_DIR_NAME_MAX_LENGTH artifact).
  const blocks = src.split(/^(?=export\s+(?:default\s+)?(?:class|const)\s+[A-Za-z0-9_]+|(?:class|function|interface|type|let|var|const)\s+[A-Za-z0-9_]+)/gm);
  for (const b of blocks) {
    const hm = b.match(/^export\s+(?:default\s+)?(?:class|const)\s+([A-Za-z0-9_]+)/);
    if (!hm) continue;
    const nm = b.match(/^[ \t]*(?:readonly\s+)?name\s*[:=]\s*['"]([^'"]+)['"]/m);
    const hasExecute = /^[ \t]*(?:async\s+)?execute\s*\(|execute\s*:\s*(?:async\s*)?\(/m.test(b);
    if (nm && hasExecute) toolClass[hm[1]] = nm[1];
  }
}
// Tool-class-level classification.
const toolSymbols = Object.keys(toolClass);
const toolRegistered = toolSymbols.filter(s => {
  const files = symbolToFile[s] || [];
  return referenced.has(s) || files.some(f => f === 'EliteTools.ts' && referenced.has('EliteTools.' + s));
});
const toolNotRegistered = toolSymbols.filter(s => !toolRegistered.includes(s));
const toolNames = {}; // symbol -> tool name string
for (const f of Object.keys(implByFile)) {
  const src = read(path.join(DEF_DIR, f));
  // split roughly by class/const blocks
  const blocks = src.split(/(?=export\s+(?:default\s+)?(?:class|const)\s+[A-Za-z0-9_]+)/g);
  for (const b of blocks) {
    const hm = b.match(/export\s+(?:default\s+)?(?:class|const)\s+([A-Za-z0-9_]+)/);
    if (!hm) continue;
    const nm = b.match(/(?:readonly\s+)?name\s*[:=]\s*['"]([^'"]+)['"]/);
    if (nm) toolNames[hm[1]] = nm[1];
  }
}

const report = {
  exactSource: 'f40f6100e8083bfefeef54eb7812c3690b068048 (api/src/modules/tools subtree)',
  definitionFiles: Object.keys(implByFile).length,
  exportedSymbols: implSymbols.size,
  registryReferencedIdentifiers: referenced.size,
  implementedAndRegistered: registered.length,
  implementedNotRegistered: implementedNotRegistered.map(s => ({
    symbol: s, files: symbolToFile[s], toolName: toolNames[s] || null,
  })),
  referencedNotImplemented: referencedNotImplemented.filter(r => r !== 'Error' && r !== 'T'),
  eliteReferencedMissing,
  toolClasses: toolSymbols.length,
  toolClassesRegistered: toolRegistered.length,
  toolClassesNotRegistered: toolNotRegistered.map(s => ({
    symbol: s, files: symbolToFile[s], toolName: toolClass[s],
  })),
};
fs.writeFileSync(path.join(__dirname, 'reconcile.json'), JSON.stringify(report, null, 2));

let md = `# IMPLEMENTED-vs-REGISTERED reconciliation — exact f40 bytes\n\n`;
md += `SOURCE=f40f6100e8083bfefeef54eb7812c3690b068048 (api/src/modules/tools subtree, git-archive extracted)\n`;
md += `METHOD=static parse of registry.ts registration positions vs exported symbols in definitions/*.ts\n`;
md += `SCOPE=class/const registration only; alias maps, planner catalogue and executor dispatch are separate layers (not covered here)\n\n`;
md += `DEFINITION_FILES=${report.definitionFiles}\nEXPORTED_SYMBOLS=${report.exportedSymbols}\n`;
md += `REGISTRY_REFERENCED_IDENTIFIERS=${report.registryReferencedIdentifiers}\n`;
md += `IMPLEMENTED_AND_REGISTERED=${report.implementedAndRegistered}\n`;
md += `IMPLEMENTED_NOT_REGISTERED=${report.implementedNotRegistered.length}\n`;
md += `REFERENCED_NOT_IMPLEMENTED=${report.referencedNotImplemented.length}\n\n`;
md += `## IMPLEMENTED_NOT_REGISTERED (exported symbol, no registry reference)\n\n`;
md += `| symbol | file(s) | tool name |\n|---|---|---|\n`;
for (const e of report.implementedNotRegistered) {
  md += `| ${e.symbol} | ${e.files.join(', ')} | ${e.toolName || '?'} |\n`;
}
md += `\n## TOOL-CLASS level (block has tool name + execute member)\n\n`;
md += `TOOL_CLASSES=${report.toolClasses}\nTOOL_CLASSES_REGISTERED=${report.toolClassesRegistered}\n`;
md += `TOOL_CLASSES_NOT_REGISTERED=${report.toolClassesNotRegistered.length}\n\n`;
md += `| symbol | file(s) | tool name |\n|---|---|---|\n`;
for (const e of report.toolClassesNotRegistered) {
  md += `| ${e.symbol} | ${e.files.join(', ')} | ${e.toolName} |\n`;
}
md += `\n## REFERENCED_NOT_IMPLEMENTED (registry references, no export found)\n\n`;
for (const r of report.referencedNotImplemented) md += `- ${r}\n`;
if (!report.referencedNotImplemented.length) md += `(none)\n`;
md += `\n## EliteTools referenced-but-missing\n\n`;
for (const r of report.eliteReferencedMissing) md += `- ${r}\n`;
if (!report.eliteReferencedMissing.length) md += `(none)\n`;
fs.writeFileSync(path.join(__dirname, 'RECONCILE-REPORT.md'), md);
console.log(`files=${report.definitionFiles} exported=${report.exportedSymbols} registered=${report.implementedAndRegistered} notRegistered=${report.implementedNotRegistered.length} refMissing=${report.referencedNotImplemented.length} toolClasses=${report.toolClasses} toolReg=${report.toolClassesRegistered} toolNotReg=${report.toolClassesNotRegistered.length}`);
