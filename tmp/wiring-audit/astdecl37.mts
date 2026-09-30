// astdecl37.mts — Checkpoint 37: AST-filtered declared-tool enumeration (READ-ONLY).
// Scans api/src/modules/tools/definitions/*.ts in BOTH trees (Muse + main/NVIDIA read-only).
// Buckets per file:
//   A. tool classes: class X extends BaseTool OR implements ToolDefinition, with literal `name`
//   B. object tools: object literals with literal `name:` inside exported const arrays
//   C. dynamic-name tool classes: tool-heritage classes WITHOUT a literal name
//   D. other literal name fields: literal name fields NOT in A/B (regex false-positive sources)
// No source edits, no registry boot, no network. Deterministic sorted output.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ts = require('../../api/node_modules/typescript');

const TREES: Record<string, string> = {
  MUSE: 'D:/Joe/muse-worktree/api/src/modules/tools/definitions',
  MAIN: 'D:/Joe/xelitesolutions/api/src/modules/tools/definitions',
};

interface FileResult {
  file: string;
  toolClasses: Array<{ cls: string; name: string }>;
  objectTools: string[];
  dynamicNameClasses: string[];
  otherNameFields: number;
  otherNameValues: string[];
}

function getLiteralName(members: ts.NodeArray<ts.ClassElement> | ts.NodeArray<ts.ObjectLiteralElement>): string | null {
  for (const m of members) {
    if ((ts.isPropertyDeclaration(m) || ts.isPropertyAssignment(m)) && m.name && ts.isIdentifier(m.name) && m.name.text === 'name') {
      const init = (m as any).initializer;
      if (init && ts.isStringLiteral(init)) return init.text;
    }
  }
  return null;
}

function extendsName(node: ts.ClassDeclaration): string | null {
  for (const h of node.heritageClauses ?? []) {
    if (h.token === ts.SyntaxKind.ExtendsKeyword) {
      for (const t of h.types) return t.expression.getText();
    }
  }
  return null;
}
function implementsToolDef(node: ts.ClassDeclaration): boolean {
  for (const h of node.heritageClauses ?? []) {
    if (h.token === ts.SyntaxKind.ImplementsKeyword) {
      for (const t of h.types) if (t.expression.getText() === 'ToolDefinition') return true;
    }
  }
  return false;
}
// A class is a tool class if it extends BaseTool, implements ToolDefinition,
// or extends (transitively, within the same file) a tool class. This catches
// concrete subclasses of abstract intermediate bases (e.g. ApiDiscoveryTool).
function markToolClasses(classes: ts.ClassDeclaration[]): Set<ts.ClassDeclaration> {
  const marked = new Set<ts.ClassDeclaration>();
  const byName = new Map<string, ts.ClassDeclaration>();
  for (const c of classes) if (c.name) byName.set(c.name.text, c);
  for (const c of classes) {
    if (extendsName(c) === 'BaseTool' || implementsToolDef(c)) marked.add(c);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of classes) {
      if (marked.has(c)) continue;
      const ext = extendsName(c);
      if (ext && byName.has(ext) && marked.has(byName.get(ext)!)) { marked.add(c); changed = true; }
    }
  }
  return marked;
}

function scanFile(full: string, file: string): FileResult {
  const src = ts.createSourceFile(file, fs.readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true);
  const r: FileResult = { file, toolClasses: [], objectTools: [], dynamicNameClasses: [], otherNameFields: 0, otherNameValues: [] };
  const counted = new Set<ts.Node>();
  const allClasses: ts.ClassDeclaration[] = [];
  (function collect(node: ts.Node) {
    if (ts.isClassDeclaration(node)) allClasses.push(node);
    ts.forEachChild(node, collect);
  })(src);
  const toolSet = markToolClasses(allClasses);
  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node) && node.name) {
      const lit = getLiteralName(node.members);
      if (toolSet.has(node)) {
        if (lit) r.toolClasses.push({ cls: node.name.text, name: lit });
        else r.dynamicNameClasses.push(node.name.text);
        counted.add(node);
      }
    }
    if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.initializer) {
      // exported const objects/arrays of object literals, e.g.:
      //   export const X: ToolDefinition = { name: '...' }   (B2: top-level object)
      //   export const Xs: ToolDefinition[] = [{ name... }]  (B1: array elements)
      const stmt = node.parent?.parent;
      const exported = stmt && ts.isVariableStatement(stmt)
        && stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
      let init: ts.Expression = node.initializer;
      while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init)
        || ts.isSatisfiesExpression(init) || ts.isNonNullExpression(init)) init = init.expression;
      if (exported && ts.isObjectLiteralExpression(init)) {
        const lit = getLiteralName(init.properties);
        if (lit) { r.objectTools.push(lit); counted.add(init); }
      }
      if (exported && ts.isArrayLiteralExpression(init)) {
        for (const raw of init.elements) {
          let el: ts.Expression = raw as ts.Expression;
          while (ts.isAsExpression(el) || ts.isParenthesizedExpression(el)
            || ts.isSatisfiesExpression(el) || ts.isNonNullExpression(el)) el = el.expression;
          if (ts.isObjectLiteralExpression(el)) {
            const lit = getLiteralName(el.properties);
            if (lit) { r.objectTools.push(lit); counted.add(el); }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(src);
  // Second pass: literal `name` fields that are NOT a tool declaration's own
  // name member. Suppress ONLY direct members of counted classes/objects
  // (node.parent === counted node); nested occurrences inside a tool class
  // (viewport presets, template entries) are still non-tool names.
  function visit2(node: ts.Node) {
    if ((ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node)) && node.name
        && ts.isIdentifier(node.name) && node.name.text === 'name') {
      const init = (node as any).initializer;
      if (init && ts.isStringLiteral(init)) {
        if (!counted.has(node.parent as ts.Node)) { r.otherNameFields++; r.otherNameValues.push(init.text); }
      }
    }
    ts.forEachChild(node, visit2);
  }
  visit2(src);
  r.toolClasses.sort((a, b) => a.name.localeCompare(b.name));
  r.objectTools.sort();
  r.dynamicNameClasses.sort();
  r.otherNameValues.sort();
  return r;
}

const out: any = { probe: 'astdecl37', trees: {} };
for (const [label, dir] of Object.entries(TREES)) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts')).sort();
  const results = files.map(f => scanFile(path.join(dir, f), f));
  const names = new Set<string>();
  for (const fr of results) {
    for (const c of fr.toolClasses) names.add(c.name);
    for (const n of fr.objectTools) names.add(n);
  }
  // duplicates: same name from 2+ (file,class) sites
  const sites = new Map<string, string[]>();
  for (const fr of results) {
    for (const c of fr.toolClasses) {
      const k = c.name; if (!sites.has(k)) sites.set(k, []);
      sites.get(k)!.push(`${fr.file}::${c.cls}`);
    }
    for (const n of fr.objectTools) {
      if (!sites.has(n)) sites.set(n, []);
      sites.get(n)!.push(`${fr.file}::(object)`);
    }
  }
  const dupes = [...sites.entries()].filter(([, v]) => v.length > 1)
    .map(([k, v]) => ({ name: k, sites: v.sort() })).sort((a, b) => a.name.localeCompare(b.name));
  out.trees[label] = {
    filesScanned: files.length,
    filesWithToolDecls: results.filter(r => r.toolClasses.length + r.objectTools.length > 0).length,
    toolClassCount: results.reduce((s, r) => s + r.toolClasses.length, 0),
    objectToolCount: results.reduce((s, r) => s + r.objectTools.length, 0),
    distinctDeclaredNames: names.size,
    dynamicNameClasses: results.flatMap(r => r.dynamicNameClasses.map(c => `${r.file}::${c}`)),
    otherNameFields: results.reduce((s, r) => s + r.otherNameFields, 0),
    otherNameDistinct: [...new Set(results.flatMap(r => r.otherNameValues))].sort(),
    duplicateNames: dupes,
    files: results.filter(r => r.toolClasses.length + r.objectTools.length + r.dynamicNameClasses.length + r.otherNameFields > 0),
  };
}
const json = JSON.stringify(out, null, 1) + '\n';
const tag = process.argv[2] || 'runA';
const fxDir = 'D:/Joe/muse-worktree/tmp/wiring-audit/fx-astdecl37';
fs.mkdirSync(fxDir, { recursive: true });
fs.writeFileSync(path.join(fxDir, `astdecl37_${tag}.json`), json);
const sha = crypto.createHash('sha256').update(json).digest('hex');
fs.writeFileSync(path.join(fxDir, `astdecl37_${tag}.log`),
  `tag=${tag}\nsha256=${sha}\nMUSE_distinct=${out.trees.MUSE.distinctDeclaredNames} MAIN_distinct=${out.trees.MAIN.distinctDeclaredNames}\n`);
console.log(`tag=${tag} sha256=${sha}`);
console.log(`MUSE distinct=${out.trees.MUSE.distinctDeclaredNames} classes=${out.trees.MUSE.toolClassCount} objects=${out.trees.MUSE.objectToolCount} other=${out.trees.MUSE.otherNameFields}`);
console.log(`MAIN distinct=${out.trees.MAIN.distinctDeclaredNames} classes=${out.trees.MAIN.toolClassCount} objects=${out.trees.MAIN.objectToolCount} other=${out.trees.MAIN.otherNameFields}`);
