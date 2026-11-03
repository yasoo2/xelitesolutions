/**
 * READING THE MODEL'S TURN.
 *
 * The router hands back one string. When the provider used native function
 * calling, that string is the JSON envelope `{"type":"tool_calls",
 * "tool_calls":[…]}`; otherwise it is the model's text. Small open models do
 * not always use native calls: Qwen writes `<tool_call>{…}</tool_call>`
 * inside its text when a template is missing, and many models answer with a
 * fenced JSON block. A call written as text is still a call. Dropping it
 * would turn a model that did the right thing into one that "said nothing",
 * and the loop would ask it again for the same step.
 *
 * Nothing here guesses: a block that does not name a known tool, or whose
 * arguments are not a JSON object, is left as text for the model to see.
 */
import type { ModelStep, ToolCall } from './types';

const TOOL_CALLS_ENVELOPE = /^\s*\{\s*"type"\s*:\s*"tool_calls"/;

function argumentsText(value: unknown): string | null {
    if (value == null) return '{}';
    if (typeof value === 'string') {
        const t = value.trim();
        if (!t) return '{}';
        try {
            const parsed = JSON.parse(t);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? t : null;
        } catch { return null; }
    }
    if (typeof value === 'object' && !Array.isArray(value)) return JSON.stringify(value);
    return null;
}

/** A call id the model can be answered with. Stable within a run, so the transcript replays byte for byte. */
function callId(step: number, index: number): string {
    return `call_${step}_${index}`;
}

function fromEnvelope(raw: string, step: number): ToolCall[] | null {
    if (!TOOL_CALLS_ENVELOPE.test(raw)) return null;
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { return null; }
    const list = Array.isArray(parsed?.tool_calls) ? parsed.tool_calls : [];
    const calls: ToolCall[] = [];
    list.forEach((tc: any, i: number) => {
        const name = String(tc?.function?.name ?? tc?.name ?? '').trim();
        const args = argumentsText(tc?.function?.arguments ?? tc?.arguments);
        if (!name || args == null) return;
        calls.push({ id: String(tc?.id || callId(step, i)), name, arguments: args });
    });
    return calls;
}

/**
 * Calls written into the text: Qwen's `<tool_call>` tags, or a fenced or bare
 * JSON object of the shape `{"name": …, "arguments": …}` (also accepted:
 * `tool`/`args`, `function`/`parameters`). Only names in `known` count.
 */
function fromText(text: string, known: ReadonlySet<string>, step: number): { calls: ToolCall[]; rest: string } {
    const calls: ToolCall[] = [];
    let rest = text;
    const take = (block: string, whole: string) => {
        let obj: any;
        try { obj = JSON.parse(block); } catch { return; }
        const items = Array.isArray(obj) ? obj : [obj];
        let took = false;
        for (const item of items) {
            if (!item || typeof item !== 'object') continue;
            const name = String(item.name ?? item.tool ?? item.function ?? '').trim();
            if (!known.has(name)) continue;
            const args = argumentsText(item.arguments ?? item.args ?? item.parameters ?? item.input);
            if (args == null) continue;
            calls.push({ id: callId(step, calls.length), name, arguments: args });
            took = true;
        }
        if (took) rest = rest.replace(whole, '');
    };
    for (const m of text.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g)) take(m[1], m[0]);
    if (!calls.length) {
        for (const m of text.matchAll(/```(?:json|tool_call)?\s*\n([\s\S]*?)\n\s*```/g)) take(m[1], m[0]);
    }
    if (!calls.length) {
        const t = text.trim();
        if (t.startsWith('{') && t.endsWith('}')) take(t, t);
    }
    return { calls, rest: rest.trim() };
}

/** Strip a reasoning block some local models leave in the visible text. */
export function withoutReasoning(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export function readModelTurn(raw: string, known: ReadonlySet<string>, step: number, durationMs: number): ModelStep {
    const text = String(raw ?? '');
    const native = fromEnvelope(text, step);
    if (native) return { text: '', toolCalls: native, durationMs };
    const visible = withoutReasoning(text);
    const { calls, rest } = fromText(visible, known, step);
    if (calls.length) return { text: rest, toolCalls: calls, toolCallsFromText: true, durationMs };
    return { text: visible, toolCalls: [], durationMs };
}
