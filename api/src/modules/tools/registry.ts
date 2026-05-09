
import { ToolDefinition } from './types';
import { BrowserRunTool } from './definitions/BrowserRunTool';
import { MemoryTools } from './definitions/MemoryTool';
import { TerminalManagerTool, SafeReadFileTool, AskUserTool } from './definitions/TaskInteractionTools';

import { VisualQATool } from './definitions/VisualQATool';
import { ImageGenerationTool } from './definitions/ImageGenerationTool';
import { CodebaseNavigatorTool } from './definitions/CodebaseNavigatorTool';
import { ArchitectTool } from './definitions/ArchitectTool';
import { BulkFileGeneratorTool } from './definitions/BulkFileGeneratorTool';
import { CentralAnswerTool } from './definitions/CentralAnswerTool';
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
import { RetryManagerTool } from './definitions/RetryManagerTool';
import { FallbackTool } from './definitions/FallbackTool';
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

export const tools: ToolDefinition[] = [
  new BrowserRunTool(),
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
  new AskUserTool()
].filter(Boolean) as any as ToolDefinition[];
