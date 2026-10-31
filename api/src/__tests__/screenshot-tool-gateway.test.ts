export {};
/**
 * Screenshot tool gateway integration tests (legacy normal mode + autonomous admission).
 *
 * REAL path under test: ToolService.executeTool -> REAL AgentExecutionFirewall
 * -> REAL ScreenshotTool instance in a controlled single-entry registry.
 * Nothing here replaces executeTool, the firewall, ScreenshotTool, or their
 * security decisions with an invented gateway.
 *
 * Inert edges: Chromium (synthetic PNG via the existing pngjs dependency, never
 * real navigation), WS broadcasts, persistence/session lookup, secrets config,
 * scheduler. Filesystem root is REAL and RETAINED (see JOE_SCREENSHOT_TEST_ROOT).
 *
 * Limit of the one normal workflow through attendedRun: the inert scheduler
 * runs work inline in registration order; it does not emulate queue priority
 * or scheduler-driven stop ordering. Stop is proven through the context
 * signal/isCancelled handle observed inside ScreenshotTool, not via scheduler
 * ordering.
 */
const nativeFs = jest.requireActual('fs') as typeof import('fs');
const nativePath = jest.requireActual('path') as typeof import('path');
const { PNG } = jest.requireActual('pngjs') as any;

const SID = '111111111111111111111111';
const UID = 'synthetic-owner';
const WS = '222222222222222222222222';
const FOREIGN_UID = 'foreign-user';
const ARABIC_BASENAME = 'لقطة-شاشة-التحقق.png';
const PAGE_URL = 'https://example.com/';

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = nativeFs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = nativePath.join(dir, entry);
    let stat: any = null;
    try {
      stat = nativeFs.lstatSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) out.push(...listFilesRecursive(full));
    else if (stat.isFile()) out.push(full);
  }
  return out;
}

describe('screenshot tool gateway (legacy normal mode + autonomous admission)', () => {
  const outerEnv = process.env;
  const outerSessions = (global as any).mockSessions;

  afterEach(() => {
    process.env = outerEnv;
    if (outerSessions === undefined) delete (global as any).mockSessions;
    else (global as any).mockSessions = outerSessions;
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.resetModules();
  });

  function fixture(
    options: {
      autonomous?: boolean;
      ownerRecord?: any;
      access?: (write: boolean) => boolean | Promise<boolean>;
      rootFor?: (wid: string, fallback: string) => string;
      onScreenshot?: () => void | Promise<void>;
      onGoto?: () => void | Promise<void>;
      onContextClose?: () => void | Promise<void>;
      onBrowserClose?: () => void | Promise<void>;
      onServerClose?: () => void | Promise<void>;
      onServerKill?: () => void | Promise<void>;
      omitExitEvidence?: boolean;
      replaceProcessOnCleanup?: boolean;
      mutateProcessPidOnCleanup?: boolean;
      serverEndpoint?: string;
      onServerLaunch?: () => void | Promise<void>;
      onConnect?: () => void | Promise<void>;
    } = {},
  ) {
    jest.resetModules();
    jest.useFakeTimers();
    const base = outerEnv.JOE_SCREENSHOT_TEST_ROOT;
    if (!base || !nativePath.isAbsolute(base)) {
      throw new Error('An explicitly owned retained test root is required');
    }
    const root = nativeFs.mkdtempSync(nativePath.join(base, 'shot-'));
    if (options.autonomous) {
      process.env = {
        NODE_ENV: 'test',
        JOE_AUTONOMOUS_DEVELOPMENT: '1',
        PERSISTENCE_MODE: 'JSON',
        AI_COST_POLICY: 'free_only',
        AUTO_APPROVE_ALL: '0',
        AUTO_APPROVE_SAFE: '0',
        ENABLE_AUTH_BYPASS: 'false',
        JOE_SCREENSHOT_TEST_ROOT: base,
      } as any;
      (global as any).mockSessions = [{ id: SID, userId: UID, workspaceId: WS }];
    } else {
      const kept: any = { ...(outerEnv as any) };
      delete kept.JOE_AUTONOMOUS_DEVELOPMENT;
      process.env = {
        ...kept,
        NODE_ENV: 'test',
        PERSISTENCE_MODE: 'JSON',
        AI_COST_POLICY: 'free_only',
        AUTO_APPROVE_ALL: '0',
        AUTO_APPROVE_SAFE: '1',
        ENABLE_AUTH_BYPASS: 'false',
        JOE_SCREENSHOT_TEST_ROOT: base,
      } as any;
      delete (process.env as any).JOE_AUTONOMOUS_DEVELOPMENT;
      delete (global as any).mockSessions;
    }

    const png = new PNG({ width: 24, height: 18 });
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = 200;
      png.data[i + 1] = 220;
      png.data[i + 2] = 240;
      png.data[i + 3] = 255;
    }
    const pngBytes: Buffer = PNG.sync.write(png);

    const observations = {
      launches: 0,
      closes: 0,
      serverCloses: 0,
      serverKills: 0,
      connects: 0,
      launchOptions: null as any,
      screenshots: 0,
      gotos: [] as string[],
    };
    const rootCalls: string[] = [];
    const permissionCalls: Array<{ id: string; uid: string; write: boolean }> = [];
    const secretsCalls: string[][] = [];
    const events: any[] = [];
    const traceCalls: any[] = [];

    const deny = (name: string) => (..._args: any[]) => {
      throw new Error('Unexpected external effect: ' + name);
    };
    const mock = (name: string, fields: any) => jest.doMock(name, () => fields);

    const page = {
      goto: async (url: any) => {
        observations.gotos.push(String(url));
        if (options.onGoto) await options.onGoto();
      },
      waitForTimeout: async (_ms: any) => {},
      screenshot: async () => {
        observations.screenshots += 1;
        if (options.onScreenshot) await options.onScreenshot();
        return Buffer.from(pngBytes);
      },
    };
    const browser = {
      newContext: async (_opts: any) => ({ newPage: async () => page, close: async () => { if (options.onContextClose) await options.onContextClose(); } }),
      close: async () => {
        observations.closes += 1;
        if (options.onBrowserClose) await options.onBrowserClose();
      },
    };

    const ownedProcess = { pid: 12345, exitCode: null as number | null, signalCode: null as string | null };
    let processReads = 0;
    const server = {
      process: () => {
        processReads += 1;
        if (processReads > 1 && options.mutateProcessPidOnCleanup) ownedProcess.pid = 54321;
        return processReads > 1 && options.replaceProcessOnCleanup ? { ...ownedProcess } : ownedProcess;
      },
      wsEndpoint: () => options.serverEndpoint || 'ws://127.0.0.1:1234/synthetic-owned-endpoint',
      close: async () => {
        observations.serverCloses += 1;
        if (options.onServerClose) await options.onServerClose();
        if (!options.omitExitEvidence) ownedProcess.exitCode = 0;
      },
      kill: async () => {
        observations.serverKills += 1;
        if (options.onServerKill) await options.onServerKill();
        if (!options.omitExitEvidence) ownedProcess.signalCode = 'SIGKILL';
      },
    };
    mock('playwright', {
      chromium: {
        launchServer: async (opts: any) => {
          observations.launches += 1;
          observations.launchOptions = opts;
          if (options.onServerLaunch) await options.onServerLaunch();
          return server;
        },
        connect: async (endpoint: string, opts: any) => {
          observations.connects += 1;
          expect(endpoint).toBe(server.wsEndpoint());
          expect(opts.timeout).toBe(30000);
          if (options.onConnect) await options.onConnect();
          return browser;
        },
      },
    });
    mock('glob', { glob: deny('glob') });
    class ObjectId {
      static isValid(v: string) {
        return /^[0-9a-f]{24}$/u.test(String(v));
      }
    }
    mock('mongoose', {
      __esModule: true,
      default: { Types: { ObjectId }, connection: { readyState: 1 } },
    });
    mock('../api/chat-store', { usesLocalChatStore: () => true });
    const ownerRecord = options.ownerRecord !== undefined ? options.ownerRecord : { userId: UID, workspaceId: WS };
    mock('../shared/models/session', {
      Session: { findById: () => ({ select: () => ({ lean: async () => ownerRecord }) }) },
    });
    mock('../shared/utils/logger', { logger: { debug: jest.fn(), error: jest.fn() } });
    mock('../modules/services/vectorDb', { vectorDb: {} });
    mock('../modules/services/TraceManager', {
      traceManager: { logEvent: (...args: any[]) => traceCalls.push(args) },
    });
    let selectedRoot = root;
    mock('../modules/services/WorkspaceService', {
      workspaceService: {
        externalRoot: base,
        canAccessAutonomousFiles: async (id: string, uid: string, write: boolean) => {
          permissionCalls.push({ id, uid, write });
          if (options.access) return options.access(write);
          return id === WS && uid === UID;
        },
        getActiveRoot: (id: string) => {
          rootCalls.push(id);
          if (options.rootFor) return options.rootFor(id, selectedRoot);
          if (id !== WS) throw new Error('Wrong explicit workspace');
          return selectedRoot;
        },
        runWithWorkspace: (id: string, work: () => any) => {
          if (id !== WS) throw new Error('Wrong run workspace');
          return work();
        },
      },
    });
    mock('../modules/tools/utils', {
      resolveToolPath: (..._a: any[]) => {
        throw new Error('Unexpected path rewrite for screenshot');
      },
    });
    mock('../modules/services/BinaryService', { BinaryService: {} });
    mock('../modules/services/secrets', {
      getSessionRunConfig: (sid: string) => {
        secretsCalls.push([sid]);
        return {};
      },
    });
    mock('../modules/browser/challenge', { agentSearchUrl: deny('network') });
    mock('../core/terminal/paint', { paintLine: (v: any) => v });
    mock('../shared/utils/url', { normalizeUrlForGoto: (v: any) => String(v || '') });
    const pushEvent = (e: any) => events.push(e);
    mock('../api/ws', {
      broadcast: pushEvent,
      broadcastThinkingPhase: (sid: string, phase: string) => pushEvent({ type: 'thinking_phase', sessionId: sid, phase }),
      broadcastTerminalLine: pushEvent,
      registerSessionOwner: pushEvent,
      registerTerminalOwner: pushEvent,
      registerTerminalSessionOwner: pushEvent,
    });
    mock('../api/page-store', { persistJoeProjects: deny('projects'), writeJoeProject: deny('projects') });
    mock('../modules/terminal/command-router', { commandRouter: {} });
    mock('../modules/tools/handlers', { handleShellCommand: deny('shell') });
    mock('../kernel/ExecutionEngine', { executionEngine: {} });
    mock('../shared/file-write-contract', { validateFileWriteBatch: deny('batch') });
    mock('../modules/tools/terminal/TerminalState', {
      terminals: {},
      registerTerminal: deny('terminal'),
      removeTerminal: deny('terminal'),
    });
    mock('../modules/terminal/terminal-kernel', { terminalKernel: {} });
    mock('../core/session/attended-run', {
      registerRun: () => {
        const handle: any = {
          cancelled: false,
          whenCancelled: new Promise(() => {}),
          cancel() {
            handle.cancelled = true;
          },
        };
        return handle;
      },
      releaseHandle: jest.fn(),
      attendRun: ({ work }: any) => work(),
    });
    mock('../modules/browser/manager', { getChromiumLaunchOptions: () => ({}) });

    const { ScreenshotTool } = require('../modules/tools/definitions/ScreenshotTool');
    const leaf = new ScreenshotTool();
    const { ScreenshotResultTool } = require('../modules/tools/definitions/ScreenshotResultTool');
    const artifactReader = new ScreenshotResultTool();
    mock('../modules/tools/registry', { tools: [leaf, artifactReader] });

    const { executeTool } = require('../modules/services/ToolService');
    const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
    const ctx = () => ({ sessionId: SID, userId: UID, workspaceId: WS });
    const invoke = (name: string, input: any, context: any = ctx(), owner: any = { userId: UID, sessionId: SID }) =>
      executionFirewall.runInContext(undefined, () => executeTool(name, input, context), owner);
    return {
      root,
      base,
      events,
      traceCalls,
      rootCalls,
      permissionCalls,
      secretsCalls,
      observations,
      pngBytes,
      ctx,
      invoke,
      executionFirewall,
    };
  }

  test('permitted owner captures a real PNG under the exact Arabic basename', async () => {
    const f = fixture();
    expect(process.env.JOE_AUTONOMOUS_DEVELOPMENT).toBeUndefined();
    expect(process.env.ENABLE_AUTH_BYPASS).toBe('false');
    expect(process.env.AUTO_APPROVE_ALL).toBe('0');
    expect(process.env.AUTO_APPROVE_SAFE).toBe('1');
    expect(f.executionFirewall.isSystemContext()).toBe(false);

    const result = await f.invoke('screenshot', { url: PAGE_URL, filename: ARABIC_BASENAME });
    expect(result.ok).toBe(true);
    expect(result.output && result.output.success).toBe(true);

    const outPath = String(result.output && result.output.path);
    expect(nativePath.basename(outPath)).toBe(ARABIC_BASENAME);
    expect(outPath.startsWith(f.root + nativePath.sep)).toBe(true);
    const stored = nativeFs.readFileSync(outPath);
    expect(stored.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
    const parsed = PNG.sync.read(stored);
    expect(parsed.width).toBe(result.output.width);
    expect(parsed.height).toBe(result.output.height);
    expect(f.secretsCalls.length).toBeGreaterThan(0);
    expect(f.observations.launches).toBe(1);
    expect(f.observations.screenshots).toBe(1);
    expect(f.observations.gotos).toEqual([PAGE_URL]);
    expect(f.rootCalls.length).toBeGreaterThan(0);
    expect(f.rootCalls.every((id) => id === WS)).toBe(true);
    expect(f.permissionCalls.length).toBeGreaterThan(0);
    expect(f.permissionCalls.every((c) => c.id === WS && c.uid === UID && c.write === true)).toBe(true);
    const shots = f.events.filter((e) => e && e.type === 'screenshot');
    expect(shots).toHaveLength(1);
    expect(shots[0].sessionId).toBe(SID);
    expect(shots[0].userId).toBe(UID);
    expect(shots[0].workspaceId).toBe(WS);
    expect(String(shots[0].data.url).startsWith('data:image/png;base64,')).toBe(true);
  });

  test('foreign user session is refused before capture or write', async () => {
    const f = fixture();
    const result = await f.invoke(
      'screenshot',
      { url: PAGE_URL, filename: ARABIC_BASENAME },
      { sessionId: SID, userId: FOREIGN_UID, workspaceId: WS },
    );
    expect(result.ok).toBe(false);
    expect(String(result.error)).toMatch(/session_forbidden/);
    expect(f.rootCalls).toEqual([]);
    expect(f.observations.launches).toBe(0);
    expect(f.observations.screenshots).toBe(0);
    expect(f.events).toEqual([]);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });

  test('denied workspace write membership is refused before capture or write', async () => {
    const f = fixture({ access: () => false });
    const result = await f.invoke('screenshot', { url: PAGE_URL, filename: ARABIC_BASENAME });
    expect(result.ok).toBe(false);
    expect(String(result.error)).toMatch(/workspace_permission_denied/);
    expect(f.observations.launches).toBe(0);
    expect(f.observations.screenshots).toBe(0);
    expect(f.events.filter((e) => e && e.type === 'screenshot')).toEqual([]);
    expect(listFilesRecursive(f.root)).toEqual([]);
    expect(f.permissionCalls.length).toBeGreaterThan(0);
  });

  test('input-supplied session/workspace/user ids cannot replace trusted context or steal root', async () => {
    const attackerRoot = nativeFs.mkdtempSync(nativePath.join(outerEnv.JOE_SCREENSHOT_TEST_ROOT!, 'attacker-'));
    const f = fixture({
      rootFor: (wid: string, fallback: string) => (wid === 'attacker-ws' ? attackerRoot : fallback),
    });
    const result = await f.invoke('screenshot', {
      url: PAGE_URL,
      filename: ARABIC_BASENAME,
      sessionId: 'attacker-session',
      workspaceId: 'attacker-ws',
      userId: 'attacker-user',
    });
    expect(result.ok).toBe(true);
    const outPath = String(result.output && result.output.path);
    expect(outPath.startsWith(f.root + nativePath.sep)).toBe(true);
    expect(nativePath.basename(outPath)).toBe(ARABIC_BASENAME);
    expect(listFilesRecursive(attackerRoot)).toEqual([]);
    const shots = f.events.filter((e) => e && e.type === 'screenshot');
    expect(shots).toHaveLength(1);
    expect(shots[0].sessionId).toBe(SID);
    expect(shots[0].userId).toBe(UID);
    expect(shots[0].workspaceId).toBe(WS);
    expect(f.permissionCalls.every((c) => c.id === WS && c.uid === UID)).toBe(true);
  });

  test('missing trusted session is refused with no side effects', async () => {
    const f = fixture({ ownerRecord: null });
    const result = await f.invoke('screenshot', { url: PAGE_URL, filename: ARABIC_BASENAME }, { workspaceId: WS });
    expect(result.ok).toBe(false);
    expect(f.observations.launches).toBe(0);
    expect(f.observations.screenshots).toBe(0);
    expect(f.events).toEqual([]);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });

  test('pre-cancelled request emits no success and no files', async () => {
    const f = fixture();
    const controller = new AbortController();
    controller.abort();
    const result = await f.invoke(
      'screenshot',
      { url: PAGE_URL, filename: ARABIC_BASENAME },
      { ...f.ctx(), signal: controller.signal },
    );
    expect(result.ok).toBe(false);
    expect(f.events.filter((e) => e && e.type === 'screenshot')).toEqual([]);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });

  test('stop during capture emits no success and no files', async () => {
    let stopped = false;
    const f = fixture({
      onScreenshot: async () => {
        stopped = true;
      },
    });
    const result = await f.invoke(
      'screenshot',
      { url: PAGE_URL, filename: ARABIC_BASENAME },
      { ...f.ctx(), isCancelled: () => stopped },
    );
    expect(result.ok).toBe(false);
    expect(stopped).toBe(true);
    expect(f.observations.screenshots).toBe(1);
    expect(f.events.filter((e) => e && e.type === 'screenshot')).toEqual([]);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });

  test('bounded screenshot is admitted without approval flags in autonomous mode', async () => {
    const f = fixture({ autonomous: true });
    expect(process.env.AUTO_APPROVE_SAFE).toBe('0');
    expect(process.env.AUTO_APPROVE_ALL).toBe('0');
    expect(process.env.ENABLE_AUTH_BYPASS).toBe('false');
    const result = await f.invoke('screenshot', { url: PAGE_URL, filename: ARABIC_BASENAME });
    expect(result.ok).toBe(true);
    expect(nativePath.basename(result.output.path)).toBe(ARABIC_BASENAME);
    expect(PNG.sync.read(nativeFs.readFileSync(result.output.path)).width).toBe(24);
    expect(f.events.filter(e => e && e.type === 'screenshot')).toHaveLength(1);
    expect(f.permissionCalls.every(c => c.id === WS && c.uid === UID && c.write)).toBe(true);
    expect(f.secretsCalls).toEqual([]);
  });

  test.each(['foreign user', 'foreign workspace', 'foreign ambient owner', 'missing session'])
  ('autonomous %s is refused before progress, capture or files', async shape => {
    const f = fixture({ autonomous: true });
    const context: any = f.ctx();
    let ambient: any = { userId: UID, sessionId: SID };
    if (shape === 'foreign user') { context.userId = FOREIGN_UID; ambient.userId = FOREIGN_UID; }
    if (shape === 'foreign workspace') context.workspaceId = 'foreign-workspace';
    if (shape === 'foreign ambient owner') ambient.userId = FOREIGN_UID;
    if (shape === 'missing session') delete context.sessionId;
    const result = await f.invoke('screenshot', { url: PAGE_URL }, context, ambient);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('policy_blocked');
    expect(f.observations.launches).toBe(0);
    expect(f.events).toEqual([]);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });

  test('autonomous input identities cannot replace trusted owner or workspace', async () => {
    const f = fixture({ autonomous: true });
    const result = await f.invoke('screenshot', { url: PAGE_URL, filename: ARABIC_BASENAME,
      sessionId: 'foreign-session', userId: FOREIGN_UID, workspaceId: 'foreign-workspace' });
    expect(result.ok).toBe(true);
    const shot = f.events.find(e => e && e.type === 'screenshot');
    expect(shot).toMatchObject({ sessionId: SID, userId: UID, workspaceId: WS });
    expect(f.rootCalls.every(id => id === WS)).toBe(true);
  });

  test('autonomous revoked write membership prevents capture and delivery', async () => {
    const f = fixture({ autonomous: true, access: () => false });
    const result = await f.invoke('screenshot', { url: PAGE_URL });
    expect(result).toMatchObject({ ok: false, error: 'workspace_permission_denied' });
    expect(f.observations.launches).toBe(0);
    expect(f.events.filter(e => e && e.type === 'screenshot')).toEqual([]);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });

  test.each(['screenshot_extra', 'screen_capture', 'delete_file', 'shell_execute', 'deploy_project'])
  ('autonomous %s cannot borrow screenshot admission', async name => {
    const f = fixture({ autonomous: true });
    const result = await f.invoke(name, { url: PAGE_URL });
    expect(result).toMatchObject({ ok: false, error: 'policy_blocked', output: { reason: 'tool_not_admitted' } });
    expect(f.observations.launches).toBe(0);
    expect(f.events).toEqual([]);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });

  test('autonomous cancellation during capture prevents files and success pixels', async () => {
    let stopped = false;
    const f = fixture({ autonomous: true, onScreenshot: () => { stopped = true; } });
    const result = await f.invoke('screenshot', { url: PAGE_URL }, { ...f.ctx(), isCancelled: () => stopped });
    expect(result.ok).toBe(false);
    expect(f.events.filter(e => e && e.type === 'screenshot')).toEqual([]);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });
  test('owned quiet result read executes through real gateway without repainting the run', async () => {
    const f = fixture({ autonomous: true });
    const saved = await f.invoke('screenshot', { url: PAGE_URL, filename: ARABIC_BASENAME });
    expect(saved.ok).toBe(true);
    const id = nativePath.basename(nativePath.dirname(String(saved.output?.path)));
    f.events.length = 0;
    const result = await f.invoke('screenshot_result', { captureId: id }, { ...f.ctx(), artifactPresentation: true });
    expect(result.ok).toBe(true);
    expect(result.output?.capture.filename).toBe(ARABIC_BASENAME);
    expect(Buffer.from(result.output.imageDataUrl.split(',')[1], 'base64')).toEqual(f.pngBytes);
    expect(f.events.filter(e => e && typeof e === 'object' && e.type)).toEqual([]);
    expect(f.events).toContain(SID); // Ownership registration remains intact.
    expect(f.permissionCalls.some(c => c.write === false && c.id === WS && c.uid === UID)).toBe(true);
    expect(f.executionFirewall.isSystemContext()).toBe(false);
  });
  test('quiet artifact presentation cannot bypass foreign session or workspace identity', async () => {
    for (const extra of [{ userId: FOREIGN_UID }, { workspaceId: 'foreign-ws' }]) {
      const f = fixture({ autonomous: true });
      const result = await f.invoke('screenshot_result', {}, { ...f.ctx(), ...extra, artifactPresentation: true });
      expect(result.ok).toBe(false);
      expect(f.rootCalls).toEqual([]); expect(f.events).toEqual([]);
      expect(listFilesRecursive(f.root)).toHaveLength(0);
    }
  });
  test('artifact arguments cannot substitute trusted identities or select a file path', async () => {
    const f = fixture({ autonomous: true });
    const saved = await f.invoke('screenshot', { url: PAGE_URL, filename: ARABIC_BASENAME });
    const id = nativePath.basename(nativePath.dirname(String(saved.output?.path)));
    const result = await f.invoke('screenshot_result', { captureId: id, userId: FOREIGN_UID, workspaceId: 'foreign-ws', path: '../private' }, { ...f.ctx(), artifactPresentation: true });
    expect(result.ok).toBe(true); expect(f.rootCalls.every(id => id === WS)).toBe(true);
  });
  test('private result without quiet presentation retains ordinary gateway progress', async () => {
    const f = fixture({ autonomous: true });
    const result = await f.invoke('screenshot_result', {});
    expect(result.ok).toBe(true); expect(result.output.captures).toHaveLength(0);
    expect(f.events.some(e => e?.type === 'tool_started')).toBe(true);
  });
  test('pre-cancelled private result emits no image or pixels', async () => {
    const f = fixture({ autonomous: true });
    const result = await f.invoke('screenshot_result', {}, { ...f.ctx(), artifactPresentation: true, isCancelled: () => true });
    expect(result.ok).toBe(false); expect(result.output?.imageDataUrl).toBeUndefined();
    expect(f.rootCalls).toEqual([]); expect(f.events).toEqual([]);
  });


  test.each(['context', 'browser'] as const)('%s cleanup rejection is terminal and publishes no capture', async (stage) => {
    const rejectClose = async () => { throw new Error('PRIVATE_NATIVE_DETAILS'); };
    const f = fixture({ onContextClose: stage === 'context' ? rejectClose : undefined,
      onBrowserClose: stage === 'browser' ? rejectClose : undefined });
    const result = await f.invoke('screenshot', { url: PAGE_URL, filename: 'cleanup.png' });
    expect(result.ok).toBe(false);
    expect(result.output).toEqual({ status: 'failed', reason: `capture_${stage}_cleanup_failed`, nonRecoverable: true });
    expect(f.observations.closes).toBe(1);
    expect(f.events.filter(e => e?.type === 'screenshot')).toEqual([]);
    expect(listFilesRecursive(f.root)).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_NATIVE_DETAILS');
  });

  test.each(['context', 'browser'] as const)('%s cleanup deadline is terminal and remains bounded', async (stage) => {
    const stallClose = () => new Promise<void>(() => {});
    const f = fixture({ onContextClose: stage === 'context' ? stallClose : undefined,
      onBrowserClose: stage === 'browser' ? stallClose : undefined });
    const pending = f.invoke('screenshot', { url: PAGE_URL, filename: 'timeout.png' });
    await jest.advanceTimersByTimeAsync(5001);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.output).toEqual({ status: 'failed', reason: `capture_${stage}_cleanup_timeout`, nonRecoverable: true });
    expect(f.observations.closes).toBe(1);
    expect(f.events.filter(e => e?.type === 'screenshot')).toEqual([]);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });
  test('client close waiting for the owned server to exit must not deadlock', async () => {
    let release: () => void = () => {};
    const exit = new Promise<void>(resolve => { release = resolve; });
    const f = fixture({ onBrowserClose: () => exit, onServerClose: async () => { release(); } });
    const pending = f.invoke('screenshot', { url: PAGE_URL });
    await jest.advanceTimersByTimeAsync(5001);
    expect((await pending).ok).toBe(true);
    expect(f.observations.serverCloses).toBe(1);
    expect(f.observations.closes).toBe(1);
    expect(f.events.filter(e => e?.type === 'screenshot')).toHaveLength(1);
  });
  test('cleanup evidence distinguishes client timeout and strips native details', async () => {
    const f = fixture({ onBrowserClose: () => new Promise<void>(() => {}) });
    const pending = f.invoke('screenshot', { url: PAGE_URL }, {...f.ctx(),traceId:'owned-trace'});
    await jest.advanceTimersByTimeAsync(5001);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.logs).toContain('Screenshot cleanup browser_client: timeout.');
    const evidence = f.traceCalls.filter(row => row[2]?.event === 'capture_cleanup').map(row => row[2]);
    expect(evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({stage:'context',status:'completed'}),
      expect.objectContaining({stage:'server_grace',status:'completed'}),
      expect.objectContaining({stage:'browser_client',status:'timeout'}),
    ]));
    expect(JSON.stringify(evidence)).not.toContain('12345');
    expect(JSON.stringify(evidence)).not.toContain('ws://');
    expect(f.events.filter(e => e?.type === 'screenshot')).toEqual([]);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });
  test('capture owns a loopback server and proves process exit before saving', async () => {
    const f = fixture();
    const result = await f.invoke('screenshot', { url: PAGE_URL });
    expect(result.ok).toBe(true);
    expect(f.observations.launchOptions).toMatchObject({ host: '127.0.0.1', port: 0, headless: true, timeout: 30000 });
    expect(f.observations.connects).toBe(1);
    expect(f.observations.serverCloses).toBe(1);
    expect(f.observations.serverKills).toBe(0);
  });
  test('owned process is force-closed after graceful server close stalls', async () => {
    const f = fixture({ onServerClose: () => new Promise<void>(() => {}) });
    const pending = f.invoke('screenshot', { url: PAGE_URL });
    await jest.advanceTimersByTimeAsync(5001);
    const result = await pending;
    expect(result.ok).toBe(true);
    expect(f.observations.serverCloses).toBe(1);
    expect(f.observations.serverKills).toBe(1);
    expect(f.events.filter(e => e?.type === 'screenshot')).toHaveLength(1);
  });
  test('successful close calls without observed exit never publish a capture', async () => {
    const f = fixture({ omitExitEvidence: true });
    const result = await f.invoke('screenshot', { url: PAGE_URL });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('capture_browser_cleanup_failed');
    expect(f.observations.serverKills).toBe(1);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });
  test('a replaced process handle is never a force-close target', async () => {
    const f = fixture({ replaceProcessOnCleanup: true });
    const result = await f.invoke('screenshot', { url: PAGE_URL });
    expect(result.ok).toBe(false);
    expect(f.observations.serverKills).toBe(0);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });
  test('force-close failure is terminal and does not leak native error text', async () => {
    const f = fixture({ onServerClose: async () => { throw new Error('PRIVATE_NATIVE_DETAILS'); },
      onServerKill: async () => { throw new Error('PRIVATE_NATIVE_DETAILS'); } });
    const result = await f.invoke('screenshot', { url: PAGE_URL });
    expect(result.ok).toBe(false);
    expect(result.output).toEqual({ status: 'failed', reason: 'capture_browser_cleanup_failed', nonRecoverable: true });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_NATIVE_DETAILS');
    expect(f.observations.serverKills).toBe(1);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });
  test('force-close deadline stays terminal and bounded', async () => {
    const f = fixture({ onServerClose: () => new Promise<void>(() => {}),
      onServerKill: () => new Promise<void>(() => {}) });
    const pending = f.invoke('screenshot', { url: PAGE_URL });
    await jest.advanceTimersByTimeAsync(10001);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.error).toBe('capture_browser_cleanup_timeout');
    expect(f.observations.serverCloses).toBe(1);
    expect(f.observations.serverKills).toBe(1);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });
  test.each(['COM\u00b9.png', 'LPT\u00b2.png', 'COM\u00b3.jpg'])('reserved Windows name %s stays refused before launch', async filename => {
    const f = fixture();
    const result = await f.invoke('screenshot', { url: PAGE_URL, filename });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_filename');
    expect(f.observations.launches).toBe(0);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });
  test('mutating the owned process PID prevents any force-close target', async () => {
    const f = fixture({ mutateProcessPidOnCleanup: true });
    const result = await f.invoke('screenshot', { url: PAGE_URL });
    expect(result.ok).toBe(false);
    expect(f.observations.serverKills).toBe(0);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });
  test('a non-loopback control endpoint is never connected or published', async () => {
    const f = fixture({ serverEndpoint: 'ws://example.com:1234/not-owned' });
    const result = await f.invoke('screenshot', { url: PAGE_URL });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('capture_browser_endpoint_invalid');
    expect(f.observations.connects).toBe(0);
    expect(f.observations.serverCloses).toBe(1);
    expect(f.events.filter(e => e?.type === 'screenshot')).toEqual([]);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });
  test('a stopped capture awaits its late server and disposes it before returning', async () => {
    let release!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    const f = fixture({ onServerLaunch: () => delayed });
    const controller = new AbortController();
    let returned = false;
    const pending = f.invoke('screenshot', { url: PAGE_URL }, { ...f.ctx(), signal: controller.signal })
      .then((result: { ok: boolean }) => { returned = true; return result; });
    await jest.advanceTimersByTimeAsync(0);
    expect(f.observations.launches).toBe(1);
    controller.abort();
    await jest.advanceTimersByTimeAsync(0);
    expect(returned).toBe(false);
    expect(f.observations.connects).toBe(0);
    release();
    await jest.advanceTimersByTimeAsync(0);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(f.observations.serverCloses).toBe(1);
    expect(f.observations.serverKills).toBe(0);
    expect(f.events.filter(e => e?.type === 'screenshot')).toEqual([]);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });
  test('an unresolved stopped launch reaches a finite nonrecoverable cleanup fence', async () => {
    const f = fixture({ onServerLaunch: () => new Promise<void>(() => {}) });
    const controller = new AbortController();
    const pending = f.invoke('screenshot', { url: PAGE_URL }, { ...f.ctx(), signal: controller.signal });
    await jest.advanceTimersByTimeAsync(0);
    controller.abort();
    await jest.advanceTimersByTimeAsync(45001);
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(result.output).toEqual({ status: 'failed', reason: 'capture_browser_cleanup_timeout', nonRecoverable: true });
    expect(f.observations.connects).toBe(0);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });
  test('a failed control connection still disposes only the launched server', async () => {
    const f = fixture({ onConnect: async () => { throw new Error('PRIVATE_CONNECTION_DETAIL'); } });
    const result = await f.invoke('screenshot', { url: PAGE_URL });
    expect(result.ok).toBe(false);
    expect(f.observations.launches).toBe(1);
    expect(f.observations.serverCloses).toBe(1);
    expect(f.observations.serverKills).toBe(0);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CONNECTION_DETAIL');
    expect(listFilesRecursive(f.root)).toEqual([]);
  });
  test('a connection arriving after cancellation cannot create a page or publish pixels', async () => {
    let release!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    const f = fixture({ onConnect: () => delayed });
    const controller = new AbortController();
    const pending = f.invoke('screenshot', { url: PAGE_URL }, { ...f.ctx(), signal: controller.signal });
    await jest.advanceTimersByTimeAsync(0);
    expect(f.observations.connects).toBe(1);
    controller.abort();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(f.observations.serverCloses).toBe(1);
    release();
    await jest.advanceTimersByTimeAsync(0);
    expect(f.observations.closes).toBe(1);
    expect(f.observations.serverCloses).toBe(1);
    expect(f.observations.screenshots).toBe(0);
    expect(f.events.filter(e => e?.type === 'screenshot')).toEqual([]);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });
  test.each(['CON.png', 'PRN.png', 'AUX.png', 'NUL.png', 'COM1.png', 'COM9.png', 'LPT1.png', 'LPT9.png'])
  ('ASCII Windows reserved name %s remains refused before launch', async filename => {
    const f = fixture();
    const result = await f.invoke('screenshot', { url: PAGE_URL, filename });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid_filename');
    expect(f.observations.launches).toBe(0);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });
  test.each(['ws://127.0.0.1:80/private', 'ws://127.0.0.1:1234/'])
  ('invalid private control endpoint %s is refused before connection', async serverEndpoint => {
    const f = fixture({ serverEndpoint });
    const result = await f.invoke('screenshot', { url: PAGE_URL });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('capture_browser_endpoint_invalid');
    expect(f.observations.connects).toBe(0);
    expect(f.observations.serverCloses).toBe(1);
    expect(listFilesRecursive(f.root)).toEqual([]);
  });
});
