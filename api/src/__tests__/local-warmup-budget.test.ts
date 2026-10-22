import type * as LocalBrain from '../core/llm/local-brain';
import type { RequestResourceManager } from '../core/resources/RequestResourceManager';

async function flush() { for (let step = 0; step < 40; step++) await Promise.resolve(); }

describe('bounded local-model boot warmup', () => {
  const keys = ['LOCAL_LLM_BASE_URL', 'OLLAMA_HOST', 'LOCAL_LLM_MODEL', 'JOE_LOCAL_WARMUP_ALL', 'JOE_VISION_WARMUP'];
  let saved: Record<string, string | undefined>;
  let fetchMock: jest.SpyInstance;
  let brain: typeof LocalBrain;
  let resources: RequestResourceManager;
  let requests: Array<{ body: any; signal: AbortSignal }>;
  let generate: () => Promise<Response>;
  const response = () => ({ ok: true, json: async () => ({ done: true, response: 'hi' }) }) as Response;

  beforeEach(async () => {
    saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    jest.resetModules();
    jest.useFakeTimers();
    const actualResources = jest.requireActual('../core/resources/RequestResourceManager');
    resources = new actualResources.RequestResourceManager({ sampleMemory: () => ({
      totalBytes: 16 * 1024 ** 3, freeBytes: 8 * 1024 ** 3, availableBytes: 8 * 1024 ** 3,
    }) });
    jest.doMock('../core/resources/RequestResourceManager', () => ({ ...actualResources, requestResourceManager: resources }));
    requests = [];
    generate = async () => response();
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (String(url).endsWith('/api/tags')) {
        return { ok: true, json: async () => ({ models: [
          { name: 'qwen2.5-coder:7b' }, { name: 'qwen3.5:4b' }, { name: 'moondream:latest' },
        ] }) } as Response;
      }
      if (!String(url).endsWith('/api/generate')) throw new Error('unexpected_test_network_path');
      requests.push({ body: JSON.parse(String(options?.body)), signal: options?.signal as AbortSignal });
      return generate();
    });
    brain = await import('../core/llm/local-brain');
    await brain.detectLocalModels();
  });

  afterEach(() => {
    fetchMock.mockRestore();
    jest.dontMock('../core/resources/RequestResourceManager');
    jest.clearAllTimers();
    jest.useRealTimers();
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('warms one configured/default model with a finite lease, keeping both task choices', async () => {
    await brain.warmUpLocalBrain();
    expect(requests).toHaveLength(1);
    // Discovery assigns the coding default to the env; warmup respects that
    // existing selection rather than silently replacing it with the chat model.
    expect(requests[0].body).toMatchObject({ model: 'qwen2.5-coder:7b', keep_alive: '5m' });
    expect(brain.pickLocalModel('code_generation')).toBe('qwen2.5-coder:7b');
    expect(brain.pickLocalModel('chat')).toBe('qwen3.5:4b');
  });

  it('coalesces simultaneous boot and refresh triggers and cleans successful timers', async () => {
    let finish!: (result: Response) => void;
    generate = () => new Promise(resolve => { finish = resolve; });
    const boot = brain.warmUpLocalBrain();
    const refresh = brain.warmUpLocalBrain();
    expect(boot).toBe(refresh);
    await flush();
    expect(requests).toHaveLength(1);
    finish(response());
    await Promise.all([boot, refresh]);
    expect(requests[0].signal.aborted).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ends the visible ignored-abort warmup at 10s and admits a refresh only after transport settles', async () => {
    let finishTransport!: (result: Response) => void;
    generate = () => new Promise(resolve => { finishTransport = resolve; });
    let finished = false;
    const boot = brain.warmUpLocalBrain().then(() => { finished = true; });
    await jest.advanceTimersByTimeAsync(9999);
    expect(finished).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(finished).toBe(true);
    await boot;
    expect(requests[0].signal.aborted).toBe(true);
    expect(brain.localWarmupMs()).toBe(0); // Unknown, never a fabricated success measurement.
    expect(jest.getTimerCount()).toBe(0);
    expect(resources.status().inference.active).toBe(1);
    generate = async () => response();
    const refresh = brain.warmUpLocalBrain();
    await flush();
    expect(requests).toHaveLength(1);
    expect(resources.status().heavy.queued).toBe(1);
    finishTransport(response());
    await refresh;
    expect(requests).toHaveLength(2);
    expect(resources.status()).toMatchObject({ activeRequests: 0, heavy: { active: 0, queued: 0 }, inference: { active: 0, queued: 0 } });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('observes late transport rejection after returning without scheduling a retry', async () => {
    let rejectTransport!: (reason: Error) => void;
    generate = () => new Promise((_, reject) => { rejectTransport = reject; });
    const boot = brain.warmUpLocalBrain();
    await jest.advanceTimersByTimeAsync(10000);
    await boot;
    rejectTransport(new Error('late_test_rejection'));
    await flush();
    expect(requests).toHaveLength(1);
    expect(resources.status().inference.active).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('preserves an explicit model selection', async () => {
    process.env.LOCAL_LLM_MODEL = 'custom-user-model';
    await brain.warmUpLocalBrain();
    expect(requests).toHaveLength(1);
    expect(requests[0].body.model).toBe('custom-user-model');
  });

  it('keeps admission through an unfinished response body and coalesces its refresh trigger', async () => {
    let finishBody!: (body: unknown) => void;
    const body = new Promise(resolve => { finishBody = resolve; });
    generate = async () => ({ ok: true, json: () => body }) as Response;
    const boot = brain.warmUpLocalBrain();
    await flush();
    expect(requests).toHaveLength(1);
    expect(resources.status().inference.active).toBe(1);
    const refresh = brain.warmUpLocalBrain();
    expect(refresh).toBe(boot);
    expect(requests).toHaveLength(1);
    finishBody({ done: true, response: 'hi' });
    await Promise.all([boot, refresh]);
    expect(resources.status().inference.active).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cleans up a failed transport and remains best effort without fallback', async () => {
    generate = async () => { throw new Error('test_transport_failure'); };
    await expect(brain.warmUpLocalBrain()).resolves.toBeUndefined();
    expect(requests).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps explicit multi-model and vision warming sequential', async () => {
    process.env.JOE_LOCAL_WARMUP_ALL = '1';
    process.env.JOE_VISION_WARMUP = '1';
    let active = 0;
    let peak = 0;
    generate = async () => {
      active++; peak = Math.max(peak, active);
      await Promise.resolve(); active--;
      return response();
    };
    await brain.warmUpLocalBrain();
    expect(new Set(requests.map(request => request.body.model)).size).toBe(3);
    expect(peak).toBe(1);
    expect(requests.every(request => request.body.keep_alive === '5m')).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
});
