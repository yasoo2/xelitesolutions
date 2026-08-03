import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { IntentParser } from '../core/intelligence/IntentParser';
import { executeTool } from '../modules/services/ToolService';
import { broadcastThinkingDetail, broadcast } from '../api/ws';
import { narrate, narrationEnabled } from '../core/agents/narrator';
import { routeToModel, isProviderFailure, PROVIDER_FAILURE_PREFIX } from '../core/llm/intelligent-router';
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
import { withDeadline, NODE_DEADLINE_MS, RUN_DEADLINE_MS } from '../shared/utils/deadline';
import { repairMemory } from '../core/memory/repair-memory';

/** Tools the PlanningEngine picks DETERMINISTICALLY. A node carrying one of
 *  these already knows exactly what to run and with which input, so it must be
 *  executed as-is — never re-decided by the weak-model tool-picker inside
 *  JoeAgent, whose menu is a short hardcoded list. That re-decision is what
 *  silently discarded `github_repo_manager(analyze)`: the picker could not even
 *  see that tool, fell back to another one, and the repo was never analysed. */
const DETERMINISTIC_TOOLS = [
    'google_account', 'user_browser',
    'write_file', 'file_write', 'create_file', 'write_to_file', 'read_file', 'file_read',
    'web_page_builder', 'react_project', 'project_edit', 'form_inbox', 'github_repo_manager', 'project_pipeline', 'project_run', 'project_stop', 'deploy_pages',
];

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
  /** The error this node last failed with — the key into repair memory. */
  lastError?: string;
  /** What the injected recovery nodes did — recorded as the cure if the retry succeeds. */
  repairNote?: string;
};

export type AgentDAG = {
  id: string;
  nodes: ExecutionNode[];
  status: "idle" | "running" | "completed" | "failed";
};

/**
 * A RUN-LEVEL recovery budget. The per-node retry cap (2) never stopped the
 * field failure: every recovery injects NEW nodes with NEW ids whose retry
 * counters start at zero, so one broken request grew 5 → 9 → 12 → 13 nodes,
 * each cycle burning provider tokens and minutes. Three recoveries per run
 * is the honest ceiling — past it, Joe says what failed and stops.
 */
const MAX_RECOVERIES_PER_RUN = 3;

export class AgentOrchestrator {
  private recoveriesUsed = 0;
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
        return this.coordinate(dag, runtimeMemory, goal.context, goal.traceId, goal.goal);
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
    traceId?: string,
    /** The user's request, verbatim — what the narration is about. */
    goalText?: string,
  ): Promise<{ ok: boolean; result: any }> {
    dag.status = "running";
    const completedNodes = new Set<string>();
    let iterations = 0;
    let stalledReplans = 0;
    // The last REAL error a node produced. Every "the orchestrator gave up" exit
    // below reports this instead of describing its own internal state — the user
    // needs to read why the work failed, not how the scheduler noticed.
    let lastNodeError: any = null;
    /**
     * The step that finished last, and how it went — the only thing that makes
     * the narration below narration rather than decoration. A line that could
     * have been written before the step ran says nothing about the run.
     */
    let lastDone: { task: string; ok: boolean; summary?: string } | undefined;
    let stepNo = 0;
    const maxIterations = Math.max(10, dag.nodes.length * 5);
    const giveUp = (fallback: string) => ({ ok: false, result: lastNodeError || fallback });

    while (completedNodes.size < dag.nodes.length) {
      iterations++;
      if (iterations > maxIterations) {
        dag.status = "failed";
        return giveUp("Execution stopped: orchestration iteration limit exceeded");
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
          return giveUp("Execution stopped: no ready nodes after recovery/replanning attempts");
        }
        const newDag = await this.plan(dag.nodes[0]?.task || "continue goal", memory, traceId);
        const existingIds = new Set(dag.nodes.map(n => n.id));
        const uniqueNodes = newDag.nodes.filter(n => !existingIds.has(n.id));
        if (uniqueNodes.length === 0) {
          dag.status = "failed";
          return giveUp("Execution stopped: replanning produced no new executable nodes");
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
          const isProtected = isSmartBrowserTool || (typeof node.tool === 'string' && DETERMINISTIC_TOOLS.includes(node.tool));
          if (!isProtected) {
            if (node.agent === 'Browser') { node.tool = 'browser_run'; }
            else if (node.tool === 'browser_run') { node.tool = 'shell_execute'; }
          }
        }

        node.status = "running";
        const startTime = Date.now();
        console.log(`[AgentOrchestrator] Executing node: ${node.id} (${node.task})`);
        /**
         * THE AGENT SAYS, IN ITS OWN WORDS, WHAT IT IS DOING.
         *
         * This line used to be `🚀 Running: ${node.task} via ${node.agent}` — a
         * template filled in from the plan, displayed under the heading
         * "التفكير العصبي". It could have been written before the run started,
         * which is what made it a simulated tool wearing a real one's name.
         *
         * Now the model is shown what just finished, INCLUDING whether it
         * worked, and asked for one sentence. When it does not answer, or
         * answers badly, nothing is shown — there is deliberately no fallback
         * sentence, because a canned line under that heading is the exact fake
         * this replaces. The step never waits on it beyond the timeout and
         * never fails because of it.
         */
        stepNo++;
        if (narrationEnabled()) {
            const line = await narrate(
                {
                    goal: goalText || node.task,
                    done: lastDone,
                    next: { task: node.task, tool: node.tool },
                    index: stepNo,
                    total: dag.nodes.length,
                    isArabic: /[ؠ-ٟٮ-ۓۺ-ۿ]/.test(String(goalText || '')),
                },
                (prompt) => routeToModel(
                    [{ role: 'user', content: prompt }],
                    undefined, undefined, undefined, undefined, undefined, undefined,
                    { modelConfig: goalContext?.modelConfig, purpose: 'internal' },
                ),
            );
            if (line.text) broadcastThinkingDetail(memory.sessionId, line.text);
            else console.log(`[Narrator] no line for ${node.id} (${line.reject || 'rejected'})`);
        }

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

        const liveSessionId = goalContext?.sessionId || dag.id;
        const executionContext = {
            sessionId: liveSessionId,
            workspaceId: goalContext?.workspaceId,
            userId: goalContext?.userId,
            userName: goalContext?.userName,
            systemInstructions: goalContext?.systemInstructions,
            traceId,
            memory: memory.getHistory(),
            modelConfig: goalContext?.modelConfig,
            language: goalContext?.language,
            // [PERSISTENT MEMORY] Forward the recalled user/project context so tools
            // (central_answer, page builder) can personalise their output.
            memoryContext: goalContext?.memoryContext,
            // [LIVE VOICE] Tools accept onProgress/onThought (phase executor,
            // project pipeline, …) but the orchestrator never provided them —
            // every progress call was a silent no-op and a multi-phase build ran
            // MUTE for minutes, looking frozen. Wire both to the same
            // thinking_detail stream the panel already renders.
            onProgress: (m: string) => { try { broadcastThinkingDetail(liveSessionId, m); } catch { /* panel optional */ } },
            onThought: (m: string) => { try { broadcastThinkingDetail(liveSessionId, m); } catch { /* panel optional */ } },
        };

        const isDirectAnswer = node.tool === 'central_answer'
          || /^(answering|respond to)\s*:/i.test(node.task || '');

        // Resolve {{FROM:<nodeId>}} references so a later node can CONSUME an earlier
        // node's output — e.g. write the browser's extracted data into a file. This
        // is what makes the browser chain with the other tools in one request.
        const nodeInput = this.resolveInputRefs(node.input, dag);

        try {
          // [WALL CLOCK] The stall detector only runs BETWEEN iterations — an
          // await that hangs inside a tool froze the whole run invisibly. Every
          // node now has a hard deadline; on expiry the node fails HONESTLY
          // («deadline_exceeded») and the run moves on or ends with a reason.
          // A full-project pipeline node runs many phases (installs, builds,
          // QA) — it gets the RUN budget, not a single node's slice.
          const nodeBudget = node.tool === 'project_pipeline' ? RUN_DEADLINE_MS : NODE_DEADLINE_MS;
          const deadline = <T,>(p: Promise<T>) =>
            withDeadline(p, nodeBudget, `node ${node.id} (${node.tool || node.agent || 'task'})`);
          if (isDirectAnswer) {
            const question = nodeInput?.question
              || (node.task || '').replace(/^(answering|respond to)\s*:\s*/i, '').trim()
              || node.task;
            result = await deadline(executeTool('central_answer', { question }, executionContext));
          } else if (node.tool === 'web_page_builder') {
            // Deterministic build tool — run it directly so the weak-model tool-picker
            // can't downgrade a "build a page" request back into a chat answer.
            result = await deadline(executeTool('web_page_builder', nodeInput, executionContext));
          } else if (typeof node.tool === 'string' && ((node.tool.startsWith('browser_') && node.tool !== 'browser_run') || DETERMINISTIC_TOOLS.includes(node.tool))) {
            // Deterministic tools (browser smart-tools, Google account, user's own
            // browser, file read/write) — run the exact tool directly so the weak-model
            // tool-picker or a Dev agent can't mis-handle a node that already names its
            // tool and carries a resolved input (e.g. write the browser's data to a file).
            result = await deadline(executeTool(node.tool, nodeInput, executionContext));
          } else if (agent) {
            result = await deadline(agent.execute(node.task, nodeInput, executionContext));
          } else {
            result = await deadline(executeTool(node.tool, { ...nodeInput, context: memory.getHistory() }, executionContext));
          }
        } catch (err: any) {
          result = { ok: false, error: err.message };
        }
        
        if (result.ok) {
          // A retry that succeeds PROVES the repair worked — that is the only
          // moment a cure is worth remembering. Recording at plan time would
          // memorize guesses; recording here memorizes verified medicine.
          if ((node.retryCount || 0) > 0 && node.lastError && node.repairNote) {
            repairMemory.recordRepair(node.lastError, node.repairNote)
              .catch((e) => console.warn('[RepairMemory] record failed:', e?.message));
          }
          lastDone = { task: node.task, ok: true, summary: undefined };
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
          const out = (result as any)?.output || {};
          // An explicit "user must act" marker on ANY tool's output means the same:
          // surface the message, never loop. deploy_pages returning needsConnect
          // used to trigger a browser "obtain a token" recovery loop — exactly the
          // wrong response. The tool's own error IS the answer the user needs.
          const userActionMarker = !!(out.needsConnect || out.needsRepo || out.tokenInvalid || out.unsupported);
          const userActionableTool = (typeof node.tool === 'string' &&
            (node.tool === 'google_account' || node.tool === 'user_browser' || node.tool.startsWith('browser_')))
            || userActionMarker;
          const toolMsg = out.message || out.summary || (userActionMarker ? result.error : undefined);
          if (userActionableTool && toolMsg) {
            node.status = "completed";
            node.result = toolMsg;
            memory.record(node.id, node.task, String(toolMsg), "completed");
            completedNodes.add(node.id);
            continue;
          }

          node.status = "failed";
          lastNodeError = result.error || lastNodeError;
          node.lastError = typeof result.error === 'string' ? result.error : JSON.stringify(result.error ?? '');
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

          /**
           * A DEAD BRAIN IS NOT A FAILURE TO RECOVER FROM. IT IS THE END.
           *
           * When every provider is unreachable, this used to hand the failure
           * to the PLANNER — which is itself an LLM call, on the engine that
           * just proved unreachable. Worse, the planner reads the failure text,
           * and that text is Joe's advice TO THE USER: «شغّل Ollama محلياً …
           * أو تحقّق من اتصال الإنترنت». It duly turned that advice into a task
           * list and executed it.
           *
           * Measured in a real session, after the user asked only to recolour a
           * page: a seven-node "Fix and continue" plan whose first step,
           * `check_internet`, went to the BROWSER agent — which opened a real
           * browser window and asked the user to intervene — and whose second,
           * `run_ollama_locally`, ran `ollama serve` in their terminal. The user
           * saw a browser open «لأسباب لا أعلمها». That is what happened.
           *
           * Remediation text is for a human to read, never for a planner to
           * execute. When the engine is gone, say so once and stop.
           */
          // CONTAINS, not starts-with: by the time a failure reaches here it has
          // usually been wrapped ("Node X failed: …"), and `isProviderFailure`
          // anchors at the start because narration needs it to.
          const saysNoBrain = (x: any) =>
            isProviderFailure(x) || String(x ?? '').includes(PROVIDER_FAILURE_PREFIX);
          if (saysNoBrain(result.error) || saysNoBrain((result as any).result)) {
            console.error('[AgentOrchestrator] No LLM provider reachable — ending the run instead of planning a recovery.');
            if (traceId) traceManager.logEvent(traceId, 'orchestrator', { event: 'recovery_skipped', nodeId: node.id, reason: 'provider_unreachable' });
            return { ok: false, result: result.error };
          }

          // [DECISION] Intelligent recovery attempt (Reviewer/QA department steps in)
          emitDepartment(memory.sessionId, 'reviewer', `recovering: ${node.task}`);
          const currentRetryCount = node.retryCount || 0;
          if (currentRetryCount >= 2) {
            console.error(`[AgentOrchestrator] Max retries reached for node: ${node.id}`);
            return { ok: false, result: result.error || "Fatal execution error: Max retries reached" };
          }

          if (this.recoveriesUsed >= MAX_RECOVERIES_PER_RUN) {
            console.error(`[AgentOrchestrator] Recovery budget exhausted (${MAX_RECOVERIES_PER_RUN} per run) — stopping honestly instead of growing the plan again.`);
            if (traceId) traceManager.logEvent(traceId, 'orchestrator', { event: 'recovery_budget_exhausted', nodeId: node.id });
            return {
              ok: false,
              result: `تعذّر إكمال المهمة بعد ${MAX_RECOVERIES_PER_RUN} محاولات إصلاح متتالية — توقفت بصدق بدل الدوران في حلقة إصلاحات. آخر خطأ: ${String((result.error as any)?.message || result.error || '').slice(0, 300)}`,
            };
          }
          this.recoveriesUsed++;
          const recoveryResult = await this.attemptRecovery(node, result.error, memory, dag, traceId);
          if (recoveryResult.recovered) {
            broadcastThinkingDetail(memory.sessionId, `⚠️ Recovering from failure in "${node.task}". Injecting repair nodes...`);
            if (traceId) traceManager.logEvent(traceId, 'orchestrator', { event: 'recovery_attempted', nodeId: node.id, status: 'recovered' });
            
            const existingIds = new Set(dag.nodes.map(n => n.id));
            const nodesWithRetry = recoveryResult.newNodes
              .filter(n => !existingIds.has(n.id))
              .map(n => ({ ...n, retryCount: currentRetryCount + 1 }));
            if (nodesWithRetry.length === 0) {
              // The planner builds deterministic node ids, so a recovery plan for a
              // failed node usually comes back carrying that SAME id. Filtering it
              // out left zero nodes and the user got the meaningless line "Recovery
              // failed: no new recovery nodes were produced" instead of the actual
              // failure (a DNS blip on api.github.com, in the reported case).
              // A recovery plan that re-proposes the same step IS "run it again",
              // which is exactly the right move for a transient error — so retry the
              // node in place and let the retry ceiling above end it if it keeps
              // failing, at which point the REAL error is what gets returned.
              const proposesSameStep = recoveryResult.newNodes.some(n =>
                n.id === node.id || (!!n.tool && n.tool === node.tool));
              if (proposesSameStep) {
                broadcastThinkingDetail(memory.sessionId, `🔁 Retrying "${node.task}" after a transient failure...`);
                node.status = "pending";
                node.retryCount = currentRetryCount + 1;
                continue;
              }
              // Nothing usable came back: surface the real reason the node failed,
              // never a description of the recovery machinery.
              return { ok: false, result: result.error || "Fatal execution error" };
            }
            node.status = "pending";
            node.retryCount = currentRetryCount + 1;
            // What the cure DID, phrased for a future planning prompt. If the
            // retry succeeds, this exact line becomes the remembered medicine.
            node.repairNote = nodesWithRetry
              .map(n => `${n.tool || n.agent}: ${n.task}`).join(' | ').slice(0, 500);
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

    // The ERROR TEXT rides in the recovery goal itself. Before this, the planner
    // was asked to "Fix and continue: <task>" while the actual failure reason sat
    // buried in a raw history JSON blob — a weak model plans the repair from the
    // task title and re-runs the same failing step. A doctor cannot treat a
    // patient whose symptoms were withheld.
    const errorText = String(
        (error && typeof error === 'object') ? ((error as any).message || JSON.stringify(error)) : (error ?? '')
    ).slice(0, 1500);

    // Scar tissue: if Joe beat this exact class of error before, the proven cure
    // rides into the planning prompt. The planner still thinks — the memory is a
    // strong lead, not a script — but it starts from experience, not from zero.
    let rememberedCure = '';
    try {
        const known = errorText ? repairMemory.recallRepair(errorText) : null;
        if (known) {
            rememberedCure = `\n[A REPAIR THAT WORKED FOR THIS SAME ERROR BEFORE (proven ${known.wins}x) — prefer it unless the context clearly differs]:\n${known.repair}`;
            broadcastThinkingDetail(memory.sessionId, `🧠 أعرف هذا الخطأ — العلاج الذي نجح سابقاً: ${known.repair.slice(0, 120)}`);
        }
    } catch { /* memory is a bonus, never a blocker */ }

    const recoveryGoal = errorText
        ? `Fix and continue: ${failedNode.task}\n[THE STEP FAILED WITH THIS ERROR — read it and plan the repair around its cause]:\n${errorText}${rememberedCure}`
        : `Fix and continue: ${failedNode.task}`;

    // Ask PlanningEngine for recovery nodes
    const recoveryPlan = await PlanningEngine.generatePlan({
        intent: { goal: recoveryGoal, complexity: 'high', riskLevel: 'medium', suggestedAgent: failedNode.agent, rawIntent: {} },
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
      // TRUNCATE stdout/stderr — never delete them. Deleting blinded every later
      // step in the DAG: "run the tests, then fix what failed" recorded a
      // successful test run as {status:'success'} with the entire report erased,
      // so the fix step had nothing to read. The output of a command Joe ran IS
      // the material the next step works with.
      if (typeof sanitized.stdout === 'string' && sanitized.stdout.length > 4000) {
        sanitized.stdout = sanitized.stdout.slice(0, 4000) + `\n…[truncated ${sanitized.stdout.length - 4000} chars]`;
      }
      if (typeof sanitized.stderr === 'string' && sanitized.stderr.length > 2000) {
        sanitized.stderr = sanitized.stderr.slice(0, 2000) + `\n…[truncated ${sanitized.stderr.length - 2000} chars]`;
      }
      // The raw command line can carry inline secrets (API keys in env prefixes) —
      // that one stays out of recorded results.
      delete sanitized.command;
      return sanitized;
    }
    return output;
  }
}
