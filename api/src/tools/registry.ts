
import { ToolDefinition } from './types';
import { BrowserRunTool } from './definitions/BrowserRunTool';
import { MemoryTool } from './definitions/MemoryTool';
import { GenesisAgent } from '../agents/GenesisAgent';
import { GenesisToolDef } from './definitions/GenesisTool';
import { VisualQATool } from './definitions/VisualQATool';
import { ImageGenerationTool } from './definitions/ImageGenerationTool';
import { CodebaseNavigatorTool } from './definitions/CodebaseNavigatorTool';
import { ArchitectTool } from './definitions/ArchitectTool';
import { BulkFileGeneratorTool } from './definitions/BulkFileGeneratorTool';
import { CentralAnswerTool } from './definitions/CentralAnswerTool';
import { RequestAnalyzerTool } from './definitions/RequestAnalyzerTool';
import { ProjectPlannerTool } from './definitions/ProjectPlannerTool';
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
import { RetryManagerTool } from './definitions/RetryManagerTool';
import { FallbackTool } from './definitions/FallbackTool';
import { JavaBuilderTool } from './definitions/JavaBuilderTool';
import { GoBuilderTool } from './definitions/GoBuilderTool';

// New Modular Tools
import { WebPipelineTool, DevServerTool, ScaffoldTool } from './definitions/WebDevelopmentTools';
import { TaskLoopTool } from './definitions/TaskLoopTool';
import { EchoTool, FileEditTool, GrepSearchTool, NpmManagerTool, ScaffoldProjectTool, ShellExecuteTool } from './definitions/SystemTools';
import { AnalyzeProjectTool, AnalyzeCodebaseTool } from './definitions/AnalysisTools';
import { HttpFetchTool, HtmlExtractTool, RssFetchTool, JsonQueryTool } from './definitions/ContentTools';
import { KnowledgeSearchTool, KnowledgeAddTool } from './definitions/KnowledgeTools';
import { GitOpsTool } from './definitions/GitTools';

// --- Phase 11 Enterprise Tools ---
import { TerraformManagerTool, KubernetesOpsTool, DockerSwarmOpsTool } from './definitions/InfrastructureTools';
import { DbSchemaMigratorTool, QueryOptimizerTool, LargeDataSeederTool } from './definitions/DatabaseEnterpriseTools';
import { SonarAnalysisTool, DependencyAuditorTool, LoadTesterTool } from './definitions/QualityTools';
import { CodebaseOutlineTool } from './definitions/CodebaseOutlineTool';
import { SearchApiTool } from './definitions/SearchApiTool';
import { TaskLifecycleTool } from './definitions/TaskLifecycleTool';
import { ShellStatusTool } from './definitions/SystemTools';
import { DirectoryInspectionTool, FileSearchTool, SymbolInspectorTool, AdvancedFileEditTool } from './definitions/UtilityTools';
import { SafeReadFileTool, AskUserTool, TerminalManagerTool } from './definitions/TaskInteractionTools';
import { BrowserVisionTool } from './definitions/BrowserVisionTool';
import { BrowserActionTool } from './definitions/BrowserActionTool';

// import { executeTool } from '../services/ToolService'; // Lazy execution for Genesis (Removed to fix cycle)

// Instantiate all tools
export const tools: ToolDefinition[] = [
  // --- Core Browser & Agent ---
  new BrowserRunTool(),
  VisualQATool,
  MemoryTool,
  ArchitectTool,

  // --- Genesis ---
  {
    ...GenesisToolDef,
    permissions: GenesisToolDef.permissions as any,
    sideEffects: GenesisToolDef.sideEffects as any,
    execute: async (input) => {
      const logs: string[] = [];
      const goal = input.goal;
      logs.push(`🌌 Genesis Activated: "${goal}"`);
      try {
        const genesis = new GenesisAgent();
        const { plan, steps } = await genesis.orchestrate(goal);
        logs.push(`📜 Plan Generated (${plan.length} chars)`);
        // Hand off to TaskLoop via ToolService (Dynamic Import to avoid cycle)
        const { executeTool } = await import('../services/ToolService');
        return executeTool('task_loop', {
          goal: `Genesis Execution: ${goal}`,
          steps: steps,
          maxIterations: 50
        });
      } catch (e: any) {
        return { ok: false, error: `Genesis Failed: ${e.message}`, logs };
      }
    }
  },

  // --- Web Development ---
  new WebPipelineTool(),
  new DevServerTool(),
  new ScaffoldTool(),

  // --- Core System ---
  new ShellExecuteTool(),
  new FileEditTool(),
  new GrepSearchTool(),
  new NpmManagerTool(),
  new ScaffoldProjectTool(),
  new EchoTool(),
  new CentralAnswerTool(),
  new RequestAnalyzerTool(),
  new ProjectPlannerTool(),
  new PhaseExecutorTool(),
  new ProjectStateManagerTool(),
  new AutoTesterTool(),
  new TemplateManagerTool(),
  new CodeReviewerTool(),
  new SecurityScannerTool(),
  new PerformanceAnalyzerTool(),
  new GitHubRepoManagerTool(),
  new GitHubPRTool(),
  new GitHubActionsTool(),
  new CacheManagerTool(),
  new LLMCacheTool(),
  new MonitoringTool(),
  new ErrorRecoveryTool(),
  new PythonBuilderTool(),
  new LoggerTool(),
  new AlertManagerTool(),
  new RetryManagerTool(),
  new FallbackTool(),
  new JavaBuilderTool(),
  new GoBuilderTool(),

  // --- Automation ---
  new TaskLoopTool(),
  BulkFileGeneratorTool,
  CodebaseNavigatorTool as any,

  // --- Analysis ---
  new AnalyzeProjectTool(),
  new AnalyzeCodebaseTool(),

  // --- Content & Network ---
  new HttpFetchTool(),
  new HtmlExtractTool(),
  new RssFetchTool(),
  new JsonQueryTool(),

  // --- Knowledge ---
  new KnowledgeSearchTool(),
  new KnowledgeAddTool(),

  // --- Git ---
  new GitOpsTool(),

  // --- Phase 11: Enterprise Infrastructure ---
  new TerraformManagerTool(),
  new KubernetesOpsTool(),
  new DockerSwarmOpsTool(),

  // --- Phase 11: Enterprise Database ---
  new DbSchemaMigratorTool(),
  new QueryOptimizerTool(),
  new LargeDataSeederTool(),

  // --- Phase 11: Enterprise Quality ---
  new SonarAnalysisTool(),
  new DependencyAuditorTool(),
  new LoadTesterTool(),

  // --- Media ---
  // --- Phase 15: God Mode Tools ---
  new CodebaseOutlineTool(),
  new SearchApiTool(),
  new TaskLifecycleTool(),
  new ShellStatusTool(),
  new DirectoryInspectionTool(),
  new FileSearchTool(),
  new SymbolInspectorTool(),
  new SymbolInspectorTool(),
  new AdvancedFileEditTool(),
  new SafeReadFileTool(),
  new AskUserTool(),
  new TerminalManagerTool(),
  new BrowserVisionTool(),
  new BrowserActionTool(),
];
