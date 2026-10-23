import { randomUUID } from 'node:crypto';
import { requestResourceManager } from '../../resources/RequestResourceManager';
import { noteLocalThroughput } from '../local-throughput';

// Pinned contract: Ollama v0.35.1 api/types.go (research observation 2026-10-14).
// Estimates below are admission policy, not exact tokenizer or image accounting.
const MAX_CONTEXT = 16384;
// Requested ceiling; the resource manager admits a window that fits memory.
const DEFAULT_CONTEXT = 16384;
const MIN_FITTED_OUTPUT_TOKENS = 256;
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_RECORD_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_IMAGE_BASE64_BYTES = 4 * 1024 * 1024;
const MAX_MESSAGES = 256;
const MAX_TOOLS = 128;

export class ManagedOllamaError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
        this.name = 'ManagedOllamaError';
    }
}

function fail(code: string, message: string): never {
    throw new ManagedOllamaError(code, message);
}

/** A closed vocabulary for a local server's error body: the text itself may hold prompt or secret fragments. */
export function serverErrorClass(body: string): string {
    if (!body.trim()) return 'empty';
    if (/out of memory|insufficient memory|requires more system memory|\balloc/i.test(body)) return 'memory';
    if (/context (?:length|window|size)|num_ctx|exceeds?|too long|truncat/i.test(body)) return 'context';
    if (/cancel/i.test(body)) return 'cancelled';
    if (/time(?:d)?\s*out|deadline/i.test(body)) return 'timeout';
    if (/llama.?server|runner|exit status|terminated|unexpected EOF|connection (?:reset|refused)|EOF\b|model (?:failed|not) (?:to )?load/i.test(body)) return 'runner';
    if (/not found|no such model|pull/i.test(body)) return 'model-missing';
    return 'unclassified';
}

export function isManagedOllamaEndpoint(baseURL: string): boolean {
    // Check the raw spelling first: URL normalization must not admit alternate
    // IP spellings, dot segments, escaped paths, credentials or backslashes.
    if (typeof baseURL !== 'string'
        || !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):11434(?:\/(?:v1\/?)?)?$/i.test(baseURL)) return false;
    try {
        const url = new URL(baseURL);
        return url.protocol === 'http:' && url.port === '11434'
            && !url.username && !url.password && !url.search && !url.hash
            && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase())
            && ['/', '/v1', '/v1/'].includes(url.pathname);
    } catch { return false; }
}

export interface ManagedOllamaChatOptions {
    baseURL: string;
    model: string;
    messages: readonly unknown[];
    tools?: readonly unknown[];
    onDelta?: (delta: string) => void;
    signal?: AbortSignal;
    timeoutMs: number;
    maxCompletionTokens?: number;
    // Trusted server policy; never derive this from a user's prompt or tool args.
    maxContextTokens?: number;
    reasoningEffort?: 'none';
    temperature?: number;
    format?: 'json' | Record<string, unknown>;
}

export interface ManagedOllamaToolCall {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
}

export interface ManagedOllamaMetrics {
    contextTokens: number;
    outputTokens: number;
    promptEstimatedTokens: number;
    prompt_eval_count?: number;
    eval_count?: number;
    total_duration?: number;
    load_duration?: number;
    prompt_eval_duration?: number;
    eval_duration?: number;
    done_reason?: string;
}

export interface ManagedOllamaResult {
    content: string;
    tool_calls?: ManagedOllamaToolCall[];
    metrics: ManagedOllamaMetrics;
}

interface InferenceBudget { signal: AbortSignal; contextTokens: number; outputTokens: number }
interface InferenceOptions {
    promptEstimatedTokens: number;
    requestedOutputTokens: number;
    requestedContextTokens: number;
    signal: AbortSignal;
    queueTimeoutMs?: number;
}
export interface ManagedOllamaDependencies {
    fetch?: typeof globalThis.fetch;
    resourceManager?: {
        withInference<T>(work: (budget: InferenceBudget) => Promise<T>, options: InferenceOptions): Promise<T>;
    };
}

type JsonObject = Record<string, any>;
function object(value: unknown): value is JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function keys(value: JsonObject, allowed: string[]): void {
    if (Object.keys(value).some(key => !allowed.includes(key))) {
        fail('OLLAMA_UNSUPPORTED_INPUT', 'Unsupported message or tool metadata; use the native supported contract.');
    }
}

function json(value: unknown): string {
    let nodes = 0;
    let estimatedBytes = 0;
    const seen = new Set<object>();
    const visit = (item: unknown, depth: number): void => {
        if (++nodes > 100000 || depth > 32) fail('OLLAMA_INPUT_LIMIT', 'JSON input exceeds the bounded nesting or item limit.');
        estimatedBytes += typeof item === 'string' ? Buffer.byteLength(item, 'utf8') + 2 : 8;
        if (estimatedBytes > MAX_REQUEST_BYTES) fail('OLLAMA_INPUT_LIMIT', 'JSON input exceeds the byte limit.');
        if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
        if (typeof item === 'number' && Number.isFinite(item)) return;
        if (!Array.isArray(item) && !object(item)) fail('OLLAMA_INVALID_INPUT', 'Input must contain only JSON values.');
        if (seen.has(item as object)) fail('OLLAMA_INVALID_INPUT', 'Input must not contain circular JSON values.');
        seen.add(item as object);
        for (const [key, child] of Object.entries(item as object)) {
            estimatedBytes += Buffer.byteLength(key, 'utf8') + 3;
            visit(child, depth + 1);
        }
        seen.delete(item as object);
    };
    visit(value, 0);
    try { return JSON.stringify(value); }
    catch { return fail('OLLAMA_INVALID_INPUT', 'Input could not be serialized as JSON.'); }
}

function name(value: unknown): value is string {
    return typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(value);
}

function image(value: unknown): string {
    if (typeof value !== 'string' || value.length > MAX_IMAGE_BASE64_BYTES + 64) {
        fail('OLLAMA_IMAGE_INPUT', 'Images must be bounded base64 data URLs; remote URLs and files are unsupported.');
    }
    const match = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
    if (!match || match[1].length % 4 !== 0 || Buffer.from(match[1], 'base64').toString('base64') !== match[1]) {
        fail('OLLAMA_IMAGE_INPUT', 'Images must be valid base64 image data URLs.');
    }
    return match[1];
}

function inputToolCall(value: unknown, index: number): JsonObject {
    if (!object(value)) fail('OLLAMA_TOOL_INPUT', 'Tool calls must be function objects.');
    keys(value, ['id', 'type', 'function']);
    if (value.type !== undefined && value.type !== 'function') fail('OLLAMA_TOOL_INPUT', 'Only function tool calls are supported.');
    if (!object(value.function)) fail('OLLAMA_TOOL_INPUT', 'Tool calls require a function.');
    keys(value.function, ['name', 'arguments', 'index']);
    if (!name(value.function.name)) fail('OLLAMA_TOOL_INPUT', 'Tool calls require a valid function name.');
    let args: unknown = value.function.arguments;
    if (typeof args === 'string') {
        if (Buffer.byteLength(args, 'utf8') > MAX_RECORD_BYTES) fail('OLLAMA_INPUT_LIMIT', 'Tool arguments exceed the input limit.');
        try { args = JSON.parse(args); }
        catch { fail('OLLAMA_TOOL_INPUT', 'Tool arguments must be valid JSON objects.'); }
    }
    if (!object(args)) fail('OLLAMA_TOOL_INPUT', 'Tool arguments must be JSON objects.');
    json(args);
    if (value.id !== undefined && (typeof value.id !== 'string' || !value.id || value.id.length > 256)) {
        fail('OLLAMA_TOOL_INPUT', 'Tool-call IDs must be bounded nonempty strings.');
    }
    const nativeIndex = value.function.index ?? index;
    if (!Number.isInteger(nativeIndex) || nativeIndex < 0 || nativeIndex >= MAX_TOOLS) {
        fail('OLLAMA_TOOL_INPUT', 'Tool-call indexes must be bounded nonnegative integers.');
    }
    return { ...(value.id ? { id: value.id } : {}), function: { name: value.function.name, arguments: args, index: nativeIndex } };
}

function mapMessages(messages: readonly unknown[]): { messages: JsonObject[]; promptEstimatedTokens: number } {
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
        fail('OLLAMA_MESSAGE_INPUT', 'A bounded nonempty message list is required.');
    }
    let estimate = 256;
    let accumulatedBytes = 0;
    const mapped = messages.map(raw => {
        if (!object(raw)) fail('OLLAMA_MESSAGE_INPUT', 'Messages must be objects.');
        keys(raw, ['role', 'content', 'tool_calls', 'tool_call_id', 'tool_name', 'name', 'thinking', 'images']);
        if (!['system', 'developer', 'user', 'assistant', 'tool'].includes(raw.role)) {
            fail('OLLAMA_MESSAGE_INPUT', 'Unsupported message role.');
        }
        const role = raw.role === 'developer' ? 'system' : raw.role;
        let content = '';
        const images: string[] = [];
        if (typeof raw.content === 'string') content = raw.content;
        else if (Array.isArray(raw.content)) {
            if (raw.content.length > 256) fail('OLLAMA_INPUT_LIMIT', 'Too many message content parts.');
            for (const part of raw.content) {
                if (!object(part)) fail('OLLAMA_MESSAGE_INPUT', 'Unsupported message content part.');
                if (part.type === 'text') {
                    keys(part, ['type', 'text']);
                    if (typeof part.text !== 'string') fail('OLLAMA_MESSAGE_INPUT', 'Text parts require string text.');
                    content += part.text;
                } else if (part.type === 'image_url' && role === 'user') {
                    keys(part, ['type', 'image_url']);
                    if (!object(part.image_url)) fail('OLLAMA_IMAGE_INPUT', 'Images require a base64 data URL.');
                    keys(part.image_url, ['url', 'detail']);
                    if (part.image_url.detail !== undefined && part.image_url.detail !== 'auto') {
                        fail('OLLAMA_IMAGE_INPUT', 'Native Ollama does not support image detail selection.');
                    }
                    images.push(image(part.image_url.url));
                } else fail('OLLAMA_MESSAGE_INPUT', 'Unsupported message content part.');
            }
        } else if (!(role === 'assistant' && raw.content == null && Array.isArray(raw.tool_calls) && raw.tool_calls.length)) {
            fail('OLLAMA_MESSAGE_INPUT', 'Messages require string or supported multimodal content.');
        }
        if (raw.images !== undefined) {
            if (role !== 'user' || !Array.isArray(raw.images)) fail('OLLAMA_IMAGE_INPUT', 'Only user image data URLs are supported.');
            images.push(...raw.images.map(image));
        }
        if (images.length > 4) fail('OLLAMA_IMAGE_INPUT', 'At most four images per message are supported.');
        const result: JsonObject = { role, content, ...(images.length ? { images } : {}) };
        if (raw.thinking !== undefined) {
            if (role !== 'assistant' || typeof raw.thinking !== 'string') fail('OLLAMA_MESSAGE_INPUT', 'Thinking metadata requires an assistant string.');
            result.thinking = raw.thinking;
        }
        if (raw.tool_calls !== undefined) {
            if (role !== 'assistant' || !Array.isArray(raw.tool_calls) || raw.tool_calls.length > MAX_TOOLS) fail('OLLAMA_TOOL_INPUT', 'Only assistant messages may contain bounded tool calls.');
            result.tool_calls = raw.tool_calls.map(inputToolCall);
        }
        if (raw.name !== undefined || raw.tool_name !== undefined || raw.tool_call_id !== undefined) {
            if (role !== 'tool') fail('OLLAMA_TOOL_INPUT', 'Tool-result metadata requires a tool message.');
            if (raw.name !== undefined && raw.tool_name !== undefined && raw.name !== raw.tool_name) fail('OLLAMA_TOOL_INPUT', 'Tool-result names conflict.');
            const toolName = raw.tool_name ?? raw.name;
            if (toolName !== undefined) {
                if (!name(toolName)) fail('OLLAMA_TOOL_INPUT', 'Tool results require valid tool names.');
                result.tool_name = toolName;
            }
            if (raw.tool_call_id !== undefined) {
                if (typeof raw.tool_call_id !== 'string' || !raw.tool_call_id || raw.tool_call_id.length > 256) fail('OLLAMA_TOOL_INPUT', 'Tool results require bounded IDs.');
                result.tool_call_id = raw.tool_call_id;
            }
        }
        // Images are not charged as their base64 text; their token cost is unknown.
        const textBytes = Buffer.byteLength(json({ ...result, images: [] }), 'utf8');
        accumulatedBytes += textBytes + images.reduce((sum, value) => sum + value.length + 3, 0);
        if (accumulatedBytes > MAX_REQUEST_BYTES) fail('OLLAMA_INPUT_LIMIT', 'Local inference messages exceed the byte limit.');
        estimate += 16 + Math.ceil(textBytes / 3) + images.length * 1024;
        return result;
    });
    return { messages: mapped, promptEstimatedTokens: estimate };
}

function mapTools(tools: readonly unknown[] | undefined): JsonObject[] | undefined {
    if (tools === undefined) return undefined;
    if (!Array.isArray(tools) || tools.length > MAX_TOOLS) fail('OLLAMA_TOOL_INPUT', 'Tool schemas must be a bounded array.');
    return tools.map(tool => {
        if (!object(tool)) fail('OLLAMA_TOOL_INPUT', 'Tools must be function schemas.');
        keys(tool, ['type', 'function']);
        if (tool.type !== 'function' || !object(tool.function)) fail('OLLAMA_TOOL_INPUT', 'Only function tool schemas are supported.');
        keys(tool.function, ['name', 'description', 'parameters']);
        if (!name(tool.function.name) || !object(tool.function.parameters)
            || (tool.function.description !== undefined && typeof tool.function.description !== 'string')) {
            fail('OLLAMA_TOOL_INPUT', 'Tools require valid names, descriptions and parameter objects.');
        }
        json(tool);
        // Preserve the complete schema; do not reduce it to remembered fields.
        return tool;
    });
}

function linkedSignals(signals: (AbortSignal | undefined)[]): { signal: AbortSignal; close: () => void; abort: () => void } {
    const controller = new AbortController();
    const listeners: Array<[AbortSignal, () => void]> = [];
    for (const signal of signals) {
        if (!signal) continue;
        const abort = () => controller.abort();
        if (signal.aborted) abort();
        else { signal.addEventListener('abort', abort, { once: true }); listeners.push([signal, abort]); }
    }
    return { signal: controller.signal, abort: () => controller.abort(), close: () => {
        for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener);
        listeners.length = 0;
    } };
}

function assertActive(signal: AbortSignal): void {
    if (signal.aborted) fail('RESOURCE_CANCELLED', 'Local inference was cancelled.');
}

function metric(record: JsonObject, key: string): number | undefined {
    const value = record[key];
    if (value === undefined) return undefined;
    if (!Number.isSafeInteger(value) || value < 0) fail('OLLAMA_INVALID_RESPONSE', 'Local inference returned invalid metrics.');
    return value;
}

async function consume(response: Response, stream: boolean, signal: AbortSignal, budget: InferenceBudget,
    promptEstimatedTokens: number, onDelta?: (delta: string) => void): Promise<ManagedOllamaResult> {
    if (!response.body) fail('OLLAMA_INCOMPLETE', 'Local inference returned no response body.');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const callPrefix = `ollama_call_${randomUUID()}`;
    let full = '';
    let outputBytes = 0;
    let totalBytes = 0;
    let pending = '';
    let terminal: JsonObject | undefined;
    const calls = new Map<number, ManagedOllamaToolCall>();
    const abort = () => { void reader.cancel().catch(() => undefined); };
    signal.addEventListener('abort', abort, { once: true });
    const accept = (raw: unknown): void => {
        if (!object(raw) || typeof raw.done !== 'boolean') fail('OLLAMA_INVALID_RESPONSE', 'Local inference returned an invalid completion record.');
        if (raw.error !== undefined) fail('OLLAMA_SERVER_ERROR', 'Local inference rejected the request; inspect the local server logs.');
        if (raw.remote_host || raw.remote_model) fail('OLLAMA_REMOTE_RESPONSE', 'Managed inference requires a local model response.');
        if (terminal) fail('OLLAMA_INVALID_RESPONSE', 'Local inference returned data after its terminal record.');
        if (raw.done_reason === 'length') fail('LOCAL_COMPLETION_LIMIT', 'local_completion_limit_exceeded');
        if (!object(raw.message) || raw.message.role !== 'assistant' || typeof raw.message.content !== 'string') {
            fail('OLLAMA_INVALID_RESPONSE', 'Local inference returned an invalid assistant message.');
        }
        const piece = raw.message.content;
        outputBytes += Buffer.byteLength(piece, 'utf8');
        if (outputBytes > MAX_OUTPUT_BYTES) fail('OLLAMA_OUTPUT_LIMIT', 'Local inference output exceeded the byte limit.');
        full += piece;
        if (raw.message.tool_calls !== undefined) {
            if (!Array.isArray(raw.message.tool_calls) || raw.message.tool_calls.length > MAX_TOOLS) fail('OLLAMA_INVALID_RESPONSE', 'Local inference returned invalid tool calls.');
            const initialSize = calls.size;
            for (const [offset, call] of raw.message.tool_calls.entries()) {
                const native = inputToolCall(call, initialSize + offset);
                const index = native.function.index;
                const mapped: ManagedOllamaToolCall = {
                    id: native.id || `${callPrefix}_${index}`, type: 'function',
                    function: { name: native.function.name, arguments: json(native.function.arguments) },
                };
                outputBytes += Buffer.byteLength(json(mapped), 'utf8');
                if (outputBytes > MAX_OUTPUT_BYTES || calls.has(index)) fail('OLLAMA_INVALID_RESPONSE', 'Local inference returned duplicate or excessive tool calls.');
                calls.set(index, mapped);
            }
        }
        if (piece && onDelta) { try { onDelta(piece); } catch { /* Optional UI callback must not start a retry. */ } }
        if (raw.done) terminal = raw;
    };
    try {
        assertActive(signal);
        while (true) {
            const chunk = await reader.read();
            assertActive(signal);
            if (chunk.done) break;
            totalBytes += chunk.value.byteLength;
            if (totalBytes > (stream ? MAX_RESPONSE_BYTES : MAX_OUTPUT_BYTES)) fail('OLLAMA_OUTPUT_LIMIT', 'Local inference response exceeded the byte limit.');
            pending += decoder.decode(chunk.value, { stream: true });
            if (stream) {
                let newline: number;
                while ((newline = pending.indexOf('\n')) >= 0) {
                    const line = pending.slice(0, newline).trim();
                    pending = pending.slice(newline + 1);
                    if (Buffer.byteLength(line, 'utf8') > MAX_RECORD_BYTES) fail('OLLAMA_RECORD_LIMIT', 'Local inference stream record exceeded the byte limit.');
                    if (line) { try { accept(JSON.parse(line)); } catch (error) {
                        if (error instanceof ManagedOllamaError) throw error;
                        fail('OLLAMA_INVALID_RESPONSE', 'Local inference returned malformed JSON.');
                    } }
                }
                if (Buffer.byteLength(pending, 'utf8') > MAX_RECORD_BYTES) fail('OLLAMA_RECORD_LIMIT', 'Local inference stream record exceeded the byte limit.');
                if (terminal) {
                    if (pending.trim()) fail('OLLAMA_INVALID_RESPONSE', 'Local inference returned data after its terminal record.');
                    await reader.cancel();
                    break;
                }
            }
        }
        pending += decoder.decode();
        if (pending.trim()) {
            if (stream && Buffer.byteLength(pending, 'utf8') > MAX_RECORD_BYTES) fail('OLLAMA_RECORD_LIMIT', 'Local inference stream record exceeded the byte limit.');
            try { accept(JSON.parse(pending)); } catch (error) {
                if (error instanceof ManagedOllamaError) throw error;
                fail('OLLAMA_INVALID_RESPONSE', 'Local inference returned malformed JSON.');
            }
        }
        if (!terminal || (!full.trim() && calls.size === 0)) fail('OLLAMA_INCOMPLETE', 'Local inference ended without a complete nonempty result.');
        if (terminal.done_reason !== undefined && !['stop', 'tool_calls'].includes(terminal.done_reason)) {
            fail('OLLAMA_INCOMPLETE', 'Local inference did not report a supported completion reason.');
        }
        const evalCount = metric(terminal, 'eval_count');
        const promptCount = metric(terminal, 'prompt_eval_count');
        if ((evalCount !== undefined && evalCount >= budget.outputTokens)
            || (promptCount !== undefined && promptCount > budget.contextTokens - budget.outputTokens)) {
            fail('LOCAL_COMPLETION_LIMIT', 'local_completion_limit_exceeded');
        }
        const metrics: ManagedOllamaMetrics = { contextTokens: budget.contextTokens, outputTokens: budget.outputTokens, promptEstimatedTokens };
        for (const key of ['prompt_eval_count', 'eval_count', 'total_duration', 'load_duration', 'prompt_eval_duration', 'eval_duration'] as const) {
            const value = metric(terminal, key);
            if (value !== undefined) metrics[key] = value;
        }
        if (terminal.done_reason !== undefined) metrics.done_reason = terminal.done_reason;
        return { content: full, ...(calls.size ? { tool_calls: [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call) } : {}), metrics };
    } finally {
        signal.removeEventListener('abort', abort);
        try { await reader.cancel(); } catch { /* Only this request's reader. */ }
        reader.releaseLock();
        pending = '';
    }
}

export async function managedOllamaChat(options: ManagedOllamaChatOptions,
    dependencies: ManagedOllamaDependencies = {}): Promise<ManagedOllamaResult> {
    if (!isManagedOllamaEndpoint(options.baseURL)) fail('OLLAMA_ENDPOINT', 'Managed inference requires the canonical loopback Ollama endpoint on port 11434.');
    if (typeof options.model !== 'string' || options.model.length > 128
        || !/^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)?(?::[a-z0-9][a-z0-9._-]*)?$/i.test(options.model)
        || /(?:^|[/:._-])(?:cloud|auto)(?:$|[/:._-])/i.test(options.model)) fail('OLLAMA_MODEL', 'Managed inference requires an explicit local model name.');
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 30 * 60 * 1000) {
        fail('OLLAMA_TIMEOUT_INPUT', 'Local inference timeout must be between 1 ms and 30 minutes.');
    }
    const maxContextTokens = options.maxContextTokens ?? DEFAULT_CONTEXT;
    if (!Number.isInteger(maxContextTokens) || maxContextTokens < 1 || maxContextTokens > MAX_CONTEXT) fail('OLLAMA_CONTEXT_INPUT', 'Managed context policy must be between 1 and 16384 tokens.');
    const requestedOutputTokens = options.maxCompletionTokens ?? 512;
    if (!Number.isInteger(requestedOutputTokens) || requestedOutputTokens < 1) fail('OLLAMA_OUTPUT_INPUT', 'Output tokens must be a positive integer.');
    // Fitted to the room the prompt leaves once it is measured (below).
    let outputTokens = requestedOutputTokens;
    if (options.reasoningEffort !== undefined && options.reasoningEffort !== 'none') fail('OLLAMA_UNSUPPORTED_INPUT', 'Unsupported local reasoning effort.');
    if (options.temperature !== undefined && (!Number.isFinite(options.temperature) || options.temperature < 0 || options.temperature > 2)) fail('OLLAMA_UNSUPPORTED_INPUT', 'Temperature must be finite and between 0 and 2.');
    if (options.format !== undefined && options.format !== 'json' && !object(options.format)) fail('OLLAMA_FORMAT_INPUT', 'Native format must be json or a JSON-schema object.');
    const deadline = new AbortController();
    const deadlineAt = Date.now() + options.timeoutMs;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; deadline.abort(); }, options.timeoutMs);
    timer.unref?.();
    const outer = linkedSignals([options.signal, deadline.signal]);
    const checkDeadline = (): void => {
        // Synchronous preparation and callbacks can delay the timer callback.
        if (Date.now() >= deadlineAt) { timedOut = true; deadline.abort(); }
        assertActive(outer.signal);
    };
    try {
        checkDeadline();
        const mapped = mapMessages(options.messages);
        const tools = mapTools(options.tools);
        if (tools?.length) mapped.promptEstimatedTokens += Math.ceil(Buffer.byteLength(json(tools), 'utf8') / 3) + 64;
        if (options.format !== undefined) mapped.promptEstimatedTokens += Math.ceil(Buffer.byteLength(json(options.format), 'utf8') / 3);
        // ⛔ A wish for more output than the context can hold is not a reason to
        // produce nothing. Eval 2026-10-22: ai_write_file asked 6000 output tokens
        // of a 4096 context and EVERY non-frontend file failed before inference.
        // The output gets the room the measured prompt leaves; only when even a
        // minimal answer cannot fit is it a real overflow.
        const room = maxContextTokens - mapped.promptEstimatedTokens - 1;
        if (requestedOutputTokens > room) {
            if (room < MIN_FITTED_OUTPUT_TOKENS) fail('RESOURCE_CONTEXT_OVERFLOW', 'The prompt leaves no room for an answer inside the managed context.');
            outputTokens = room;
        }
        const basePayload = {
            model: options.model, messages: mapped.messages, stream: !!options.onDelta,
            keep_alive: '5m', truncate: false, shift: false,
            ...(tools?.length ? { tools } : {}), ...(options.format !== undefined ? { format: options.format } : {}),
            ...(options.reasoningEffort === 'none' && /^qwen3(?:\.5)?(?::[a-z0-9][a-z0-9._-]*)?$/i.test(options.model) ? { think: false } : {}),
        };
        if (Buffer.byteLength(json(basePayload), 'utf8') > MAX_REQUEST_BYTES) fail('OLLAMA_INPUT_LIMIT', 'Local inference request exceeded the byte limit.');
        checkDeadline();
        const manager = dependencies.resourceManager ?? requestResourceManager;
        const result = await manager.withInference(async budget => {
            checkDeadline();
            if (!Number.isInteger(budget.contextTokens) || budget.contextTokens < 1 || budget.contextTokens > maxContextTokens
                || !Number.isInteger(budget.outputTokens) || budget.outputTokens < 1 || budget.outputTokens > outputTokens
                || mapped.promptEstimatedTokens + budget.outputTokens > budget.contextTokens) {
                fail('RESOURCE_CONTEXT_OVERFLOW', 'The complete prompt and output reserve do not fit the admitted context estimate.');
            }
            const run = linkedSignals([outer.signal, budget.signal]);
            try {
                assertActive(run.signal);
                const body = json({ ...basePayload, options: { num_ctx: budget.contextTokens, num_predict: budget.outputTokens,
                    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}) } });
                if (Buffer.byteLength(body, 'utf8') > MAX_REQUEST_BYTES) fail('OLLAMA_INPUT_LIMIT', 'Local inference request exceeded the byte limit.');
                const endpoint = new URL(options.baseURL);
                endpoint.pathname = '/api/chat';
                const response = await (dependencies.fetch ?? globalThis.fetch)(endpoint.toString(), {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: run.signal,
                    redirect: 'error',
                });
                if (run.signal.aborted) {
                    try { await response.body?.cancel(); } catch { /* Only this aborted request's response. */ }
                }
                assertActive(run.signal);
                if (!response.ok) {
                    // The loopback server's reason is CLASSIFIED for the operator log;
                    // its text is never echoed anywhere. Eval round 6 (2026-10-23):
                    // five plans failed at 311-414 s as a bare HTTP 500, no reason.
                    let reason = '';
                    try { reason = (await response.text()).slice(0, 4096); } catch { /* The status alone is still logged. */ }
                    console.warn('[LocalCall] server-error', JSON.stringify({ status: response.status, reason: serverErrorClass(reason) }));
                    fail('OLLAMA_HTTP_ERROR', `Local inference returned HTTP ${response.status}.`);
                }
                const completion = await consume(response, !!options.onDelta, run.signal, budget, mapped.promptEstimatedTokens, options.onDelta);
                checkDeadline();
                return completion;
            } finally { run.close(); }
        }, { promptEstimatedTokens: mapped.promptEstimatedTokens, requestedOutputTokens: outputTokens,
            requestedContextTokens: maxContextTokens, fitOutputToContext: true, signal: outer.signal,
            // The caller's deadline already covers queue wait (RESOURCE_TIMEOUT below);
            // a second, fixed 300 s queue cap failed every call queued behind one CPU
            // plan (eval round 6: RESOURCE_QUEUE_TIMEOUT at 300 013 ms, deadline 30 min).
            queueTimeoutMs: options.timeoutMs });
        checkDeadline();
        // Every successful receipt teaches the deadlines what this machine really does.
        noteLocalThroughput(result.metrics);
        return result;
    } catch (error) {
        if (timedOut) fail('RESOURCE_TIMEOUT', 'Local inference exceeded its request deadline, including queue wait.');
        if (outer.signal.aborted) fail('RESOURCE_CANCELLED', 'Local inference was cancelled.');
        if (error instanceof ManagedOllamaError) throw error;
        if (typeof (error as any)?.code === 'string' && /^(?:RESOURCE_|HEAVY_)/.test((error as any).code)) throw error;
        fail('OLLAMA_TRANSPORT_ERROR', 'Local inference transport failed; no retry was started.');
    } finally {
        clearTimeout(timer);
        outer.close();
    }
}
