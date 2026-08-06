
import { ToolDefinition, ToolPermission } from './types';
import { BrowserRunTool } from './definitions/BrowserRunTool';
import { UiFixTool } from './definitions/UiFixTool';
import { PageFixTool } from './definitions/PageFixTool';
import { BrowserSummarizeTool, BrowserUIAuditTool, BrowserFillFormTool, BrowserCompareTool, BrowserExtractDataTool, BrowserCheckLinksTool, BrowserPerformanceTool, BrowserSEOAuditTool, BrowserConsoleScanTool, BrowserSavePdfTool, BrowserReadabilityTool, BrowserContrastAuditTool, BrowserA11yDeepTool, BrowserExtractMetaTool, BrowserTranslateTool, BrowserResponsiveCheckTool, BrowserFindTextTool, BrowserDesignTokensTool, BrowserClickTool, BrowserFullPageShotTool, BrowserSmartAgentTool, BrowserAutofixTool, BrowserConsentTool, BrowserSearchTool, BrowserOpenTool } from './definitions/BrowserSmartTools';
import { GoogleAccountTool } from './definitions/GoogleAccountTool';
import { UserBrowserTool } from './definitions/UserBrowserTool';
import { MemoryTools } from './definitions/MemoryTool';
import { TerminalManagerTool, SafeReadFileTool, AskUserTool } from './definitions/TaskInteractionTools';

import { VisualQATool } from './definitions/VisualQATool';
import { ImageGenerationTool } from './definitions/ImageGenerationTool';
import { CodebaseNavigatorTool } from './definitions/CodebaseNavigatorTool';
import { ArchitectTool } from './definitions/ArchitectTool';
import { BulkFileGeneratorTool } from './definitions/BulkFileGeneratorTool';
import { CentralAnswerTool } from './definitions/CentralAnswerTool';
import { WebPageBuilderTool } from './definitions/WebPageBuilderTool';
import { ReactProjectTool } from './definitions/ReactProjectTool';
import { ProjectEditTool } from './definitions/ProjectEditTool';
import { FormInboxTool } from './definitions/FormInboxTool';
import { ImportProjectTool } from './definitions/ImportProjectTool';
import { ApiProjectTool } from './definitions/ApiProjectTool';
import { OrdersReadTool } from './definitions/OrdersReadTool';
import { BusinessProfileTool } from './definitions/BusinessProfileTool';
import { RequestAnalyzerTool } from './definitions/RequestAnalyzerTool';
import { ProjectPlannerTool } from './definitions/ProjectPlannerTool';
import { AIGeneratorTool } from './definitions/AIGeneratorTool';
import { ProgressiveGeneratorTool } from './definitions/ProgressiveGeneratorTool';
import * as EliteTools from './definitions/EliteTools';
import { PhaseExecutorTool } from './definitions/PhaseExecutorTool';
import { ProjectPipelineTool } from './definitions/ProjectPipelineTool';
import { ProjectRunTool, ProjectStopTool } from './definitions/ProjectRunTool';
import { DeployPagesTool } from './definitions/DeployPagesTool';
import { ProjectStateManagerTool } from './definitions/ProjectStateManagerTool';
import { AutoTesterTool } from './definitions/AutoTesterTool';
import { TemplateManagerTool } from './definitions/TemplateManagerTool';
import { CodeReviewerTool } from './definitions/CodeReviewerTool';
import { SecurityScannerTool } from './definitions/SecurityScannerTool';
import { PerformanceAnalyzerTool } from './definitions/PerformanceAnalyzerTool';
import { GitHubRepoManagerTool } from './definitions/GitHubRepoManagerTool';
import { GitHubPRTool } from './definitions/GitHubPRTool';
import { GitHubActionsTool } from './definitions/GitHubActionsTool';
import { CacheManagerTool } from './definitions/CacheManagerTool';
import { LLMCacheTool } from './definitions/LLMCacheTool';
import { MonitoringTool } from './definitions/MonitoringTool';
import { ErrorRecoveryTool } from './definitions/ErrorRecoveryTool';
import { PythonBuilderTool } from './definitions/PythonBuilderTool';
import { LoggerTool } from './definitions/LoggerTool';
import { AlertManagerTool } from './definitions/AlertManagerTool';
import { JavaBuilderTool } from './definitions/JavaBuilderTool';
import { GoBuilderTool } from './definitions/GoBuilderTool';
import { JoeEngineeringReportTool } from './definitions/JoeEngineeringReportTool';
import { EchoTool, FileEditTool, ShellExecuteTool, WriteFileTool, ScaffoldProjectTool, LsTool, NpmManagerTool, ShellStatusTool,
  DeleteFileTool
} from './definitions/SystemTools';


// Self Coding Tools
import {
  RepoReadFileTool,
  RepoSearchTool,
  RepoApplyPatchTool,
  RepoRunCommandTool,
  RepoDiffSummaryTool
} from './definitions/RepoSelfCodingTools';

// ===== REVIVED TOOLS (previously defined but never registered) =====
import { AnalyzeProjectTool, AnalyzeCodebaseTool, ProjectDetectTool } from './definitions/AnalysisTools';
import { ApiTesterTool } from './definitions/ApiTesterTool';
import { AuthBuilderTool } from './definitions/AuthBuilderTool';
import { BrowserActionTool } from './definitions/BrowserActionTool';
import { BrowserVisionTool } from './definitions/BrowserVisionTool';
import { CodebaseOutlineTool } from './definitions/CodebaseOutlineTool';
import { HttpFetchTool, HtmlExtractTool, RssFetchTool, JsonQueryTool } from './definitions/ContentTools';
import { DbSchemaMigratorTool, QueryOptimizerTool, LargeDataSeederTool } from './definitions/DatabaseEnterpriseTools';
import { DatasourceTool } from './definitions/DatasourceTool';
import { DeadCodeTool } from './definitions/DeadCodeTool';
import { DockerManagerTool } from './definitions/DockerManagerTool';
import { GitOpsTool } from './definitions/GitTools';
import { I18nTranslatorTool } from './definitions/I18nTranslatorTool';
import { KnowledgeSearchTool, KnowledgeAddTool } from './definitions/KnowledgeTools';
import { MobileBuilderTool } from './definitions/MobileBuilderTool';
import { NotifyUserTool } from './definitions/NotifyUserTool';
import { PaymentsTool } from './definitions/PaymentsTool';
import { SonarAnalysisTool, DependencyAuditTool, QualityRunTool, SecretsScanRepoTool, CiGeneratePipelineTool, LoadTesterTool } from './definitions/QualityTools';
import { ScreenshotTool, VisualComparisonTool } from './definitions/ScreenshotTool';
import { SearchApiTool } from './definitions/SearchApiTool';
import { SwaggerDocsTool } from './definitions/SwaggerDocsTool';
import { TaskLifecycleTool } from './definitions/TaskLifecycleTool';
import { TaskLoopTool } from './definitions/TaskLoopTool';
import { TodoWriteTool } from './definitions/TodoWriteTool';
import { DirectoryInspectionTool, FileSearchTool, SearchTextTool, SymbolInspectorTool, AdvancedFileEditTool } from './definitions/UtilityTools';
import { VideoActionTool } from './definitions/VideoActionTool';
import { ArchiveFilesTool } from './definitions/ArchiveFilesTool';
import { DeployProjectTool } from './definitions/DeployProjectTool';
import { TerraformManagerTool, KubernetesOpsTool, DockerSwarmOpsTool } from './definitions/InfrastructureTools';
import { PythonExecutionTool } from './definitions/PythonExecutionTool';
import { WebPipelineTool, DevServerTool, ScaffoldTool } from './definitions/WebDevelopmentTools';
import { PatternRecognitionTool, AutoRefactorTool, TestGeneratorTool, PerformanceProfilerTool, DocumentationGeneratorTool } from './definitions/AdvancedTools';

function createTool(T: any): ToolDefinition {
  if (typeof T === 'function') {
    try { return new T(); } catch { }
  }
  if (T && typeof T.ProjectPlannerTool === 'function') return new T.ProjectPlannerTool();
  if (T && typeof T.AIGeneratorTool === 'function') return new T.AIGeneratorTool();
  if (T && typeof T.ProgressiveGeneratorTool === 'function') return new T.ProgressiveGeneratorTool();
  if (T && typeof T.PhaseExecutorTool === 'function') return new T.PhaseExecutorTool();
  if (T && typeof T.AutoTesterTool === 'function') return new T.AutoTesterTool();
  // Fallback for others
  if (T && T.default && typeof T.default === 'function') return new T.default();
  return T;
}

// Safely instantiate a revived tool; a single broken tool must never take down
// the whole registry (engineering-grade resilience).
function safeNew(label: string, factory: () => any): ToolDefinition | null {
  try {
    const t = factory();
    return t || null;
  } catch (e: any) {
    console.warn(`[ToolRegistry] Skipping revived tool "${label}": ${e?.message || e}`);
    return null;
  }
}

// Revived tools: previously defined in definitions/ but never wired into the
// registry. Each is instantiated defensively.
const revivedTools: (ToolDefinition | null)[] = [
  // Analysis & navigation
  safeNew('analyze_project', () => new AnalyzeProjectTool()),
  safeNew('analyze_codebase', () => new AnalyzeCodebaseTool()),
  safeNew('project_detect', () => new ProjectDetectTool()),
  safeNew('codebase_outline', () => new CodebaseOutlineTool()),
  safeNew('dead_code_detector', () => new DeadCodeTool()),
  // API & content
  safeNew('api_tester', () => new ApiTesterTool()),
  safeNew('http_fetch', () => new HttpFetchTool()),
  safeNew('html_extract', () => new HtmlExtractTool()),
  safeNew('rss_fetch', () => new RssFetchTool()),
  safeNew('json_query', () => new JsonQueryTool()),
  safeNew('search_api', () => new SearchApiTool()),
  safeNew('query_datasource', () => new DatasourceTool()),
  // Builders & scaffolding
  safeNew('auth_builder', () => new AuthBuilderTool()),
  safeNew('mobile_builder', () => new MobileBuilderTool()),
  safeNew('swagger_docs', () => new SwaggerDocsTool()),
  safeNew('i18n_translator', () => new I18nTranslatorTool()),
  safeNew('web_pipeline', () => new WebPipelineTool()),
  safeNew('dev_server', () => new DevServerTool()),
  safeNew('scaffold_full_stack', () => new ScaffoldTool()),
  // Browser & media
  safeNew('browser_action', () => new BrowserActionTool()),
  safeNew('browser_vision', () => new BrowserVisionTool()),
  safeNew('screenshot', () => new ScreenshotTool()),
  safeNew('visual_compare', () => new VisualComparisonTool()),
  safeNew('video_action', () => new VideoActionTool()),
  // Database
  safeNew('db_schema_migrator', () => new DbSchemaMigratorTool()),
  safeNew('query_optimizer', () => new QueryOptimizerTool()),
  safeNew('large_data_seeder', () => new LargeDataSeederTool()),
  // Infrastructure & ops
  safeNew('docker_manager', () => new DockerManagerTool()),
  safeNew('terraform_manager', () => new TerraformManagerTool()),
  safeNew('kubernetes_ops', () => new KubernetesOpsTool()),
  safeNew('docker_swarm_ops', () => new DockerSwarmOpsTool()),
  safeNew('git_ops', () => new GitOpsTool()),
  // GitHub: these three were imported at the top of this file but NEVER
  // registered, so every call to them died with "unknown_tool" — dead code
  // pretending to be a capability. github_repo_manager is what the repo-analysis
  // fast-path routes to.
  safeNew('github_repo_manager', () => new GitHubRepoManagerTool()),
  safeNew('github_pr', () => new GitHubPRTool()),
  safeNew('github_actions', () => new GitHubActionsTool()),
  // Same story: imported here, never registered, therefore unreachable. Each was
  // verified to instantiate and expose a real execute() before being wired in.
  safeNew('alert_manager', () => new AlertManagerTool()),
  safeNew('cache_manager', () => new CacheManagerTool()),
  safeNew('go_builder', () => new GoBuilderTool()),
  safeNew('java_builder', () => new JavaBuilderTool()),
  safeNew('llm_cache', () => new LLMCacheTool()),
  safeNew('logger', () => new LoggerTool()),
  safeNew('monitoring', () => new MonitoringTool()),
  safeNew('project_state_manager', () => new ProjectStateManagerTool()),
  safeNew('python_builder', () => new PythonBuilderTool()),
  safeNew('request_analyzer', () => new RequestAnalyzerTool()),
  safeNew('template_manager', () => new TemplateManagerTool()),
  safeNew('deploy_project', () => new DeployProjectTool()),
  safeNew('archive_files', () => new ArchiveFilesTool()),
  safeNew('execute_python', () => new PythonExecutionTool()),
  // Quality & analysis
  safeNew('sonar_analysis', () => new SonarAnalysisTool()),
  safeNew('dependency_audit', () => new DependencyAuditTool()),
  safeNew('quality_run', () => new QualityRunTool()),
  safeNew('secrets_scan_repo', () => new SecretsScanRepoTool()),
  safeNew('ci_generate_pipeline', () => new CiGeneratePipelineTool()),
  safeNew('load_tester', () => new LoadTesterTool()),
  safeNew('pattern_recognize', () => new PatternRecognitionTool()),
  safeNew('auto_refactor', () => new AutoRefactorTool()),
  safeNew('test_generator', () => new TestGeneratorTool()),
  safeNew('performance_profiler', () => new PerformanceProfilerTool()),
  safeNew('documentation_generator', () => new DocumentationGeneratorTool()),
  // Knowledge, tasks & utilities
  safeNew('knowledge_search', () => new KnowledgeSearchTool()),
  safeNew('knowledge_add', () => new KnowledgeAddTool()),
  safeNew('task_lifecycle', () => new TaskLifecycleTool()),
  safeNew('task_loop', () => new TaskLoopTool()),
  safeNew('inspect_directory', () => new DirectoryInspectionTool()),
  safeNew('search_files', () => new FileSearchTool()),
  // Content search — «grep» and its five synonyms resolve HERE now.
  safeNew('search_text', () => new SearchTextTool()),
  safeNew('inspect_symbol', () => new SymbolInspectorTool()),
  safeNew('file_edit_advanced', () => new AdvancedFileEditTool()),
  safeNew('notify_user', () => new NotifyUserTool()),
  safeNew('payments_create_checkout_session', () => new PaymentsTool()),
  TodoWriteTool, // already a ToolDefinition object
];

const baseTools: ToolDefinition[] = [
  new BrowserRunTool(),
  new BrowserSummarizeTool(),
  new BrowserUIAuditTool(),
  // …and the one that MENDS what that audit finds.
  new UiFixTool(),
  // …and the same repair for a page Joe does NOT own: a live CSS patch.
  new PageFixTool(),
  new BrowserFillFormTool(),
  new BrowserCompareTool(),
  new BrowserExtractDataTool(),
  new BrowserCheckLinksTool(),
  new BrowserPerformanceTool(),
  new BrowserSEOAuditTool(),
  new BrowserConsoleScanTool(),
  new BrowserSavePdfTool(),
  new BrowserReadabilityTool(),
  new BrowserContrastAuditTool(),
  new BrowserA11yDeepTool(),
  new BrowserExtractMetaTool(),
  new BrowserTranslateTool(),
  new BrowserResponsiveCheckTool(),
  new BrowserFindTextTool(),
  new BrowserDesignTokensTool(),
  new BrowserClickTool(),
  new BrowserFullPageShotTool(),
  new BrowserSmartAgentTool(),
  new BrowserAutofixTool(),
  new BrowserConsentTool(),
  new BrowserSearchTool(),
  new BrowserOpenTool(),
  new GoogleAccountTool(),
  new UserBrowserTool(),
  ...MemoryTools,

  // SELF CODING CORE
  new RepoReadFileTool(),
  new RepoSearchTool(),
  new RepoApplyPatchTool(),
  new RepoRunCommandTool(),
  new RepoDiffSummaryTool(),

  ArchitectTool,

  createTool(AIGeneratorTool),
  createTool(ProgressiveGeneratorTool),
  
  // ELITE TOOLS
  new EliteTools.DependencyGraphTool(),
  new EliteTools.BusinessLogicTool(),
  new EliteTools.ChaosTestingTool(),
  new EliteTools.ComplianceValidatorTool(),
  new EliteTools.CostEstimatorTool(),
  new EliteTools.AmbiguityResolverTool(),
  new EliteTools.MultiAgentDebateTool(),
  new EliteTools.SelfConfidenceTool(),

  createTool(ProjectPlannerTool),
  createTool(PhaseExecutorTool),
  createTool(ProjectPipelineTool),
  createTool(ProjectRunTool),
  createTool(ProjectStopTool),
  createTool(DeployPagesTool),
  createTool(CentralAnswerTool),
  createTool(WebPageBuilderTool),
  createTool(ReactProjectTool),
  createTool(ProjectEditTool),
  createTool(FormInboxTool),
  createTool(ImportProjectTool),
  createTool(ApiProjectTool),
  createTool(OrdersReadTool),
  createTool(BusinessProfileTool),
  createTool(AutoTesterTool),
  createTool(CodeReviewerTool),
  createTool(SecurityScannerTool),
  createTool(PerformanceAnalyzerTool),
  createTool(ErrorRecoveryTool),
  createTool(JoeEngineeringReportTool),

  // fallback minimal set to avoid breaking
  new EchoTool(),
  new FileEditTool(),
  new ShellExecuteTool(),
  new WriteFileTool(),
  new DeleteFileTool(),
  new ScaffoldProjectTool(),
  new LsTool(),
  // [AUDIT] npm_manager and shell_check_status were DEFINED for months and
  // never registered — npm_manager is a name the frontend watches to open
  // the terminal, and the WHOLE npm_install/npm_build/npm_run alias family
  // resolves to it: written, wired in the UI, aliased to — and unreachable.
  // (grep_search stays UNregistered on purpose: ToolService deliberately
  // redirects that name to search_files — a field-proven fix an existing
  // lock test protects against shadowing.)
  new NpmManagerTool(),
  new ShellStatusTool(),
  new TerminalManagerTool(),
  new SafeReadFileTool(),
  new AskUserTool(),

  // Revived tools (defensively instantiated above)
  ...revivedTools
].filter(Boolean) as any as ToolDefinition[];

/* ============================================================
   THE CONTRACT IS ENFORCED HERE, NOT HOPED FOR.
   ============================================================
   A full-registry sweep found 51 tools declaring `permissions = []` — a
   copy-pasted placeholder that had spread across whole files. It is not a
   cosmetic gap: ToolService computes

       needsWorkspace = perms.length > 0 || effects.length > 0
       needsUser      = perms.length > 0 || effects.length > 0

   so a tool with an empty permission list skips the workspace check AND the
   user check entirely. Every browser tool, the page builder and the form inbox
   were running unattributed — invisible today because this machine runs with
   ENABLE_AUTH_BYPASS, and a real hole the moment Joe serves anyone else.

   The same sweep found 29 tools with `rateLimitPerMinute = 0`, which the
   limiter reads as «no limit at all».

   Each of those has been declared properly at its source. This pass is the
   guarantee that the next one cannot slip through quietly: an under-declared
   tool is given a conservative default and NAMED in the log, so the fix is a
   line of output away instead of a security review away.
   ============================================================ */
const PERMISSION_HINTS: Array<[RegExp, ToolPermission[]]> = [
  [/^browser_|^user_browser$|^google_account$|search|crawl|fetch|http|download/i, ['internet']],
  [/write|edit|delete|deploy|publish|scaffold|builder|install|manager|state/i, ['write']],
  [/./, ['read']],
];
const VALID_PERMISSIONS = new Set<ToolPermission>(['read', 'write', 'deploy', 'delete', 'execute', 'internet']);
const DEFAULT_RATE_LIMIT = 30;

/** Names of tools this pass had to repair — reported once, not once each. */
export const contractDefaults: { permissions: string[]; rateLimit: string[]; unknown: string[] } =
  { permissions: [], rateLimit: [], unknown: [] };

function enforceContract(t: any): void {
  const perms: any[] = Array.isArray(t.permissions) ? t.permissions : [];
  const bad = perms.filter(p => !VALID_PERMISSIONS.has(p));
  if (bad.length) {
    contractDefaults.unknown.push(`${t.name}:${bad.join('/')}`);
    t.permissions = perms.filter(p => VALID_PERMISSIONS.has(p));
  }
  if (!Array.isArray(t.permissions) || t.permissions.length === 0) {
    const guess = (PERMISSION_HINTS.find(([re]) => re.test(String(t.name))) || [null, ['read']])[1] as ToolPermission[];
    t.permissions = [...guess];
    contractDefaults.permissions.push(`${t.name}→${guess.join('/')}`);
  }
  if (!Array.isArray(t.sideEffects)) t.sideEffects = [];
  t.sideEffects = t.sideEffects.filter((p: any) => VALID_PERMISSIONS.has(p));
  if (typeof t.rateLimitPerMinute !== 'number' || t.rateLimitPerMinute <= 0) {
    contractDefaults.rateLimit.push(String(t.name));
    t.rateLimitPerMinute = DEFAULT_RATE_LIMIT;
  }
}

// De-duplicate by tool name (keep first occurrence) so the registry stays
// consistent even if a name is ever registered twice.
export const tools: ToolDefinition[] = (() => {
  const seen = new Set<string>();
  const unique: ToolDefinition[] = [];
  for (const t of baseTools) {
    const name = (t as any)?.name;
    if (!name) continue;
    if (seen.has(name)) {
      console.warn(`[ToolRegistry] Duplicate tool name skipped: ${name}`);
      continue;
    }
    enforceContract(t as any);
    seen.add(name);
    unique.push(t);
  }
  console.info(`[ToolRegistry] Registered ${unique.length} tools (${revivedTools.filter(Boolean).length} revived).`);
  // One line, not one per tool — a log he cannot read is a log he will not read.
  if (contractDefaults.unknown.length) console.warn(`[ToolRegistry] dropped unknown permissions: ${contractDefaults.unknown.join(', ')}`);
  if (contractDefaults.permissions.length) {
    console.warn(`[ToolRegistry] ${contractDefaults.permissions.length} tool(s) declared no permissions — defaulted: ${contractDefaults.permissions.join(', ')}`);
  }
  if (contractDefaults.rateLimit.length) {
    console.warn(`[ToolRegistry] ${contractDefaults.rateLimit.length} tool(s) had no rate limit — set to ${DEFAULT_RATE_LIMIT}/min: ${contractDefaults.rateLimit.join(', ')}`);
  }
  return unique;
})();
