'use strict';

// Full current answer/router/local-provider modules, with only inert transports.
// The VM is a controlled fixture, not a hostile-code sandbox. No ambient env or network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '../..');
const SOURCE_MODULES = Object.freeze([
  'modules/tools/definitions/CentralAnswerTool.ts',
  'core/llm/intelligent-router.ts',
  'core/llm/explicit-local-selection.ts',
  'core/llm/local-verification-budget.ts',
  'core/llm/selected-local-answer-budget.ts',
  'core/llm/concise-answer-prompt.ts',
  'core/llm/requested-answer-language.ts',
  'core/llm/providers/local.ts',
  'core/llm/local-brain.ts',
  'core/llm/provider-continuity.ts',
  'shared/utils/json.ts',
  'shared/reply-language.ts',
  'shared/utils/language.ts',
]);
const sourceReads = [];
const compiled = new Map();
const toolOverlay = path.basename(process.argv[1] || '') === 'verify-local-answer-routing.cjs' ? process.argv[2] : undefined;
for (const relative of SOURCE_MODULES) {
  const filename = relative === 'modules/tools/definitions/CentralAnswerTool.ts' && toolOverlay
    ? path.resolve(toolOverlay) : path.join(ROOT, relative);
  const bytes = fs.readFileSync(filename);
  const observed = crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
  sourceReads.push({ relative, sha256: observed, bytes: bytes.length });
  const emitted = ts.transpileModule(bytes.toString('utf8'), {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const errors = (emitted.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(`Syntax/transpile diagnostics: ${relative}`);
  compiled.set(relative, emitted.outputText);
}

function newFixture(envOverrides = {}, sdkBehavior, installedModels = ['qwen3.5:4b', 'qwen2.5-coder:7b']) {
  const timers = new Map(); let timerId=1;
  const observations = { metadata: [], sdk: [], constructors: [], routeContexts: [], routeAnalyses: [], adapterCalls: [], violations: [], logs: [] };
  const deny = (name) => (..._args) => {
    observations.violations.push(name);
    throw new Error(`Closed fixture denied: ${name}`);
  };
  const env = {
    NODE_ENV: 'test', AI_COST_POLICY: 'free_only', AI_FREE_PROVIDERS: '',
    LOCAL_LLM_BASE_URL: 'http://127.0.0.1:11434/v1', LOCAL_LLM_MODEL: 'qwen3.5:4b',
    LOCAL_LLM_TIMEOUT: '180000', OFFLINE_MODE: 'true', OFFLINE_LOCAL_TIMEOUT_MS: '45000',
    LLM_CACHE_DISABLE: '1', LLM7_DISABLE: '1', LLM_RATELIMIT_PATIENCE_MS: '0',
    ...envOverrides,
  };
  // This object contains synthetic, explicitly selected names only; no ambient environment is copied.
  const processFixture = Object.freeze({ env, cwd: () => ROOT, platform: 'win32', nextTick: deny('process.nextTick') });
  class SDK {
    constructor(options) {
      observations.constructors.push({ ...options });
      this.chat = { completions: { create: (body, requestOptions) => {
        const event = { body, requestOptions, index: observations.sdk.length };
        observations.sdk.push(event);
        return sdkBehavior ? sdkBehavior(event, observations) : Promise.resolve({ choices: [{ message: { content: '731' } }] });
      } } };
    }
  }
  const unconfigured = name => ({
    isAvailable: () => false,
    isConfigured: () => false,
    chatComplete: (...args) => { observations.adapterCalls.push({ name, args }); return deny(`adapter:${name}`)(); },
  });
  const classes = {
    OpenAIProvider: class { constructor() { deny('OpenAIProvider constructor')(); } },
    GeminiProvider: class { constructor() { deny('GeminiProvider constructor')(); } },
    OpenRouterProvider: class { constructor() { deny('OpenRouterProvider constructor')(); } },
  };
  const moduleCache = new Map();
  let registry;
  const quietConsole = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(level => [level,
    (...args) => observations.logs.push({ level, args: args.map(value => typeof value === 'string' ? value : '[non-string]') }),
  ]));
  const cryptoFixture = {
    createHash: crypto.createHash.bind(crypto), createHmac: crypto.createHmac.bind(crypto),
    randomBytes: length => {
      if (length !== 32) return deny('unexpected randomBytes request')();
      return Buffer.alloc(32, 0x3a);
    },
  };
  const sandbox = {
    console: quietConsole, process: processFixture, Buffer, URL, URLSearchParams,
    AbortController, AbortSignal, TextEncoder, TextDecoder, Date,
    setTimeout: (cb,ms) => {const id=timerId++;timers.set(id,{cb,ms});return id;}, clearTimeout: id => timers.delete(id),
    setInterval: deny('setInterval'), clearInterval: deny('clearInterval'),
    fetch: async (url,options) => {
      if (url !== 'http://127.0.0.1:11434/api/tags' || options?.method && options.method !== 'GET') return deny('fetch')();
      observations.metadata.push({url,method:'GET'});
      return {ok:true,json:async()=>({models:installedModels.map(name=>({name}))})};
    }, WebSocket: deny('WebSocket'),
  };
  sandbox.global = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  function load(relative) {
    if (moduleCache.has(relative)) return moduleCache.get(relative).exports;
    if (!compiled.has(relative)) return deny(`undeclared module:${relative}`)();
    const moduleRecord = { exports: {} };
    moduleCache.set(relative, moduleRecord);
    const requireClosed = request => {
      if (request === 'openai') return { __esModule: true, default: SDK };
      if (request === 'crypto') return cryptoFixture;
      if (!request.startsWith('.')) return deny(`require:${request}`)();
      let target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), request));
      if (!target.endsWith('.ts')) target += '.ts';
      if (target === 'core/llm/providers/registry.ts') {
        if (!registry) {
          registry = Object.fromEntries([
            'pollinationsProvider', 'openRouterProvider', 'groqProvider', 'geminiProvider', 'deepSeekProvider',
            'openAIProvider', 'cerebrasProvider', 'mistralProvider', 'huggingfaceProvider', 'llm7Provider', 'duckAIProvider',
          ].map(name => [name, unconfigured(name)]));
          registry.localProvider = new (load('core/llm/providers/local.ts').LocalProvider)();
        }
        return registry;
      }
      if (target === 'modules/tools/definitions/LLMCacheTool.ts') return {
        LLMCacheTool: { checkCache: deny('cache check'), saveToCache: deny('cache save') },
      };
      if (target === 'core/llm/providers/openai.ts') return { OpenAIProvider: classes.OpenAIProvider };
      if (target === 'core/llm/providers/gemini.ts') return { GeminiProvider: classes.GeminiProvider };
      if (target === 'core/llm/providers/openrouter.ts') return { OpenRouterProvider: classes.OpenRouterProvider };
      const exports = load(target);
      // Observe the real CentralAnswer→real router boundary without changing any argument or result.
      if (relative === 'modules/tools/definitions/CentralAnswerTool.ts' && target === 'core/llm/intelligent-router.ts') {
        return { ...exports, routeToModel: (...args) => {
          observations.routeContexts.push(args[7]);
          observations.routeAnalyses.push(args[1]);
          return exports.routeToModel(...args);
        } };
      }
      return exports;
    };
    const filename = path.join(ROOT, relative);
    const wrapped = new vm.Script(`(function(exports,require,module,__filename,__dirname){\n${compiled.get(relative)}\n})`, { filename });
    wrapped.runInContext(context, { timeout: 2000 })(moduleRecord.exports, requireClosed, moduleRecord, filename, path.dirname(filename));
    return moduleRecord.exports;
  }
  const Tool = load('modules/tools/definitions/CentralAnswerTool.ts').CentralAnswerTool;
  const router = load('core/llm/intelligent-router.ts');
  return { tool: new Tool(), router, localProvider: new (load('core/llm/providers/local.ts').LocalProvider)(), localBrain: load("core/llm/local-brain.ts"), localReasoningOptions: load('core/llm/providers/local.ts').localReasoningOptions, observations, env, sourceReads, timers };
}

module.exports = { newFixture, sourceReads };

