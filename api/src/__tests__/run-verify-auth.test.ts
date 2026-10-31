/**
 * Focused /runs/verify boundary: actual Express Router, actual auth middleware,
 * and real JWTs signed with a synthetic secret. No app/server is started.
 * Every other route dependency is inert; provider verification is a sentinel.
 */
export {};

type Scenario = {
  name: string; env?: string; bypass?: string; header?: string;
  subject?: unknown; missingSubject?: boolean; stringPayload?: boolean;
  wrongSecret?: boolean; expired?: boolean; localUserId?: unknown;
  status: number; result?: 'success' | 'false' | 'throw'; expectedSub?: unknown;
};

const scenarios: Scenario[] = [
  { name: 'anonymous production', status: 401 },
  { name: 'anonymous development with bypass disabled', env: 'development', bypass: 'false', status: 401 },
  { name: 'production ignores enabled development bypass', bypass: 'true', status: 401 },
  { name: 'Basic header cannot supply provider authority', header: 'Basic synthetic', status: 401 },
  { name: 'Bearer null without development bypass', header: 'Bearer null', status: 401 },
  { name: 'empty Bearer without development bypass', header: 'Bearer ', status: 401 },
  { name: 'malformed supplied JWT', header: 'Bearer not-a-jwt', status: 401 },
  { name: 'wrongly signed JWT', subject: 'synthetic-user', wrongSecret: true, status: 401 },
  { name: 'expired JWT', subject: 'synthetic-user', expired: true, status: 401 },
  { name: 'invalid JWT cannot downgrade to dev bypass', env: 'development', bypass: 'true', header: 'Bearer not-a-jwt', status: 401 },
  { name: 'wrong signature cannot downgrade to dev bypass', env: 'development', bypass: 'true', subject: 'synthetic-user', wrongSecret: true, status: 401 },
  { name: 'expired JWT cannot downgrade to dev bypass', env: 'development', bypass: 'true', subject: 'synthetic-user', expired: true, status: 401 },
  { name: 'signed missing subject', missingSubject: true, status: 401 },
  { name: 'signed empty subject', subject: '', status: 401 },
  { name: 'signed whitespace subject', subject: ' \t\n ', status: 401 },
  { name: 'signed numeric subject', subject: 7, status: 401 },
  { name: 'signed object subject', subject: { id: 'synthetic-user' }, status: 401 },
  { name: 'signed array subject', subject: ['synthetic-user'], status: 401 },
  { name: 'signed null subject', subject: null, status: 401 },
  { name: 'signed plain-string payload', stringPayload: true, status: 401 },
  { name: 'valid owner JWT preserves selected verification', subject: 'synthetic-user', status: 200, expectedSub: 'synthetic-user' },
  { name: 'valid whitespace-padded nonblank subject remains accepted', subject: ' synthetic-user ', status: 200, expectedSub: ' synthetic-user ' },
  { name: 'development absent credential retains documented bypass', env: 'development', bypass: 'true', status: 200, expectedSub: 'synthetic-local-user' },
  { name: 'development Bearer null retains documented absent-credential rule', env: 'development', bypass: 'true', header: 'Bearer null', status: 200, expectedSub: 'synthetic-local-user' },
  { name: 'development empty Bearer retains documented absent-credential rule', env: 'development', bypass: 'true', header: 'Bearer ', status: 200, expectedSub: 'synthetic-local-user' },
  { name: 'valid JWT takes priority over development bypass', env: 'development', bypass: 'true', subject: 'signed-user', status: 200, expectedSub: 'signed-user' },
  { name: 'authenticated provider failure retains existing result', subject: 'synthetic-user', status: 200, result: 'false', expectedSub: 'synthetic-user' },
  { name: 'authenticated provider exception retains existing result', subject: 'synthetic-user', status: 200, result: 'throw', expectedSub: 'synthetic-user' },
];

describe('/runs/verify authentication', () => {
  const originalEnv = process.env;
  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test.each(scenarios)('$name', async scenario => {
    jest.resetModules();
    // isDev is evaluated when actual auth.ts loads, so set this first.
    process.env = {
      NODE_ENV: scenario.env || 'production',
      ENABLE_AUTH_BYPASS: scenario.bypass || 'false',
    };
    const forbiddenEffects: string[] = [];
    const refuse = (name: string) => (..._args: unknown[]) => {
      forbiddenEffects.push(name);
      throw new Error('Unexpected route effect: ' + name);
    };
    const closed = (name: string, fields: Record<string, unknown>): any => new Proxy(fields, {
      get(target, key) {
        if (Object.prototype.hasOwnProperty.call(target, key)) return target[key as string];
        if (key === '__esModule') return false;
        return refuse(name + '.' + String(key))();
      },
      set: (_target, key) => refuse(name + ':set:' + String(key))(),
    });
    const mock = (moduleName: string, fields: Record<string, unknown>) => {
      jest.doMock(moduleName, () => closed(moduleName, fields));
    };
    const mockDefault = (moduleName: string, fields: Record<string, unknown>) => {
      jest.doMock(moduleName, () => ({ __esModule: true, default: closed(moduleName, fields) }));
    };
    mockDefault('fs', {});
    mockDefault('mongoose', { connection: closed('mongoose.connection', { readyState: 0 }) });
    mock('../modules/services/AgentLoopService', { AgentLoopService: refuse('AgentLoopService') });
    mock('../api/routes/files', { loadUploadedFiles: refuse('loadUploadedFiles') });
    mock('../api/chat-store', { persistChatStores: refuse('persistChatStores') });
    for (const [name, exportName] of [
      ['run', 'Run'], ['toolExecution', 'ToolExecution'], ['artifact', 'Artifact'],
      ['session', 'Session'], ['message', 'Message'],
    ]) mock('../shared/models/' + name, { [exportName]: closed(exportName, {}) });
    mock('../modules/services/TraceManager', { traceManager: closed('traceManager', {}) });
    mock('../api/ws', Object.fromEntries(['broadcast', 'getActiveRunSessions', 'registerRunSession',
      'unregisterRunSession', 'sessionOwnerOf', 'runOwnerOf'].map(name => [name, refuse(name)])));
    mock('../shared/run-evidence-store', { getRunEvidence: refuse('getRunEvidence'), getRunEvidenceForSession: refuse('getRunEvidenceForSession') });
    mock('../core/session/attended-run', { registerRun: refuse('registerRun'), releaseHandle: refuse('releaseHandle') });
    mock('../modules/services/WorkspaceService', { workspaceService: closed('workspaceService', {}) });
    mock('../core/resume/continuation-command', Object.fromEntries(['continuationExecutionGoal', 'findInterruptedContinuation',
      'isContinuationCommand'].map(name => [name, refuse(name)])));
    mock('../modules/tools/path-containment', { isWithinRoot: refuse('isWithinRoot') });
    const secret = 'synthetic-run-verify-secret-not-an-account-credential';
    mock('../shared/config', { config: { jwtSecret: secret, localUserId: scenario.localUserId ?? 'synthetic-local-user' } });
    let providerImports = 0;
    const verifyProviderDirect = jest.fn(async (..._args: unknown[]) => {
      if (scenario.result === 'throw') throw new Error('synthetic_provider_failure');
      return scenario.result === 'false' ? { ok: false, detail: 'synthetic_empty' } : { ok: true, detail: 'synthetic_answer' };
    });
    jest.doMock('../core/llm/intelligent-router', () => {
      providerImports++;
      return closed('provider', { verifyProviderDirect });
    });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const jwt = require('jsonwebtoken');
    const express = require('express');
    const actualAuth = require('../api/middleware/auth');
    const actualRouter = require('../api/routes/run').default;
    // Actual Express registration/handlers; no mocked allow/deny auth, listener,
    // supertest, app bootstrap, or synthetic copy of the route implementation.
    const route = actualRouter.stack.find((layer: any) => layer.route?.path === '/verify')?.route;
    expect(typeof express.Router).toBe('function');
    expect(route.methods.post).toBe(true);
    expect(route.stack).toHaveLength(2);
    expect([actualAuth.authenticate, actualAuth.authenticateOptional]).toContain(route.stack[0].handle);
    let header = scenario.header;
    if (scenario.missingSubject || scenario.stringPayload || Object.prototype.hasOwnProperty.call(scenario, 'subject')) {
      const payload = scenario.stringPayload ? 'synthetic-signed-string' : {
        role: 'OWNER', ...(scenario.missingSubject ? {} : { sub: scenario.subject }),
        ...(scenario.expired ? { exp: 1 } : {}),
      };
      header = 'Bearer ' + jwt.sign(payload, scenario.wrongSecret ? 'synthetic-wrong-secret' : secret);
    }
    let bodyReads = 0;
    const selected = { provider: 'gemini', apiKey: 'synthetic-provider-key', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'synthetic-exact-model' };
    const req: any = { headers: header === undefined ? {} : { authorization: header } };
    Object.defineProperty(req, 'body', { get() {
      bodyReads++;
      return { ...selected, auth: { sub: 'forged-body-user' }, userId: 'forged-body-user', workspaceId: 'forged-workspace' };
    } });
    const response: any = { statusCode: 200, payload: undefined,
      status(code: number) { this.statusCode = code; return this; },
      json(value: unknown) { this.payload = value; return this; },
    };
    let middlewareNext = 0;
    await route.stack[0].handle(req, response, () => { middlewareNext++; });
    if (middlewareNext) await route.stack[1].handle(req, response, refuse('unexpected-handler-next'));
    const witness = { name: scenario.name, status: response.statusCode, payload: response.payload,
      providerImports, providerCalls: verifyProviderDirect.mock.calls.length, bodyReads,
      selectedProvider: verifyProviderDirect.mock.calls[0]?.[0],
      selectedModel: (verifyProviderDirect.mock.calls[0]?.[1] as any)?.model,
      argumentCount: verifyProviderDirect.mock.calls[0]?.length,
      middlewareNext, forbiddenEffects };
    console.info('RUN_VERIFY_AUTH_WITNESS ' + JSON.stringify(witness));
    expect(forbiddenEffects).toEqual([]);
    expect(response.statusCode).toBe(scenario.status);
    if (scenario.status === 401) {
      expect(['Unauthorized', 'Invalid token']).toContain(response.payload?.error);
      expect(providerImports).toBe(0);
      expect(verifyProviderDirect).not.toHaveBeenCalled();
      expect(bodyReads).toBe(0);
    } else {
      expect(req.auth.sub).toBe(scenario.expectedSub);
      expect(providerImports).toBe(1);
      expect(verifyProviderDirect).toHaveBeenCalledTimes(1);
      expect(verifyProviderDirect).toHaveBeenCalledWith(selected.provider, {
        apiKey: selected.apiKey, baseUrl: selected.baseUrl, model: selected.model,
      });
      expect(verifyProviderDirect.mock.calls[0]).toHaveLength(2);
      expect(bodyReads).toBe(1);
      expect(response.payload).toEqual(scenario.result === 'false'
        ? { ok: false, error: 'synthetic_empty', provider: selected.provider }
        : scenario.result === 'throw'
          ? { ok: false, error: 'synthetic_provider_failure', provider: selected.provider }
          : { ok: true, provider: selected.provider, detail: 'synthetic_answer' });
    }
  });
});
