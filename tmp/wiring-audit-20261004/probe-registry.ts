// Wiring reconciliation probe — Muse audit slice 2026-10-04 (HEAD e1b01c16).
// METHOD-COMPATIBLE with c212 probe (tmp/wiring-reconcile-20261003/probe-source.txt):
// same 45-goal corpus, same static-catalogue/alias reconciliation, plus
// per-goal pick recording (c212 follow-up) and definition-file coverage.
// SCOPE: Muse HEAD static L1-L2 only. No provider calls, no servers.
// RUN (from api/): tsx ../tmp/wiring-audit-20261004/probe-registry.ts
// ENV: JWT_SECRET=<random test-only>, TEMP/TMP under workspace.
import { createHash } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const srcRoot = join(repoRoot, 'api', 'src');

const sha256 = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

async function main() {
  const head = execSync('git -c safe.directory=D:/Joe/muse-worktree rev-parse HEAD', { cwd: repoRoot }).toString().trim();

  // ---- LEVEL 1: definition files (static) ----
  const defDir = join(srcRoot, 'modules', 'tools', 'definitions');
  const defFiles = readdirSync(defDir).filter(f => f.endsWith('.ts')).sort();
  const registryPath = join(srcRoot, 'modules', 'tools', 'registry.ts');
  const registrySrc = readFileSync(registryPath, 'utf8');
  const importedDefModules = [...new Set(
    [...registrySrc.matchAll(/from\s+'\.\/definitions\/([^']+)'/g)].map(m => m[1] + '.ts')
  )].sort();
  const defFilesNeverImported = defFiles.filter(f => !importedDefModules.includes(f));

  // ---- LEVEL 2: runtime registry import ----
  const { tools, contractDefaults } = await import('../../api/src/modules/tools/registry');
  const { PLANNER_TOOL_CATALOGUE } = await import('../../api/src/core/orchestrator/plan-tools');
  const { CORE_TOOLS, selectToolsFor } = await import('../../api/src/core/orchestrator/toolCatalog');
  const { TOOL_ALIASES } = await import('../../api/src/modules/services/ToolService');

  const registered: string[] = (tools as any[]).map(t => String(t?.name || '')).filter(Boolean).sort();
  const regSet = new Set(registered);
  const missingName = (tools as any[]).filter(t => !t?.name).length;
  let withExecute = 0, withDescription = 0, withSchema = 0;
  for (const t of tools as any[]) {
    if (typeof t?.execute === 'function') withExecute++;
    if (typeof t?.description === 'string' && t.description.length > 0) withDescription++;
    if (t?.inputSchema && typeof t.inputSchema === 'object') withSchema++;
  }

  // ---- Static catalogue vs registry (c212 method) ----
  const catalogue: Array<{ tool: string; purpose: string }> = PLANNER_TOOL_CATALOGUE || [];
  const aliases: Record<string, string> = TOOL_ALIASES || {};
  const resolveName = (n: string): string => {
    let cur = n;
    const seen = new Set<string>();
    while (aliases[cur] && !seen.has(cur)) { seen.add(cur); cur = aliases[cur]; }
    return cur;
  };
  const catalogueNames = catalogue.map(e => e.tool);
  const dupes = [...new Set(catalogueNames.filter((n, i) => catalogueNames.indexOf(n) !== i))];
  const catalogueUnregistered = catalogueNames.filter(n => !regSet.has(n));
  const catalogueViaAlias = catalogueUnregistered.filter(n => regSet.has(resolveName(n)));
  const catalogueDead = catalogueUnregistered.filter(n => !regSet.has(resolveName(n)));
  const core: string[] = CORE_TOOLS || [];
  const coreDead = core.filter(n => !regSet.has(n) && !regSet.has(resolveName(n)));

  // ---- Retrieved coverage: EXACT c212 45-goal corpus ----
  const CORPUS: string[] = [
    'Translate the website to Arabic', 'ترجم الموقع إلى الإنجليزية',
    'Write tests for the project', 'اكتب اختبارات للمشروع',
    'Deploy the site to production', 'انشر الموقع على الاستضافة',
    'Design the database schema', 'صمم قاعدة البيانات',
    'Audit the UI in a real browser', 'افحص الواجهة في المتصفح',
    'Take a screenshot of the homepage', 'خذ لقطة شاشة للصفحة',
    'Scan the code for security vulnerabilities', 'افحص الثغرات الأمنية',
    'Profile performance and load test', 'اختبر الأداء والضغط',
    'Remember my preferences for later', 'تذكر تفضيلاتي',
    'Commit the changes to git', 'احفظ التغييرات في جيت',
    'Build a docker container for the app', 'ابن حاوية دوكر',
    'What was the last error in the terminal', 'ما آخر خطأ ظهر في الترمنال',
    'Install npm dependencies', 'ثبت الحزم',
    'Write API documentation with swagger', 'اكتب التوثيق',
    'Find and fix broken links', 'أصلح الروابط المكسورة',
    'Generate a PDF report', 'أنشئ تقرير pdf',
    'Summarize this web page', 'لخص محتوى الصفحة',
    'Check responsive layout on mobile', 'افحص الاستجابة على الجوال',
    'Improve SEO meta tags', 'حسن السيو والأرشفة',
    'Set up a CI pipeline', 'أنشئ خط أنابيب CI',
    'Build a mobile app', 'ابن تطبيق جوال',
    'Add checkout payments', 'أضف الدفع والفواتير',
    'Choose local or external provider with least setup', 'اختر المسار الأنسب بأقل إعداد',
    'Send me an email notification', 'أرسل تنبيها بالبريد',
    'Delete the temp files and list the folder', 'احذف الملفات المؤقتة',
    'Search the codebase for the login function', 'ابحث في الكود عن الدخول',
    'Fix the crash and recover', 'أصلح العطل',
    'Analyze sales and produce a report', 'حلل المبيعات وأعط تقريرا',
    'Check color contrast for accessibility', 'افحص التباين والوصول',
    'Review the orders inbox', 'راجع طلبات الزبائن',
    'Generate an image for the hero section', 'أنشئ صورة للواجهة',
    'Run visual QA on the checkout page', 'افحص الصفحة بصريا',
    'Create the video thumbnail', 'أنشئ مقطع فيديو',
  ];
  const surfaced = new Map<string, { goals: number; maxScore: number }>();
  const perGoal: Record<string, Array<{ name: string; score: number }>> = {};
  const perGoalCounts: number[] = [];
  for (const goal of CORPUS) {
    const picked = selectToolsFor(goal, 30) as Array<{ name: string; score: number }>;
    perGoal[goal] = picked.map(s => ({ name: s.name, score: s.score }));
    perGoalCounts.push(picked.length);
    for (const s of picked) {
      const e = surfaced.get(s.name) || { goals: 0, maxScore: 0 };
      e.goals += 1;
      if (s.score > e.maxScore) e.maxScore = s.score;
      surfaced.set(s.name, e);
    }
  }
  const neverSurfaced = registered.filter(n => !surfaced.has(n));

  const out = {
    probe: 'muse-wiring-reconcile-20261004',
    methodCompatibleWith: 'c212 zz-muse-catalogue-reconcile (same 45-goal corpus)',
    head,
    registrySha256: sha256(registryPath),
    planToolsSha256: sha256(join(srcRoot, 'core', 'orchestrator', 'plan-tools.ts')),
    toolCatalogSha256: sha256(join(srcRoot, 'core', 'orchestrator', 'toolCatalog.ts')),
    level1: {
      definitionFiles: defFiles.length,
      registryImportsDefModules: importedDefModules.length,
      defFilesNeverImported,
    },
    level2: {
      registered: registered.length,
      missingNameEntries: missingName,
      namesUnique: new Set(registered).size === registered.length,
      withExecute, withDescription, withSchema,
      defaultedPermissions: (contractDefaults?.permissions || []).length,
      defaultedRateLimit: (contractDefaults?.rateLimit || []).length,
      unknownPermissions: (contractDefaults?.unknown || []).length,
    },
    staticCatalogue: {
      count: catalogue.length,
      dupes,
      unregistered: catalogueUnregistered,
      viaAlias: catalogueViaAlias,
      dead: catalogueDead,
    },
    core: { tools: core, dead: coreDead },
    aliases: { count: Object.keys(aliases).length },
    retrieval45: {
      corpusGoals: CORPUS.length,
      unionCount: surfaced.size,
      perGoalMinMax: [Math.min(...perGoalCounts), Math.max(...perGoalCounts)],
      collapsedGoals: CORPUS.filter(g => (perGoal[g] || []).length <= 9),
      neverSurfaced,
      detail: [...surfaced.entries()].map(([name, e]) => ({ name, goals: e.goals, maxScore: e.maxScore }))
        .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name)),
    },
    registeredNames: registered,
    perGoal,
  };
  // Delimited so stdout logs cannot corrupt the evidence JSON.
  console.log('__EVIDENCE_JSON_BEGIN__');
  console.log(JSON.stringify(out));
  console.log('__EVIDENCE_JSON_END__');
}

main().catch(e => { console.error('PROBE_FAILED', e); process.exit(1); });
