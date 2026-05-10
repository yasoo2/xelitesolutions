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
   * Executes DAG, evaluates progress after each step, and re-plans if needed.
   * This is the "Main Execution Brain" of the runtime.
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
        // [STALLED] Trigger immediate dynamic re-planning
        console.warn(`[AgentOrchestrator] Execution stalled. Re-computing strategy...`);
        const newDag = await this.plan(dag.nodes[0]?.task || "continue goal", memory);
        dag.nodes = [...dag.nodes, ...newDag.nodes];
        continue;
      }

      for (const node of readyNodes) {
        // [ADAPTIVE] Re-evaluate agent selection right before execution based on latest memory
        const refinedAgentType = await this.selectOptimalAgent(node, memory);
        if (refinedAgentType !== node.agent) {
          console.log(`[AgentOrchestrator] Dynamic Agent Shift: ${node.agent} -> ${refinedAgentType} for task "${node.task}"`);
          node.agent = refinedAgentType as AgentType;
        }

        node.status = "running";
        broadcastThinkingDetail(memory.sessionId, `🚀 Agent Execution: ${node.agent} is processing "${node.task}"`);
        
        const agent = this.agents.get(node.agent);
        let result;

        try {
          if (agent) {
            result = await agent.execute(node.task, node.input, { sessionId: dag.id, memory: memory.getHistory() });
          } else {
            result = await executeTool(node.tool, { ...node.input, context: memory.getHistory() }, { sessionId: dag.id });
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

          // [SELF-ADAPTIVE] Mid-Execution Evaluation
          const evaluation = await this.evaluateProgress(node, memory, dag);
          if (evaluation.shouldReplan) {
            console.log(`[AgentOrchestrator] Progress evaluation triggered RE-PLAN.`);
            broadcastThinkingDetail(memory.sessionId, "🧠 Goal analysis suggests path adjustment. Re-planning...");
            const updatedDag = await this.plan(dag.id, memory); // Re-plan based on current memory
            dag.nodes = updatedDag.nodes; 
            break; // Break the current node loop to start fresh with new DAG
          }
        } else {
          console.error(`[AgentOrchestrator] Node ${node.id} failed: ${result.error}`);
          node.status = "failed";
          memory.record(node.id, node.task, result.error, "failed");

          // [RECOVERY] Attempt intelligent failure recovery
          const recoveryResult = await this.attemptRecovery(node, result.error, memory, dag);
          if (recoveryResult.recovered) {
            dag.nodes = [...dag.nodes, ...recoveryResult.newNodes];
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
      const decision = await advancedAnalyzeTask(node.task, prompt);
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
    const history = memory.getSummary();
    const systemPrompt = `Analyze the current execution history and determine if we need to adjust the plan.
Goal: ${dag.id}
History: ${history}

If the last result suggests a better path or a new requirement, set shouldReplan to true.`;

    try {
      const evaluation = await advancedAnalyzeTask(`Evaluate progress for goal: ${dag.id}`, systemPrompt);
      return { shouldReplan: !!evaluation.shouldReplan };
    } catch {
      return { shouldReplan: false };
    }
  }

  /**
   * Failure Recovery Brain
   */
  private async attemptRecovery(failedNode: ExecutionNode, error: any, memory: ExecutionMemory, dag: AgentDAG): Promise<{ recovered: boolean; newNodes: ExecutionNode[] }> {
    broadcastThinkingDetail(memory.sessionId, `⚠️ Analyzing failure: ${failedNode.task}...`);
    
    // Ask PlanningEngine for recovery nodes
    const recoveryPlan = await PlanningEngine.generatePlan({ 
        intent: { goal: `Fix and continue: ${failedNode.task}`, complexity: 'high', riskLevel: 'medium', suggestedAgent: failedNode.agent, rawIntent: {} }, 
        memory: memory.getHistory() 
    });

    return { 
        recovered: recoveryPlan.steps.length > 0, 
        newNodes: (recoveryPlan.steps as any).map((s: any) => ({ ...s, status: 'pending' })) 
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
