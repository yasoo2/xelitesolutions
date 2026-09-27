/**
 * ADAPTIVE DAG PLANNER — parallel execution, failure diagnosis, multi-attempt planning
 *
 * Enhances the base generateDynamicDag with:
 * - Parallel execution detection (independent steps that can run concurrently)
 * - Pre-planning failure diagnosis (analyze error context before planning)
 * - Multi-attempt planning with entropy (try multiple strategies)
 * - Step validation and dependency optimization
 * - Execution-time budget awareness
 */

import { ExecutionStep, ExecutionPlan } from './PlanningEngine';
import { StructuredIntent } from '../intelligence/IntentParser';
import { routeToModel, TaskAnalysis } from '../llm/intelligent-router';
import { catalogueFor } from './toolCatalog';
import { compactHistoryForPrompt } from './history-compact';
import { isBuildRequest } from '../intelligence/intent-classifier';

export interface ParallelGroup {
    stepIds: string[];
    canRunInParallel: boolean;
    reason: string;
}

export interface FailureDiagnosis {
    rootCause: string;
    category: 'dependency' | 'syntax' | 'runtime' | 'configuration' | 'quota' | 'unknown';
    suggestedRepairs: string[];
    confidence: number;
}

export interface PlanAttempt {
    steps: ExecutionStep[];
    reasoning: string;
    parallelGroups: ParallelGroup[];
    confidence: number;
}

export interface AdaptiveDagOptions {
    maxAttempts?: number;
    entropySeed?: string;
    enableParallelDetection?: boolean;
    enableFailureDiagnosis?: boolean;
    timeBudgetMs?: number;
}

/**
 * Analyze the execution history and error context to diagnose failure root cause
 */
export async function diagnoseFailure(
    intent: StructuredIntent,
    memory: any,
    context?: any
): Promise<FailureDiagnosis> {
    const history = memory ? compactHistoryForPrompt(memory) : null;
    const recentErrors = history?.filter((h: any) =>
        h.type === 'tool_done' && h.data?.ok === false
    ) || [];

    if (recentErrors.length === 0) {
        return {
            rootCause: 'No prior execution history to diagnose',
            category: 'unknown',
            suggestedRepairs: ['Proceed with standard planning'],
            confidence: 0.1
        };
    }

    const latestError = recentErrors[recentErrors.length - 1];
    const errorMessage = String(latestError.data?.error || latestError.data?.message || 'Unknown error');
    const failedTool = latestError.data?.tool || 'unknown';

    // Classify error category
    let category: FailureDiagnosis['category'] = 'unknown';
    let suggestedRepairs: string[] = [];

    if (/401|403|unauthori[sz]ed|invalid.*key|auth.*fail/i.test(errorMessage)) {
        category = 'quota';
        suggestedRepairs = ['Check provider credentials', 'Switch to free provider', 'Use local model'];
    } else if (/429|rate limit|quota|tokens per day/i.test(errorMessage)) {
        category = 'quota';
        suggestedRepairs = ['Wait for quota reset', 'Use fallback providers', 'Reduce token usage'];
    } else if (/syntax|parse|unexpected token|TS23|TS25|TS70/i.test(errorMessage)) {
        category = 'syntax';
        suggestedRepairs = ['Read the failing file', 'Fix syntax error', 'Run typecheck'];
    } else if (/ENOENT|not found|does not exist|missing dependency|module not found/i.test(errorMessage)) {
        category = 'dependency';
        suggestedRepairs = ['Install missing dependencies', 'Check import paths', 'Verify file exists'];
    } else if (/timeout|timed out|ETIMEDOUT/i.test(errorMessage)) {
        category = 'runtime';
        suggestedRepairs = ['Increase timeout', 'Optimize operation', 'Split into smaller steps'];
    } else if (/config|setting|environment|variable/i.test(errorMessage)) {
        category = 'configuration';
        suggestedRepairs = ['Check environment variables', 'Verify configuration files', 'Review settings'];
    } else {
        category = 'unknown';
        suggestedRepairs = ['Read error details', 'Add diagnostic logging', 'Simplify the step'];
    }

    return {
        rootCause: `${failedTool}: ${errorMessage.slice(0, 200)}`,
        category,
        suggestedRepairs,
        confidence: category !== 'unknown' ? 0.8 : 0.3
    };
}

/**
 * Detect independent steps that can run in parallel
 */
export function detectParallelGroups(steps: ExecutionStep[]): ParallelGroup[] {
    const groups: ParallelGroup[] = [];
    const visited = new Set<string>();
    const adjacency = new Map<string, Set<string>>();
    const reverseAdjacency = new Map<string, Set<string>>();

    // Build dependency graph
    for (const step of steps) {
        if (!adjacency.has(step.id)) adjacency.set(step.id, new Set());
        if (!reverseAdjacency.has(step.id)) reverseAdjacency.set(step.id, new Set());
        for (const dep of step.dependsOn) {
            adjacency.get(dep)?.add(step.id);
            reverseAdjacency.get(step.id)?.add(dep);
        }
    }

    // Find all steps with no dependencies (can start immediately)
    const noDeps = steps.filter(s => s.dependsOn.length === 0).map(s => s.id);
    if (noDeps.length > 1) {
        groups.push({
            stepIds: noDeps,
            canRunInParallel: true,
            reason: 'No dependencies - can start concurrently'
        });
    }

    // Find independent branches at each level
    const processed = new Set(noDeps);
    let currentLevel = noDeps;

    while (currentLevel.length > 0) {
        const nextLevel: string[] = [];
        for (const stepId of currentLevel) {
            for (const next of adjacency.get(stepId) || []) {
                const allDepsProcessed = Array.from(reverseAdjacency.get(next) || []).every(d => processed.has(d));
                if (allDepsProcessed && !processed.has(next)) {
                    nextLevel.push(next);
                }
            }
        }
        if (nextLevel.length > 1) {
            groups.push({
                stepIds: nextLevel,
                canRunInParallel: true,
                reason: 'All dependencies satisfied - branch can run in parallel'
            });
        }
        for (const id of nextLevel) processed.add(id);
        currentLevel = nextLevel;
    }

    // Check for tool-type parallelism (same tool type, different inputs)
    const toolGroups = new Map<string, string[]>();
    for (const step of steps) {
        if (!toolGroups.has(step.tool)) toolGroups.set(step.tool, []);
        toolGroups.get(step.tool)!.push(step.id);
    }
    for (const [tool, stepIds] of toolGroups) {
        if (stepIds.length > 1) {
            // Check if they're truly independent (no shared dependencies)
            const independent = stepIds.every(id =>
                steps.find(s => s.id === id)?.dependsOn.every(d => !stepIds.includes(d)) !== false
            );
            if (independent) {
                groups.push({
                    stepIds,
                    canRunInParallel: true,
                    reason: `Same tool (${tool}) with independent inputs`
                });
            }
        }
    }

    return groups;
}

/**
 * Optimize step dependencies - remove redundant dependsOn entries
 */
export function optimizeDependencies(steps: ExecutionStep[]): ExecutionStep[] {
    const stepMap = new Map(steps.map(s => [s.id, s]));

    return steps.map(step => {
        const deps = step.dependsOn.filter(depId => {
            const depStep = stepMap.get(depId);
            if (!depStep) return false;
            // Keep dependency if it provides data used by this step
            const stepInput = JSON.stringify(step.input);
            return stepInput.includes(`{{FROM:${depId}}`) || stepInput.includes(`FROM:${depId}`);
        });
        return { ...step, dependsOn: deps };
    });
}

/**
 * Validate plan completeness - check for common planning errors
 */
export function validatePlan(steps: ExecutionStep[], intent: StructuredIntent): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for cycles
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const stepMap = new Map(steps.map(s => [s.id, s]));

    function hasCycle(stepId: string): boolean {
        if (visiting.has(stepId)) return true;
        if (visited.has(stepId)) return false;
        visiting.add(stepId);
        const step = stepMap.get(stepId);
        if (step) {
            for (const dep of step.dependsOn) {
                if (hasCycle(dep)) return true;
            }
        }
        visiting.delete(stepId);
        visited.add(stepId);
        return false;
    }

    for (const step of steps) {
        if (hasCycle(step.id)) {
            issues.push(`Cycle detected involving step: ${step.id}`);
            break;
        }
    }

    // Check for missing dependencies
    for (const step of steps) {
        for (const dep of step.dependsOn) {
            if (!stepMap.has(dep)) {
                issues.push(`Step ${step.id} depends on missing step: ${dep}`);
            }
        }
    }

    // Check for build requests with only answer tools
    const buildRequest = isBuildRequest(String(intent.goal || '')).isBuild;
    if (buildRequest) {
        const answerTools = new Set(['central_answer', 'echo', 'alert_manager', 'template_manager']);
        const allAnswerTools = steps.every(s => answerTools.has(s.tool));
        if (allAnswerTools && steps.length > 0) {
            issues.push('Build request planned with only answer tools - no execution steps');
        }
    }

    // Check for orphaned steps (no one depends on them and they're not final)
    const dependedOn = new Set<string>();
    for (const step of steps) {
        for (const dep of step.dependsOn) dependedOn.add(dep);
    }
    const finalSteps = steps.filter(s => !dependedOn.has(s.id));
    if (finalSteps.length === 0 && steps.length > 0) {
        issues.push('No final step - all steps are dependencies of others');
    }

    return { valid: issues.length === 0, issues };
}

/**
 * Generate multiple plan attempts with different strategies
 */
export async function generatePlanAttempts(
    intent: StructuredIntent,
    memory: any,
    context: any,
    options: AdaptiveDagOptions = {}
): Promise<PlanAttempt[]> {
    const attempts: PlanAttempt[] = [];
    const maxAttempts = options.maxAttempts || 3;
    const baseEntropy = options.entropySeed || Math.random().toString(36).substring(7);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const entropySeed = `${baseEntropy}_attempt${attempt}`;
        const attemptContext = { ...context, adaptiveAttempt: attempt, entropySeed };

        try {
            const plan = await generateSinglePlan(intent, memory, attemptContext, options);
            if (plan.steps.length > 0) {
                const parallelGroups = options.enableParallelDetection !== false
                    ? detectParallelGroups(plan.steps)
                    : [];
                const validation = validatePlan(plan.steps, intent);

                attempts.push({
                    steps: plan.steps,
                    reasoning: plan.reasoning || `Attempt ${attempt + 1}`,
                    parallelGroups,
                    confidence: validation.valid ? 0.9 : 0.5
                });

                if (validation.valid && attempt > 0) {
                    // Valid plan found on retry - good enough
                    break;
                }
            }
        } catch (err) {
            console.warn(`[AdaptiveDag] Attempt ${attempt + 1} failed:`, err);
        }
    }

    return attempts;
}

/**
 * Single plan generation with enhanced prompt
 */
async function generateSinglePlan(
    intent: StructuredIntent,
    memory: any,
    context: any,
    options: AdaptiveDagOptions
): Promise<{ steps: ExecutionStep[]; reasoning: string }> {
    const isRecovery = /^fix and continue:/i.test(String(intent.goal || '').trim());
    const historyContext = memory ? `\nPrevious Execution History:\n${JSON.stringify(compactHistoryForPrompt(memory))}` : "";
    const failureDiagnosis = options.enableFailureDiagnosis !== false && isRecovery
        ? await diagnoseFailure(intent, memory, context)
        : null;

    const recoveryRules = isRecovery ? `
This is a FAILURE-RECOVERY plan. Non-negotiable rules:
- READ the error text inside the goal. Every step you propose must address its CAUSE (missing dependency -> install it; wrong path -> locate the right one; syntax error -> read the file and fix that line).
- NEVER just re-run the failed step unchanged as the whole plan; earn the retry with a diagnosis or repair step before it.
- Keep it minimal: diagnose -> repair -> re-run. Do not re-author work that already succeeded.
${failureDiagnosis ? `
FAILURE DIAGNOSIS (pre-computed):
Root Cause: ${failureDiagnosis.rootCause}
Category: ${failureDiagnosis.category}
Suggested Repairs: ${failureDiagnosis.suggestedRepairs.join(', ')}
Confidence: ${failureDiagnosis.confidence}
` : ''}` : '';

    const systemPrompt = `You are a Professional Software Architecture Planner.
Generate a dynamic Execution DAG (Directed Acyclic Graph) for the given goal.

Entropy Seed: ${context.entropySeed} (Use this to explore different optimal paths)

Constraints:
- Use ONLY tools from THIS catalogue (name(args) — purpose). An argument ending with ? is optional:
${catalogueFor(intent.goal)}
- If nothing in the catalogue fits, use central_answer(question) — never invent a tool name.
- Define explicit dependencies (dependsOn).
- DATA FLOW: when a step needs what an earlier step PRODUCED, put {{FROM:<that step's id>}} inside its input where the data belongs — it is replaced with that step's real output at run time.
- Any id you write inside {{FROM:...}} MUST also appear in that step's dependsOn.
- Assign an agent to each node: Dev, Security, Browser, General.
- DO NOT use static templates. Analyze the specific goal from a fresh perspective.
- Provide a brief "reasoning" field for EACH step explaining why this path was chosen.
- PARALLEL EXECUTION: Steps with no shared dependencies CAN run in parallel. Mark them with "parallel": true.
${recoveryRules}

Goal: ${intent.goal}
Complexity: ${intent.complexity}
Risk: ${intent.riskLevel}${historyContext}

Return ONLY a JSON array of steps:
[
  {
    "id": "node_id",
    "task": "precise task description",
    "tool": "tool_name",
    "agent": "agent_type",
    "input": { "instruction": "..." },
    "dependsOn": ["prev_node_id"],
    "parallel": true|false,
    "reasoning": "why this step and why this position"
  }
]`;

    const response = await routeToModel([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze goal and generate DAG for: ${intent.goal}` }
    ], undefined, undefined, undefined, undefined, undefined, undefined, { ...context, purpose: 'internal' });

    const rawSteps = parseJsonArrayLoose(response);
    if (!rawSteps || !Array.isArray(rawSteps) || rawSteps.length === 0) {
        throw new Error('No valid steps generated');
    }

    const steps: ExecutionStep[] = (rawSteps as any[]).map((step: any) => ({
        id: String(step.id || `step_${Math.random().toString(36).substring(7)}`),
        description: String(step.description || step.task || step.task_description || `Execute task`),
        tool: String(step.tool || 'shell_execute'),
        agent: String(step.agent || 'General'),
        input: step.input || {},
        dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn.map(String) : [],
        parallel: step.parallel === true,
        reasoning: step.reasoning || ''
    }));

    // Optimize dependencies
    const optimized = optimizeDependencies(steps);

    return { steps: optimized, reasoning: `Generated with entropy ${context.entropySeed}` };
}

/**
 * Parse JSON array from LLM response (handles markdown fences, extra text)
 */
function parseJsonArrayLoose(text: string): any[] | null {
    if (!text) return null;
    // Try to extract JSON array from markdown fence
    const fenceMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (fenceMatch) {
        try { return JSON.parse(fenceMatch[1]); } catch { }
    }
    // Try to find first [ and last ]
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start >= 0 && end > start) {
        try { return JSON.parse(text.slice(start, end + 1)); } catch { }
    }
    return null;
}

/**
 * Select the best plan from multiple attempts
 */
export function selectBestPlan(attempts: PlanAttempt[]): PlanAttempt | null {
    if (attempts.length === 0) return null;

    // Sort by confidence, then by fewer steps (simpler), then by parallel groups
    return attempts.sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        if (a.steps.length !== b.steps.length) return a.steps.length - b.steps.length;
        return b.parallelGroups.length - a.parallelGroups.length;
    })[0];
}

export default {
    diagnoseFailure,
    detectParallelGroups,
    optimizeDependencies,
    validatePlan,
    generatePlanAttempts,
    selectBestPlan,
    parseJsonArrayLoose
};