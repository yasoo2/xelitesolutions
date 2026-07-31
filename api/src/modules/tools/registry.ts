
import { ToolDefinition } from './types';
import { BrowserRunTool } from './definitions/BrowserRunTool';
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
import { RequestAnalyzerTool } from './definitions/RequestAnalyzerTool';
import { ProjectPlannerTool } from './definitions/ProjectPlannerTool';
import { AIGeneratorTool } from './definitions/AIGeneratorTool';
import { ProgressiveGeneratorTool } from './definitions/ProgressiveGeneratorTool';
import * as EliteTools from './definitions/EliteTools';
import { PhaseExecutorTool } from './definitions/PhaseExecutorTool';
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
import { EchoTool, FileEditTool, ShellExecuteTool, WriteFileTool, ScaffoldProjectTool, LsTool } from './definitions/SystemTools';


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
import { DirectoryInspectionTool, FileSearchTool, SymbolInspectorTool, AdvancedFileEditTool } from './definitions/UtilityTools';
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
  // Was defined and fully implemented but never listed here, so the tool
  // simply did not exist as far as the agent was concerned.
  new EliteTools.AIWriteFileTool(),

  createTool(ProjectPlannerTool),
  createTool(PhaseExecutorTool),
  createTool(CentralAnswerTool),
  createTool(WebPageBuilderTool),
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
  new ScaffoldProjectTool(),
  new LsTool(),
  new TerminalManagerTool(),
  new SafeReadFileTool(),
  new AskUserTool(),

  // Revived tools (defensively instantiated above)
  ...revivedTools
].filter(Boolean) as any as ToolDefinition[];

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
    seen.add(name);
    unique.push(t);
  }
  console.info(`[ToolRegistry] Registered ${unique.length} tools (${revivedTools.filter(Boolean).length} revived).`);
  return unique;
})();
