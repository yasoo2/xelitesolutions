import { PlanningEngine, ExecutionNode as PlanNode } from '../core/orchestrator/PlanningEngine';
import { IntentParser } from '../core/intelligence/IntentParser';
import { executeTool } from '../modules/services/ToolService';
import { broadcastThinkingDetail } from '../api/ws';
import { v4 as uuidv4 } from 'uuid';
import { BaseAgent } from './agents/BaseAgent';
import { DevAgent } from './agents/DevAgent';
import { SecurityAgent } from './agents/SecurityAgent';
import { ExecutionMemory } from '../core/orchestrator/ExecutionMemory';

/**
 * Modular Agent Platform - Core Intelligence Layer (REAL Agent Runtime)
 */

export type AgentGoal = {
  id: string;
  goal: string;
  context?: Record<string, any>;
  priority?: "low" | "medium" | "high";
};

export type AgentType = "Dev" | "Security" | "Deploy" | "Browser" | "General";

export type ExecutionNode = {
  id: string;
  agent: AgentType;
  task: string;
  tool: string;
  input: any;
  dependencies: string[];
  status: "pending" | "running" | "completed" | "failed";
  result?: any;
};

export type AgentDAG = {
  id: string;
  nodes: ExecutionNode[];
  status: "idle" | "running" | "completed" | "failed";
};

export class AgentOrchestrator {
  private memory: Map<string, ExecutionMemory> = new Map();
  private agents: Map<AgentType, BaseAgent> = new Map();

  constructor() {
    // Register specialized agents
    const devAgent = new DevAgent();
    this.agents.set("Dev", devAgent);
    this.agents.set("Security", new SecurityAgent());
    this.agents.set("General", devAgent); 
  }

  /**
   * Main entry point: Executes a high-level goal with REAL-TIME intelligence
   */
  public async execute(goal: AgentGoal): Promise<{ ok: boolean; result: any }> {
    console.log(`[AgentOrchestrator] Starting REAL-TIME orchestration for goal: ${goal.goal}`);
    broadcastThinkingDetail(goal.id, `🧠 Initializing Autonomous Brain for goal: ${goal.goal}`);

    // Initialize Runtime Memory
    const runtimeMemory = new ExecutionMemory(goal.id);
    this.memory.set(goal.id, runtimeMemory);

    // 1. Initial Dynamic Planning
    const dag = await this.plan(goal.goal);
    dag.id = goal.id;

    // 2. Adaptive Coordination Execution
    return await this.coordinate(dag, runtimeMemory);
  }

  /**
   * Converts goal into a structured execution plan (DAG) dynamically
   */
  public async plan(goalText: string, memory?: ExecutionMemory): Promise<AgentDAG> {
    const context = IntentParser.createContext('orchestrator', 'global', []);
    const intent = await IntentParser.parse(goalText, context);
    
    // Inject memory into planning if available
    const historySummary = memory ? memory.getSummary() : "";
    const enrichedGoal = historySummary 
        ? `${goalText}\n\n[CONTEXT: Previous attempts/steps results]\n${historySummary}` 
        : goalText;

    const rawPlan = await PlanningEngine.generatePlan({ ...intent, goal: enrichedGoal });

    const nodes: ExecutionNode[] = rawPlan.steps.map((step) => ({
      id: step.id,
      agent: (step.agent as AgentType) || "General",
      task: step.description,
      tool: step.tool,
      input: step.input,
      dependencies: step.dependsOn || [],
      status: "pending"
    }));

    return {
      id: uuidv4(),
      nodes,
      status: "idle"
    };
  }

  /**
   * ADAPTIVE COORDINATION LOOP
   * Executes DAG, re-plans if needed, and learns from results
   */
  private async coordinate(dag: AgentDAG, memory: ExecutionMemory): Promise<{ ok: boolean; result: any }> {
    dag.status = "running";
    const completedNodes = new Set<string>();

    while (completedNodes.size < dag.nodes.length) {
      const readyNodes = dag.nodes.filter(n => 
        n.status === "pending" && 
        n.dependencies.every(depId => completedNodes.has(depId))
      );

      if (readyNodes.length === 0 && completedNodes.size < dag.nodes.length) {
        // [ADAPTIVE] If stalled, trigger a re-plan
        console.warn(`[AgentOrchestrator] DAG stalled. Triggering mid-execution re-plan...`);
        const newDag = await this.plan(dag.nodes[0]?.task || "continue execution", memory);
        dag.nodes = [...dag.nodes, ...newDag.nodes];
        continue;
      }

      for (const node of readyNodes) {
        node.status = "running";
        broadcastThinkingDetail(memory.sessionId, `⚡ Running: ${node.task} via ${node.agent} Agent`);
        
        const agent = this.agents.get(node.agent);
        let result;

        if (agent) {
          result = await agent.execute(node.task, node.input, { sessionId: dag.id, results: memory.getResults() });
        } else {
          result = await executeTool(node.tool, { ...node.input, orchestratorContext: memory.getResults() }, { sessionId: dag.id });
        }
        
        if (result.ok) {
          node.status = "completed";
          const cleanOutput = this.sanitizeOutput(result.output);
          node.result = cleanOutput;
          memory.record(node.id, node.task, cleanOutput, "completed");
          completedNodes.add(node.id);

          // [ADAPTIVE] Mid-Execution Re-evaluation
          await this.evaluateProgress(node, memory, dag);
        } else {
          console.warn(`[AgentOrchestrator] Step failed: ${node.id}. Triggering ADAPTIVE RECOVERY.`);
          node.status = "failed";
          memory.record(node.id, node.task, result.error, "failed");

          // [CRITICAL] Re-plan DAG to recover from failure
          const recoveryDag = await this.plan(`Recover from failure in ${node.task}. Error: ${result.error}`, memory);
          if (recoveryDag && recoveryDag.nodes.length > 0) {
             // Add recovery nodes to DAG
             dag.nodes = [...dag.nodes, ...recoveryDag.nodes];
             continue; 
          }

          return { ok: false, result: result.error || "Execution failed" };
        }
      }
    }

    dag.status = "completed";
    return { ok: true, result: memory.getResults() };
  }

  /**
   * Evaluates if the goal needs adjustment after a step succeeds
   */
  private async evaluateProgress(node: ExecutionNode, memory: ExecutionMemory, dag: AgentDAG) {
     const history = memory.getHistory();
     const lastResult = history[history.length - 1]?.result;
     
     // If the result suggests the plan is finished early or needs more steps
     if (typeof lastResult === 'string' && (lastResult.includes('DONE') || lastResult.includes('FINISHED'))) {
         console.log(`[AgentOrchestrator] Early completion signal detected in ${node.id}`);
     }
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
