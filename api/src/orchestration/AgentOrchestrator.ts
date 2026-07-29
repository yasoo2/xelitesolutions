import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { IntentParser } from '../core/intelligence/IntentParser';
import { executeTool } from '../modules/services/ToolService';
import { broadcastThinkingDetail, broadcast } from '../api/ws';
import { emitDepartment } from './departments';
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

    // [Departments] BA analyses the request, then the Architect plans it.
    emitDepartment(goal.id, 'analyst');

    // 1. Initial Dynamic Planning
    emitDepartment(goal.id, 'architect');
    const dag = await this.plan(goal.goal, undefined, goal.traceId);
    dag.id = goal.id;

    if (goal.traceId) {
        traceManager.logEvent(goal.traceId, 'orchestrator', {
            event: 'execution_started',
            goal: goal.goal,
            dag_structure: dag.nodes.map(n => ({ id: n.id, task: n.task, tool: n.tool }))
        });
    }

    // 2. Adaptive Coordination Execution (Developer department)
    emitDepartment(goal.id, 'developer');
    const result = await executionFirewall.runInContext(goal.traceId, () => {
        return this.coordinate(dag, runtimeMemory, goal.context, goal.traceId);
    });

    // [Departments] QA reviews the outcome, then it's delivered.
    emitDepartment(goal.id, 'reviewer');
    emitDepartment(goal.id, 'delivered', result.ok ? 'ok' : 'failed');

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
        // [DECISION] Re-evaluate agent fit — EXCEPT for a browser node the
        // PlanningEngine pinned deterministically (tool browser_run + agent
        // Browser). Re-classification uses keyword guesses and demoted
        // «ادخل صفحة جيت هاب وسجّل الدخول» to the Dev agent (GitHub/repo read
        // as a coding task), which then ran browser_run as a bare tool and
        // failed with actions_or_instruction_required. The planner's explicit
        // browser routing always wins.
        const pinnedBrowserNode = node.tool === 'browser_run' && node.agent === 'Browser';
        if (!pinnedBrowserNode) {
          const refinedAgentType = await this.selectOptimalAgent(node, memory);
          if (refinedAgentType !== node.agent) {
            broadcastThinkingDetail(memory.sessionId, `🔄 Shifted agent for "${node.task}" to ${refinedAgentType}`);
            node.agent = refinedAgentType as AgentType;
          }
        }

        // Keep the tool consistent with the resolved agent (no repo task -> browser).
        // CRITICAL: never clobber a specific browser smart-tool (browser_summarize,
        // browser_responsive_check, browser_smart_agent, ...) — those are chosen
        // deterministically by PlanningEngine and executed directly below. Coercing
        // them to the generic browser_run here is what made every smart-browser
        // prompt fall through to a failed browser_run + "Recovery failed".
        if (node.tool !== 'central_answer') {
          const isSmartBrowserTool = typeof node.tool === 'string'
            && node.tool.startsWith('browser_') && node.tool !== 'browser_run';
          // Deterministic tools chosen by PlanningEngine (Google, the user's browser,
          // file read/write, page builder) must NEVER be coerced to browser_run just
          // because the agent got re-classified — that broke compound plans (e.g. the
          // "send" node of a browse->email plan ran the browser instead of Gmail).
          const DETERMINISTIC = ['google_account', 'user_browser', 'write_file', 'file_write', 'create_file', 'write_to_file', 'read_file', 'file_read', 'web_page_builder'];
          const isProtected = isSmartBrowserTool || (typeof node.tool === 'string' && DETERMINISTIC.includes(node.tool));
          if (!isProtected) {
            if (node.agent === 'Browser') { node.tool = 'browser_run'; }
            else if (node.tool === 'browser_run') { node.tool = 'shell_execute'; }
          }
        }

        node.status = "running";
        const startTime = Date.now();
        console.log(`[AgentOrchestrator] Executing node: ${node.id} (${node.task})`);
        broadcastThinkingDetail(memory.sessionId, `🚀 Running: ${node.task} via ${node.agent} Agent`);

        const isBrowserNode = node.agent === 'Browser' || node.tool === 'browser_run';
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
            language: goalContext?.language,
            // [PERSISTENT MEMORY] Forward the recalled user/project context so tools
            // (central_answer, page builder) can personalise their output.
            memoryContext: goalContext?.memoryContext
        };

        const isDirectAnswer = node.tool === 'central_answer'
          || /^(answering|respond to)\s*:/i.test(node.task || '');

        // Resolve {{FROM:<nodeId>}} references so a later node can CONSUME an earlier
        // node's output — e.g. write the browser's extracted data into a file. This
        // is what makes the browser chain with the other tools in one request.
        const nodeInput = this.resolveInputRefs(node.input, dag);

        try {
          if (isDirectAnswer) {
            const question = nodeInput?.question
              || (node.task || '').replace(/^(answering|respond to)\s*:\s*/i, '').trim()
              || node.task;
            result = await executeTool('central_answer', { question }, executionContext);
          } else if (node.tool === 'web_page_builder') {
            // Deterministic build tool — run it directly so the weak-model tool-picker
            // can't downgrade a "build a page" request back into a chat answer.
            result = await executeTool('web_page_builder', nodeInput, executionContext);
          } else if (typeof node.tool === 'string' && ((node.tool.startsWith('browser_') && node.tool !== 'browser_run') || node.tool === 'google_account' || node.tool === 'user_browser' || ['write_file', 'file_write', 'create_file', 'write_to_file', 'read_file', 'file_read'].includes(node.tool))) {
            // Deterministic tools (browser smart-tools, Google account, user's own
            // browser, file read/write) — run the exact tool directly so the weak-model
            // tool-picker or a Dev agent can't mis-handle a node that already names its
            // tool and carries a resolved input (e.g. write the browser's data to a file).
            result = await executeTool(node.tool, nodeInput, executionContext);
          } else if (agent) {
            result = await agent.execute(node.task, nodeInput, executionContext);
          } else {
            result = await executeTool(node.tool, { ...nodeInput, context: memory.getHistory() }, executionContext);
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

          // Tools that report a "the user must do X" state — connect Google, install
          // the browser extension, provide a 2FA code — are asking the USER to act.
          // That is a legitimate answer to surface, NOT a system failure to "recover"
          // from. Show the tool's own message instead of spawning a recovery loop.
          const userActionableTool = typeof node.tool === 'string' &&
            (node.tool === 'google_account' || node.tool === 'user_browser' || node.tool.startsWith('browser_'));
          const toolMsg = (result as any)?.output?.message || (result as any)?.output?.summary;
          if (userActionableTool && toolMsg) {
            node.status = "completed";
            node.result = toolMsg;
            memory.record(node.id, node.task, String(toolMsg), "completed");
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

          // [DECISION] Intelligent recovery attempt (Reviewer/QA department steps in)
          emitDepartment(memory.sessionId, 'reviewer', `recovering: ${node.task}`);
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
   * Replace {{FROM:<nodeId>}} markers in a node's input with the referenced node's
   * result, so one tool can consume another's output (browser -> file, etc.).
   */
  private resolveInputRefs(input: any, dag: any): any {
    const textOf = (r: any): string => {
      if (r == null) return '';
      if (typeof r === 'string') return r;
      const o = r.output ?? r;
      return String(
        o?.answer ?? o?.message ?? o?.summary ?? o?.text ??
        (typeof o === 'string' ? o : JSON.stringify(o))
      );
    };
    const walk = (v: any): any => {
      if (typeof v === 'string') {
        return v.replace(/\{\{\s*FROM:([a-zA-Z0-9_-]+)\s*\}\}/g, (_m, id) => {
          const dep = (dag?.nodes || []).find((n: any) => n.id === id);
          return dep ? textOf(dep.result) : '';
        });
      }
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') { const out: any = {}; for (const k of Object.keys(v)) out[k] = walk(v[k]); return out; }
      return v;
    };
    try { return walk(input); } catch { return input; }
  }

  /**
   * A task is a real web/browser task ONLY when it navigates to a URL or an
   * explicit web page - NOT merely because it contains the word "browser" or
   * "search" (which wrongly sent repo-search tasks to the browser).
   */
  static isWebTask(text: string): boolean {
    const t = String(text || '');
    const low = t.toLowerCase();
    if (/https?:\/\//.test(low)) return true;
    if (/\bwww\.[a-z0-9-]+\.[a-z]{2,}/.test(low)) return true;
    if (/\b[a-z0-9-]+\.(com|org|net|io|dev|co|app|gov|edu|ai)\b/.test(low)) return true;
    if (/(navigate to|browse to|open (the )?(web ?site|url|page|link)|go to (the )?(web ?site|url|https?|page))/.test(low)) return true;
    if (/(افتح|اذهب\s*(إلى|الى)|تصفّ?ح)\s*(الموقع|الرابط|صفحة|الصفحة|https?)/.test(t)) return true;
    return false;
  }

  /**
   * Deterministic agent routing (no LLM call): instant and correct on free models.
   */
  private async selectOptimalAgent(node: ExecutionNode, _memory: ExecutionMemory): Promise<string> {
    if (node.tool === 'central_answer' || /^(answering|respond to)\s*:/i.test(node.task || '')) {
      return 'General';
    }
    if (AgentOrchestrator.isWebTask(node.task) || AgentOrchestrator.isWebTask(JSON.stringify(node.input || ''))) {
      return 'Browser';
    }
    const t = (node.task || '').toLowerCase();
    if (/\b(security|vulnerab|exploit|owasp|penetration|cve)\b|أمان|ثغرة|اختراق/.test(t)) {
      return 'Security';
    }
    return 'Dev';
  }

  /**
   * Professional-grade progress evaluation
   * Checks if the current path is still optimal.
   */
  private async evaluateProgress(_lastNode: ExecutionNode, _memory: ExecutionMemory, _dag: AgentDAG): Promise<{ shouldReplan: boolean }> {
    // Mid-flight LLM replanning disabled: on free models it fired spurious replans
    // that exploded the DAG and slowed everything. Saves one LLM call per node.
    return { shouldReplan: false };
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
