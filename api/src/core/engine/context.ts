/**
 * THE CONVERSATION, KEPT THE WAY THE STRONGEST AGENTS KEEP IT.
 *
 * Four rules from Manus, Codex and OpenHands, each with its reason:
 *
 *  1. Append-only. A message, once sent, is never edited. Model servers reuse
 *     the work done on an unchanged prefix (prefix/KV caching). On a GPU
 *     server that sets the cost and speed of every step, since an agent
 *     reads about a hundred tokens for each one it writes.
 *
 *  2. Restorable compression. A long observation is cut to its head and
 *     tail, and the full text is saved under `.joe/out/`. The model is told
 *     the path, so nothing is lost for good: it can read the rest with
 *     file_read.
 *
 *  3. Recite the goals at the end. When the plan changes, and every few
 *     steps, the plan and the time left are appended to the step's last
 *     observation, so the goals sit where the model attends most (Manus
 *     "recitation"). It is appended, never edited in place, so every prompt
 *     is still the previous prompt plus what happened since.
 *
 *  4. Failures stay. Compaction keeps the latest errors word for word. A model
 *     that cannot see its last failure repeats it.
 *
 * Compaction is deterministic. It is built from what the run MEASURED (files
 * written, commands and their exit codes, addresses served, pages seen), not
 * from a model's summary of itself. On a CPU laptop a summarising call costs
 * minutes, and a summary can claim things that never happened.
 */
import { promises as fsp } from 'fs';
import path from 'path';
import type { ChatMessage, ContentPart, PlanState, RunState } from './types';

/**
 * UTF-8 bytes over three: the estimate the managed transport admits by, so the
 * engine compacts before the transport would refuse the call. Arabic counts as
 * the two bytes per letter it costs.
 */
export function estimateTokens(text: string): number {
    return Math.ceil(Buffer.byteLength(String(text || ''), 'utf8') / 3);
}

const IMAGE_TOKENS = 1_200;

export function messageTokens(m: ChatMessage): number {
    let n = 8;
    if (typeof (m as any).content === 'string') n += estimateTokens((m as any).content);
    else if (Array.isArray((m as any).content)) {
        for (const p of (m as any).content as ContentPart[]) n += p.type === 'text' ? estimateTokens(p.text) : IMAGE_TOKENS;
    }
    if (m.role === 'assistant' && m.tool_calls) {
        for (const tc of m.tool_calls) n += estimateTokens(tc.function.name) + estimateTokens(tc.function.arguments) + 8;
    }
    return n;
}

export interface ContextBudget {
    /** Characters one observation may take in the stored history. */
    observationChars: number;
    /** Compact when the stored history passes this many tokens. */
    compactAtTokens: number;
    /** Tokens kept verbatim at the end when compacting. */
    keepRecentTokens: number;
    /** Compact before the history has this many messages (the local transport refuses 256). */
    maxMessages: number;
}

/**
 * Budgets follow the model's window, so the same code serves a 16k-token
 * laptop model and a 128k-token server model; a bigger window gives every
 * observation more room. The window holds four things: the tool schemas, the
 * history, and room for the reply (a whole file written in one call needs
 * thousands of tokens). Compaction keeps the history inside what is left.
 */
export function budgetFor(contextTokens: number, toolTokens = 0, maxMessages = 200): ContextBudget {
    const window = Math.max(4_096, contextTokens);
    const reply = Math.min(16_384, Math.max(2_048, Math.round(window * 0.35)));
    const history = Math.max(2_048, window - reply - toolTokens - 512);
    return {
        observationChars: Math.round(Math.min(48_000, Math.max(2_400, history * 0.25 * 3))),
        compactAtTokens: history,
        keepRecentTokens: Math.round(history * 0.45),
        maxMessages,
    };
}

/** Head and tail of a long text, with the path of the full text. */
export function bound(text: string, maxChars: number, fullPath?: string): string {
    const s = String(text ?? '');
    if (s.length <= maxChars) return s;
    const head = Math.floor(maxChars * 0.6);
    const tail = maxChars - head;
    const cut = s.length - head - tail;
    const where = fullPath ? ` The full text is in ${fullPath} (read it with file_read).` : '';
    return `${s.slice(0, head)}\n\n[… ${cut} characters cut here.${where}]\n\n${s.slice(s.length - tail)}`;
}

export function formatPlan(plan: PlanState): string {
    const lines: string[] = [];
    if (plan.requirements.length) {
        lines.push('Requirements (from the request; each must be proven before task_finish passes):');
        for (const r of plan.requirements) {
            const mark = r.status === 'done' ? 'x' : r.status === 'blocked' ? '!' : ' ';
            lines.push(`  [${mark}] ${r.id}: ${r.text}${r.evidence ? ` — evidence: ${r.evidence}` : ''}`);
        }
    }
    if (plan.steps.length) {
        lines.push('Steps:');
        for (const s of plan.steps) {
            const mark = s.status === 'done' ? 'x' : s.status === 'in_progress' ? '>' : ' ';
            lines.push(`  [${mark}] ${s.title}`);
        }
    }
    if (plan.note) lines.push(`Note: ${plan.note}`);
    return lines.join('\n');
}

export class Conversation {
    private readonly messages: ChatMessage[] = [];
    private outSeq = 0;
    private readonly transcriptPath: string;
    private transcriptChain: Promise<void> = Promise.resolve();
    compactions = 0;

    constructor(private readonly stateDir: string, private budget: ContextBudget) {
        this.transcriptPath = path.join(stateDir, 'transcript.jsonl');
    }

    get length(): number { return this.messages.length; }
    get observationChars(): number { return this.budget.observationChars; }

    /** The stored history. Never mutated after a push. */
    history(): readonly ChatMessage[] { return this.messages; }

    tokens(): number {
        return this.messages.reduce((n, m) => n + messageTokens(m), 0);
    }

    push(m: ChatMessage): void {
        this.messages.push(m);
        this.record({ message: m });
    }

    /** Append to the transcript file only. */
    private record(entry: Record<string, unknown>): void {
        const line = JSON.stringify({ at: Date.now(), ...entry }) + '\n';
        this.transcriptChain = this.transcriptChain
            .then(() => fsp.mkdir(this.stateDir, { recursive: true }))
            .then(() => fsp.appendFile(this.transcriptPath, line, 'utf8'))
            .catch(() => { /* the transcript is a record, never a reason to stop the run */ });
    }

    /** Save a long observation and return the bounded text the model will read. */
    async observation(toolName: string, step: number, text: string, projectDir: string): Promise<string> {
        const s = String(text ?? '');
        if (s.length <= this.budget.observationChars) return s;
        const file = path.join(this.stateDir, 'out', `${String(step).padStart(4, '0')}-${++this.outSeq}-${toolName}.txt`);
        let rel: string | undefined;
        try {
            await fsp.mkdir(path.dirname(file), { recursive: true });
            await fsp.writeFile(file, s, 'utf8');
            rel = path.relative(projectDir, file).split(path.sep).join('/');
        } catch { rel = undefined; }
        return bound(s, this.budget.observationChars, rel);
    }

    /**
     * What one call sends: the stored history, unchanged. Each call's prompt
     * is the previous call's prompt plus what happened since, so a server can
     * resume from the state it already computed. That matters most for hybrid
     * models such as qwen3.5, whose recurrent state cannot be rewound to an
     * earlier point in the prompt.
     */
    forCall(): ChatMessage[] {
        return [...this.messages];
    }

    /**
     * A PICTURE THE MODEL REFUSED IS TAKEN OUT, NOT CARRIED FOREVER.
     *
     * The owner's phone, 2026-11-08: a cut-short screenshot reached the model,
     * which answered «Could not process image» — and every retry sent the same
     * picture again, so a run that had done all it was asked failed three times
     * in a row. Each picture is replaced by a line saying it could not be read,
     * so the next call goes on and the model looks again if it needs to.
     * Returns how many pictures were taken out.
     */
    dropImages(note = '(A picture was here; the model could not read it. Look again if you need to see the screen.)'): number {
        let dropped = 0;
        for (let i = 0; i < this.messages.length; i++) {
            const m = this.messages[i];
            if (!Array.isArray(m.content)) continue;
            const parts = m.content as ContentPart[];
            if (!parts.some(p => p.type === 'image_url')) continue;
            dropped += parts.filter(p => p.type === 'image_url').length;
            const kept = parts.filter(p => p.type !== 'image_url');
            this.messages[i] = { ...m, content: [...kept, { type: 'text', text: note }] } as ChatMessage;
        }
        if (dropped) this.record({ droppedImages: dropped });
        return dropped;
    }

    needsCompaction(): boolean {
        return this.tokens() > this.budget.compactAtTokens || this.messages.length > this.budget.maxMessages;
    }

    /**
     * Keep the system message and the request, replace the older middle with
     * one measured summary, and keep the recent tail verbatim. The tail starts
     * on an assistant turn, so no tool result is separated from its call.
     */
    compact(state: RunState, lastErrors: string[]): { removed: number; summaryChars: number } {
        const head = this.messages.slice(0, 2);
        const rest = this.messages.slice(2);
        let keepFrom = rest.length;
        let kept = 0;
        const keepMessages = Math.floor(this.budget.maxMessages / 2);
        for (let i = rest.length - 1; i >= 0; i--) {
            kept += messageTokens(rest[i]);
            if (kept > this.budget.keepRecentTokens || rest.length - i > keepMessages) break;
            keepFrom = i;
        }
        while (keepFrom < rest.length && rest[keepFrom].role !== 'assistant') keepFrom++;
        if (keepFrom <= 0 || keepFrom >= rest.length) {
            //  Nothing safe to fold, or one turn alone fills the window. Fold
            //  everything but the newest assistant turn and its results.
            keepFrom = rest.length;
            for (let i = rest.length - 1; i >= 0; i--) if (rest[i].role === 'assistant') { keepFrom = i; break; }
            if (keepFrom <= 0) return { removed: 0, summaryChars: 0 };
        }
        const removed = keepFrom;
        const summary = this.measuredSummary(state, lastErrors, removed);
        this.messages.length = 0;
        this.messages.push(...head, { role: 'user', content: summary }, ...rest.slice(keepFrom));
        this.compactions++;
        this.record({ compaction: this.compactions, removed, summary });
        return { removed, summaryChars: summary.length };
    }

    private measuredSummary(state: RunState, lastErrors: string[], removed: number): string {
        const lines: string[] = [
            `[Earlier work, summarised from what this run measured. ${removed} older messages were folded here; the full transcript is in .joe/transcript.jsonl.]`,
        ];
        const files = [...state.files.values()];
        if (files.length) {
            lines.push(`Files changed so far (${files.length}):`);
            for (const f of files.slice(-60)) lines.push(`  ${f.change} ${f.path}${f.bytes != null ? ` (${f.bytes} bytes)` : ''}`);
            if (files.length > 60) lines.push(`  … and ${files.length - 60} more (file_list shows them all).`);
        }
        const cmds = state.commands.slice(-12);
        if (cmds.length) {
            lines.push(`Last commands (${cmds.length} of ${state.commands.length}):`);
            for (const c of cmds) lines.push(`  exit ${c.exitCode ?? 'none'}${c.timedOut ? ' (timed out)' : ''} · ${c.command}${c.cwd && c.cwd !== '.' ? `  [in ${c.cwd}]` : ''}`);
        }
        const served = state.served.filter(p => p.running);
        if (served.length) {
            lines.push('Running now:');
            for (const p of served) lines.push(`  ${p.name}: ${p.command}${p.url ? ` → ${p.url}` : ''}`);
        }
        const pages = state.pages.slice(-3);
        if (pages.length) {
            lines.push('Last pages seen:');
            for (const p of pages) lines.push(`  ${p.url} status ${p.status ?? '?'} · ${p.textLength} chars of text · ${p.consoleErrors.length} console errors`);
        }
        const v = state.verifications[state.verifications.length - 1];
        if (v) {
            lines.push(`Last task_finish check: ${v.passed ? 'PASSED' : 'FAILED'}`);
            for (const c of v.checks) if (c.status === 'failed') lines.push(`  failed ${c.id}: ${c.detail}`);
        }
        if (lastErrors.length) {
            lines.push('Latest errors, verbatim:');
            for (const e of lastErrors.slice(-4)) lines.push(`  ${e}`);
        }
        return lines.join('\n');
    }

    /** Wait for the transcript to be on disk (end of run, tests). */
    flushed(): Promise<void> { return this.transcriptChain; }
}
