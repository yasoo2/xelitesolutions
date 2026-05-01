
import { ToolDefinition } from './types';
import { BrowserRunTool } from './definitions/BrowserRunTool';
import { MemoryTools } from './definitions/MemoryTool';

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
import { EchoTool, FileEditTool, ShellExecuteTool, WriteFileTool } from './definitions/SystemTools';


// Self Coding Tools
import {
  RepoReadFileTool,
  RepoSearchTool,
  RepoApplyPatchTool,
  RepoRunCommandTool,
  RepoDiffSummaryTool
} from './definitions/RepoSelfCodingTools';

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

  new ProjectPlannerTool(),
  new PhaseExecutorTool(),
  new AutoTesterTool(),
  new CodeReviewerTool(),
  new SecurityScannerTool(),
  new PerformanceAnalyzerTool(),
  new ErrorRecoveryTool(),

  // fallback minimal set to avoid breaking
  new EchoTool(),
  new FileEditTool(),
  new ShellExecuteTool(),
  new WriteFileTool()
] as any as ToolDefinition[];
