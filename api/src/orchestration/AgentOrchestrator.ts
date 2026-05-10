import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { IntentParser } from '../core/intelligence/IntentParser';
import { executeTool } from '../modules/services/ToolService';
import { broadcastThinkingDetail } from '../api/ws';
import { v4 as uuidv4 } from 'uuid';
import { BaseAgent } from './agents/BaseAgent';
import { DevAgent } from './agents/DevAgent';
import { SecurityAgent } from './agents/SecurityAgent';

/**
 * Modular Agent Platform - Core Intelligence Layer
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
  private memory: Map<string, any> = new Map();
  private agents: Map<AgentType, BaseAgent> = new Map();

  constructor() {
    // Register specialized agents
    const devAgent = new DevAgent();
    this.agents.set("Dev", devAgent);
    this.agents.set("Security", new SecurityAgent());
    this.agents.set("General", devAgent); // Use DevAgent as fallback for General tasks
    // More agents can be added here
  }

  /**
   * Main entry point: Executes a high-level goal
   */
  public async execute(goal: AgentGoal): Promise<{ ok: boolean; result: any }> {
    console.log(`[AgentOrchestrator] Executing goal: ${goal.goal} (ID: ${goal.id})`);
    broadcastThinkingDetail(goal.id, `🧠 Initializing Orchestrator for goal: ${goal.goal}`);

    // 1. Generate Structured DAG
    const dag = await this.plan(goal.goal);
    dag.id = goal.id;

    // 2. Coordinate Execution
    return await this.coordinate(dag);
  }

  /**
   * Converts goal into a structured execution plan (DAG)
   */
  public async plan(goalText: string): Promise<AgentDAG> {
    const context = IntentParser.createContext('orchestrator', 'global', []);
    const intent = await IntentParser.parse(goalText, context);
    const rawPlan = await PlanningEngine.generatePlan(intent);

    const nodes: ExecutionNode[] = rawPlan.steps.map((step, index) => ({
      id: step.id || `node_${index + 1}`,
      agent: this.selectAgent(step.description),
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
   * Selects the appropriate agent based on task description
   */
  private selectAgent(task: string): AgentType {
    const t = task.toLowerCase();
    if (t.includes('security') || t.includes('audit') || t.includes('vulnerability')) return "Security";
    if (t.includes('deploy') || t.includes('cicd') || t.includes('docker') || t.includes('server')) return "Deploy";
    if (t.includes('browser') || t.includes('scrape') || t.includes('click') || t.includes('site')) return "Browser";
    if (t.includes('code') || t.includes('fix') || t.includes('refactor') || t.includes('build')) return "Dev";
    return "General";
  }

  /**
   * Coordinates DAG execution through ExecutionEngine (ToolService)
   */
  private async coordinate(dag: AgentDAG): Promise<{ ok: boolean; result: any }> {
    dag.status = "running";
    const completedNodes = new Set<string>();
    const results: Record<string, any> = {};

    while (completedNodes.size < dag.nodes.length) {
      const readyNodes = dag.nodes.filter(n => 
        n.status === "pending" && 
        n.dependencies.every(depId => completedNodes.has(depId))
      );

      if (readyNodes.length === 0 && completedNodes.size < dag.nodes.length) {
        throw new Error(`Circular dependency detected or stalled DAG at ${completedNodes.size}/${dag.nodes.length} nodes`);
      }

      // Execute ready nodes (parallelizable, but sequential for safety in this version)
      for (const node of readyNodes) {
        node.status = "running";
        
        const agent = this.agents.get(node.agent);
        let result;

        if (agent) {
          console.log(`[AgentOrchestrator] Delegating to ${node.agent} Agent: ${node.task}`);
          result = await agent.execute(node.task, node.input, { sessionId: dag.id, results });
        } else {
          // Fallback to direct ToolService execution
          console.log(`[AgentOrchestrator] No specialized agent for ${node.agent}. Falling back to ToolService.`);
          result = await executeTool(node.tool, { ...node.input, orchestratorContext: results }, { sessionId: dag.id });
        }
        
        if (result.ok) {
          node.status = "completed";
          // [HARDENING] Clean output to prevent shell leakage
          const cleanOutput = this.sanitizeOutput(result.output);
          node.result = cleanOutput;
          results[node.id] = cleanOutput;
          completedNodes.add(node.id);
        } else {
          console.warn(`[AgentOrchestrator] Node ${node.id} failed: ${result.error || result.error}. Attempting re-plan...`);
          node.status = "failed";
          return { ok: false, result: result.error || "Execution failed" };
        }
      }
    }

    dag.status = "completed";
    return { ok: true, result: results };
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
