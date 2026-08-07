import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { isArabicReply, say } from '../shared/reply-language';
import { unrunnableShellStep } from '../core/orchestrator/plan-tools';
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
import { RunStep } from '../core/orchestrator/answerComposer';

/** Tools the PlanningEngine picks DETERMINISTICALLY. A node carrying one of
 *  these already knows exactly what to run and with which input, so it must be
 *  executed as-is — never re-decided by the weak-model tool-picker inside
 *  JoeAgent, whose menu is a short hardcoded list. That re-decision is what
 *  silently discarded `github_repo_manager(analyze)`: the picker could not even
 *  see that tool, fell back to another one, and the repo was never analysed. */
const DETERMINISTIC_TOOLS = [
    'google_account', 'user_browser',
    'write_file', 'file_write', 'create_file', 'write_to_file', 'read_file', 'file_read',
    'web_page_builder', 'react_project', 'api_project', 'orders_read', 'business_profile', 'project_edit', 'form_inbox', 'import_project', 'github_repo_manager', 'project_pipeline', 'project_run', 'project_stop', 'deploy_pages',
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

/**
 * A REPAIR FOR ONE STEP IS NOT A NEW PROJECT.
 *
 * From his run: `init` failed, and the repair came back with TWENTY-ONE nodes.
 * Its third step failed with «File not found», and THAT repair came back with
 * twenty-seven. Fifty steps, minutes of provider quota, and a Groq 429 — all
 * of it hunting a configuration file that never existed, invented by a planner
 * from the words «missing URL».
 */
const MAX_REPAIR_NODES = 6;

/** The shape of a failure, ignoring the parts that change between attempts. */
function errorSignature(text: string): string {
    return String(text || '')
        .toLowerCase()
        .replace(/\d+/g, '#')                       // ports, timestamps, counts
        .replace(/[a-z]:\\[^\s"']+|\/[^\s"']{8,}/g, '§')  // paths
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);
}

/**
 * WHAT MAY NEVER OVERLAP.
 *
 * Independent steps run together, but some tools share ONE live thing: the
 * browser session is a single page, a builder rewrites the same project folder,
 * a deploy stages one tree, git has one index, a terminal has one cursor. Two of
 * those at once is not speed, it is a corrupted project. They are listed rather
 * than guessed, and anything not listed is free to run beside its siblings.
 */
const SERIAL_TOOLS = /^(?:browser_|user_browser$|project_|react_project$|api_project$|web_page_builder$|deploy_|import_project$|github_repo_manager$|git_|terminal_manager$|checkpoint)/;

/** How many independent steps may be in flight at once. */
const MAX_PARALLEL_NODES = Number(process.env.JOE_MAX_PARALLEL || 4);

/**
 * The next slice of ready work: either one step that must run alone, or up to
 * MAX_PARALLEL_NODES steps that share nothing.
 */
function pickParallelBatch(ready: ExecutionNode[]): ExecutionNode[] {
  if (!ready.length) return ready;
  const isSerial = (n: ExecutionNode) => SERIAL_TOOLS.test(String(n.tool || '')) || n.agent === 'Browser';
  if (isSerial(ready[0])) return [ready[0]];
  const batch: ExecutionNode[] = [];
  for (const n of ready) {
    if (isSerial(n)) break;
    batch.push(n);
    if (batch.length >= Math.max(1, MAX_PARALLEL_NODES)) break;
  }
  return batch;
}

/** The run's own story, in plan order — what each step was for and what it
 *  produced. The answer the user reads is composed from this. */
function runSteps(dag: AgentDAG): RunStep[] {
  return dag.nodes.map(n => ({ id: n.id, task: n.task, tool: n.tool, status: n.status, result: n.result }));
}

export class AgentOrchestrator {
  private recoveriesUsed = 0;
  /** Failures already sent to the planner once, by shape. */
  private readonly repairedSignatures = new Set<string>();
  private memory: Map<string, ExecutionMemory> = new Map();
  private agents: Map<AgentType, BaseAgent> = new Map();
  private context?: Record<string, any>;

  /**
   * WHICH LANGUAGE THIS RUN ANSWERS IN.
   *
   * «عند وضع بروميت بالانجليزية … يجب ان تكون النتيجة والذكاء العصبي كلها
   * انجليزية». The interface's setting wins; with none, the goal's own script
   * decides. Same rule as every build tool, from the one file that holds it.
   */
  private replyIsArabic(memory?: any): boolean {
    return isArabicReply({ language: this.context?.language, text: String(memory?.goalText || '') });
  }

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
  public async execute(goal: AgentGoal): Promise<{ ok: boolean; result: any; steps?: RunStep[] }> {
    console.log(`[AgentOrchestrator] Starting REAL-TIME orchestration for goal: ${goal.goal}`);
    broadcastThinkingDetail(goal.id, `🧠 Initializing Autonomous Brain for goal: ${goal.goal}`);

    // goal.id IS the session — callers that pass no explicit context (the
    // REST /api/agent entry among them) must still plan WITH the session,
    // or the planner looks up joeProjects['default'], misses the active
    // project, and an edit like «غيّر الطراز» falls past the surgical
    // editor (caught by the UI-integration wire proof).
    this.context = goal.context || { sessionId: goal.id };

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
    }, { userId: goal.context?.userId, sessionId: goal.context?.sessionId || goal.id });

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
    
    // (An `enrichedGoal` used to be built here from memory.getSummary() and
    //  then never passed to anything — the plan was always made from goalText.
    //  The history DOES reach the planner, through the `memory` argument below,
    //  which generatePlan renders into its prompt. The dead string is gone.)

    const rawPlan = await PlanningEngine.generatePlan({ intent, memory: memory?.getHistory() }, traceId, this.context);

    // The graph the executor will actually schedule: unique ids, no dangling or
    // cyclic edges, and every {{FROM:...}} reference declared as a real
    // dependency so it resolves AFTER its producer ran. Applied here, not only
    // inside sanitizeSteps, so the deterministic fast paths and the recovery
    // planner get the same guarantee.
    // EVERY plan — fast path, semantic route, recovery — leaves here runnable.
    // Field log: a recovery plan produced «search_text needs a query» and then
    // «central_answer was called without a question», because only the
    // LLM branch went through the sanitiser. The argument pre-flight belongs to
    // ALL of them, exactly like the data-flow repair below it.
    const readySteps = PlanningEngine.fillRequiredArgs(
        rawPlan.steps as any, String(goalText || intent.goal || ''), this.context);
    const nodes: ExecutionNode[] = PlanningEngine.wireDataFlow(readySteps as any).map((step: any) => ({
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
  ): Promise<{ ok: boolean; result: any; steps?: RunStep[] }> {
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
    // Every «the orchestrator gave up» exit carries the run's steps with it: a
    // run that failed halfway still built things, and the reply used to be the
    // bare error with no trace of the work that survived.
    const giveUp = (fallback: string) => ({ ok: false, result: lastNodeError || fallback, steps: runSteps(dag) });

    while (completedNodes.size < dag.nodes.length) {
      iterations++;
      if (iterations > maxIterations) {
        dag.status = "failed";
        return giveUp("Execution stopped: orchestration iteration limit exceeded");
      }

      console.log(`[AgentOrchestrator] Step Iteration. Completed: ${completedNodes.size}/${dag.nodes.length}`);
      
      // A dependency on a node that is not IN the graph can never be satisfied —
      // the node would stay pending, the loop would see nothing ready, and after
      // two replans the run ends with «Execution stopped» instead of doing the
      // work. Plans leave PlanningEngine.wireDataFlow with no such edge, but
      // recovery and stall merges drop nodes whose ids already exist, which can
      // orphan an edge here. An unknown id counts as satisfied: run the step.
      const knownIds = new Set(dag.nodes.map(n => n.id));
      const readyNodes = dag.nodes.filter(n =>
        n.status === "pending" &&
        n.dependencies.every(depId => completedNodes.has(depId) || !knownIds.has(depId))
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


      /** Executes one node: agent fit, narration, the tool itself. No bookkeeping. */
      const runNode = async (node: ExecutionNode): Promise<{ result: any; startTime: number; isDirectAnswer: boolean }> => {
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

          /**
           * A STEP NOBODY COULD EVER RUN IS NOT A FAILURE TO RETRY.
           *
           * Field log: `git --version` answered exit=0, and the very next step
           * was «Install Git if it is not installed» → `sudo apt-get install
           * git -y` — a Linux package manager, on Windows, with sudo. The
           * allowlist blocked it, the node failed, it was retried, and the run
           * ended at «Max retries reached for node: install_git».
           *
           * Recognising the impossibility costs one regex and saves the run.
           */
          const shellish = node.tool === 'shell_execute' || node.tool === 'terminal_manager';
          const impossible = shellish ? unrunnableShellStep((nodeInput as any)?.command) : null;
          if (impossible) {
            console.log(`[AgentOrchestrator] ⏭️ skipping ${node.id}: ${impossible}`);
            broadcastThinkingDetail(memory.sessionId, `⏭️ ${node.task} — ${impossible}`);
            return {
              result: { ok: true, output: { skipped: true, reason: impossible }, logs: [impossible] },
              startTime,
              isDirectAnswer: false,
            };
          }

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
            } else if (node.tool === 'shell_execute' && typeof nodeInput?.command === 'string' && nodeInput.command.trim()) {
              // A COMMAND THAT IS ALREADY WRITTEN NEEDS NO ONE TO THINK ABOUT IT.
              // shell_execute went through the Dev agent, which asks a model what
              // to run — so a plan whose step already said `npm test` failed
              // outright when no provider answered: «تعذّر الوصول إلى محرّك
              // الذكاء» for work that needed no thinking at all. Measured. When
              // the command is present it is executed; when it is not, the agent
              // still does its job of working out what to run.
              result = await deadline(executeTool('shell_execute', nodeInput, executionContext));
            } else if (agent) {
              result = await deadline(agent.execute(node.task, nodeInput, executionContext));
            } else {
              result = await deadline(executeTool(node.tool, { ...nodeInput, context: memory.getHistory() }, executionContext));
            }
          } catch (err: any) {
            result = { ok: false, error: err.message };
          }
        return { result, startTime, isDirectAnswer };
      };

      /**
       * FAN OUT WHAT DOES NOT DEPEND ON ANYTHING.
       *
       * The plan has modelled independence since the day it was a DAG, and the
       * executor threw it away: `for (const node of readyNodes) { await … }`
       * ran three unrelated steps one after another. Measured, three
       * independent two-second steps took 6.1 seconds — the graph knew they
       * could all start at once and nobody asked it.
       *
       * They start together now, up to a cap. What may NOT overlap is listed
       * explicitly rather than guessed: everything that shares one live
       * resource — the single browser page, the project workspace a builder
       * rewrites, a deploy, a git tree, a terminal. Those still run alone, so
       * speed is never bought with a corrupted project.
       *
       * Only the RUNNING is parallel. Every result is then handled in plan
       * order by exactly the same code as before, so recovery, replanning and
       * the honest failure paths behave identically.
       */
      const batch = pickParallelBatch(readyNodes);
      if (batch.length > 1) {
        broadcastThinkingDetail(memory.sessionId, say(this.replyIsArabic(memory), `⚡ ${batch.length} خطوات مستقلّة — أنفّذها معاً`, `⚡ ${batch.length} independent steps — running them together`));
      }
      const batchResults = new Map<string, any>();
      await Promise.all(batch.map(async (node) => {
        const r = await runNode(node);
        batchResults.set(node.id, r);
      }));

      for (const node of batch) {
        const ran = batchResults.get(node.id);
        let result: any = ran.result;
        const startTime: number = ran.startTime;
        const isDirectAnswer: boolean = ran.isDirectAnswer;
        
        if (result.ok) {
          // A retry that succeeds PROVES the repair worked — that is the only
          // moment a cure is worth remembering. Recording at plan time would
          // memorize guesses; recording here memorizes verified medicine.
          /**
           * …AND A CURE MADE OF PROSE IS NOT A CURE.
           *
           * From his log: `central_answer was called without a question` came
           * back with «a repair that worked for this same error before (proven
           * 2x)» whose entire content was `central_answer: Formulate a
           * question… | project_planner: Re-plan…`. Nothing in it had ever
           * repaired anything: an answering tool always "succeeds", so a step
           * that failed for a real reason and was then re-run as an essay
           * taught Joe that essays are medicine — and it prescribed them again.
           *
           * A repair is only remembered when at least one step in it actually
           * DID something.
           */
          const curedByDoing = String(node.repairNote || '')
            .split('|')
            .some(part => {
              const tool = part.split(':')[0].trim();
              return tool && !PlanningEngine.ANSWER_ONLY.has(tool);
            });
          if ((node.retryCount || 0) > 0 && node.lastError && node.repairNote && curedByDoing) {
            repairMemory.recordRepair(node.lastError, node.repairNote)
              .catch((e) => console.warn('[RepairMemory] record failed:', e?.message));
          } else if ((node.retryCount || 0) > 0 && node.repairNote && !curedByDoing) {
            console.warn('[RepairMemory] not remembering a repair made only of answers — nothing in it did anything.');
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
          if (isDirectAnswer && !isProviderFailure(result.error)) {
            // …but «the brain is unreachable» is not an answer to surface as
            // one. Marking it completed made the run claim success, and — since
            // a completed node's result is what {{FROM:…}} hands to the next
            // step — wrote «تعذّر الوصول إلى محرّك الذكاء» into the user's
            // report file in the place where the findings belong. Measured in
            // verify_honest_results.ts. A dead brain falls through to the
            // failure path below, which ends the run honestly and without a
            // recovery loop.
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
            return { ok: false, result: result.error, steps: runSteps(dag) };
          }

          // [DECISION] Intelligent recovery attempt (Reviewer/QA department steps in)
          emitDepartment(memory.sessionId, 'reviewer', `recovering: ${node.task}`);
          const currentRetryCount = node.retryCount || 0;
          if (currentRetryCount >= 2) {
            console.error(`[AgentOrchestrator] Max retries reached for node: ${node.id}`);
            return { ok: false, result: result.error || "Fatal execution error: Max retries reached", steps: runSteps(dag) };
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
              return { ok: false, result: result.error || "Fatal execution error", steps: runSteps(dag) };
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

          return { ok: false, result: result.error || "Fatal execution error", steps: runSteps(dag) };
        }
      }
    }

    dag.status = "completed";
    // The steps ride out WITH the result. The reply used to be built from the
    // stepId->output map alone, walked backwards — so a run whose last step
    // wrote a file answered the user with that step's status and threw the
    // material away. The narrative order and each step's task are what make a
    // whole-run answer possible; the map stays exactly as it was for every
    // existing caller.
    return { ok: true, result: memory.getResults(), steps: runSteps(dag) };
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
          // Empty here means the reference pointed at a step that had not run —
          // an empty file or an empty email, with nothing on screen to explain
          // it. wireDataFlow declares every reference as a dependency so this
          // cannot happen; if it ever does, it says so in the log.
          if (!dep) { console.warn(`[AgentOrchestrator] {{FROM:${id}}} names no node in this plan — resolved to nothing`); return ''; }
          if (dep.result === undefined && dep.status !== 'completed') {
            console.warn(`[AgentOrchestrator] {{FROM:${id}}} read before «${id}» finished (status: ${dep.status}) — resolved to nothing`);
          }
          return textOf(dep.result);
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

    /**
     * THE SAME FAILURE TWICE IS NOT A NEW PROBLEM.
     *
     * His run, in order: `no_url` → a 21-node repair → «File not found» → a
     * 27-node repair → «File not found» again. The second plan was the first
     * plan's hallucination re-derived from the same words. A planner that just
     * failed to repair a failure will not repair it better on the second
     * reading of the identical text.
     */
    const signature = errorSignature(errorText);
    if (signature && this.repairedSignatures.has(signature)) {
        console.error(`[AgentOrchestrator] Same failure shape twice — refusing to re-plan: ${signature}`);
        if (traceId) traceManager.logEvent(traceId, 'orchestrator', { event: 'recovery_refused_repeat', nodeId: failedNode.id, signature });
        broadcastThinkingDetail(memory.sessionId,
            `⛔ نفس العطل تكرّر بعد الإصلاح — لن أعيد التخطيط لنفس السبب. أتوقّف بصدق: ${errorText.slice(0, 160)}`);
        return { recovered: false, newNodes: [] };
    }
    if (signature) this.repairedSignatures.add(signature);

    // Scar tissue: if Joe beat this exact class of error before, the proven cure
    // rides into the planning prompt. The planner still thinks — the memory is a
    // strong lead, not a script — but it starts from experience, not from zero.
    let rememberedCure = '';
    try {
        const known = errorText ? repairMemory.recallRepair(errorText) : null;
        if (known) {
            rememberedCure = `\n[A REPAIR THAT WORKED FOR THIS SAME ERROR BEFORE (proven ${known.wins}x) — prefer it unless the context clearly differs]:\n${known.repair}`;
            broadcastThinkingDetail(memory.sessionId, say(this.replyIsArabic(memory), `🧠 أعرف هذا الخطأ — العلاج الذي نجح سابقاً: ${known.repair.slice(0, 120)}`, `🧠 I know this failure — the repair that worked before: ${known.repair.slice(0, 120)}`));
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

    const planned: any[] = PlanningEngine.wireDataFlow(
      PlanningEngine.fillRequiredArgs(recoveryPlan.steps as any, recoveryGoal, this.context) as any,
    );
    // Twenty-one nodes to repair one step is not a repair. Keep the head of the
    // plan — the steps that actually address the failure come first — and say
    // out loud that the rest was dropped.
    const kept = planned.slice(0, MAX_REPAIR_NODES);
    if (planned.length > kept.length) {
        console.warn(`[AgentOrchestrator] Repair plan had ${planned.length} nodes — kept ${kept.length}.`);
        broadcastThinkingDetail(memory.sessionId,
            `✂️ خطة الإصلاح عادت بـ${planned.length} خطوة لعطل واحد — أبقيتُ أول ${kept.length} وأسقطتُ الباقي.`);
    }

    const newNodes: ExecutionNode[] = kept.map((step: any) => ({
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
