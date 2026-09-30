// Checkpoint-13 fragment: what does EliteTools' getLLM()/callLLM resolve offline?
// Answers whether chaos_test_plan's ok:true+{} comes from the MISMATCH-#9
// resolve-prose path (tool regex drops it) or an actual '{}' model reply.
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const mod: any = await import(pathToFileURL(path.join(ROOT, 'api', 'src', 'core', 'llm.ts')).href);
const fn = mod.callLLM || mod.default?.callLLM;
console.log(JSON.stringify({ hasCallLLM: typeof fn === 'function' }));
if (typeof fn !== 'function') process.exit(1);
const raced: any = await Promise.race([
  fn('Generate Chaos Plan for: two-tier web app WIRING_QA_TOKEN_13d7', [{ role: 'system', content: 'Return JSON scenarios.' }])
    .then((v: any) => ({ settled: 'resolved', type: typeof v, head: String(v).slice(0, 300) })),
  new Promise(res => setTimeout(() => res({ settled: 'timeout_60s' }), 60000)),
]);
console.log(JSON.stringify(raced, null, 1));
console.log(JSON.stringify({
  hasJsonObject: /\{[\s\S]*\}/.test(String((raced as any).head || '')),
  extractedOrEmpty: JSON.parse(String((raced as any).head || '').match(/\{[\s\S]*\}/)?.[0] || '{}'),
}));
process.exit(0);
