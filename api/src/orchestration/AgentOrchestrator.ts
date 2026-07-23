import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { IntentParser } from '../core/intelligence/IntentParser';
import { executeTool } from '../modules/services/ToolService';
import { broadcastThinkingDetail, broadcast } from '../api/ws';
import { randomUUID } from 'crypto';
import { BaseAgent } from './agents/BaseAgent';
import { DevAgent } from './agents/DevAgent';
import { SecurityAgent } from './agents/SecurityAgent';
import { BrowserAgent } from './agents/BrowserAgent';
import { ExecutionMemory } from '../core/orchestrator/ExecutionMemory';
import { traceManager } from '../modules/services/TraceManager';
import { executionFirewall } from './AgentExecutionFirewall';
import intelligentRouter from '../core/llm/intelligent-router';

/**
 * Modular Agent Platform - Core Intelligence Layer (REAL Agent Runtime)
 */

export type AgentGoal = {
  id: string;
  traceId?: string;
  goal: string;
  context?: Record<string, any>;
  priority?: "low" | "medium" | "high";
};

export type AgentType = "Dev" | "Security" | "Deploy" | "Browser" | "General";

export type ExecutionNode = {
  id: string;
  traceId?: string;
  agent: AgentType;
  task: string;
  tool: string;
  input: any;
  dependencies: string[];
  status: "pending" | "running" | "completed" | "failed";
  result?: any;
  retryCount?: number;
};

export type AgentDAG = {
  id: string;
  nodes: ExecutionNode[];
  status: "idle" | "running" | "completed" | "failed";
};

export class AgentOrchestrator {
  private memory: Map<string, ExecutionMemory> = new Map();
  private agents: Map<AgentType, BaseAgent> = new Map();
  private context?: Record<string, any>;

  constructor() {
    // Register specialized agents
    const devAgent = new DevAgent();
    this.agents.set("Dev", devAgent);
    this.agents.set("Security", new SecurityAgent());
    this.agents.set("Browser", new BrowserAgent());
    this.agents.set("General", devAgent); 
  }

  /**
   * Main entry point: Executes a high-level goal with REAL-TIME intelligence
   */
  public async execute(goal: AgentGoal): Promise<{ ok: boolean; result: any }> {
    console.log(`[AgentOrchestrator] Starting REAL-TIME orchestration for goal: ${goal.goal}`);
    broadcastThinkingDetail(goal.id, `🧠 Initializing Autonomous Brain for goal: ${goal.goal}`);

    this.context = goal.context;

    // Initialize Runtime Memory
    const runtimeMemory = new ExecutionMemory(goal.id);
    this.memory.set(goal.id, runtimeMemory);

    // 1. Initial Dynamic Planning
    const dag = await this.plan(goal.goal, undefined, goal.traceId);
    dag.id = goal.id;

    if (goal.traceId) {
        traceManager.logEvent(goal.traceId, 'orchestrator', {
            event: 'execution_started',
            goal: goal.goal,
            dag_structure: dag.nodes.map(n => ({ id: n.id, task: n.task, tool: n.tool }))
        });
    }

    // 2. Adaptive Coordination Execution
    const result = await executionFirewall.runInContext(goal.traceId, () => {
        return this.coordinate(dag, runtimeMemory, goal.context, goal.traceId);
    });
    
    if (goal.traceId) {
        traceManager.endTrace(goal.traceId);
    }
    
    return result;
  }

  /**
   * Converts goal into a structured execution plan (DAG) dynamically
   */
  public async plan(goalText: string, memory?: ExecutionMemory, traceId?: string): Promise<AgentDAG> {
    const context = IntentParser.createContext('orchestrator', 'global', [], this.context);
    const intent = await IntentParser.parse(goalText, context);
    
    // Inject memory into planning if available
    const historySummary = memory ? memory.getSummary() : "";
    const enrichedGoal = historySummary 
        ? `${goalText}\n\n[CONTEXT: Previous attempts/steps results]\n${historySummary}` 
        : goalText;

    const rawPlan = await PlanningEngine.generatePlan({ intent, memory: memory?.getHistory() }, traceId, this.context);

    const nodes: ExecutionNode[] = rawPlan.steps.map((step) => ({
      id: step.id,
      traceId,
      agent: (step.agent as AgentType) || "General",
      task: step.description || (step as any).task || "Task",
      tool: step.tool,
      input: step.input,
      dependencies: step.dependsOn || [],
      status: "pending"
    }));

    if (traceId) {
        traceManager.logEvent(traceId, 'planning', {
            goal: goalText,
            steps_generated: nodes.length,
            reasoning: (rawPlan as any).reasoning
        });
    }

    return {
      id: randomUUID(),
      nodes,
      status: "idle"
    };
  }

  /**
   * ADAPTIVE COORDINATION LOOP
   * Executes DAG, evaluates progress after each step, and re-plans if needed.
   * This is the "Main Execution Brain" of the runtime.
   */
  private async coordinate(
    dag: AgentDAG,
    memory: ExecutionMemory,
    goalContext?: Record<string, any>,
    traceId?: string
  ): Promise<{ ok: boolean; result: any }> {
    dag.status = "running";
    const completedNodes = new Set<string>();
    let iterations = 0;
    let stalledReplans = 0;
    const maxIterations = Math.max(10, dag.nodes.length * 5);

    while (completedNodes.size < dag.nodes.length) {
      iterations++;
      if (iterations > maxIterations) {
        dag.status = "failed";
        return { ok: false, result: "Execution stopped: orchestration iteration limit exceeded" };
      }

      console.log(`[AgentOrchestrator] Step Iteration. Completed: ${completedNodes.size}/${dag.nodes.length}`);
      
      const readyNodes = dag.nodes.filter(n => 
        n.status === "pending" && 
        n.dependencies.every(depId => completedNodes.has(depId))
      );

      if (readyNodes.length === 0 && completedNodes.size < dag.nodes.length) {
        // [DECISION] Trigger dynamic re-planning on stall
        broadcastThinkingDetail(memory.sessionId, "🧠 Execution stalled. Re-evaluating strategy...");
        if (traceId) traceManager.logEvent(traceId, 'orchestrator', { event: 'stall_detected', completed: completedNodes.size });
        stalledReplans++;
        if (stalledReplans > 2) {
          dag.status = "failed";
          return { ok: false, result: "Execution stopped: no ready nodes after recovery/replanning attempts" };
        }
        const newDag = await this.plan(dag.nodes[0]?.task || "continue goal", memory, traceId);
        const existingIds = new Set(dag.nodes.map(n => n.id));
        const uniqueNodes = newDag.nodes.filter(n => !existingIds.has(n.id));
        if (uniqueNodes.length === 0) {
          dag.status = "failed";
          return { ok: false, result: "Execution stopped: replanning produced no new executable nodes" };
        }
        dag.nodes = [...dag.nodes, ...uniqueNodes];
        continue;
      }

      for (const node of readyNodes) {
        // [DECISION] Re-evaluate agent fit
        const refinedAgentType = await this.selectOptimalAgent(node, memory);
        if (refinedAgentType !== node.agent) {
          broadcastThinkingDetail(memory.sessionId, `🔄 Shifted agent for "${node.task}" to ${refinedAgentType}`);
          node.agent = refinedAgentType as AgentType;
        }

        node.status = "running";
        const startTime = Date.now();
        console.log(`[AgentOrchestrator] Executing node: ${node.id} (${node.task})`);
        broadcastThinkingDetail(memory.sessionId, `🚀 Running: ${node.task} via ${node.agent} Agent`);

        const isBrowserNode = node.agent === 'Browser' || node.tool === 'browser_run' || (node.task && (node.task.toLowerCase().includes('browser') || node.task.includes('متصفح')));
        if (isBrowserNode) {
          broadcast({
            type: 'step_started',
            data: {
              sessionId: memory.sessionId,
              tool: { name: 'browser_run', input: { task: node.task } }
            },
            sessionId: memory.sessionId
          });
        }

        if (traceId) {
            traceManager.logEvent(traceId, 'orchestrator', {
                event: 'node_execution_started',
                nodeId: node.id,
                task: node.task,
                agent: node.agent,
                tool: node.tool,
                input: node.input,
                startTime
            });
        }
        
        const agent = this.agents.get(node.agent);
        let result;

        const executionContext = {
            sessionId: goalContext?.sessionId || dag.id,
            workspaceId: goalContext?.workspaceId,
            userId: goalContext?.userId,
            traceId,
            memory: memory.getHistory(),
            modelConfig: goalContext?.modelConfig,
            language: goalContext?.language
        };

        const isDirectAnswer = node.tool === 'central_answer'
          || /^(answering|respond to)\s*:/i.test(node.task || '');

        try {
          if (isDirectAnswer) {
            const question = node.input?.question
              || (node.task || '').replace(/^(answering|respond to)\s*:\s*/i, '').trim()
              || node.task;
            result = await executeTool('central_answer', { question }, executionContext);
          } else if (agent) {
            result = await agent.execute(node.task, node.input, executionContext);
          } else {
            result = await executeTool(node.tool, { ...node.input, context: memory.getHistory() }, executionContext);
          }
        } catch (err: any) {
          result = { ok: false, error: err.message };
        }
        
        if (result.ok) {
          node.status = "completed";
          const cleanOutput = this.sanitizeOutput(result.output);
          node.result = cleanOutput;
          memory.record(node.id, node.task, cleanOutput, "completed");
          completedNodes.add(node.id);

          if (traceId) {
            traceManager.logEvent(traceId, 'orchestrator', {
                event: 'node_execution_completed',
                nodeId: node.id,
                status: 'success',
                duration: Date.now() - startTime
            });
          }

          // [DECISION] Mid-flight progress assessment
          const evaluation = await this.evaluateProgress(node, memory, dag);
          if (evaluation.shouldReplan) {
            broadcastThinkingDetail(memory.sessionId, "🧠 Path adjustment required. Re-calculating execution graph...");
            if (traceId) traceManager.logEvent(traceId, 'orchestrator', { event: 'replan_triggered', nodeId: node.id });
            const updatedDag = await this.plan(dag.id, memory, traceId);
            const existingIds = new Set(dag.nodes.map(n => n.id));
            const uniqueNodes = updatedDag.nodes.filter(n => !existingIds.has(n.id));
            dag.nodes = [...dag.nodes, ...uniqueNodes];
            break; 
          }
        } else {
          console.error(`[AgentOrchestrator] Node ${node.id} failed: ${result.error}`);

          // A conversational / direct-answer node must NEVER spawn a diagnostic
          // recovery loop (the duplicated "neural thinking" the user reported).
          // Treat it as completed with whatever text we have and move on.
          if (isDirectAnswer) {
            const text = (typeof result.error === 'string' && result.error) ? result.error : 'تم.';
            node.status = "completed";
            node.result = text;
            memory.record(node.id, node.task, text, "completed");
            completedNodes.add(node.id);
            continue;
          }

          node.status = "failed";
          memory.record(node.id, node.task, result.error, "failed");

          if (traceId) {
            traceManager.logEvent(traceId, 'orchestrator', {
                event: 'node_execution_completed',
                nodeId: node.id,
                status: 'failed',
                error: result.error,
                duration: Date.now() - startTime
            });
          }

          // [DECISION] Intelligent recovery attempt
          const currentRetryCount = node.retryCount || 0;
          if (currentRetryCount >= 2) {
            console.error(`[AgentOrchestrator] Max retries reached for node: ${node.id}`);
            return { ok: false, result: result.error || "Fatal execution error: Max retries reached" };
          }

          const recoveryResult = await this.attemptRecovery(node, result.error, memory, dag, traceId);
          if (recoveryResult.recovered) {
            broadcastThinkingDetail(memory.sessionId, `⚠️ Recovering from failure in "${node.task}". Injecting repair nodes...`);
            if (traceId) traceManager.logEvent(traceId, 'orchestrator', { event: 'recovery_attempted', nodeId: node.id, status: 'recovered' });
            
            const existingIds = new Set(dag.nodes.map(n => n.id));
            const nodesWithRetry = recoveryResult.newNodes
              .filter(n => !existingIds.has(n.id))
              .map(n => ({ ...n, retryCount: currentRetryCount + 1 }));
            if (nodesWithRetry.length === 0) {
              return { ok: false, result: "Recovery failed: no new recovery nodes were produced" };
            }
            node.status = "pending";
            node.retryCount = currentRetryCount + 1;
            node.dependencies = Array.from(new Set([...node.dependencies, ...nodesWithRetry.map(n => n.id)]));
            dag.nodes = [...dag.nodes, ...nodesWithRetry];
            continue;
          }

          return { ok: false, result: result.error || "Fatal execution error" };
        }
      }
    }

    dag.status = "completed";
    return { ok: true, result: memory.getResults() };
  }

  /**
   * Fail-Safe Dynamic Agent Selection
   */
  private async selectOptimalAgent(node: ExecutionNode, memory: ExecutionMemory): Promise<string> {
    const history = memory.getSummary();
    const prompt = `You are a Dispatcher for a Multi-Agent System.
Task: ${node.task}
Current History: ${history}

Based on the task and recent results, which agent is best suited for this?
Available Agents: Dev, Security, Browser, General.

Return ONLY the agent name.`;

    try {
      const messages = [
          { role: 'system', content: prompt },
          { role: 'user', content: node.task }
      ];
      const responseText = await intelligentRouter.routeToModel(messages, {
          type: 'complex_reasoning',
          complexity: 'low',
          requiresTools: false,
          estimatedTokens: 100,
          language: 'en'
      } as any, undefined, undefined, undefined, undefined, undefined, this.context);

      let decision: any;
      try {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          decision = jsonMatch ? JSON.parse(jsonMatch[0]) : responseText.trim();
      } catch (e) {
          decision = responseText.trim();
      }

      const agent = typeof decision === 'string' ? decision : (decision.agent || decision.primary || 'General');
      return ['Dev', 'Security', 'Browser', 'General'].includes(agent) ? agent : 'General';
    } catch {
      return node.agent; // Fallback to planned agent
    }
  }

  /**
   * Professional-grade progress evaluation
   * Checks if the current path is still optimal.
   */
  private async evaluateProgress(lastNode: ExecutionNode, memory: ExecutionMemory, dag: AgentDAG): Promise<{ shouldReplan: boolean }> {
    if (lastNode.agent === 'Browser' || lastNode.tool === 'browser_run') {
        return { shouldReplan: false };
    }

    const history = memory.getSummary();
    const systemPrompt = `Analyze the current execution history and determine if we need to adjust the plan.
Goal: ${dag.id}
History: ${history}

If the last result suggests a better path or a new requirement, set shouldReplan to true.`;

    try {
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Evaluate progress for goal: ${dag.id}` }
      ];
      
      const responseText = await intelligentRouter.routeToModel(messages, {
        type: 'complex_reasoning',
        complexity: 'low',
        requiresTools: false,
        estimatedTokens: 100,
        language: 'en'
      } as any, undefined, undefined, undefined, undefined, undefined, this.context);
      
      let evaluation: any;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        evaluation = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
      } catch (e) {
        evaluation = {};
      }
      return { shouldReplan: !!evaluation.shouldReplan };
    } catch {
      return { shouldReplan: false };
    }
  }

  /**
   * Failure Recovery Brain
   */
  private async attemptRecovery(failedNode: ExecutionNode, error: any, memory: ExecutionMemory, dag: AgentDAG, traceId?: string): Promise<{ recovered: boolean; newNodes: ExecutionNode[] }> {
    broadcastThinkingDetail(memory.sessionId, `⚠️ Analyzing failure: ${failedNode.task}...`);
    
    // Ask PlanningEngine for recovery nodes
    const recoveryPlan = await PlanningEngine.generatePlan({ 
        intent: { goal: `Fix and continue: ${failedNode.task}`, complexity: 'high', riskLevel: 'medium', suggestedAgent: failedNode.agent, rawIntent: {} }, 
        memory: memory.getHistory() 
    }, traceId, this.context);

    const newNodes: ExecutionNode[] = (recoveryPlan.steps as any).map((step: any) => ({
      id: step.id,
      traceId,
      agent: (step.agent as AgentType) || failedNode.agent || "General",
      task: step.description || step.task || "Recovery task",
      tool: step.tool,
      input: step.input,
      dependencies: step.dependsOn || [],
      status: "pending"
    }));

    return { 
        recovered: newNodes.length > 0, 
        newNodes 
    };
  }

  /**
   * Cleans output to ensure no raw shell/debug data leaks to API response
   */
  private sanitizeOutput(output: any): any {
    if (!output) return output;
    if (typeof output === 'string') {
      // Remove common shell artifacts or paths if sensitive
      return output.trim();
    }
    if (typeof output === 'object') {
      const sanitized = { ...output };
      // Remove known leaked fields from ToolService/child_process
      delete sanitized.stdout;
      delete sanitized.stderr;
      delete sanitized.command;
      return sanitized;
    }
    return output;
  }
}
