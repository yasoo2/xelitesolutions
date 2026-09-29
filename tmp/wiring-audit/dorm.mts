import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);
async function main() {
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const names = (registry.tools as any[]).map((t: any) => String(t.name)).sort();
  const stems = ['fs_glob', 'check_syntax', 'generate_tests', 'generate_docs', 'db_inspect', 'command_policy_check', 'tool_create_shell', 'shell_status', 'product_search', 'deep_research', 'business_logic', 'chaos', 'cost_estimator', 'self_confidence', 'terraform', 'security_scan', 'search_files', 'search_text', 'github_repo_manager', 'shell_check_status', 'security_scanner', 'inspect_directory', 'read_file'];
  for (const n of names) {
    if (stems.some(s => n.includes(s) || s.includes(n))) console.log(n);
  }
}
main().catch(e => { console.error('DORM_FAILED', e); process.exit(1); });
