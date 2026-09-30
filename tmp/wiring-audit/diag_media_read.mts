// Diagnostic (checkpoint 26): replicate ImageStudioTool.readTables EXACTLY
// against a controlled fixture and observe the subprocess outcome.
// Read-only w.r.t. Joe source; writes only under fx-media-diag.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

async function attempt(tag: string, dir: string, engine: any) {
  const script = path.join(dir, '.joe-read-tables.mjs');
  const out = path.join(os.tmpdir(), `joe-tables-diag-${tag}-${Date.now()}.json`);
  fs.writeFileSync(script, `
import fs from 'node:fs';
import { entities } from './entities.js';
const out = [];
for (const key of Object.keys(entities.tables)) {
  const t = entities.tables[key];
  const fields = (t.entity && t.entity.fields) || [];
  out.push({ key, fields: fields.map(f => f.key), rows: t.list() });
}
fs.writeFileSync(process.argv[2], JSON.stringify(out));
`, 'utf-8');
  const lines: string[] = [];
  try {
    const child = engine.runArgvStreaming(process.execPath, ['.joe-read-tables.mjs', out], {
      cwd: dir, env: { NODE_NO_WARNINGS: '1' },
      onLine: (l: string, s: string) => { lines.push(`[${s}] ${String(l).slice(0, 200)}`); },
    });
    const done = await Promise.race([
      child.done,
      new Promise(r => setTimeout(() => r({ timeout: true } as any), 25000)),
    ]);
    const exists = fs.existsSync(out);
    let content: any = null;
    try { if (exists) content = JSON.parse(fs.readFileSync(out, 'utf-8')); } catch (e: any) { content = `PARSE_ERR:${e.message}`; }
    console.log(JSON.stringify({ tag, dir, done, outExists: exists, content, lines: lines.slice(0, 12) }));
  } catch (e: any) {
    console.log(JSON.stringify({ tag, dir, threw: String(e?.message || e).slice(0, 300) }));
  } finally {
    try { fs.rmSync(script, { force: true }); } catch {}
    try { fs.rmSync(out, { force: true }); } catch {}
  }
}

async function main() {
  const mod: any = await imp(path.join(SRC, 'kernel', 'ExecutionEngine.ts'));
  const engine = mod.executionEngine;
  const base = path.join(HERE, 'fx-media-diag');
  const plain = path.join(base, 'proj');
  fs.mkdirSync(plain, { recursive: true });
  fs.writeFileSync(path.join(plain, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(plain, 'entities.js'),
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
  console.log('tmpdir=' + os.tmpdir());
  console.log('node=' + process.execPath);
  await attempt('plain', plain, engine);
  await attempt('extprefix', '\\\\?\\' + plain, engine);
  fs.rmSync(base, { recursive: true, force: true });
  process.exit(0);
}

main().catch(e => { console.error('DIAG_FATAL', e); process.exit(1); });
