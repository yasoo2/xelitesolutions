import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

async function main() {
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const names = (registry.tools as any[]).map((t: any) => String(t.name)).sort();
  console.log('COUNT=' + names.length);
  const re = /delete|deploy|shell_execute|git_ops|browser_run|echo|task_lifecycle|central_answer|project_undo|project_repair|project_run|project_stop|memorize|write_file|file_edit|scaffold|npm_manager|auto_tester|java_builder|read_file|inspect_|grep_search|codebase_navigator|project_detect|analyze_codebase|http_fetch|payments_/;
  for (const n of names) if (re.test(n)) console.log(n);
}
main().catch(e => { console.error('NAMES_FAILED', e); process.exit(1); });
