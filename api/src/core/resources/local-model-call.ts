/**
 * A MODEL CALL TO A SERVER ON THIS MACHINE IS ADMITTED, WHATEVER IT IS CALLED.
 *
 * Second review of round 21: the managed Ollama transport and LocalProvider
 * admit their calls (withInference / withLocalModelCall), but the same model
 * reached by another spelling was not — structured.ts's /api/generate for
 * OLLAMA_HOST=http://0.0.0.0:11434 (Ollama's own Linux server value), the
 * router's custom OpenAI-compatible route at a local URL that is not the
 * canonical one, vision's compatible fetch, a compatible gateway configured as
 * OPENAI_API_BASE or LLM7_BASE_URL, an image or speech server on this machine.
 * Those calls ran beside admitted ones, and an install could unload the very
 * model they were using: the idle-model unload is safe only because every
 * model call holds the heavy lane for its whole run.
 *
 * So the question is asked of the address, not of its spelling: a host that
 * resolves to this machine without a lookup — any loopback spelling (URL
 * parsing folds 127.1, 2130706433 and 0x7f000001 into 127.0.0.1), the
 * unspecified address 0.0.0.0 / [::] (a connection to it reaches this
 * machine), localhost and *.localhost, an address of one of this machine's own
 * interfaces, or this machine's own host name. A remote server's memory is not
 * this machine's: its calls are not admitted here.
 */
import { requestResourceManager, type HeavyOptions } from './RequestResourceManager';
import { isThisMachineEndpoint } from '../../shared/this-machine-host';

/** True when `endpoint` (a URL, or a bare host[:port] as OLLAMA_HOST allows) names a server on this machine (shared/this-machine-host). */
export const isLocalModelEndpoint = isThisMachineEndpoint;

/**
 * Run a model call to `endpoint`: admitted as a local model call when the
 * server is on this machine (it holds the heavy lane for its whole run, its
 * own resident model is credited to it and never unloaded for it), run as it
 * is otherwise. The caller passes its cancellation as `signal` and its
 * deadline as `queueTimeoutMs`, so a wait that outlives the deadline is a
 * RESOURCE_QUEUE_TIMEOUT refusal, not a call that ran.
 */
export function admitLocalModelCall<T>(endpoint: unknown, work: (admission?: AbortSignal) => Promise<T>,
    options: HeavyOptions = {}): Promise<T> {
    if (!isLocalModelEndpoint(endpoint)) return work();
    // `admission` is the lease's own cancellation (his request closing): the call stops with it.
    return requestResourceManager.withLocalModelCall(() => work(requestResourceManager.currentSignal()),
        { kind: 'local-model-call', ...options });
}
