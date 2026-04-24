export type JoeWorkflowMode = 'plan_only' | 'execute' | 'repair' | 'release_check';

export type JoePhaseStatus = 'pending' | 'running' | 'passed' | 'failed' | 'partial' | 'blocked';

export type JoeRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface JoeExecutionContext {
  userId: string;
  workspaceId: string;
  sessionId: string;
  mode?: JoeWorkflowMode;
  maxSteps?: number;
  metadata?: Record<string, unknown>;
}

export interface JoeTaskDefinition {
  id?: string;
  task: string;
  tool: string;
  args?: Record<string, unknown>;
  priority?: 'low' | 'medium' | 'high';
  required?: boolean;
  risk?: JoeRiskLevel;
}

export interface JoePhaseDefinition {
  phaseNumber: number;
  name: string;
  description?: string;
  tasks: JoeTaskDefinition[];
  verificationTask?: JoeTaskDefinition;
  deliverables?: string[];
  estimatedTime?: string;
}

export interface JoeWorkflowPlan {
  projectName: string;
  projectVibe?: string;
  totalPhases: number;
  estimatedDuration?: string;
  phases: JoePhaseDefinition[];
  dependencies?: Record<string, string[]>;
  originalDescription?: string;
}

export interface JoeToolResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  logs?: string[];
  artifacts?: unknown[];
}

export interface JoeTaskExecutionResult {
  task: string;
  tool: string;
  ok: boolean;
  error?: string;
  output?: unknown;
  logs?: string[];
}

export interface JoePhaseExecutionResult {
  phaseNumber: number;
  phaseName: string;
  status: JoePhaseStatus;
  completedTasks: number;
  totalTasks: number;
  results: JoeTaskExecutionResult[];
}

export interface JoeQualityIssue {
  source: 'build' | 'browser' | 'visual' | 'security' | 'performance' | 'api' | 'unknown';
  severity: JoeRiskLevel;
  message: string;
  tool?: string;
  raw?: unknown;
}

export interface JoeQualityGateResult {
  passed: boolean;
  issues: JoeQualityIssue[];
  checks: JoeTaskExecutionResult[];
}

export interface JoeOrchestratorResult {
  ok: boolean;
  plan?: JoeWorkflowPlan;
  phases: JoePhaseExecutionResult[];
  quality?: JoeQualityGateResult;
  error?: string;
  logs: string[];
}

export interface JoeToolExecutor {
  executeTool(name: string, input: Record<string, unknown>, context: JoeExecutionContext): Promise<JoeToolResult>;
}
