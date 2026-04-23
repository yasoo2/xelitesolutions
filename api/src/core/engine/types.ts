export type EngineeringPhase =
  | 'understand'
  | 'inspect'
  | 'plan'
  | 'validate_plan'
  | 'execute'
  | 'test'
  | 'repair'
  | 'review'
  | 'finalize';

export type EngineeringTaskType =
  | 'bugfix'
  | 'feature'
  | 'ui'
  | 'backend'
  | 'deploy'
  | 'security'
  | 'browser'
  | 'explain'
  | 'unknown';

export type EngineeringStepType = 'read' | 'edit' | 'create' | 'delete' | 'command' | 'test' | 'deploy' | 'browser';
export type EngineeringRisk = 'low' | 'medium' | 'high';

export interface PromptAnalysis {
  goal: string;
  taskType: EngineeringTaskType;
  projectType?: string;
  requiredOutput: string[];
  likelyFiles: string[];
  risks: string[];
  missingInfo: string[];
  shouldAskUser: boolean;
  assumptions: string[];
}

export interface ProjectContext {
  root: string;
  frameworks: string[];
  packageScripts: Record<string, string>;
  frontendRoot?: string;
  backendRoot?: string;
  entryFiles: string[];
  configFiles: string[];
  testCommands: string[];
  buildCommands: string[];
  deployFiles: string[];
  envHints: string[];
}

export interface EngineeringPlanStep {
  id: string;
  title: string;
  type: EngineeringStepType;
  target?: string;
  command?: string;
  reason: string;
  risk: EngineeringRisk;
  successCriteria: string[];
}

export interface EngineeringPlan {
  goal: string;
  assumptions: string[];
  steps: EngineeringPlanStep[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface ExecutionJournalEntry {
  stepId: string;
  tool: string;
  inputSummary: string;
  outputSummary: string;
  filesTouched: string[];
  error?: string;
  confidence: number;
}

export interface FinalEngineeringReport {
  summary: string;
  filesChanged: string[];
  testsRun: string[];
  issuesFixed: string[];
  remainingRisks: string[];
  nextAction?: string;
}

export interface AutonomousEngineerInput {
  prompt: string;
  sessionId?: string;
  workspaceId?: string;
  userId?: string;
  projectRoot?: string;
  onEvent?: (event: { type: string; phase?: EngineeringPhase; data?: any }) => void;
}

export interface AutonomousEngineerResult {
  ok: boolean;
  analysis: PromptAnalysis;
  project: ProjectContext;
  plan: EngineeringPlan;
  validation: ValidationResult;
  journal: ExecutionJournalEntry[];
  report: FinalEngineeringReport;
}
