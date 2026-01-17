
import { ToolDefinition, ToolExecutionResult } from './types';
import { BrowserRunTool } from './definitions/BrowserRunTool';
import { MemoryTool } from './definitions/MemoryTool';
import { GenesisAgent } from '../agents/GenesisAgent';
import { GenesisToolDef } from './definitions/GenesisTool'; // Keep this wrapper or extract? Wrapper is fine.
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

// New Modular Tools
import { WebPipelineTool, DevServerTool, ScaffoldTool } from './definitions/WebDevelopmentTools';
import { TaskLoopTool } from './definitions/TaskLoopTool';
import { EchoTool, FileEditTool, GrepSearchTool, NpmManagerTool, ScaffoldProjectTool, ShellExecuteTool } from './definitions/SystemTools';
import { AnalyzeProjectTool, AnalyzeCodebaseTool } from './definitions/AnalysisTools';
import { HttpFetchTool, HtmlExtractTool, RssFetchTool, JsonQueryTool } from './definitions/ContentTools';
import { KnowledgeSearchTool, KnowledgeAddTool } from './definitions/KnowledgeTools';
import { GitOpsTool, GitHubRepoCreateTool } from './definitions/GitTools';

// Rate Limiting Logic (Preserved)
const toolRateBuckets = new Map<string, { minute: number; count: number }>();

export function rateLimitBucketKey(name: string, input: any) {
  if (name === 'browser_run' || name === 'browser_open' || name === 'visual_qa') {
    return `${name}:${input?.sessionId || 'global'}`;
  }
  return name; // simplistic bucket
}

export function checkToolRateLimit(bucketKey: string, limitPerMinute: number): { allowed: boolean; retryAfterMs?: number } {
  if (!limitPerMinute || limitPerMinute <= 0) return { allowed: true };
  const now = Date.now();
  const minute = Math.floor(now / 60000);
  const bucket = toolRateBuckets.get(bucketKey);

  if (bucket && bucket.minute === minute) {
    if (bucket.count >= limitPerMinute) {
      return { allowed: false, retryAfterMs: (minute + 1) * 60000 - now };
    }
    bucket.count++;
  } else {
    toolRateBuckets.set(bucketKey, { minute, count: 1 });
  }
  return { allowed: true };
}

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
      // Re-implement Genesis wrapper logic here briefly or import? 
      // The wrapper needs `executeTool` which is recursive.
      // To allow circular dependency (Genesis uses executeTool which uses tools), we can trust the import.
      // But GenesisAgent is imported.
      const logs: string[] = [];
      const goal = input.goal;
      logs.push(`🌌 Genesis Activated: "${goal}"`);
      try {
        const genesis = new GenesisAgent();
        const { plan, steps } = await genesis.orchestrate(goal);
        logs.push(`📜 Plan Generated (${plan.length} chars)`);
        // Hand off to TaskLoop
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

  // --- Automation ---
  new TaskLoopTool(),
  BulkFileGeneratorTool,
  CodebaseNavigatorTool as any, // Cast due to internal definition mismatch if needed

  // --- Analysis ---
  new AnalyzeProjectTool(),
  new AnalyzeCodebaseTool(),

  // --- Content & Network ---
  new HttpFetchTool(),
  new HtmlExtractTool(),
  new RssFetchTool(), // Replaces rss_fetch
  new JsonQueryTool(),

  // --- Knowledge ---
  new KnowledgeSearchTool(),
  new KnowledgeAddTool(),

  // --- Git ---
  new GitOpsTool(),
  new GitHubRepoCreateTool(),

  // --- Media ---
  { ...ImageGenerationTool, permissions: ImageGenerationTool.permissions as any, sideEffects: ImageGenerationTool.sideEffects as any },
];

// The Dispatcher
export async function executeTool(name: string, input: any, context?: any): Promise<ToolExecutionResult> {
  const logs: string[] = [];
  const t0 = Date.now();
  let effectiveName = name;
  let effectiveInput = { ...input };

  // --- Aliasing & Compatibility Layer ---
  const contextSessionId = context?.sessionId;

  if (name === 'browser_open') {
    effectiveName = 'browser_run';
    const url = effectiveInput.url || effectiveInput.input || '';
    if (!Array.isArray(effectiveInput.actions)) effectiveInput.actions = [];
    if (url) {
      effectiveInput.actions.unshift({ type: 'goto', url });
    } else if (effectiveInput.actions.length === 0) {
      // Default to Google if just "Opening Browser" to avoid getting stuck on about:blank
      effectiveInput.actions.push({ type: 'goto', url: 'https://www.google.com' });
    }
  }
  if (name === 'browser_get_state') {
    effectiveName = 'browser_run';
    if (!Array.isArray(effectiveInput.actions)) effectiveInput.actions = [];
    if (effectiveInput.actions.length === 0) {
      effectiveInput.actions.push({ type: 'ui_audit' });
    }
  }
  if (name === 'browser_snapshot') {
    effectiveName = 'browser_run';
    if (!Array.isArray(effectiveInput.actions)) effectiveInput.actions = [];
    if (effectiveInput.actions.length === 0) {
      effectiveInput.actions.push({ type: 'ui_audit' });
    }
  }

  // Universal Session Injection
  if ((effectiveName === 'browser_run' || effectiveName === 'visual_qa' || effectiveName === 'codebase_navigator') && !effectiveInput.sessionId && contextSessionId) {
    effectiveInput.sessionId = contextSessionId;
  }

  logs.push(`[${new Date().toISOString()}] start ${effectiveName} (orig=${name})`);
  try {
    const tDef = tools.find(t => t.name === effectiveName);
    if (!tDef) {
      return { ok: false, error: 'unknown_tool', logs };
    }
    // Update bucket key to use effective name
    const bucketKey = rateLimitBucketKey(effectiveName, effectiveInput);
    const rl = checkToolRateLimit(bucketKey, tDef.rateLimitPerMinute);
    if (!rl.allowed) {
      logs.push(
        `rate_limited=1 bucket=${bucketKey} limit_per_minute=${tDef.rateLimitPerMinute} retry_after_ms=${rl.retryAfterMs}`,
      );
      return { ok: false, error: 'rate_limited', output: { retryAfterMs: rl.retryAfterMs }, logs };
    }

    // Execute
    if (tDef && typeof (tDef as any).execute === 'function') {
      const res = await (tDef as any).execute(effectiveInput);
      const ok = !!res?.ok;
      const output = res?.output ?? null;
      const artifacts = Array.isArray(res?.artifacts) ? res.artifacts : undefined;
      const toolLogs = Array.isArray(res?.logs) ? res.logs : [];
      logs.push(...toolLogs);
      return { ok, output, logs, artifacts, error: res?.error };
    }

    return { ok: false, error: 'tool_implementation_missing', logs };

  } catch (e: any) {
    const duration = Date.now() - t0;
    logs.push(`exception=${e.message} duration=${duration}ms`);
    return { ok: false, error: `exception: ${e.message}`, logs };
  }
}
