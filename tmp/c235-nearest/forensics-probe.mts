// C235 follow-up forensics (read-only): candidate lists for null cases +
// exact-name baselines proving the prose-form scope of F-C235-1.
// Same run env as nearest-probe.mts.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const planTools = require('D:/Joe/muse-worktree/api/src/core/orchestrator/plan-tools.ts');
const { resolvePlannedTool } = planTools;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { tools } = require('D:/Joe/muse-worktree/api/src/modules/tools/registry');
const regSet: Set<string> = new Set((tools || []).map((t: any) => String(t.name)));
const norm = (v: any) => String(v || '').trim().toLowerCase();
const key = (v: any) => norm(v).replace(/[_\-\s]+/g, ' ').replace(/[^a-z0-9. /]/g, '').trim();
const snake = (v: any) => norm(v).replace(/[\s\-.]+/g, '_').replace(/[^a-z0-9_]/g, '');
const cands = (p: string) => [...regSet].filter(
  (t) => key(p).includes(t.replace(/_/g, ' ')) || snake(p).includes(t),
);
const out: any = {
  ai_write_file_prose: {
    resolution: resolvePlannedTool('please run ai write file for this'),
    candidates: cands('please run ai write file for this'),
  },
  file_edit_advanced_prose: {
    resolution: resolvePlannedTool('please run file edit advanced for this'),
    candidates: cands('please run file edit advanced for this'),
  },
  exact_baselines: {
    browser_seo_audit: resolvePlannedTool('browser_seo_audit'),
    repo_search: resolvePlannedTool('repo_search'),
    github_actions: resolvePlannedTool('github_actions'),
    ai_write_file: resolvePlannedTool('ai_write_file'),
    browser_ui_audit: resolvePlannedTool('browser_ui_audit'),
  },
};
fs.writeFileSync(
  'D:/Joe/muse-worktree/tmp/c235-nearest/forensics-result.json',
  JSON.stringify(out, null, 1),
);
console.log(JSON.stringify(out, null, 1));
