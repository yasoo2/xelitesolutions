import { IntentParser } from '../intelligence/IntentParser';
import { PlanningEngine, ExecutionPlan, ExecutionStep } from './PlanningEngine';
import { SelfHealingController, RecoveryAction } from './SelfHealingController';
import { ExecutionMemory } from './ExecutionMemory';
import { executeTool } from '../../modules/services/ToolService';
import { broadcast, broadcastThinkingDetail } from '../../api/ws';
import { ConversationContext } from '../llm/context-engine';

export interface OrchestrationResult {
    ok: boolean;
    output: any;
    stepsExecuted: number;
    plan: ExecutionPlan;
}

export class AutonomousOrchestrator {
    /**
     * Main entry point for autonomous execution
     */
    static async execute(
        userText: string,
        context: ConversationContext,
        options: { runId: string }
    ): Promise<OrchestrationResult> {
        const { runId } = options;
        const sessionId = context.sessionId;

        // 1. Parse Intent
        broadcastThinkingDetail(sessionId, "🔍 Analyzing high-level intent...");
        const intent = await IntentParser.parse(userText, context);
        
        // 2. Generate Plan
        broadcastThinkingDetail(sessionId, `🏗️ Generating execution plan for complexity: ${intent.complexity}...`);
        const plan = await PlanningEngine.generatePlan(intent);
        
        broadcast({ 
            type: 'text', 
            runId, 
            data: `📋 **Execution Plan Generated**\n${plan.steps.map(s => `- ${s.description}`).join('\n')}` 
        });

        // 3. Execute Steps
        let stepsExecuted = 0;
        const results: any[] = [];

        for (const step of plan.steps) {
            broadcastThinkingDetail(sessionId, `🚀 Executing Step ${stepsExecuted + 1}: ${step.description}`);
            
            const result = await this.executeStepWithRetry(step, plan, context, 2);
            
            stepsExecuted++;
            results.push(result);

            if (!result.ok && step.fallbackStrategy === 'abort') {
                broadcast({ type: 'text', runId, data: `❌ Execution aborted at step ${stepsExecuted}: ${result.error}` });
                break;
            }
            
            // Adjust plan dynamically based on result if needed (Advanced Phase 3 feature)
            // if (result.ok) this.adjustPlan(plan, result);
        }

        const success = results.every(r => r.ok);
        
        return {
            ok: success,
            output: results[results.length - 1]?.output || 'Tasks completed',
            stepsExecuted,
            plan
        };
    }

    /**
     * Execute a step with built-in retry and self-healing
     */
    private static async executeStepWithRetry(
        step: ExecutionStep,
        plan: ExecutionPlan,
        context: ConversationContext,
        maxRetries: number
    ): Promise<any> {
        let lastResult: any;
        let attempt = 0;

        while (attempt <= maxRetries) {
            const start = Date.now();
            lastResult = await executeTool(step.tool, step.input, { 
                sessionId: context.sessionId,
                userId: context.userId
            });

            const duration = Date.now() - start;

            // Record in memory
            ExecutionMemory.record({
                tool: step.tool,
                inputHash: this.calculateHash(JSON.stringify(step.input)),
                success: lastResult.ok,
                durationMs: duration,
                error: lastResult.error
            });

            if (lastResult.ok) return lastResult;

            attempt++;
            if (attempt <= maxRetries) {
                broadcastThinkingDetail(context.sessionId, `⚠️ Step failed. Attempting self-healing (Retry ${attempt}/${maxRetries})...`);
                
                const recovery: RecoveryAction = await SelfHealingController.handleFailure(
                    lastResult.error,
                    step.tool,
                    step.input,
                    plan.goal
                );

                if (recovery.type === 'abort') return lastResult;
                
                if (recovery.type === 'alternative' && recovery.tool) {
                    step.tool = recovery.tool;
                    step.input = recovery.input || step.input;
                }
                
                // If retry type, we just loop again
            }
        }

        return lastResult;
    }

    private static calculateHash(text: string): string {
        const crypto = require('crypto');
        return crypto.createHash('md5').update(text).digest('hex');
    }
}
