import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { broadcast, LiveEvent, registerRunOwner, registerSessionOwner } from '../ws';
import { executeTool } from '../services/ToolService';
import { ToolExecution } from '../models/toolExecution';
import { Artifact } from '../models/artifact';
import { Approval } from '../models/approval';
import { Run } from '../models/run';
import { planNextStep, generateSessionTitle, getSystemPrompt } from '../llm';
import { authenticate, authenticateOptional } from '../middleware/auth';
import { Session } from '../models/session';
import { Message } from '../models/message';
import { FileModel } from '../models/file';
import { MemoryService } from '../services/memory';
import { MemoryItem } from '../models/memoryItem';
import { rewriteInlineLoginCredentialsToSecrets } from '../browser/secrets';
import { stopSession } from '../browser/manager';
import { canAccessBrowserSession } from '../browser/wsHub';
import { freeIntelligenceOptimizer } from '../llm/free-intelligence-optimizer';
import { normalizeUrlForGoto } from '../utils/url';
import { setSessionSecretEncrypted } from '../services/secrets';

const router = Router();

const loopPauseThrottle = new Map<string, number>();
const rateLimitCooldown = new Map<string, number>();
const projectDetectThrottle = new Map<string, number>();
const cancelledRuns = new Map<string, { at: number; reason?: string }>();
const browserRunGuard = new Map<
  string,
  {
    totalCount: number;
    lastAt: number;
    lastSig: string;
    sigCount: number;
  }
>();

const BROWSER_RUN_MAX_PER_SESSION = 6;
const BROWSER_RUN_MIN_INTERVAL_MS = 7000;

const CANCELLED_RUN_TTL_MS = 24 * 60 * 60 * 1000;
const CANCELLED_RUN_MAX_ENTRIES = 5000;

function pruneCancelledRuns() {
  if (cancelledRuns.size <= CANCELLED_RUN_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of cancelledRuns) {
    if (now - v.at > CANCELLED_RUN_TTL_MS) cancelledRuns.delete(k);
  }
  if (cancelledRuns.size <= CANCELLED_RUN_MAX_ENTRIES) return;
  let removed = 0;
  for (const k of cancelledRuns.keys()) {
    cancelledRuns.delete(k);
    removed += 1;
    if (removed >= Math.ceil(CANCELLED_RUN_MAX_ENTRIES / 3)) break;
  }
}

function clampInt(value: any, fallback: number, min: number, max: number) {
  const n = Number.parseInt(String(value ?? ''), 10);
  const v = Number.isFinite(n) ? n : fallback;
  return Math.max(min, Math.min(max, v));
}

function isRunCancelled(runId: string): boolean {
  const rid = String(runId || '').trim();
  if (!rid) return false;
  return cancelledRuns.has(rid);
}

async function executeToolWithRateLimitRetry(
  toolName: string,
  input: any,
  context: { sessionId?: any; workspaceId?: any },
  options?: { runId?: string; maxRetries?: number; maxWaitMs?: number; onWait?: (waitMs: number, retryAfterMs: number) => void },
) {
  const maxRetries = Number.isFinite(options?.maxRetries) ? Math.max(0, Number(options?.maxRetries)) : 1;
  const maxWaitMs = Number.isFinite(options?.maxWaitMs) ? Math.max(500, Number(options?.maxWaitMs)) : 60_000;
  let retries = 0;

  while (true) {
    // [Wakil 5.4] Hard try/catch: NEVER let tool exceptions hang the agent
    let result: any;
    try {
      result = await executeTool(toolName, input, context as any);
    } catch (err: any) {
      console.error(`[Wakil 5.4] Tool "${toolName}" threw exception:`, err?.stack || err);
      return {
        ok: false,
        error: err?.message || 'tool_exception',
        logs: [`Tool threw exception: ${err?.message || 'unknown'}`],
        recoverable: true
      };
    }
    if (String(result?.error || '') !== 'rate_limited') return result;

    const retryAfterMsRaw = Number(result?.output?.retryAfterMs ?? 0);
    const retryAfterMs = Number.isFinite(retryAfterMsRaw) ? Math.max(0, retryAfterMsRaw) : 0;

    if (retries >= maxRetries) return result;
    if (options?.runId && isRunCancelled(options.runId)) return { ok: false, error: 'stopped', logs: Array.isArray(result?.logs) ? result.logs : [] };

    const waitMs = Math.max(500, Math.min(maxWaitMs, retryAfterMs || 1000 * Math.pow(2, retries)));
    if (typeof options?.onWait === 'function') options.onWait(waitMs, retryAfterMs);

    await new Promise<void>(resolve => setTimeout(resolve, waitMs));
    retries += 1;
  }
}

router.get('/', authenticate as any, async (req: Request, res: Response) => {
  const userId = String((req as any).auth?.sub || '').trim();
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const limit = clampInt(req.query.limit, 10, 1, 100);

  const workspaceIdRaw =
    (typeof req.headers['x-workspace-id'] === 'string' && req.headers['x-workspace-id'].trim())
      ? req.headers['x-workspace-id'].trim()
      : (req.query && typeof (req.query as any).workspaceId === 'string' && String((req.query as any).workspaceId).trim())
        ? String((req.query as any).workspaceId).trim()
        : '';
  const sessionsQuery: any = { userId };
  if (workspaceIdRaw && mongoose.Types.ObjectId.isValid(workspaceIdRaw)) {
    sessionsQuery.workspaceId = workspaceIdRaw;
  }

  try {
    const sessions = await Session.find(sessionsQuery)
      .sort({ updatedAt: -1 })
      .limit(500)
      .select({ _id: 1 })
      .lean();
    const sessionIds = (sessions || []).map((s: any) => s._id).filter(Boolean);
    if (sessionIds.length === 0) return res.json([]);

    const runs = await Run.find({ sessionId: { $in: sessionIds } }).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json(runs);
  } catch {
    return res.json([]);
  }
});


router.post('/stop', authenticate as any, async (req: Request, res: Response) => {
  try {
    const runId = String(req.body?.runId || '').trim();
    const browserSessionId = String(req.body?.browserSessionId || '').trim();
    if (!runId) return res.status(400).json({ error: 'runId required' });
    if (!mongoose.Types.ObjectId.isValid(runId)) return res.status(400).json({ error: 'Invalid runId' });

    const userId = String((req as any).auth?.sub || '').trim();
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const run = await Run.findById(runId).select({ sessionId: 1 }).lean();
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const allowed = await Session.findOne({ _id: (run as any).sessionId, userId }).select('_id').lean();
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    cancelledRuns.set(runId, { at: Date.now(), reason: 'user_stop' });
    pruneCancelledRuns();

    if (browserSessionId) {
      try {
        const ok = await canAccessBrowserSession(userId, browserSessionId);
        if (ok) await stopSession(browserSessionId);
      } catch { }
    }

    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: safeErrorMessage(err) || 'stop_failed' });
  }
});

function browserRunGuardKey(sessionId: string, browserSessionId: string, runId: string) {
  const bid = String(browserSessionId || '').trim();
  const rid = String(runId || '').trim();
  const sid = String(sessionId || '').trim();
  if (bid) return `run:${rid}:browser:${bid}`;
  return `run:${rid}:session:${sid}`;
}

function redactSecretsFromString(input: string): string {
  return input
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, 'sk-[REDACTED]')
    .replace(/\bghp_[A-Za-z0-9_]{10,}\b/g, 'ghp_[REDACTED]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{10,}\b/g, 'github_pat_[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{10,}\b/g, 'Bearer [REDACTED]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\bx-worker-key\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, 'x-worker-key:[REDACTED]')
    .replace(/\b(WORKER_API_KEY|BROWSER_WORKER_KEY|JWT_SECRET)\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, '$1=[REDACTED]');
}

function safeErrorMessage(err: any): string {
  const raw = typeof err?.message === 'string' ? err.message : String(err);
  const cleaned = redactSecretsFromString(raw);
  return cleaned
    .replace(/You can find your API key at https:\/\/platform\.openai\.com\/account\/api-keys\.?/gi, '')
    .replace(/https:\/\/platform\.openai\.com\/docs\/guides\/error-codes\/api-errors\.?\/?/gi, 'https://platform.openai.com/docs/guides/error-codes')
    .trim();
}

function hostFromUrlMaybe(raw: any): string | null {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return null;
  try {
    return new URL(s).host;
  } catch {
    return s;
  }
}

function formatProviderConnectHint(errMsg: string, provider: any, model: any, baseUrl: any): string {
  const msg = String(errMsg || '');
  const s = msg.toLowerCase();
  const p = typeof provider === 'string' ? provider : '';
  const m = typeof model === 'string' ? model : '';
  const host = hostFromUrlMaybe(baseUrl);

  const parts: string[] = [];
  if (p) parts.push(`provider=${p}`);
  if (m) parts.push(`model=${m}`);
  if (host) parts.push(`baseUrl=${host}`);

  let hint = '';
  if (s.includes('model') && (s.includes('not found') || s.includes('does not exist') || s.includes('model_not_found'))) {
    hint = 'The selected model may be invalid for this provider or base URL.';
  } else if (s.includes('invalid url') || s.includes('only absolute urls') || s.includes('failed to parse url')) {
    hint = 'Base URL looks invalid. Try a full URL like https://api.openai.com/v1.';
  } else if (s.includes('enotfound') || s.includes('getaddrinfo') || s.includes('dns')) {
    hint = 'DNS/host is unreachable. Verify base URL and network access.';
  } else if (s.includes('timeout') || s.includes('timed out')) {
    hint = 'Provider request timed out. Verify network and try again.';
  } else if (s.includes('certificate') || s.includes('self signed') || s.includes('ssl')) {
    hint = 'TLS/SSL handshake failed. Check proxy/certificates or use a correct HTTPS endpoint.';
  } else if (s.includes('rate limit') || s.includes('429')) {
    hint = 'Rate limited by provider. Wait and retry, or use another key/model.';
  } else if (s.includes('401') || s.includes('unauthorized')) {
    hint = 'Authentication failed. Verify the API key and the provider endpoint.';
  }

  const context = parts.length ? `\nContext: ${parts.join(' | ')}` : '';
  const hintLine = hint ? `\nHint: ${hint}` : '';
  return `${context}${hintLine}`.trim();
}

function errorStatusCode(err: any): number | null {
  const candidates = [
    err?.status,
    err?.statusCode,
    err?.response?.status,
    err?.response?.statusCode,
  ];
  for (const v of candidates) {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    if (Number.isFinite(n) && n >= 100 && n <= 599) return n;
  }
  return null;
}

function normalizeFileIds(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === 'string') {
      const s = v.trim();
      if (s) out.push(s);
    } else if (typeof v === 'object' && v !== null) {
      const id = String((v as any).id || (v as any)._id || '').trim();
      if (id) out.push(id);
    }
  }
  return out;
}

function looksLikeObjectId(raw: string): boolean {
  const s = String(raw || '').trim();
  if (!s) return false;
  return /^[a-f0-9]{24}$/i.test(s);
}

function splitFileIdCandidates(fileIds: string[]) {
  const objectIds: string[] = [];
  const filenames: string[] = [];
  for (const id of fileIds) {
    if (looksLikeObjectId(id)) objectIds.push(id);
    else filenames.push(id);
  }
  return { objectIds, filenames };
}

function isProviderAuthError(err: any, errMsg?: string): boolean {
  const status = errorStatusCode(err);
  if (status === 401 || status === 403) return true;
  const s = String(errMsg ?? safeErrorMessage(err) ?? '').toLowerCase();
  return (
    s.includes('invalid_api_key') ||
    s.includes('invalid api key') ||
    s.includes('incorrect api key') ||
    (s.includes('api key') && (s.includes('unauthorized') || s.includes('forbidden') || s.includes('401') || s.includes('403'))) ||
    (s.includes('authentication') && s.includes('fail')) ||
    s.includes('unauthorized')
  );
}

function isProviderConfigError(err: any, errMsg?: string): boolean {
  const status = errorStatusCode(err);
  const s = String(errMsg ?? safeErrorMessage(err) ?? '').toLowerCase();
  return (
    status === 400 ||
    status === 404 ||
    s.includes('model not found') ||
    s.includes('deployment not found') ||
    s.includes('bad request')
  );
}

function isProviderRateLimitError(err: any, errMsg?: string): boolean {
  const status = errorStatusCode(err);
  if (status === 429) return true;
  const s = String(errMsg ?? safeErrorMessage(err) ?? '').toLowerCase();
  return s.includes('rate limit') || s.includes('too many requests') || s.includes('429');
}

function isProviderTimeoutError(err: any, errMsg?: string): boolean {
  const s = String(errMsg ?? safeErrorMessage(err) ?? '').toLowerCase();
  const status = errorStatusCode(err);
  return status === 408 || s.includes('timeout') || s.includes('timed out') || s.includes('etimedout');
}

function isGitAuthError(raw: string) {
  const s = String(raw || '');
  return (
    /could not read Username/i.test(s) ||
    /could not read Password/i.test(s) ||
    /Authentication failed/i.test(s) ||
    /Support for password authentication was removed/i.test(s) ||
    /Permission denied \(publickey\)/i.test(s) ||
    /fatal:.*could not read/i.test(s)
  );
}

function isGithubAuthError(raw: string) {
  const s = String(raw || '');
  return (
    /Missing GitHub token/i.test(s) ||
    /Bad credentials/i.test(s) ||
    /Requires authentication/i.test(s) ||
    /\b401\b/.test(s) ||
    /\b403\b/.test(s)
  );
}

function isStripeAuthError(raw: string) {
  const s = String(raw || '');
  return (
    /Missing Stripe API key/i.test(s) ||
    /Stripe API 401/i.test(s) ||
    /invalid api key/i.test(s) ||
    /\b401\b/.test(s)
  );
}

function isArabicText(raw: string): boolean {
  return /[\u0600-\u06FF]/.test(String(raw || ''));
}

function normalizeToWords(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  return s
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGreetingOnly(raw: string): boolean {
  const s = normalizeToWords(raw);
  if (!s) return false;
  if (s.length > 80) return false;
  const lower = s.toLowerCase();
  const re =
    /^(?:(?:hi|hello|hey|yo|sup)(?:\s+(?:joe|jo|ai))?|good\s+(?:morning|evening)|how\s+are\s+you|مرحبا|اهلا|أهلا|هلا|اهلين|هلاو|السلام\s+عليكم|صباح\s+الخير|مساء\s+الخير|كيف\s+حال(?:ك|كم|ج)|شلون(?:ك|كم|ج)|اهلي?ن)(?:\s+(?:joe|jo|ai|جو|جوي))?$/i;
  return re.test(lower);
}

function greetingReply(raw: string): string {
  if (isArabicText(raw)) return "مرحباً بك. محرك التفكير العصبي (Wakil 6.2) جاهز لأهدافك الهندسية. كيف يمكنني دعمك؟";
  return "Neural Reasoning Engine (Wakil 6.2) online. How can I assist with your engineering objectives?";
}

function extractRequestedRepoName(raw: string): string | null {
  const s = String(raw || '');
  const m1 = s.match(/(?:سميه|اسم(?:ه|ها)?|سَمِّه)\s+([A-Za-z0-9._-]{1,100})/i);
  if (m1 && m1[1]) return m1[1].trim();
  const m2 = s.match(/(?:named|name it|call it)\s+([A-Za-z0-9._-]{1,100})/i);
  if (m2 && m2[1]) return m2[1].trim();
  const m3 = s.match(/\brepo(?:sitory)?\b.*?\b([A-Za-z0-9._-]{1,100})\b/i);
  if (m3 && m3[1]) return m3[1].trim();
  return null;
}

function isEcommerceRequest(raw: string): boolean {
  const s = String(raw || '');
  const hasEn = /(e[-\s]?commerce|online\s+store|web\s+shop|marketplace|ali\s*express|build\s+(a\s+)?store)/i.test(s);
  const t = normalizeArabicQuery(s);
  const hasAr =
    /(متجر|سوق|متجر\s+الكتروني|متجر\s+إلكتروني|موقع\s+متجر|علي\s*اكسبريس|علي\s*إكسبريس|اكسبرس|ابن|ابني|بناء)/.test(t);
  return hasEn || hasAr;
}

function extractTargetProjectRoot(raw: string): string {
  const s = String(raw || '');
  const m1 = s.match(/\b(vivos)\b/i);
  if (m1 && m1[1]) return m1[1].trim();
  const m2 = s.match(/(?:سميه|اسم(?:ه|ها)?|سَمِّه|named|name it|call it)\s+([A-Za-z0-9._-]{1,100})/i);
  if (m2 && m2[1]) return m2[1].trim();
  return 'ecommerce-store';
}

type WorkflowKind = 'ecommerce' | 'static_site' | 'node_api' | 'fullstack' | 'tool_shell' | 'simple_creative';









function extractRootFromText(raw: string, fallback: string): string {
  const s = String(raw || '');
  const mV = s.match(/\b(vivos)\b/i);
  if (mV && mV[1]) return mV[1].trim();

  const mNamed = s.match(/(?:سميه|اسم(?:ه|ها)?|سَمِّه|named|name it|call it)(?:\s+(?:the|a|an))?(?:\s+(?:project|app|api|site))?\s+(?:['"]?)([A-Za-z0-9._-]{1,100})(?:['"]?)/i);
  if (mNamed && mNamed[1]) return mNamed[1].trim();

  const mIn = s.match(/(?:in|into|inside|within|داخل)(?:\s+(?:the|a|an))?(?:\s+(?:folder|directory|dir|مجلد))?\s+(?:['"]?)([A-Za-z0-9._-]{1,100})(?:['"]?)/i);
  if (mIn && mIn[1]) return mIn[1].trim();

  const mFi = s.match(/(?:في)\s+([A-Za-z0-9._-]{1,100})/i);
  if (mFi && mFi[1]) return mFi[1].trim();
  return fallback;
}

function extractToolSpec(raw: string): { name: string; command: string } | null {
  const s = String(raw || '').trim();
  const mEn = s.match(/create\s+tool\s+([A-Za-z][A-Za-z0-9_-]{1,50})[\s\S]*?(?:runs?|command)\s*[:：]?\s*([^\n]+)$/i);
  if (mEn && mEn[1] && mEn[2]) return { name: mEn[1].trim(), command: mEn[2].trim() };
  const mAr =
    s.match(/(?:انشئ|أنشئ|سوي|سوِّ|قم\s+ب(?:إنشاء|انشاء))\s+(?:اداة|أداة)\s*(?:باسم|اسمها|اسم)\s*([A-Za-z][A-Za-z0-9_-]{1,50})[\s\S]*?(?:ت(?:نفذ|شغل)|تشغل)\s*[:：]?\s*([^\n]+)$/i);
  if (mAr && mAr[1] && mAr[2]) return { name: mAr[1].trim(), command: mAr[2].trim() };
  return null;
}

function isUnsafeShellCommand(cmd: string): boolean {
  const s = String(cmd || '');
  return /(rm\s+-rf|drop\s+table|shutdown|kill\s+process|\bsudo\b)/i.test(s);
}

function detectWorkflow(raw: string): { kind: WorkflowKind; root: string; tool?: { name: string; command: string } } | null {
  const s = String(raw || '');
  if (!s.trim()) return null;
  if (isEcommerceRequest(s)) return { kind: 'ecommerce', root: extractTargetProjectRoot(s) };

  const tool = extractToolSpec(s);
  if (tool) return { kind: 'tool_shell', root: 'api', tool };

  const t = normalizeArabicQuery(s);
  const isQuestionLike =
    /[?؟]/.test(s) ||
    /^(?:من|ما|ماذا|متي|متى|اين|أين|كيف|هل|لماذا)\b/.test(t) ||
    /^(?:what|when|where|why|how|who|which)\b/i.test(s);
  const hasBuildIntent =
    /\b(?:build|create|make|generate|scaffold|bootstrap|setup|set\s*up|implement|develop)\b/i.test(s) ||
    /(?:ابني|بناء|انشئ|أنشئ|انشاء|إنشاء|طور|تطوير|جهز|اصنع|برمج|برمجة|سوي|سوِّ)/.test(t) ||
    /^(?:اريد|أريد|ابي|ابغى|عايز|عاوز|احتاج|محتاج|ارغب)\b/.test(t);
  const wantsWebsite = /(website|site|landing|webpage|page)/i.test(s) || /(موقع|صفحه|صفحة|واجهه|واجهة)/.test(t);
  const wantsApi = /(api|backend|server)/i.test(s) || /(باك|خلفي|خلفيه|خلفية|سيرفر|خادم|واجهه\s+برمجه|واجهة\s+برمجه)/.test(t);
  const wantsApp = /(app|application|system)/i.test(s) || /(تطبيق|نظام|منصه|منصة)/.test(t);
  if (!wantsWebsite && !wantsApi && !wantsApp) return null;
  if (isQuestionLike && !hasBuildIntent) return null;

  const kind: WorkflowKind =
    wantsWebsite && wantsApi ? 'fullstack' : wantsApi ? 'node_api' : wantsWebsite ? 'static_site' : 'fullstack';
  const root =
    kind === 'static_site'
      ? extractRootFromText(s, 'website')
      : kind === 'node_api'
        ? extractRootFromText(s, 'api-service')
        : extractRootFromText(s, 'app');
  return { kind, root };
}

/**
 * Advanced workflow detection using RequestAnalyzer for complex requests
 * Falls back to simple keyword-based detection for basic requests
 */
async function detectWorkflowAdvanced(
  raw: string,
  options?: { useAnalyzer?: boolean; workspaceId?: string }
): Promise<{ kind: WorkflowKind; root: string; tool?: { name: string; command: string }; analysis?: any } | null> {
  const s = String(raw || '');
  if (!s.trim()) return null;

  // Quick checks first (no LLM needed)
  if (isEcommerceRequest(s)) return { kind: 'ecommerce', root: extractTargetProjectRoot(s) };

  const tool = extractToolSpec(s);
  if (tool) return { kind: 'tool_shell', root: 'api', tool };

  // Determine if request is complex enough to warrant LLM analysis
  const isComplexRequest = (text: string): boolean => {
    const wordCount = text.split(/\s+/).length;
    const hasMultipleFeatures = (text.match(/\b(module|feature|system|component|auth|database|integration|deployment|api|dashboard|v2|migration)\b/gi) || []).length >= 3;
    const mentionsDeepTech = (text.match(/\b(backend|frontend|microservice|architecture|workflow|loop|automated|pipeline|scaffold)\b/gi) || []).length >= 2;

    // Complex means it has detailed technical requirements OR many features
    return (wordCount > 60 && hasMultipleFeatures) || mentionsDeepTech;
  };

  const isSimpleCreativeRequest = (text: string): boolean => {
    const t = normalizeArabicQuery(text).toLowerCase();
    const hasCreativeKeywords = /\b(landing|page|website|css|html|design|portfolio|gallery|coming\s*soon)\b/i.test(text) ||
      /(صفحه|صفحة|هبوط|موقع|تصميم|واجهه|واجهة|ابداعي|إبداعي|بسيط)/.test(t);
    const wordCount = text.split(/\s+/).length;
    const isShort = wordCount < 30;

    // A creative request is simple if it's short and mentions creative elements without technical complexity
    return hasCreativeKeywords && isShort && !isComplexRequest(text);
  };

  // [Task-Type Classifier] IF simple creative request AND NOT complex, use simple_creative workflow
  if (isSimpleCreativeRequest(s)) {
    console.log('[detectWorkflowAdvanced] Simple creative request detected - using simple_creative workflow');
    return { kind: 'simple_creative', root: '.' };
  }

  // Use RequestAnalyzer for complex requests
  if (options?.useAnalyzer !== false && isComplexRequest(s)) {
    try {
      const { executeTool } = await import('../services/ToolService');
      const result = await executeTool('request_analyzer', { userRequest: s }, { workspaceId: options?.workspaceId });

      if (result.ok && result.output) {
        const analysis = result.output;

        // Map analysis to workflow kind
        const kindMapping: Record<string, WorkflowKind> = {
          'fullstack': 'fullstack',
          'api': 'node_api',
          'website': 'static_site',
          'dashboard': 'fullstack',
          'cms': 'fullstack',
          'ecommerce': 'ecommerce',
          'mobile': 'fullstack', // For now, treat as fullstack
          'other': 'fullstack'
        };

        const kind = kindMapping[analysis.projectType] || 'fullstack';
        const root = extractRootFromText(s, analysis.projectType === 'api' ? 'api-service' : 'app');

        return {
          kind,
          root,
          analysis // Include full analysis for later use
        };
      }
    } catch (error) {
      console.warn('[detectWorkflowAdvanced] RequestAnalyzer failed, falling back to simple detection:', error);
      // Fall through to simple detection
    }
  }

  // Fallback to simple keyword-based detection
  const t = normalizeArabicQuery(s);
  const isQuestionLike =
    /[?؟]/.test(s) ||
    /^(?:من|ما|ماذا|متي|متى|اين|أين|كيف|هل|لماذا)\b/.test(t) ||
    /^(?:what|when|where|why|how|who|which)\b/i.test(s);
  const hasBuildIntent =
    /\b(?:build|create|make|generate|scaffold|bootstrap|setup|set\s*up|implement|develop)\b/i.test(s) ||
    /(?:ابني|بناء|انشئ|أنشئ|انشاء|إنشاء|طور|تطوير|جهز|اصنع|برمج|برمجة|سوي|سوِّ)/.test(t) ||
    /^(?:اريد|أريد|ابي|ابغى|عايز|عاوز|احتاج|محتاج|ارغب)\b/.test(t);

  // Refined building intent: must mention structural web/api/app words
  const wantsWebsite = /(website|site|webpage)/i.test(s) || /(موقع|واجهه|واجهة)/.test(t);
  const wantsApi = /(api|backend|server)/i.test(s) || /(باك|خلفي|خلفيه|خلفية|سيرفر|خادم|واجهه\s+برمجه|واجهة\s+برمجه)/.test(t);
  const wantsApp = /(app|application|system)/i.test(s) || /(تطبيق|نظام|منصه|منصة)/.test(t);

  // If it's just "page" or "landing" without more intent, skip pipeline
  if (!wantsWebsite && !wantsApi && !wantsApp) return null;
  if (isQuestionLike && !hasBuildIntent) return null;

  const kind: WorkflowKind =
    wantsWebsite && wantsApi ? 'fullstack' : wantsApi ? 'node_api' : wantsWebsite ? 'static_site' : 'fullstack';
  const root =
    kind === 'static_site'
      ? extractRootFromText(s, 'website')
      : kind === 'node_api'
        ? extractRootFromText(s, 'api-service')
        : extractRootFromText(s, 'app');
  return { kind, root };
}

function repoBaseDirForTools(): string {
  return path.basename(process.cwd()) === 'api' ? '..' : '.';
}

function historyHasToolCall(history: Array<{ role: string; content: any }>, toolName: string): boolean {
  const needle = String(toolName || '').trim().toLowerCase();
  if (!needle) return false;
  return history.some(h => {
    const c = (typeof h?.content === 'string' ? h.content : JSON.stringify(h?.content || '')).toLowerCase();
    return (
      c.includes(`tool call: ${needle}`) ||
      c.includes(`execute:${needle}`) ||
      c.includes(`tool '${needle}' executed`) ||
      c.includes(`tool "${needle}" executed`)
    );
  });
}

function historyHasMarker(history: Array<{ role: string; content: any }>, marker: string): boolean {
  const needle = String(marker || '').trim();
  if (!needle) return false;
  return history.some(h => {
    const c = typeof h?.content === 'string' ? h.content : JSON.stringify(h?.content || '');
    return c.includes(needle);
  });
}

function historyAfterMarker(history: Array<{ role: string; content: any }>, marker: string) {
  const needle = String(marker || '').trim();
  if (!needle) return history;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    const c = typeof h?.content === 'string' ? h.content : '';
    if (c === needle) return history.slice(i + 1);
  }
  return history;
}

function redactToolInputForStorage(name: string, input: any) {
  if (!input || typeof input !== 'object') return input;

  if (name === 'scaffold_project' && input.structure) {
    const s = input.structure;
    const keys = Object.keys(s);
    const redactedStructure: Record<string, string> = {};
    for (const k of keys) {
      redactedStructure[k] = '[Content Redacted]';
    }
    return { ...input, structure: redactedStructure, _fileCount: keys.length };
  }

  if (name === 'shell_execute') {
    const cmd = typeof (input as any).command === 'string' ? (input as any).command : '';
    const redactCmd = (s: string) => {
      let out = String(s || '');
      out = out.replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]');
      out = out.replace(/(\btoken\s*=\s*)[^&\s]+/gi, '$1[REDACTED]');
      out = out.replace(/(\bpassword\s*=\s*)[^&\s]+/gi, '$1[REDACTED]');
      out = out.replace(/(\bapi[_-]?key\s*=\s*)[^&\s]+/gi, '$1[REDACTED]');
      out = out.replace(/(\bsecret\s*=\s*)[^&\s]+/gi, '$1[REDACTED]');
      out = out.replace(/(\b--token\s+)[^\s]+/gi, '$1[REDACTED]');
      out = out.replace(/(\b--password\s+)[^\s]+/gi, '$1[REDACTED]');
      out = out.replace(/(ghp_[A-Za-z0-9]{20,})/g, '[REDACTED]');
      out = out.replace(/(github_pat_[A-Za-z0-9_]{20,})/g, '[REDACTED]');
      out = out.replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, 'sk-[REDACTED]');
      out = out.replace(/\bBearer\s+[A-Za-z0-9._-]{10,}\b/g, 'Bearer [REDACTED]');
      return out;
    };
    return { ...(input as any), command: redactCmd(cmd) };
  }

  if (name === 'http_fetch') {
    const url = typeof (input as any).url === 'string' ? String((input as any).url) : '';
    const headersRaw = (input as any).headers;
    if (headersRaw && typeof headersRaw === 'object' && !Array.isArray(headersRaw)) {
      const headers: any = { ...headersRaw };
      for (const k of Object.keys(headers)) {
        if (/^authorization$/i.test(k)) headers[k] = '[REDACTED]';
      }
      return { ...(input as any), url, headers };
    }
    return input;
  }

  if (name === 'browser_run') {
    const sessionId = typeof (input as any).sessionId === 'string' ? (input as any).sessionId : undefined;
    const instructionText = typeof (input as any).instructionText === 'string' ? String((input as any).instructionText) : undefined;
    const actions = Array.isArray((input as any).actions) ? (input as any).actions : [];
    const redactedActions = actions.map((a: any) => {
      const t = String(a?.type || '').toLowerCase();
      if (t === 'type') {
        const text = typeof a?.text === 'string' ? a.text : typeof a?.value === 'string' ? a.value : '';
        return { ...a, text: `[redacted:${String(text || '').length}]`, value: undefined };
      }
      if (t === 'fillform') {
        const fields = Array.isArray(a?.fields) ? a.fields : [];
        const nextFields = fields.map((f: any) => {
          const label = String(f?.label || '').toLowerCase();
          const selector = String(f?.selector || '').toLowerCase();
          const combined = `${label} ${selector}`;
          const v = f?.value == null ? '' : String(f.value);
          const shouldRedact =
            Boolean(a?.sensitive) ||
            Boolean(f?.sensitive) ||
            /(password|card|cvv|iban|ssn|بطاقة|دفع|كلمة المرور|حساسية|حساب)/.test(combined);
          if (!shouldRedact) return f;
          return { ...f, value: `[redacted:${v.length}]` };
        });
        return { ...a, fields: nextFields };
      }
      return a;
    });
    const out: any = { ...(input as any), ...(sessionId ? { sessionId } : {}) };
    if (instructionText) out.instructionText = instructionText;
    if (Array.isArray(actions)) out.actions = redactedActions;
    return out;
  }

  return input;
}

// Connection verification endpoint
router.post('/verify', authenticateOptional as any, async (req: Request, res: Response) => {
  const { provider, apiKey, baseUrl, model } = req.body || {};
  const providerKey = String(provider || '').trim().toLowerCase();

  if (!providerKey || providerKey === 'llm') {
    return res.status(400).json({ error: 'مزود llm المحلي مُعطّل. اختر مزودًا وأدخل API Key.' });
  }

  if (providerKey === 'auto' || providerKey.includes('auto')) {
    return res.json({ status: 'ok', message: 'Connected successfully' });
  }
  const hasBaseUrl = typeof baseUrl === 'string' && baseUrl.trim().length > 0;
  if (providerKey && providerKey !== 'openai' && !providerKey.includes('auto') && !providerKey.includes('hack') && !providerKey.includes('pollinations') && !providerKey.includes('gemini') && !providerKey.includes('google') && !hasBaseUrl) {
    return res.status(400).json({
      error: `Provider "${providerKey}" requires an OpenAI-compatible Base URL (or select OpenAI).`,
    });
  }

  try {
    // Try a simple planning step
    const result = await planNextStep(
      [{ role: 'user', content: 'hello' }],
      {
        provider: providerKey,
        apiKey: apiKey,
        baseUrl: baseUrl,
        model: model,
        throwOnError: true,
        onProgress: (msg: string) => { console.log('Plan Progress:', msg); },
        onThought: (t: string) => { console.log('Plan Thought:', t); }
      }
    );

    if (result) {
      return res.json({ status: 'ok', message: 'Connected successfully', result });
    } else {
      return res.status(500).json({ error: 'No response from provider' });
    }
  } catch (err: any) {
    const msg = safeErrorMessage(err);
    const hint = msg ? formatProviderConnectHint(msg, provider, model, baseUrl) : '';
    const out = msg && hint ? `${msg}\n${hint}` : (msg || hint || 'Connection failed');
    console.error('Verify error:', msg);

    if (isProviderAuthError(err, msg)) return res.status(400).json({ error: out });
    if (isProviderRateLimitError(err, msg)) return res.status(429).json({ error: out });
    if (isProviderTimeoutError(err, msg)) return res.status(408).json({ error: out });
    return res.status(502).json({ error: out });
  }
});

function detectRisk(text: string) {
  const risky = /(rm\s+-rf|delete|drop\s+table|shutdown|kill\s+process)/i;
  if (risky.test(text)) {
    return 'HIGH: instruction matches destructive pattern';
  }
  return null;
}

function normalizeArabicQuery(input: string) {
  return String(input || '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/[ؤئ]/g, 'ي')
    .replace(/[ةه]/g, 'ه')
    .trim();
}

function normalizeForIntent(input: string) {
  let s = String(input || '');
  try {
    s = s.normalize('NFKC');
  } catch { }
  s = s
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه');
  s = s.replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

function isProjectRelatedRequest(raw: string): boolean {
  const s = String(raw || '').trim();
  if (!s) return false;
  if (detectWorkflow(s)) return true;

  const t = normalizeArabicQuery(s);
  const en =
    /(repo|repository|project|workspace|code|bug|error|stack|trace|function|class|file|folder|directory|path|npm|node|tsc|eslint|lint|build|deploy|compile|test|git|branch|commit|merge|pull\s+request|pr|issue)/i.test(
      s,
    );
  const ar =
    /(مستودع|ريبو|مشروع|الكود|كود|برمجه|برمجة|خطا|خطأ|باك|خلفي|فرونت|ملف|مجلد|مسار|نصبه|تنصيب|بناء|اختبار|تصحيح|ديباغ|جت|جيت|كوميت|برنش|دمج)/.test(
      t,
    );
  const explicitTool = /(project_detect|analyze_codebase|grep|file_read|file_edit|ls|npm_install|npm_build)/i.test(s);
  return Boolean(en || ar || explicitTool);
}

function isEmptyProjectDetectOutput(out: any): boolean {
  if (!out || typeof out !== 'object') return true;
  const node = Array.isArray(out.nodeProjects) ? out.nodeProjects : [];
  const py = Array.isArray(out.pythonProjects) ? out.pythonProjects : [];
  const go = Array.isArray(out.goProjects) ? out.goProjects : [];
  return node.length === 0 && py.length === 0 && go.length === 0;
}

function formatWebSearchResultsText(query: string, output: any, isArabic: boolean) {
  const q = String(query || '').trim();
  const results = Array.isArray(output?.results) ? output.results : [];
  const top = results.slice(0, 6).map((r: any) => ({
    title: String(r?.title || '').trim(),
    url: String(r?.url || '').trim(),
    description: String(r?.description || '').replace(/\s+/g, ' ').trim(),
  })).filter((x: any) => x.title && x.url);

  if (!top.length) return isArabic ? 'لم أجد نتائج بحث واضحة.' : 'I couldn’t find clear search results.';

  const lines: string[] = [];
  if (q) lines.push(isArabic ? `نتائج بحث عن: ${q}` : `Search results for: ${q}`);
  for (const r of top) {
    const desc = r.description ? ` — ${r.description.slice(0, 180)}` : '';
    lines.push(`- ${r.title} (${r.url})${desc}`);
  }
  return lines.join('\n');
}

function fallbackPlanWhenPlannerUnavailable(params: {
  userText: string;
  sessionId: string;
  history?: Array<{ role: string; content: any }>;
  preferNonLLM?: boolean;
  stopProjectDetectRepeats?: boolean;
}): any {
  const userText = String(params.userText || '');
  const sessionId = String(params.sessionId || '');
  const history = Array.isArray(params.history) ? params.history : undefined;
  const preferNonLLM = Boolean(params.preferNonLLM);
  const stopProjectDetectRepeats = params.stopProjectDetectRepeats !== false;

  const routingTextRaw = userText; // Use userText directly for routing logic
  const browserKeyword = /(?:browser|internet|متصفح|ويب|إنترنت|نت)\b/i.test(routingTextRaw);
  const githubKeyword = /\b(?:github|github\.com|جيتهاب|جيت\s*هاب)\b/i.test(routingTextRaw);
  const googleKeyword = /\b(?:google|google\.com|جوجل|قوقل)\b/i.test(routingTextRaw);
  const joeKeyword = /\b(?:joe|جو|نظام|سيستم)\b/i.test(routingTextRaw) && /(?:joe|نظام جو|جو)\b/i.test(routingTextRaw);

  const hasSiteKeyword =
    /https?:\/\/\S+/i.test(routingTextRaw) ||
    /\b(?:[a-z0-9][a-z0-9-]*\.(?:com|org|net|io|edu|gov|ly|me|sh|app))\b/i.test(routingTextRaw) ||
    githubKeyword ||
    googleKeyword ||
    joeKeyword ||
    /\b(?:facebook|youtube|twitter|x\.com|linkedin|reddit|amazon|apple|microsoft|openai|chatgpt|claude|gemini|perplexity|فيسبوك|يوتيوب|تويتر|لينكد|ريديت|أمازون|آبل|مايكروسوفت|أوبن\s*إيه\s*آي|تشات\s*جي\s*بي\s*تي|كود|جمناي)\b/i.test(
      routingTextRaw
    );

  const openVerb =
    /\b(?:open|goto|visit|show|preview|start|run|launch|افتح|ادخل|اذهب|زيارة|شغل|ابدأ|روح|زور|اعرض|وريني|ورني)\b/i.test(
      routingTextRaw
    );

  const isSimpleBrowserOpenRequest = openVerb && (hasSiteKeyword || browserKeyword);
  const multiStepKeyword =
    /(\bthen\b|\bafter\b|\bnext\b|and then|, then|; then|ثم|وبعد|بعد( ذلك)?|بعدها|ومن ثم|عدة\s+خطوات|خطوات|خطوة|تابع|نفذ|قم\s+ب|رجاء|من\s+فضلك|سجل\s*دخول|تسجيل\s*الدخول|login|sign\s*in|انقر|اضغط|click|type|اكتب|املأ|fill|submit|إرسال|scroll|مرر|extract|استخرج|لخص|summarize)/i.test(
      userText,
    );
  const extractUrlCandidate = (text: string) => {
    const http = text.match(/https?:\/\/[^\s"'<>`]+/i)?.[0];
    if (http) return http.replace(/[)\]`.,;:!?،؛؟]+$/g, '');
    const m = text.match(
      /(?:^|\s)(?:url\s*[:=]\s*)?((?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/[^\s"'<>]*)?)/i,
    );
    const candidate = (m?.[1] || '').replace(/[)\]`.,;:!?،؛؟]+$/g, '').trim();
    if (!candidate) return '';
    const isLocal =
      /^localhost(?::\d+)?(?:\/|$)/i.test(candidate) ||
      /^127\.0\.0\.1(?::\d+)?(?:\/|$)/.test(candidate) ||
      /^\d+\.\d+\.\d+\.\d+(?::\d+)?(?:\/|$)/.test(candidate);
    return `${isLocal ? 'http' : 'https'}://${candidate.replace(/^\/\//, '')}`;
  };
  const browserSessionIdFromUrl = (url: string) => {
    const base = String(sessionId || 's').replace(/[^a-z0-9_-]/gi, '_').slice(0, 32) || 's';
    let hostKey = 'site';
    try {
      const u = new URL(url);
      hostKey = String(u.hostname || 'site')
        .toLowerCase()
        .replace(/^www\./i, '')
        .replace(/[^a-z0-9_-]/gi, '_')
        .slice(0, 40);
    } catch { }
    return `browser:${base}:${hostKey || 'site'}`;
  };
  const isContinueRequest = (() => {
    const t = userText.trim();
    if (!t) return true;
    return /^(continue|go on|carry on|resume|اكمل|إكمل|كمل|كمّل|تابع|واصل|اكملها|كملها)$/i.test(t);
  })();
  const extractLastBrowserSessionIdFromHistory = (h: any[] | undefined) => {
    if (!h || !Array.isArray(h)) return '';
    for (let i = h.length - 1; i >= 0; i--) {
      const item = h[i];
      const c = typeof item?.content === 'string' ? item.content : JSON.stringify(item?.content || '');
      const m = c.match(/"sessionId"\s*:\s*"([^"]+)"/);
      const sid = String(m?.[1] || '').trim();
      if (sid && /^browser:/.test(sid)) return sid;
    }
    return '';
  };

  if (isLocationLikeQuery(userText)) {
    return { name: 'http_fetch', input: { url: 'https://ipinfo.io/json' } } as any;
  }
  if (isWeatherLikeQuery(userText)) {
    const city = extractWeatherCity(userText);
    const q = isArabicText(userText) ? `كم درجة الحرارة الآن في ${city}؟` : `current temperature in ${city} now`;
    if (preferNonLLM) return { name: 'web_search', input: { query: q } } as any;
    return { name: 'central_answer', input: { question: q } } as any;
  }
  if (isGeneralKnowledgeQuestion(userText)) {
    // Return null to let Auto mode LLM handle the response directly
    return null;
  }

  const wantsSearch =
    /(ابحث|بحث|search|find|lookup)\b/i.test(userText) ||
    /(google|جوجل|duckduck|duck\s*duck)/i.test(userText);
  if (wantsSearch) {
    return { name: 'web_search', input: { query: userText } } as any;
  }

  const wantsFileRead = /(read|اقرأ|قراءة)\s*(file|ملف)\s+/i.test(userText);
  if (wantsFileRead) {
    const m = userText.match(/(read|اقرأ|قراءة)\s*(file|ملف)\s+(.+)/i);
    const filePath = m && m[3] ? String(m[3]).trim() : '';
    if (filePath) return { name: 'file_read', input: { filePath } } as any;
  }
  const wantsLs = /(show|list|عرض|اعرض)\s*(files|الملفات)/i.test(userText) || /^ls$/i.test(userText.trim());
  if (wantsLs) return { name: 'ls', input: { path: '.' } } as any;

  const hasUrl_val = Boolean(extractUrlCandidate(userText));
  const wantsBrowser = Boolean(hasUrl_val || openVerb || browserKeyword);
  if (wantsBrowser) {
    const directUrl = extractUrlCandidate(userText);
    const wantsGithub = /(github|git\s*hub|جيت\s*هاب|جيتهاب|كت\s*هاب|كتهاب|كيت\s*هاب|كيتهاب)/i.test(userText);
    const wantsYoutube = /(youtube|يوتيوب)/i.test(userText);
    const wantsGoogle = /(google|جوجل)/i.test(userText);
    const wantsYahoo = /(yahoo|ياهو)/i.test(userText);
    const wantsLinkedIn = /(linkedin|لينكد\s*ان|لينكدإن)/i.test(userText);
    const wantsFacebook = /(facebook|فيس\s*بوك|الفيس\s*بوك)/i.test(userText);
    const wantsX = /(x\.com|\btwitter\b|تويتر)/i.test(userText);
    const wantsMicrosoft = /(microsoft|مايكروسوفت|مايكروسوت)/i.test(userText);
    const desiredUrl =
      (directUrl || '').trim() ||
      (wantsGithub
        ? 'https://github.com'
        : wantsYoutube
          ? 'https://www.youtube.com'
          : wantsGoogle
            ? 'https://www.google.com'
            : wantsYahoo
              ? 'https://www.yahoo.com'
              : wantsLinkedIn
                ? 'https://www.linkedin.com'
                : wantsFacebook
                  ? 'https://www.facebook.com'
                  : wantsX
                    ? 'https://x.com'
                    : wantsMicrosoft
                      ? 'https://www.microsoft.com'
                      : '');

    if (multiStepKeyword) {
      const sid = browserSessionIdFromUrl(desiredUrl || directUrl || 'https://example.com');
      return { name: 'browser_run', input: { sessionId: sid, instructionText: userText } } as any;
    }
    if (desiredUrl) {
      const sid = browserSessionIdFromUrl(desiredUrl);
      return { name: 'browser_open', input: { url: desiredUrl, sessionId: sid } } as any;
    }
  }

  const wantsProject = isProjectRelatedRequest(userText);
  if (!wantsProject) {
    if (history && isContinueRequest) {
      const sid = extractLastBrowserSessionIdFromHistory(history);
      if (sid) return { name: 'browser_get_state', input: { sessionId: sid } } as any;
    }
    if (preferNonLLM && userText.trim()) {
      return { name: 'web_search', input: { query: userText } } as any;
    }
    return {
      name: 'echo',
      input: {
        text: isArabicText(userText)
          ? '⚠️ التخطيط الذكي غير متاح مؤقتًا.\nأرسل طلبًا محددًا (مثال: ابحث عن… / افتح… / اقرأ ملف…).'
          : '⚠️ Smart planning is temporarily unavailable.\nSend a more explicit request (e.g., search/open/read file).',
      },
    } as any;
  }

  if (history) {
    const hasProjectDetect = historyHasToolCall(history as any, 'project_detect');
    const hasAnalyze = historyHasToolCall(history as any, 'analyze_codebase');
    if (hasProjectDetect && !hasAnalyze) {
      return { name: 'analyze_codebase', input: { path: '.' } } as any;
    }
    const wantsBuild = /\b(build|create|generate|scaffold|construct|make|implement|develop|ابني|بناء|انشئ|أنشئ|انشاء|إنشاء|طور|تطوير|جهز|اصنع|برمج|برمجة|سوي|سوِّ)\b/i.test(userText);
    if (hasProjectDetect && hasAnalyze && !wantsBuild) {
      return {
        name: 'echo',
        input: {
          text: isArabicText(userText)
            ? '⚠️ تم فحص المشروع وتحليله مسبقًا، ولا يمكن اتخاذ خطوة أدوات آمنة بدون تخطيط ذكي.\nاذكر الملف/المجلد المطلوب أو أعد المحاولة بعد دقائق.'
            : '⚠️ Project scan/analysis already ran; no safe next tool step without smart planning.\nSpecify a file/folder or retry in a couple minutes.',
        },
      } as any;
    }
  }

  if (stopProjectDetectRepeats) {
    const key = sessionId;
    const now = Date.now();
    const last = projectDetectThrottle.get(key) || 0;
    if (last && now - last < 120000) {
      return {
        name: 'echo',
        input: {
          text: isArabicText(userText)
            ? '⚠️ تم إيقاف فحص المشروع المتكرر لتجنّب الدوران.\nأعد المحاولة بعد دقائق.'
            : '⚠️ Repeated project scanning was stopped to avoid loops.\nPlease retry in a couple minutes.',
        },
      } as any;
    }
    projectDetectThrottle.set(key, now);
  }

  return { name: 'project_detect', input: { path: '.' } } as any;
}

function isGeneralKnowledgeQuestion(text: string) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  const t = normalizeArabicQuery(raw);
  const hasQuestionMark = /[?؟]/.test(raw);
  const arQ =
    /^(من|ما|ماذا|متي|متى|اين|أين|اين|كيف|هل|لماذا)\b/.test(t) ||
    /(في\s*(اي|أي)\s*عام)\b/.test(t) ||
    /(ما\s*(هو|هي|هي)\b)/.test(t);
  const enQ = /^(what|when|where|why|how|who|which)\b/i.test(raw);
  const requestVerbAr =
    /^(?:اريد|أريد|ابي|ابغى|عايز|عاوز|اعطني|اعطيني|هات|قدم|اكتب(?:لي)?|اكتب\s+لي)\b/.test(t);
  const requestVerbEn = /^(?:write|draft|tell\s+me|give\s+me)\b/i.test(raw);
  const aboutMarker = /\b(?:عن|حول)\b/.test(t) || /\b(?:about|on)\b/i.test(raw);
  const infoRequest = (requestVerbAr || requestVerbEn) && aboutMarker;
  const actionKeyword =
    /(open|start|launch|browse|visit|go to|click|run|execute|افتح|شغل|ابدأ|ادخل|اذهب|انقر|اضغط|نفذ|قم\s+ب)/i.test(
      raw,
    );
  const buildKeyword =
    /\b(?:build|create|make|generate|scaffold|bootstrap|setup|set\s*up|implement|develop)\b/i.test(raw) ||
    /(?:ابني|بناء|انشئ|أنشئ|انشاء|إنشاء|طور|تطوير|جهز|اصنع|برمج|برمجة|سوي|سوِّ)/.test(t);
  const questionLike = Boolean(hasQuestionMark || arQ || enQ || infoRequest);
  if (!questionLike) return false;
  if (actionKeyword) return false;
  if (buildKeyword) return false;
  if (isProjectRelatedRequest(raw)) return false;
  return true;
}

function containsBuilderPlanText(raw: string): boolean {
  const s = normalizeArabicQuery(raw);
  if (!s) return false;
  if (/خطة\s+بناء\s+موقع/.test(s)) return true;
  if (/plan\s+(to\s+)?build\s+(a\s+)?website/.test(s)) return true;
  if (/سأبدأ\s+الان\s+بالتنفيذ/.test(s) || /سأبدأ\s+الان\s+بالتنفيذ/.test(s)) return true;
  if (/سأبدأ\s+الان/.test(s)) return true;
  return false;
}

function isWeatherLikeQuery(text: string) {
  const t = normalizeArabicQuery(text);
  if (!t) return false;
  if (/(weather|temperature|forecast)/i.test(text)) return true;
  if (/(طقس|درجه|درجة|حراره|الحراره|الجو|الجوّ|الاجواء|توقعات|تنبؤات)/.test(t)) return true;
  if (/كم\s+.*(درجه|درجة|حراره|حرارة)/.test(t)) return true;
  return false;
}

function isLocationLikeQuery(text: string) {
  const t = normalizeArabicQuery(text);
  if (!t) return false;
  if (/(geo|coordinates|coordinate|\blat(?:itude)?\b|\blon(?:gitude)?\b)/i.test(text)) return true;
  if (/(احداثيات|إحداثيات|موقعي|موقعي|مكاني|موقعك|مكاني الحالي|موقعي الحالي|خط\s+العرض|خط\s+الطول)/.test(t)) return true;
  if (/ما\s+هي\s+احداثيات/.test(t)) return true;
  return false;
}

function isPaymentRequest(text: string) {
  const s = String(text || '');
  const t = normalizeArabicQuery(s);
  const en = /(pay|payment|checkout|buy|purchase|subscribe|subscription|invoice|charge)/i.test(s);
  const ar =
    /(دفع|سداد|تسديد|شراء|اشتراك|فاتوره|فاتورة|حجز|تحويل|جلسه\s+دفع|جلسة\s+دفع|ادفع|ادفعي|ادفعوا)/.test(t);
  return en || ar;
}

function extractPaymentParams(text: string) {
  const raw = String(text || '');
  const t = normalizeArabicQuery(raw);
  let currency = 'usd';
  if (/\b(eur|euro)\b/i.test(raw) || /يورو/.test(t)) currency = 'eur';
  else if (/\b(sar|saudi\s+riyal)\b/i.test(raw) || /(ريال\s+سعودي|ريال سعودي)/.test(t)) currency = 'sar';
  else if (/\b(aed|dirham)\b/i.test(raw) || /(درهم\s+اماراتي|درهم اماراتي|درهم اماراتي)/.test(t)) currency = 'aed';
  else if (/\b(kwd|kuwaiti\s+dinar)\b/i.test(raw) || /(دينار\s+كويتي|دينار كويتي)/.test(t)) currency = 'kwd';
  else if (/\b(egp|egyptian\s+pound)\b/i.test(raw) || /(جنيه\s+مصري|جنيه مصري)/.test(t)) currency = 'egp';
  else if (/\b(qar|qatar\s+riyal)\b/i.test(raw) || /(ريال\s+قطري|ريال قطري)/.test(t)) currency = 'qar';
  else if (/\b(omr|omani\s+riyal)\b/i.test(raw) || /(ريال\s+عماني|ريال عماني)/.test(t)) currency = 'omr';
  else if (/\b(jod|jordanian\s+dinar)\b/i.test(raw) || /(دينار\s+اردني|دينار اردني|دينار أردني)/.test(t)) currency = 'jod';
  else if (/\b(usd|dollar)\b/i.test(raw) || /دولار/.test(t)) currency = 'usd';
  const m = raw.match(/(\d+(?:[.,]\d{1,2})?)/);
  let amountCents = 4999;
  if (m && m[1]) {
    const n = Number(String(m[1]).replace(',', '.'));
    if (Number.isFinite(n) && n > 0) amountCents = Math.max(1, Math.round(n * 100));
  }
  let productName = 'Subscription';
  if (/premium/i.test(raw) || /بريميوم/.test(t)) productName = 'Premium Plan';
  else if (/pro/i.test(raw)) productName = 'Pro Plan';
  else if (/basic/i.test(raw) || /اساسي/.test(t)) productName = 'Basic Plan';
  else if (/gold/i.test(raw) || /ذهبي/.test(t)) productName = 'Gold Plan';
  else if (/silver/i.test(raw) || /فضي/.test(t)) productName = 'Silver Plan';
  return { amount: amountCents, currency, productName };
}

function extractWeatherCity(text: string) {
  const raw = String(text || '').trim();
  const t = normalizeArabicQuery(raw);
  if (!t) return 'Istanbul';

  if (/(istanbul|اسطنبول|اسطنبول|اسطنبول|إسطنبول)/i.test(raw) || /اسطنبول/.test(t)) return 'Istanbul';

  const m1 = raw.match(/(?:في|ب|بال)\s*([^\s؟?!.,،؛:]+(?:\s+[^\s؟?!.,،؛:]+){0,2})/);
  const candidate = m1 ? String(m1[1] || '').trim() : '';
  if (candidate) return candidate;

  return 'Istanbul';
}

function browserSessionIdFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/[^a-z0-9]/gi, '_');
    return `browser:deterministic:${host}`;
  } catch {
    return `browser:anon:${Date.now()}`;
  }
}

router.post('/start', authenticateOptional as any, async (req: Request, res: Response) => {
  try {
    const offlineMode = process.env.OFFLINE_MODE === 'true';
    let { text, sessionId, attachments, provider, apiKey, baseUrl, model, sessionKind, browserSessionId, clientContext, isGodMode, userSystemInstructions } = req.body || {};
    let runId: string = 'pending'; // [Wakil 6.2] Initialized early for broadcaster
    let fileIds = attachments || (req.body && (req.body as any).fileIds);
    if (!fileIds && Array.isArray(attachments)) {
      fileIds = attachments;
    }
    let assistantTextEmitted = false;
    const isAuthed = Boolean((req as any).auth);
    const userId = (req as any).auth?.sub;
    const dbReady = mongoose.connection.readyState === 1;
    const workspaceId =
      (typeof req.headers['x-workspace-id'] === 'string' && req.headers['x-workspace-id'].trim())
        ? req.headers['x-workspace-id'].trim()
        : (req.body && typeof (req.body as any).workspaceId === 'string' && String((req.body as any).workspaceId).trim())
          ? String((req.body as any).workspaceId).trim()
          : (req.query && typeof (req.query as any).workspaceId === 'string' && String((req.query as any).workspaceId).trim())
            ? String((req.query as any).workspaceId).trim()
            : (clientContext && typeof (clientContext as any).workspaceId === 'string' && String((clientContext as any).workspaceId).trim())
              ? String((clientContext as any).workspaceId).trim()
              : undefined;
    // [WAKIL ENFORCEMENT] Always Agent.
    const kind = 'agent';
    const normalizedFileIds = normalizeFileIds(fileIds);

    // [Wakil 6.2] Setup event broadcaster
    const ev = (e: any) => {
      // Auto-wrap string data for text events (frontend expects { text: string })
      if (e.type === 'text' && typeof e.data === 'string') {
        e.data = { text: e.data };
      }
      return broadcast({ ...e, runId, sessionId: sessionId || 'pending' });
    };

    // Initial signals for UI
    ev({ type: 'run_started', data: { sessionId } });
    ev({ type: 'thought', data: '> Neural link established. Analyzing user instruction...' });

    // [DEBUG] Log incoming request for file debugging
    console.log('[Run/Start] Request received:', {
      hasText: Boolean(text),
      sessionId,
      fileIdsCount: normalizedFileIds.length,
      fileIds,
      provider,
      model
    });

    if (!dbReady && !offlineMode) {
      return res.status(503).json({
        error: 'db_unavailable',
        message: 'Database connection not ready. Set MONGO_URI and start MongoDB.',
        db: mongoose.connection.readyState
      });
    }

    // [MOVED] Free Intelligence Optimizer logic moved to initialPlan calculation phase to avoid response stream corruption

    if (typeof provider === 'string') provider = provider.trim();
    if (typeof apiKey === 'string') apiKey = apiKey.trim();
    if (typeof baseUrl === 'string') baseUrl = baseUrl.trim();
    if (typeof model === 'string') model = model.trim();
    if (apiKey === '') apiKey = undefined;
    if (baseUrl === '') baseUrl = undefined;
    if (model === '') model = undefined;

    const providerKey = String(provider || 'openai').trim().toLowerCase();
    const hasBaseUrl = typeof baseUrl === 'string' && baseUrl.trim().length > 0;
    const hasAnyKey = Boolean((typeof apiKey === 'string' && apiKey.trim()) || (typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.trim()));
    const rawUserTextForKeyBypass = String(text || '');
    const xeliteMacro = (() => {
      const s = rawUserTextForKeyBypass;
      const domain = s.match(/\b(?:https?:\/\/)?(?:www\.)?(xelitesolutions\.(?:co|com))(?:\/[^\s"'<>]*)?\b/i);
      if (!domain) return null;
      const hasStartNow = /\bstart\s+now\b/i.test(s) || /ستارت\s+ناو/i.test(s);
      if (!hasStartNow) return null;
      const rawUrl = String(domain[0] || '').trim();
      const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      let email = '';
      let password = '';
      try {
        const r = rewriteInlineLoginCredentialsToSecrets(s);
        if (r.ok) {
          email = String(r.email || '').trim();
          password = String(r.password || '').trim();
        }
      } catch { }

      if (!email) {
        const emailMatch = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        email = String(emailMatch?.[0] || '').trim().replace(/[)\].,;:!?،؛]+$/g, '');
      }

      return { url, email: email || undefined, password: password || undefined };
    })();

    // 1. Process Attachments
    let attachedText = '';
    const contentParts: any[] = [];

    console.log('[File Processing] fileIds:', normalizedFileIds);
    console.log('[File Processing] mongoose.connection.readyState:', mongoose.connection.readyState);

    if (normalizedFileIds.length > 0) {
      if (dbReady) {
        // Normal path: Read from MongoDB
        try {
          const { objectIds, filenames } = splitFileIdCandidates(normalizedFileIds);
          const or: any[] = [];
          if (objectIds.length > 0) or.push({ _id: { $in: objectIds } });
          if (filenames.length > 0) or.push({ filename: { $in: filenames } });
          const files = or.length > 0 ? await FileModel.find({ $or: or }) : [];

          const byId = new Map<string, any>();
          const byFilename = new Map<string, any>();
          for (const f of files) {
            const id = String((f as any)?._id || '');
            if (id) byId.set(id, f);
            const fn = String((f as any)?.filename || '');
            if (fn && !byFilename.has(fn)) byFilename.set(fn, f);
          }

          for (const ref of normalizedFileIds) {
            const f = byId.get(ref) || byFilename.get(ref);
            if (!f) continue;
            if (f.mimeType && f.mimeType.startsWith('image/')) {
              try {
                if (fs.existsSync(f.path)) {
                  const imageBuffer = fs.readFileSync(f.path);
                  const base64Image = imageBuffer.toString('base64');
                  contentParts.push({
                    type: 'image_url',
                    image_url: {
                      url: `data:${f.mimeType};base64,${base64Image}`
                    }
                  });
                }
              } catch (err) {
                console.error('Failed to read image', err);
              }
            } else if (f.content) {
              attachedText += `\n\n--- [Attached File: ${f.originalName}] ---\n${f.content}\n--- [End of File] ---\n`;
            } else {
              // File exists but content wasn't extracted (e.g. binary or unknown type)
              attachedText += `\n\n[Attached File: ${f.originalName}] (Type: ${f.mimeType})\n(Content not automatically extracted. Refer to this file by name if needed.)\n`;
            }
          }
        } catch (e) {
          console.error('Error loading files from DB', e);
        }
      } else {
        // Fallback: DB unavailable, read from cache file
        console.log('[Fallback] MongoDB unavailable, reading files from cache');
        try {
          const cacheFilePath = path.join(__dirname, '../../.file-cache.json');
          if (fs.existsSync(cacheFilePath)) {
            const cache = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
            console.log('[Fallback] Cache file loaded, available files:', Object.keys(cache).length);

            const filenameIndex = new Map<string, any>();
            for (const v of Object.values(cache || {})) {
              const fn = v && typeof (v as any).filename === 'string' ? String((v as any).filename) : '';
              if (fn && !filenameIndex.has(fn)) filenameIndex.set(fn, v);
            }

            for (const fileId of normalizedFileIds) {
              const fileData = cache[fileId] || filenameIndex.get(fileId);
              if (fileData) {
                console.log('[Fallback] Found file in cache:', fileData.originalName);

                if (fileData.mimeType && fileData.mimeType.startsWith('image/')) {
                  try {
                    if (fs.existsSync(fileData.path)) {
                      const imageBuffer = fs.readFileSync(fileData.path);
                      const base64Image = imageBuffer.toString('base64');
                      contentParts.push({
                        type: 'image_url',
                        image_url: {
                          url: `data:${fileData.mimeType};base64,${base64Image}`
                        }
                      });
                    }
                  } catch (err) {
                    console.error('[Fallback] Failed to read image from cache:', err);
                  }
                } else if (fileData.content) {
                  attachedText += `\n\n--- [Attached File: ${fileData.originalName}] ---\n${fileData.content}\n--- [End of File] ---\n`;
                } else {
                  attachedText += `\n\n[Attached File: ${fileData.originalName}] (Type: ${fileData.mimeType})\n(Content not automatically extracted. Refer to this file by name if needed.)\n`;
                }
              } else {
                console.warn('[Fallback] File not found in cache:', fileId);
              }
            }
          } else {
            console.error('[Fallback] Cache file not found at:', cacheFilePath);
          }
        } catch (err) {
          console.error('[Fallback] Error reading cache:', err);
        }
      }
    }

    let fullPromptText = (String(text || '') + attachedText).trim();
    const ctxLines: string[] = [];
    if (typeof browserSessionId === 'string' && browserSessionId.trim()) {
      ctxLines.push(`browserSessionId=${browserSessionId.trim()}`);
    }
    if (typeof clientContext === 'string' && clientContext.trim()) {
      ctxLines.push(clientContext.trim());
    }
    if (ctxLines.length > 0) {
      fullPromptText += `\n\n[Client Context]:\n${ctxLines.join('\n')}\n`;
    }

    // [DEBUG] Log prompt construction
    console.log('[Run/Setup] Prompt constructed:', {
      textLen: text?.length,
      attachmentsLen: attachedText.length,
      contentPartsCount: contentParts.length,
      fullPromptLen: fullPromptText.length,
      snippet: fullPromptText.slice(0, 100) + '...'
    });

    // Inject Memory
    if (userId) {
      try {
        const [relevant, recentItems, persistentContext] = await Promise.all([
          MemoryService.searchMemories(userId, String(text || '')),
          MemoryItem.find({ userId, scope: 'user' }).sort({ updatedAt: -1 }).limit(20).lean(),
          MemoryService.getPersistentContext(userId, 3), // NEW: Get last 3 conversation summaries
        ]);

        const recent = (recentItems || []).map((item: any) => {
          const v =
            typeof item.value === 'string'
              ? item.value
              : item.value == null
                ? ''
                : JSON.stringify(item.value);
          return `${item.key}: ${v}`;
        }).filter(Boolean);

        const merged: string[] = [];
        const seen = new Set<string>();
        for (const line of [...relevant, ...recent]) {
          const k = String(line || '');
          if (!k || seen.has(k)) continue;
          seen.add(k);
          merged.push(k);
          if (merged.length >= 20) break;
        }

        if (merged.length > 0) {
          console.info(`[Memory] Injecting ${merged.length} memories (relevant+recent)`);
          fullPromptText += `\n\n[System Note: Known facts about this user (Memory)]:\n${merged.join('\n')}\n`;
        }

        // NEW: Inject persistent context (conversation summaries from previous sessions)
        if (persistentContext) {
          console.info(`[Memory] Injecting persistent context from previous sessions`);
          fullPromptText += persistentContext;
        }
      } catch (e) {
        console.error('[Memory] Search failed', e);
      }

      // Fire-and-forget memory extraction
      MemoryService.extractAndSaveMemories(userId, String(text || ''), { provider, apiKey, baseUrl, model, sessionId })
        .catch(err => console.error('[Memory] Extraction failed', err));
    }

    let initialContent: string | any[] = fullPromptText;
    if (contentParts.length > 0) {
      initialContent = [
        { type: 'text', text: fullPromptText },
        ...contentParts
      ];
    }

    if (!sessionId) {

      // [OFFLINE MODE GUARD] Skip session/tenant DB operations
      if (!offlineMode) {
        const { Session } = await import('../models/session');
        const { Tenant } = await import('../models/tenant');
        const tenantName = process.env.DEFAULT_TENANT_NAME || 'XElite Solutions';
        const tenantDoc = await Tenant.findOneAndUpdate(
          { name: tenantName },
          { $setOnInsert: { name: tenantName } },
          { upsert: true, new: true }
        );

        const s = await Session.create({ title: `Session ${new Date().toLocaleString()}`, mode: 'ADVISOR', kind, userId, tenantId: tenantDoc._id, workspaceId });
        sessionId = s._id.toString();
      } else {
        sessionId = `offline-session-${Date.now()}`;
        console.log('[Run/Start] OFFLINE MODE: Using mock sessionId', sessionId);
      }

    } else if (workspaceId) {
      // [FIX] Persist workspaceId on existing sessions that may be missing it
      try {
        const { Session } = await import('../models/session');
        await Session.findByIdAndUpdate(sessionId, { $set: { workspaceId } }, { new: false });
      } catch (e) {
        console.warn('[Run] Failed to update session workspaceId:', e);
      }
    }

    // Update session with new files if any
    if (normalizedFileIds.length > 0) {
      const { objectIds, filenames } = splitFileIdCandidates(normalizedFileIds);
      const or: any[] = [];
      if (objectIds.length > 0) or.push({ _id: { $in: objectIds } });
      if (filenames.length > 0) or.push({ filename: { $in: filenames } });
      if (or.length > 0) {
        await FileModel.updateMany({ $or: or }, { $set: { sessionId } });
      }
    }

    const isAutoTitleCandidate = (title: string) => {
      const t = String(title || '').trim();
      return (
        t === 'New Session' ||
        t === 'Untitled Session' ||
        t === 'New Chat' ||
        t === 'محادثة جديدة' ||
        t === 'جلسة جديدة' ||
        t === 'دردشة جديدة' ||
        t.startsWith('Session ') ||
        t.startsWith('جلسة ')
      );
    };

    // [OFFLINE MODE GUARD] Skip DB persistence when running without MongoDB
    let run: any = null;
    if (offlineMode) {
      runId = `offline-run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      console.log(`[Run/Start] OFFLINE MODE: Using mock runId: ${runId}`);
    } else {
      run = await Run.create({ sessionId, status: 'running', steps: [] });
      runId = run._id.toString();
    }

    // Auto-Title Logic (skip in offline mode)
    if (!offlineMode) {
      (async () => {
        try {
          const session = await Session.findById(sessionId);
          if (session && isAutoTitleCandidate(session.title)) {
            const messageCount = await Message.countDocuments({ sessionId });
            // Only trigger if it's the first or second message
            if (messageCount <= 2) {
              // Get the user message and potential context
              const seed = fullPromptText;
              const messages = [{ role: 'user', content: seed }];
              const newTitle = await generateSessionTitle(messages);
              if (newTitle && newTitle !== 'New Session') {
                await Session.findByIdAndUpdate(sessionId, { title: newTitle });
                broadcast({ type: 'sessions:refresh', data: { sessionId } });
              }
            }
          }
        } catch (e) {
          console.error('Auto-title background task failed', e);
        }
      })();
    }


    try {
      if (userId && runId) {
        registerRunOwner(runId, String(userId));
        registerSessionOwner(String(sessionId), String(userId));
      }
    } catch { }

    try {
      broadcast({ type: 'user_input', runId, data: { sessionId, text: String(text || '') } });
    } catch { }

    try {
      const { setSessionRunConfig, getSessionRunConfig } = await import('../services/secrets');
      const curCfg = getSessionRunConfig(String(sessionId)) || ({} as any);
      setSessionRunConfig(String(sessionId), {
        provider: typeof provider === 'string' ? provider : undefined,
        apiKey: typeof apiKey === 'string' ? apiKey : undefined,
        baseUrl: typeof baseUrl === 'string' ? baseUrl : undefined,
        model: typeof model === 'string' ? model : undefined,
        kind,
        workspaceId,
        browserSessionId:
          typeof browserSessionId === 'string' && browserSessionId.trim()
            ? browserSessionId.trim()
            : typeof curCfg.browserSessionId === 'string' && curCfg.browserSessionId.trim()
              ? curCfg.browserSessionId.trim()
              : undefined,
        autoApproveAll: curCfg.autoApproveAll,
        autoApproveSafe: curCfg.autoApproveSafe,
      });
    } catch { }


    const systemPromptEventId = `system_prompt:${sessionId}`;
    let systemPromptCreated = false;
    let systemPromptText: string | null = null;

    // [Wakil 6.2] Initial broadacster was moved to the top of the handler.
    // The previous definition of ev here is removed to avoid shadowing and unify behavior.

    try {
      // Inject God Mode into instructions for planning
      const plannerInstructions = isGodMode
        ? (text || '') + '\n[GOD MODE ACTIVE: Full Autonomy Enforced]'
        : text;
      const currentSystemPrompt = getSystemPrompt({
        name: (req as any).user?.name,
        systemInstructions: userSystemInstructions || undefined,
      });

      // ENSURE ENHANCED SYSTEM PROMPT IS ALWAYS FIRST
      const systemMessage: any = { role: 'system', content: currentSystemPrompt };

      // Log to verify prompt is being used
      console.log('[Run] System prompt applied:', {
        length: currentSystemPrompt.length,
        hasTaskAwareness: currentSystemPrompt.includes('TASK-AWARE'),
        hasErrorRecovery: currentSystemPrompt.includes('ERROR HANDLING')
      });

      // [OFFLINE MODE GUARD] Skip DB operations for system prompt in offline mode
      if (!offlineMode) {
        const existing = await Message.findOne({ sessionId, role: 'system' }).select({ _id: 1 }).lean();
        if (!existing) {
          await Message.create({ sessionId, role: 'system', content: currentSystemPrompt, runId });
          systemPromptCreated = true;
          systemPromptText = currentSystemPrompt;
        }
      } else {
        console.log('[Run/Start] OFFLINE MODE: Skipping system prompt persistence');
        systemPromptText = currentSystemPrompt;
      }

    } catch (e) {
      console.warn('Failed to create system prompt message:', safeErrorMessage(e));
    }

    // Load Conversation History
    let previousMessages: { role: 'user' | 'assistant' | 'system', content: string }[] = [];
    if (!offlineMode && sessionId) {
      try {
        const docs = await Message.find({ sessionId, runId: { $ne: runId }, role: { $ne: 'system' } })
          .sort({ createdAt: -1 }) // Get newest first
          .limit(50); // Last 50 messages
        // Reverse to chronological order (Old -> New)
        previousMessages = docs.reverse().map(d => ({ role: d.role as any, content: d.content }));
      } catch (err) {
        console.warn('[Run] Failed to load history:', safeErrorMessage(err));
      }
    }

    // Merge consecutive user messages to avoid context fragmentation
    // And limit total history size to prevent slow LLM responses
    const MAX_HISTORY_CHARS = 15000; // Approx 4-5k tokens
    let mergedHistory: typeof previousMessages = [];

    for (const msg of previousMessages) {
      const last = mergedHistory[mergedHistory.length - 1];
      if (last && last.role === 'user' && msg.role === 'user') {
        last.content += `\n\n[Follow-up]: ${msg.content}`;
      } else {
        mergedHistory.push(msg);
      }
    }

    // Truncate history if too long, keeping the most recent messages
    let totalChars = 0;
    const truncatedHistory: typeof mergedHistory = [];
    for (let i = mergedHistory.length - 1; i >= 0; i--) {
      const msg = mergedHistory[i];
      const contentLen = typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length;
      if (totalChars + contentLen > MAX_HISTORY_CHARS) {
        break;
      }
      totalChars += contentLen;
      truncatedHistory.unshift(msg);
    }
    mergedHistory = truncatedHistory;

    const history: { role: 'user' | 'assistant' | 'system', content: string | any[] }[] = [
      ...mergedHistory,
      { role: 'user', content: initialContent }
    ];

    ev({ type: 'step_started', data: { name: 'plan' } });

    let initialPlan = null;
    const rawUserText = fullPromptText;
    try {

      // Force hasAttachments if fileIds are present, even if content extraction failed
      const hasAttachments = Boolean(attachedText.trim()) || contentParts.length > 0 || (Array.isArray(fileIds) && fileIds.length > 0);
      if (xeliteMacro && !hasAttachments && !initialPlan) {
        const sid =
          typeof browserSessionId === 'string' && browserSessionId.trim()
            ? browserSessionId.trim()
            : userId
              ? `browser:${String(userId).trim()}:xelitesolutions`
              : `browser:anon:${Date.now()}`;

        try {
          const email = String(xeliteMacro.email || '').trim();
          const password = String(xeliteMacro.password || '').trim();
          if (email) setSessionSecretEncrypted(sid, 'JOE_LOGIN_EMAIL', email, 60 * 60);
          if (password) setSessionSecretEncrypted(sid, 'JOE_LOGIN_PASSWORD', password, 60 * 60);
        } catch { }

        const canUseUserSecrets = Boolean(String(userId || '').trim());
        const hasInlineCreds = Boolean(String(xeliteMacro.email || '').trim() && String(xeliteMacro.password || '').trim());
        const useSecretTokens = canUseUserSecrets || hasInlineCreds;
        const xeliteEmailText = useSecretTokens ? '{{SECRET:JOE_LOGIN_EMAIL}}' : '';
        const xelitePasswordText = useSecretTokens ? '{{SECRET:JOE_LOGIN_PASSWORD}}' : '';
        const includeLoginActions = Boolean(String(xeliteEmailText || '').trim() && String(xelitePasswordText || '').trim());
        initialPlan = {
          name: 'browser_run',
          input: {
            sessionId: sid,
            actions: [
              { type: 'goto', url: xeliteMacro.url },
              { type: 'wait', ms: 450 },
              { type: 'click', text: 'Start Now', optional: true },
              { type: 'click', text: 'Start now', optional: true },
              { type: 'click', text: 'Get Started', optional: true },
              { type: 'wait', ms: 900, optional: true },
              ...(includeLoginActions
                ? ([
                  { type: 'click', text: 'Sign in', optional: true },
                  { type: 'click', text: 'Log in', optional: true },
                  { type: 'click', text: 'Login', optional: true },
                  { type: 'click', text: 'تسجيل الدخول', optional: true },
                  { type: 'wait', ms: 700, optional: true },
                  {
                    type: 'type',
                    selector:
                      'input[type="email"],input[autocomplete="email"],input[name*="email" i],input[id*="email" i]',
                    text: xeliteEmailText,
                    optional: true,
                  },
                  { type: 'type', role: 'textbox', name: 'Email', text: xeliteEmailText, optional: true },
                  { type: 'type', role: 'textbox', name: 'E-mail', text: xeliteEmailText, optional: true },
                  { type: 'type', role: 'textbox', name: 'البريد الإلكتروني', text: xeliteEmailText, optional: true },
                  {
                    type: 'type',
                    selector:
                      'input[type="password"],input[autocomplete="current-password"],input[name*="pass" i],input[id*="pass" i]',
                    text: xelitePasswordText,
                    optional: true,
                  },
                  { type: 'type', role: 'textbox', name: 'Password', text: xelitePasswordText, optional: true },
                  { type: 'type', role: 'textbox', name: 'كلمة المرور', text: xelitePasswordText, optional: true },
                  { type: 'click', text: 'Sign in', optional: true },
                  { type: 'click', text: 'Login', optional: true },
                  { type: 'click', text: 'تسجيل الدخول', optional: true },
                  { type: 'wait', ms: 800, optional: true },
                ] as any[])
                : []),
            ],
          },
        } as any;
      }

      // [OPTIMIZER] Check cache before other heuristics
      else if (!initialPlan && rawUserText && !hasAttachments && (providerKey === 'auto' || providerKey === 'pollinations' || providerKey === 'hack')) {
        const fast = freeIntelligenceOptimizer.generateSmartResponse(rawUserText, []);
        if (fast) {
          console.log('[Optimizer] Cache HIT - Sending Instant Response (Bypassing Pipeline)');
          const answer = fast;

          // [Wakil 6.2] Simulated thinking for UX consistency
          ev({ type: 'thought', data: '> Rapid pattern match found in local knowledge base.' });
          ev({ type: 'thought', data: '> Retrieving optimized response...' });

          // Small delay to ensure thinking is visible
          await new Promise(r => setTimeout(r, 600));

          ev({ type: 'text', data: { text: answer } });
          ev({ type: 'step_done', data: { name: 'execute:echo', result: { ok: true, output: { text: answer } } } });
          ev({ type: 'run_finished', data: { runId, ok: true } });

          // Update DB/Mock state asynchronously to avoid blocking response

          Run.findByIdAndUpdate(runId, { $set: { status: 'done' } }).catch(console.error);


          return res.json({
            ok: true,
            runId,
            result: { ok: true, output: { text: answer }, logs: ['Optimizer Cache Hit'] }
          });
        }

        const optimization = await freeIntelligenceOptimizer.optimizeRequest(rawUserText, []);
        if (optimization.shouldUseCache && optimization.cachedResponse) {
          console.log('[Optimizer] Cache HIT - Sending Instant Response (Bypassing Pipeline)');
          const answer = optimization.cachedResponse;

          ev({ type: 'text', data: { text: answer } });
          ev({ type: 'step_done', data: { name: 'execute:echo', result: { ok: true, output: { text: answer } } } });
          ev({ type: 'run_finished', data: { runId, ok: true } });


          Run.findByIdAndUpdate(runId, { $set: { status: 'done' } }).catch(console.error);


          return res.json({
            ok: true,
            runId,
            result: { ok: true, output: { text: answer }, logs: ['Optimizer Cache Hit'] }
          });
        }
      }

      if (!initialPlan && isGreetingOnly(rawUserText) && !hasAttachments) {
        initialPlan = { name: 'echo', input: { text: greetingReply(rawUserText) } };
      } else {
        const wantsLocation = isLocationLikeQuery(rawUserText);
        if (wantsLocation) {
          initialPlan = { name: 'http_fetch', input: { url: 'https://ipinfo.io/json' } } as any;
        }
        if (!initialPlan && isPaymentRequest(rawUserText)) {
          const p = extractPaymentParams(rawUserText);
          initialPlan = { name: 'payments_create_checkout_session', input: { amount: p.amount, currency: p.currency, productName: p.productName } } as any;
        }
        if (!initialPlan) {
          const isFreeProvider = providerKey === 'auto' || providerKey === 'pollinations' || providerKey === 'hack';
          if ((!hasAnyKey && !isFreeProvider) || providerKey === 'llm') {
            initialPlan = fallbackPlanWhenPlannerUnavailable({
              userText: rawUserText,
              sessionId: String(sessionId),
              history: history as any,
              preferNonLLM: true,
            }) as any;
          } else {
            initialPlan = await planNextStep(history, {
              provider: providerKey,
              apiKey: apiKey,
              baseUrl: baseUrl,
              model: model,
              userId: userId,
              sessionId: String(sessionId),
              onProgress: (p) => ev({ type: 'thought', data: `> ${p}` }),
              onThought: (t) => ev({ type: 'thought', data: t }),
              throwOnError: true,
            });
          }
        }
      }
    } catch (err) {
      console.warn('LLM planning error:', safeErrorMessage(err));
    }

    ev({ type: 'step_done', data: { name: 'plan', plan: initialPlan } });

    try {
      await Run.findByIdAndUpdate(runId, { $push: { steps: { name: 'plan', status: 'done' } } });
    } catch { }


    const rawTextForDb = String(text || '');
    let persistedUserText = redactSecretsFromString(rawTextForDb);
    try {
      const r = rewriteInlineLoginCredentialsToSecrets(rawTextForDb);
      if (r.ok) persistedUserText = redactSecretsFromString(String(r.sanitizedText || persistedUserText));
    } catch { }
    try {
      const pw = String(xeliteMacro?.password || '').trim();
      if (pw) persistedUserText = persistedUserText.split(pw).join('[REDACTED]');
    } catch { }

    // [OFFLINE MODE GUARD] Skip user message persistence
    if (!offlineMode) {
      await Message.create({ sessionId, role: 'user', content: persistedUserText, runId });
    } else {
      console.log('[Run/Start] OFFLINE MODE: Skipping user message persistence');
    }


    const risk = detectRisk(String(text || ''));
    if (risk && initialPlan) {
      const authRole = (req as any)?.auth?.role;
      const { getSessionRunConfig } = await import('../services/secrets');
      const cfg = getSessionRunConfig(String(sessionId)) || ({} as any);
      const autoAll =
        authRole === 'OWNER' || cfg.autoApproveAll === true ? true : process.env.AUTO_APPROVE_ALL === '1';
      const envAutoSafe = process.env.AUTO_APPROVE_SAFE;
      const auto = autoAll || cfg.autoApproveSafe === true ? true : envAutoSafe ? envAutoSafe === '1' : true;
      const safe = !/(high|critical)/i.test(String(risk));
      if (autoAll || (auto && safe)) {
        ev({
          type: 'step_started',
          data: { name: `execute:${initialPlan.name}`, input: redactToolInputForStorage(initialPlan.name, initialPlan.input) },
        });
        const callInput =
          userId && initialPlan.input && typeof initialPlan.input === 'object'
            ? { ...(initialPlan.input as any), userId: String(userId) }
            : initialPlan.input;
        let result = await executeToolWithRateLimitRetry(initialPlan.name, callInput, { sessionId, workspaceId }, { runId });

        // [INTELLIGENCE UPGRADE] Self-Correction Logic
        if (!result.ok && providerKey === 'auto') {
          console.info(`[AutoCorrection] Tool ${initialPlan.name} failed. Attempting autonomous fix...`);
          const { suggestCorrection } = await import('../llm/intelligent-router');
          const errorMessage = (result as any).error || (result as any).message || 'Unknown error';
          const correction = await suggestCorrection(errorMessage, initialPlan.name, rawUserText);

          if (correction) {
            console.info(`[AutoCorrection] Retrying with: ${correction.action}`);
            const retryInput = userId && correction.input && typeof correction.input === 'object'
              ? { ...(correction.input as any), userId: String(userId) }
              : correction.input;
            result = await executeToolWithRateLimitRetry(correction.action, retryInput, { sessionId, workspaceId }, { runId });
          }
        }

        ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${initialPlan.name}`, result } });
        if (result.artifacts) {
          for (const a of result.artifacts) {
            ev({ type: 'artifact_created', data: { name: a.name, href: a.href } });
          }
        }
        await Run.findByIdAndUpdate(runId, { $set: { status: result.ok ? 'done' : 'failed' } });
        ev({ type: 'run_finished', data: { runId, ok: result.ok } });
        return res.json({ ok: true, runId, result });
      }
      const approvalPlanInput = redactToolInputForStorage(initialPlan.name, initialPlan.input);

      const ap = await Approval.create({ runId, action: String(text || ''), risk, status: 'pending' });
      ev({ type: 'approval_required', data: { id: ap._id.toString(), runId, risk, action: text } });
      await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } });
      const { planContext } = await import('../approvals/context');
      planContext.set(ap._id.toString(), { runId, sessionId, workspaceId, name: initialPlan.name, input: initialPlan.input });
      if (autoAll || (auto && safe)) {
        ev({ type: 'step_started', data: { name: `execute:${initialPlan.name}`, input: redactToolInputForStorage(initialPlan.name, initialPlan.input) } });
        const callInput =
          userId && initialPlan.input && typeof initialPlan.input === 'object'
            ? { ...(initialPlan.input as any), userId: String(userId) }
            : initialPlan.input;
        let result;
        try {
          result = await executeToolWithRateLimitRetry(initialPlan.name, callInput, { sessionId, workspaceId }, { runId });
        } catch (e) {
          result = { ok: false, output: String(e) };
        }
        const ignoredTools = ['ls', 'list_files', 'list_dir', 'grep_search', 'terminal_resize', 'terminal_input'];
        if (!ignoredTools.includes(String(initialPlan.name)) && result.ok && result.output) {
          let answerText = typeof result.output === 'string' ? result.output : String(result.output.note || result.output.text || '');
          if (answerText) {
            // Check for thought markers
            const thoughtMatch = answerText.match(/:{2,3}thought([\s\S]*?):{2,3}/);
            if (thoughtMatch) {
              // Strip thought from answer
              answerText = answerText.replace(/:{2,3}thought([\s\S]*?):{2,3}/, '').trim();
            }
            if (answerText) {
              ev({ type: 'text', data: { text: answerText } });
              assistantTextEmitted = true;
            }
          }
        }
        let stepResult = result;
        if (initialPlan.name === 'central_answer' && result.ok) {
          // Hide raw JSON from UI, rely on 'text' event
          stepResult = { ...result, output: { note: 'Answer emitted as text' } as any };
        }
        ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${initialPlan.name}`, result: stepResult } });
        if (result.artifacts) {
          // Persist artifacts in DB using Artifact model if needed
        }
        await Run.findByIdAndUpdate(runId, { $set: { status: result.ok ? 'done' : 'failed' } });
        ev({ type: 'run_finished', data: { runId, ok: result.ok } });
        planContext.delete(ap._id.toString());
        // Fix: Explicitly return result here like in mock branch
        return res.json({ ok: true, runId, result });
      } else {
      }
      return res.json({ runId, sessionId, blocked: true, approvalId: ap._id.toString() });

    }

    // Fast path: handle location queries without LLM planning
    try {
      const rawUserText = String(text || '');
      if (isLocationLikeQuery(rawUserText)) {
        ev({ type: 'step_started', data: { name: 'execute:http_fetch', input: { url: 'https://ipinfo.io/json', sessionId } } });
        const result = await executeToolWithRateLimitRetry('http_fetch', { url: 'https://ipinfo.io/json', sessionId }, { sessionId, workspaceId }, { runId });
        ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: 'execute:http_fetch', result } });

        if (!offlineMode) {
          await ToolExecution.create({ runId, name: 'http_fetch', input: { url: 'https://ipinfo.io/json', sessionId }, output: result.output, ok: result.ok, logs: result.logs });
        }

        let lat: number | null = null, lon: number | null = null;
        const j = (result as any)?.output?.json || {};
        if (typeof j?.loc === 'string' && j.loc.includes(',')) {
          const parts = j.loc.split(',').map((x: string) => Number(x.trim()));
          if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
            lat = parts[0]; lon = parts[1];
          }
        } else if (typeof j?.latitude === 'number' && typeof j?.longitude === 'number') {
          lat = j.latitude; lon = j.longitude;
        } else if (typeof j?.lat === 'number' && typeof j?.lon === 'number') {
          lat = j.lat; lon = j.lon;
        }
        let finalText = '';
        if (lat !== null && lon !== null) {
          finalText = [
            `### الإحداثيات التقريبية`,
            `- خط العرض (Latitude): ${lat.toFixed(6)}`,
            `- خط الطول (Longitude): ${lon.toFixed(6)}`,
            `- المصدر: مزود تحديد الموقع عبر عنوان IP (تقريبي)`
          ].join('\n');
        } else {
          finalText = 'تعذّر استخراج الإحداثيات من مزود الموقع. حاول مرة أخرى بعد قليل.';
        }
        ev({ type: 'text', data: { text: finalText } });
        ev({ type: 'run_completed', data: { runId, result } });
        ev({ type: 'run_finished', data: { runId, status: 'done' } });

        await Message.create({ sessionId, role: 'assistant', content: finalText, runId });
        await Run.findByIdAndUpdate(runId, { $set: { status: 'done' } });

        return res.json({ runId, sessionId, status: 'done' });
      }
    } catch (e) {
      // fall through to agent loop on error
    }

    // [ELITE FIX] Return early for agent runs to prevent HTTP timeouts
    if (!res.headersSent) {
      res.json({ ok: true, runId, sessionId, status: 'running' });
    }

    // --- Agent Loop (Background) ---
    (async () => {
      try {
        let steps = 0;
        const MAX_STEPS = 50;

        // Extract values from req/res needing to persist in closure
        const reqProtocol = req.protocol;
        const reqHost = req.get('host');
        // @ts-ignore
        const authRole = req.auth?.role;

        // History already loaded above

        // Track executed tools to prevent loops
        const executedTools = new Set<string>();
        const executedToolSigs = new Set<string>();
        let consecutiveThoughtSteps = 0;
        let thoughtLoopPauseEmitted = false;
        let postScaffoldScheduled = false;
        let postInstallScheduled = false;
        let postDevScheduled = false;
        let postPreviewScheduled = false;
        let lastExecutedToolSig: string | null = null;
        let lastExecutedToolName: string | null = null;

        let lastResult: any = null;
        let forcedText: string | null = null;
        let plan: { name: string, input: any } | null = null;
        let pendingPlan: { name: string, input: any } | null = null;
        let lastPlanError: string | null = null;
        let endAfterBrowserState = false;
        let simpleBrowserOpenLabel = '';
        let simpleBrowserOpenUrl = '';
        let lastBrowserRunSummary = '';
        let lastBrowserRunPageUrl = '';
        let plannerUnavailableMode = false;

        const normalizeUrlForGoto = (raw: any) => {
          let s = String(raw ?? '').trim();
          s = s.replace(/^[`"'“”‘’]+/, '').replace(/[`"'“”‘’]+$/, '').trim();
          if (!s) return s;
          const fixXelite = (url: string) => {
            const input = String(url || '').trim();
            if (!input) return input;
            try {
              const u = new URL(input);
              const host = String(u.hostname || '').trim().toLowerCase();
              const hadWww = /^www\./i.test(host);
              const hostNoWww = host.replace(/^www\./i, '');
              const isXeliteLike =
                (/xelite/i.test(hostNoWww) && /solution/i.test(hostNoWww)) ||
                /^xelitesolutions(?:\.(?:co|com))?$/i.test(hostNoWww);
              if (!isXeliteLike) return input;
              const tld = /\.com$/i.test(hostNoWww) ? 'com' : 'co';
              u.hostname = `${hadWww ? 'www.' : ''}xelitesolutions.${tld}`;
              return u.toString();
            } catch {
              return input;
            }
          };
          if (/^https?:\/\//i.test(s)) return fixXelite(s);
          if (/^\/\//.test(s)) return `https:${s}`;
          if (/^\//.test(s)) return s;
          const candidate = s.replace(/^\/\//, '');
          const isLocal =
            /^localhost(?::\d+)?(?:\/|$)/i.test(candidate) ||
            /^127\.0\.0\.1(?::\d+)?(?:\/|$)/.test(candidate) ||
            /^\d+\.\d+\.\d+\.\d+(?::\d+)?(?:\/|$)/.test(candidate);
          const looksDomain =
            /^(?:www\.)?[a-z0-9][a-z0-9-]{0,62}(?:\.[a-z0-9-]{1,63})+(?::\d+)?(?:\/[^\s"'<>]*)?$/i.test(candidate);
          if (isLocal) return `http://${candidate}`;
          if (looksDomain) return fixXelite(`https://${candidate}`);
          if (/^xelite/i.test(candidate) && /solution/i.test(candidate) && !/\./.test(candidate)) return 'https://xelitesolutions.co';
          return s;
        };
        const hostKeyFromHost = (host: string) => {
          const h = String(host || '').toLowerCase().trim();
          if (!h) return '';
          return h.startsWith('www.') ? h.slice(4) : h;
        };
        const isSameSiteHost = (targetHost: string, lockHost: string) => {
          const t = hostKeyFromHost(targetHost);
          const l = hostKeyFromHost(lockHost);
          if (!t || !l) return false;
          if (t === l) return true;
          return t.endsWith(`.${l}`);
        };
        const urlToHost = (u: string) => {
          try {
            const parsed = new URL(u);
            return parsed.hostname || '';
          } catch {
            return '';
          }
        };
        const urlToOrigin = (u: string) => {
          try {
            const parsed = new URL(u);
            return parsed.origin || '';
          } catch {
            return '';
          }
        };
        const isCrossSiteBlockedError = (err: any) => {
          const s = String(err || '');
          if (!s) return false;
          if (/cross_site_blocked/i.test(s)) return true;
          if (/browser navigation blocked/i.test(s)) return true;
          return false;
        };
        const extractOpenTargetText = (raw: string) => {
          let s = String(raw || '').trim();
          if (!s) return '';
          s = s
            .replace(/https?:\/\/[^\s"'<>]+/gi, ' ')
            .replace(/\b(?:open|start|launch|browse|visit|go\s+to)\b/gi, ' ')
            .replace(/\b(?:website|site|page)\b/gi, ' ')
            .replace(/(?:ادخل|افتح|اذهب|زيارة|شغل|ابدأ|روح|زور)\b/gi, ' ')
            .replace(/(?:الى|إلى|لـ|ل)\b/gi, ' ')
            .replace(/(?:موقع|صفحة|صفحه)\b/gi, ' ')
            .replace(/(?:على\s+المتصفح|بالـ?متصفح|في\s+المتصفح|المتصفح)\b/gi, ' ')
            .replace(/[“”"']/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          s = s.replace(/^(?:موقع|صفحة|صفحه)\s+/i, '').trim();
          s = s.replace(/\s+(?:الآن|الان|حالًا|حالا)\s*$/i, '').trim();
          return s;
        };
        const pickTopUrlFromSearch = (out: any) => {
          const results = Array.isArray(out?.results) ? out.results : [];
          const top = results[0];
          const url = typeof top?.url === 'string' ? String(top.url).trim() : '';
          return url;
        };
        let browserHostLock = '';
        let browserOriginLock = '';
        const updateBrowserLockFromOutput = (out: any) => {
          const urlRaw = typeof out?.url === 'string' ? out.url : typeof out?.pageUrl === 'string' ? out.pageUrl : '';
          const url = normalizeUrlForGoto(urlRaw);
          const host = url ? urlToHost(url) : '';
          if (host) browserHostLock = hostKeyFromHost(host);
          const origin = url ? urlToOrigin(url) : '';
          if (origin) browserOriginLock = origin;
        };
        const isStrictSameSiteUiTask = (() => {
          const s = String(text || '');
          if (/strict_same_site_ui/i.test(s)) return true;
          const strictByDefault = ['1', 'true', 'yes', 'y', 'on'].includes(
            String(process.env.STRICT_SAME_SITE_UI || '').trim().toLowerCase(),
          );
          if (!strictByDefault) return false;
          const looksLoginOrForm =
            /(login|log\s*in|sign\s*in|password|email|form|تسجيل\s*الدخول|سجل\s*دخول|كلمة\s*المرور|البريد|نموذج)/i.test(s);
          const asksSearch =
            /(google|جوجل|search|ابحث|بحث|lookup|find|duckduck|duck\s*duck)/i.test(s);
          return Boolean(looksLoginOrForm && !asksSearch);
        })();

        const initialUserTextForOpen = String(text || '');
        let pendingBrowserOpenFromSearch: { target: string } | null = null;
        const isSimpleBrowserOpenRequest = (() => {
          const s = initialUserTextForOpen;
          const sNorm = normalizeForIntent(s);
          if (!s.trim()) return false;
          const hasUrl =
            /https?:\/\/[^\s"'<>]+/i.test(s) ||
            /(?:^|\s)(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/[^\s"'<>]*)?(?:\s|$)/i.test(s);
          const openKeyword =
            /(open|start|launch|browse|visit|go to|show|display|ادخل|افتح|افتحلي|افتح\s+لي|اذهب|زيارة|شغل|ابدأ|روح|زور|وديني|ودني|ودنا|خلني|خليني|وريني|اعرض|عرض|شوف|طلعني|طالع|بدي|عايز|عاوز|ابي|ابغى)/i.test(
              sNorm,
            );
          const browserKeyword = /(\b(browser|web|preview)\b|متصفح|المتصفح|داخل المتصفح|معاينة|المعاينة)/i.test(sNorm);
          const multiStepKeyword =
            /(\bthen\b|\bafter\b|\bnext\b|and then|, then|; then|ثم|وبعد|بعد( ذلك)?|بعدها|ومن ثم|عدة\s+خطوات|خطوات|خطوة|تابع|نفذ|قم\s+ب|سجل\s*دخول|تسجيل\s*الدخول|login|sign\s*in|انقر|اضغط|click|type|اكتب|املأ|fill|submit|إرسال|scroll|مرر|extract|استخرج|لخص|summarize)/i.test(
              sNorm,
            );
          const isFileOp = /(file|folder|directory|ملف|مجلد|مسار|path|terminal|command|أمر|ترمينال)/i.test(sNorm);
          const analysisKeyword = /(كود|code|repo|repository|مستودع|ملفات|files|راجع|audit|lint|build|typecheck|تحليل)/i.test(sNorm);
          const hasSiteKeyword =
            /(joe|نظام جو|جو|github|git\s*hub|جيتهاب|جيت\s+هاب|جت\s+هاب|غيت\s+هاب|كتهاب|كت\s*هاب|كيتهاب|كيت\s*هاب|yahoo|ياهو|google|جوجل|قوقل|youtube|يوتيوب|open\s*a\s*i|open\s*ai|openai|اوبن\s*اي\s*اي|اوبن\s*اي|لينكد\s*(ان|إن)|واتساب|واتس\s*اب|فيس\s*بوك|فيسبوك|تويتر|امازون|أمازون)/i.test(
              sNorm,
            ) ||
            /(website|site|page|موقع|صفحة|صفحه)/i.test(sNorm) ||
            /(?:^|\s)(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/[^\s"'<>]*)?(?:\s|$)/i.test(s);
          if (!hasUrl && !hasSiteKeyword && !browserKeyword) return false;
          if (!(openKeyword || browserKeyword || hasUrl)) return false;
          if (multiStepKeyword) return false;
          if (isFileOp && !hasUrl) return false;
          if (analysisKeyword) return false;
          return true;
        })();
        if (isSimpleBrowserOpenRequest) {
          const s = initialUserTextForOpen;
          const normalized = normalizeUrlForGoto(s);

          if (normalized && /^https?:\/\//i.test(normalized)) {
            simpleBrowserOpenUrl = normalized;
            const host = urlToHost(normalized);
            simpleBrowserOpenLabel = host ? (host.includes('github') ? 'GitHub' : host.includes('google') ? 'Google' : host.includes('openai') ? 'OpenAI' : host.includes('yahoo') ? 'Yahoo' : host.includes('youtube') ? 'YouTube' : 'الموقع') : 'الموقع';
          } else {
            // Try standard URL extraction
            const directUrl =
              s.match(/https?:\/\/[^\s"'<>]+/i)?.[0] ||
              (() => {
                const m = s.match(/(?:^|\s)(?:url\s*[:=]\s*)?((?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/[^\s"'<>]*)?)/i);
                const candidate = (m?.[1] || '').replace(/[)\].,;:!?]+$/g, '').trim();
                const isLocal =
                  /^localhost(?::\d+)?(?:\/|$)/i.test(candidate) ||
                  /^127\.0\.0\.1(?::\d+)?(?:\/|$)/.test(candidate) ||
                  /^\d+\.\d+\.\d+\.\d+(?::\d+)?(?:\/|$)/.test(candidate);
                if (!candidate) return '';
                return `${isLocal ? 'http' : 'https'}://${candidate.replace(/^\/\//, '')}`;
              })();

            if (directUrl) {
              simpleBrowserOpenUrl = directUrl;
              simpleBrowserOpenLabel = 'الموقع';
            } else {
              const openTarget = extractOpenTargetText(s);
              if (openTarget) {
                const q = /[\u0600-\u06FF]/.test(openTarget) ? `${openTarget} الموقع الرسمي` : `${openTarget} official website`;
                pendingPlan = { name: 'web_search', input: { query: q } } as any;
                pendingBrowserOpenFromSearch = { target: openTarget };
              }
            }
          }
        }

        if (isSimpleBrowserOpenRequest) {
          if (pendingPlan?.name !== 'web_search') {
            const targetUrl = String(simpleBrowserOpenUrl || '').trim() || 'https://www.yahoo.com';
            const host = urlToHost(targetUrl);
            const hostKey = host ? hostKeyFromHost(host) : '';
            const sid =
              userId && String(userId).trim()
                ? `browser:${String(userId).trim()}:${hostKey || 'site'}`
                : `browser:${Date.now()}`;
            pendingPlan = { name: 'browser_open', input: { url: targetUrl, sessionId: sid } } as any;
          }
        }

        // Auto-route simple Google search requests to web_search tool
        const isSimpleGoogleSearchRequest = (() => {
          const s = String(text || '').trim();
          if (!s) return false;
          const hasGoogle = /(google|جوجل)/i.test(s);
          const hasSearch = /(search|ابحث|بحث|فتش|تفتيش|دور|ابغى\s+بحث|عايز\s+بحث|عاوز\s+بحث)/i.test(s);
          if (!hasGoogle || !hasSearch) return false;
          // Ensure it is not a complex multi-step instruction
          const multiStepKeyword =
            /(\bthen\b|\bafter\b|\bnext\b|and then|, then|; then|ثم|وبعد|بعد( ذلك)?|بعدها|ومن ثم|عدة\s+خطوات|خطوات|خطوة|انقر|اضغط|click|type|اكتب|املأ|fill|submit|إرسال|scroll|مرر|extract|استخرج|لخص|summarize)/i.test(
              s,
            );
          if (multiStepKeyword) return false;
          return true;
        })();

        if (isSimpleGoogleSearchRequest) {
          const s = String(text || '').trim();
          // Extract query: remove "google", "search", etc.
          let q = s.replace(/(google|جوجل|search|ابحث|بحث|فتش|تفتيش|دور|عن|في|on|in|for)/gi, ' ').trim();
          if (!q) q = s;
          pendingPlan = { name: 'web_search', input: { query: q } } as any;
        }

        while (steps < MAX_STEPS) {
          if (isRunCancelled(runId)) {
            forcedText = '⛔ تم إيقاف التنفيذ.';
            lastResult = { ok: false, error: 'stopped' };
            break;
          }
          ev({ type: 'step_started', data: { name: `planning_step_${steps + 1}` } });
          plannerUnavailableMode = false;

          // Optimization: Reuse initial plan if available for the first step to reduce latency
          if (pendingPlan) {
            plan = pendingPlan;
            pendingPlan = null;
          } else if (steps === 0 && initialPlan) {
            plan = initialPlan;
            initialPlan = null; // Prevent reuse
          } else {
            const userTextForCooldown = String(text || '');
            if (!hasAnyKey || providerKey === 'llm') {
              plannerUnavailableMode = true;
              plan = fallbackPlanWhenPlannerUnavailable({
                userText: userTextForCooldown,
                sessionId: String(sessionId),
                history: history as any,
                preferNonLLM: true,
              }) as any;
            } else {
              const coolUntil = rateLimitCooldown.get(String(sessionId)) || 0;
              if (Date.now() < coolUntil) {
                plannerUnavailableMode = true;
                plan = fallbackPlanWhenPlannerUnavailable({
                  userText: userTextForCooldown,
                  sessionId: String(sessionId),
                  history: history as any,
                  preferNonLLM: true,
                }) as any;
              } else {
                try {
                  if (isRunCancelled(runId)) {
                    forcedText = '⛔ تم إيقاف التنفيذ.';
                    lastResult = { ok: false, error: 'stopped' };
                    break;
                  }

                  // [Wakil 5.2] Agent Timeout Guard - 30s max
                  const TIMEOUT_MS = 30 * 1000;
                  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('LLM_TIMEOUT')), TIMEOUT_MS));

                  // Race between planner and timeout
                  plan = await Promise.race([
                    planNextStep(history, {
                      provider,
                      apiKey,
                      baseUrl,
                      model,
                      userId,
                      sessionId,
                      onProgress: (p) => ev({ type: 'thought', data: `> ${p}` }),
                      onThought: (t) => ev({ type: 'thought', data: t }),
                      throwOnError: true
                    }),
                    timeoutPromise
                  ]) as any;

                  // [Wakil 6.0] Deep Reasoning Emission
                  if (plan && (plan as any).reasoning) {
                    const r = (plan as any).reasoning;
                    const text = Array.isArray(r) ? r.join('\n') : String(r);
                    if (text && text.length > 5) {
                      ev({ type: 'thought', data: text });
                    }
                  }

                } catch (err: any) {
                  lastPlanError = safeErrorMessage(err);
                  const status = errorStatusCode(err);
                  console.warn(`LLM planning error (status=${status}):`, lastPlanError);

                  // [RESILIENCY] Auto-Fallback Mechanism
                  const isAuthError = isProviderAuthError(err, lastPlanError) || lastPlanError.includes('NO_API_KEY_CONFIGURED');
                  const isRateLimit = isProviderRateLimitError(err, lastPlanError) || status === 429 || lastPlanError.includes('quota') || lastPlanError === 'LLM_TIMEOUT';

                  // Only fallback if we aren't ALREADY on auto/pollinations
                  const isAlreadyFree = providerKey.includes('auto') || providerKey.includes('pollinations');

                  if ((isAuthError || isRateLimit) && !isAlreadyFree) {
                    console.info('[Resiliency] ⚠️ Primary provider failed. Falling back to Auto Mode immediately.');

                    // Notify user ONCE about the fallback
                    if (!assistantTextEmitted) {
                      const reason = lastPlanError === 'LLM_TIMEOUT' ? 'تأخرت الاستجابة' : 'نفذ الرصيد أو خطأ في المفتاح';
                      ev({
                        type: 'text',
                        data: `⚠️ **تنبيه:** ${reason} في المزود الأساسي.\n🔄 **تم التحويل تلقائياً إلى النظام المجاني (Auto Mode).**`
                      });
                      assistantTextEmitted = true; // Prevent spamming
                    }

                    // Switch to auto mode for this turn AND future turns in this session can be handled by frontend logic or re-try loop
                    provider = 'auto';
                    providerKey.replace('', 'auto'); // Update local var logic if needed (providerKey is const, but we use logic below)

                    // RETRY IMMEDIATELY with 'auto' provider
                    try {
                      plan = await planNextStep(history, {
                        provider: 'auto',
                        userId,
                        sessionId,
                        onProgress: (p) => ev({ type: 'thought', data: `> ${p}` }),
                        onThought: (t) => ev({ type: 'thought', data: t }),
                        throwOnError: false
                      });
                      if (plan) continue; // Loop continues with new plan
                    } catch (retryErr) {
                      console.error('[Resiliency] Fallback also failed:', retryErr);
                    }
                  }

                  // Standard Error Handling (if fallback didn't recover or was already free)
                  if (lastPlanError && (lastPlanError.includes('NO_API_KEY_CONFIGURED') || lastPlanError.includes('PROVIDER_LLM_DISABLED'))) {
                    break;
                  }
                  if (isProviderRateLimitError(err, lastPlanError)) {
                    rateLimitCooldown.set(String(sessionId), Date.now() + 3 * 60 * 1000);
                    plannerUnavailableMode = true;
                    const userTextForOverrides = String(text || '');
                    const userTextNorm = normalizeArabicQuery(userTextForOverrides);
                    if (isLocationLikeQuery(userTextForOverrides)) {
                      plan = { name: 'http_fetch', input: { url: 'https://ipinfo.io/json' } } as any;
                    } else if (isWeatherLikeQuery(userTextForOverrides)) {
                      const city = extractWeatherCity(userTextForOverrides);
                      const q = isArabicText(userTextForOverrides)
                        ? `كم درجة الحرارة الآن في ${city}؟`
                        : `current temperature in ${city} now`;
                      plan = { name: 'web_search', input: { query: q } } as any;
                    } else if (isGeneralKnowledgeQuestion(userTextForOverrides)) {
                      plan = { name: 'web_search', input: { query: userTextForOverrides } } as any;
                    } else if (/(ابحث|بحث|search|find|lookup|اعطني|اعطيني|معلومات|info)/.test(userTextNorm) || /^(من|ما|ماذا|متى|اين|أين|كيف|هل|لماذا|why|what|who|when|where|how)\b/.test(userTextNorm)) {
                      const qMatch = userTextForOverrides.match(/(?:عن|حول)\s+(.+)/i);
                      const query = qMatch ? qMatch[1] : userTextForOverrides;
                      plan = { name: 'web_search', input: { query } } as any;
                    } else {
                      plan = fallbackPlanWhenPlannerUnavailable({
                        userText: userTextForOverrides,
                        sessionId: String(sessionId),
                        preferNonLLM: true,
                      }) as any;
                    }
                  }
                  if (!plan) {
                    const userTextForOverrides = String(text || '');
                    plannerUnavailableMode = true;
                    plan = fallbackPlanWhenPlannerUnavailable({
                      userText: userTextForOverrides,
                      sessionId: String(sessionId),
                      history: history as any,
                      preferNonLLM: true,
                    }) as any;
                  }
                }
              }
            }
          }

          if (!plan) {
            if (!lastPlanError && !plannerUnavailableMode) {
              // Graceful stop (Planner returned null to signal completion/anti-loop)
              // ev({ type: 'text', data: '(Thinking stopped)' }); // Optional debug
              break;
            }

            const hint = lastPlanError ? formatProviderConnectHint(lastPlanError, provider, model, baseUrl) : '';
            const extra = lastPlanError ? `\n\nDetails: ${lastPlanError}${hint ? `\n${hint}` : ''}` : '';
            const msg = lastPlanError && isProviderAuthError(null, lastPlanError)
              ? `⚠️ فشل التحقق من المفتاح\nالمزوّد رفض الـ API Key. تحقق من المفتاح وإعدادات المزود.${extra}`
              : `⚠️ تعذّر التخطيط للخطوة التالية عبر المزود.\nتحقق من المزوّد/الموديل/الـ Base URL ثم أعد المحاولة.${extra}`;

            if (lastPlanError) {
              ev({ type: 'text', data: msg });
              forcedText = msg;
              assistantTextEmitted = true;
            }

            if (isGeneralKnowledgeQuestion(String(text || ''))) {
              plan = { name: 'central_answer', input: { question: String(text || '') } } as any;
            } else {
              plan = fallbackPlanWhenPlannerUnavailable({
                userText: String(text || ''),
                sessionId: String(sessionId),
                history: history as any,
                preferNonLLM: false,
              }) as any;
            }
          }

          let planName = String(plan?.name || '');
          const userTextForOverrides = String(text || '');
          const userTextNorm = normalizeArabicQuery(userTextForOverrides);

          // [GOD MODE] FORCE BUILD OVERRIDE
          // If the user clearly wants to build/create, and we haven't started, don't let it stall in "echo"
          const isExplicitBuild = /(build|create|generate|scaffold|ابني|انشئ|أنشئ|سوي|اعمل|كون|صمم)\s+(website|app|system|page|موقع|تطبيق|نظام|صفحة|صفحه)/i.test(userTextForOverrides);
          if (isExplicitBuild && steps === 0 && (planName === 'echo' || !planName)) {
            console.info('[GOD MODE] ⚡ Build Intent Detected - Forcing Pipeline Execution');
            plan = { name: 'project_detect', input: { path: '.' } } as any;
            planName = 'project_detect';
          }

          const wantsLocationEarly = isLocationLikeQuery(userTextForOverrides);
          let browserIntentThisTurn = false;
          if (wantsLocationEarly) {
            plan = { name: 'http_fetch', input: { url: 'https://ipinfo.io/json' } } as any;
            planName = 'http_fetch';
          }

          if (!wantsLocationEarly) {
            const s = userTextForOverrides;
            const sNorm = normalizeForIntent(s);
            const extractUrlCandidate = (text: string) => {
              const http = text.match(/https?:\/\/[^\s"'<>`]+/i)?.[0];
              if (http) return http.replace(/[)\]`.,;:!?،؛؟]+$/g, '');
              const m = text.match(/(?:^|\s)(?:url\s*[:=]\s*)?((?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/[^\s"'<>]*)?)/i);
              const candidate = (m?.[1] || '').replace(/[)\]`.,;:!?،؛؟]+$/g, '').trim();
              if (!candidate) return undefined;
              const isLocal =
                /^localhost(?::\d+)?(?:\/|$)/i.test(candidate) ||
                /^127\.0\.0\.1(?::\d+)?(?:\/|$)/.test(candidate) ||
                /^\d+\.\d+\.\d+\.\d+(?::\d+)?(?:\/|$)/.test(candidate);
              return `${isLocal ? 'http' : 'https'}://${candidate.replace(/^\/\//, '')}`;
            };
            const extractedUrl = extractUrlCandidate(s) || '';
            const hasUrl = Boolean(extractedUrl);
            const openKeyword =
              /(open|start|launch|browse|visit|go to|ادخل|افتح|اذهب|زيارة|شغل|ابدأ|روح|زور|وديني|ودني|ودنا|خلني|خليني|بدي|عايز|عاوز|ابي|ابغى)/i.test(
                sNorm,
              );
            const browserKeyword = /(\b(browser|web|preview)\b|متصفح|المتصفح|داخل المتصفح|معاينة|المعاينة)/i.test(sNorm);
            const isFileOp = /(file|folder|directory|ملف|مجلد|مسار|path|terminal|command|أمر|ترمينال)/i.test(sNorm);
            const githubKeyword = /(github|git\s*hub|جيت\s*هاب|جيتهاب|جت\s*هاب|غيت\s*هاب|كت\s*هاب|كتهاب|كيت\s*هاب|كيتهاب)/i.test(sNorm);
            const analysisKeyword = /(كود|code|repo|repository|مستودع|ملفات|files|اختبر|تحقق|راجع|audit|lint|build|typecheck|تحليل)/i.test(sNorm);

            const testKeyword = /(اختبر|اختبار|شيك|شيّك|تشييك|جرّب|جرب|تاكد|تأكد|تفقد|تفقده|تحقق)/i.test(sNorm);
            let wantsBrowser = Boolean(hasUrl || browserKeyword || openKeyword || (testKeyword && hasUrl));
            if (openKeyword && githubKeyword && analysisKeyword) wantsBrowser = false;
            if (openKeyword && isFileOp) wantsBrowser = false;
            browserIntentThisTurn = wantsBrowser || isSimpleBrowserOpenRequest;

            const looksLikeInPageBrowserAction =
              !hasUrl &&
              !openKeyword &&
              /(click|انقر|اضغط|type|اكتب|املأ|fill|submit|إرسال|scroll|مرر|extract|استخرج|لخص|summarize|اقرأ|read|حدد|select|اختر|ابحث\s+داخل\s+الصفحة)/i.test(
                s,
              );
            if (
              kind === 'agent' &&
              !wantsBrowser &&
              looksLikeInPageBrowserAction &&
              typeof browserSessionId === 'string' &&
              browserSessionId.trim() &&
              !/^browser_/.test(planName)
            ) {
              plan = { name: 'browser_run', input: { sessionId: browserSessionId.trim(), instructionText: s } } as any;
              planName = 'browser_run';
              browserIntentThisTurn = true;
            }

            if (wantsBrowser && !/^browser_/.test(planName)) {
              const directUrl = extractedUrl;
              const wantsYahoo = /(yahoo|ياهو)/i.test(sNorm);
              const wantsYoutube = /(youtube|يوتيوب)/i.test(sNorm);
              const wantsGoogle = /(google|جوجل|قوقل)/i.test(sNorm);
              const wantsOpenAI = /(open\s*a\s*i|open\s*ai|openai|اوبن\s*اي\s*اي|اوبن\s*اي)/i.test(sNorm);
              const wantsMicrosoft = /(microsoft|مايكروسوفت|مايكروسوت)/i.test(sNorm);
              const wantsX = /(x\.com|\btwitter\b|تويتر)/i.test(sNorm);
              const wantsFacebook = /(facebook|فيس\s*بوك|الفيس\s*بوك|فيسبوك)/i.test(sNorm);
              const wantsLinkedIn = /(linkedin|لينكد\s*ان|لينكدان|لينكدإن)/i.test(sNorm);
              const wantsPricing = /(price|pricing|سعر|الاسعار|الأسعار|تكلفة|cost)/i.test(sNorm);
              const wantsBilling =
                /(balance|billing|credit|credits|usage|payment|invoice|invoices|رصيد|الرصيد|فواتير|الفواتير|استخدام|المدفوعات)/i.test(
                  sNorm,
                );
              const openAiUrl = wantsBilling
                ? 'https://platform.openai.com/account/billing/overview'
                : 'https://platform.openai.com/';
              const openAiPricingUrl = 'https://openai.com/pricing';
              const desiredUrl =
                (directUrl || '').trim() ||
                (wantsOpenAI
                  ? (wantsPricing ? openAiPricingUrl : openAiUrl)
                  : wantsYahoo
                    ? 'https://www.yahoo.com'
                    : wantsYoutube
                      ? 'https://www.youtube.com'
                      : githubKeyword
                        ? 'https://github.com'
                        : wantsGoogle
                          ? 'https://www.google.com'
                          : wantsMicrosoft
                            ? 'https://www.microsoft.com'
                            : wantsX
                              ? 'https://x.com'
                              : wantsFacebook
                                ? 'https://www.facebook.com'
                                : wantsLinkedIn
                                  ? 'https://www.linkedin.com'
                                  : '');
              if (desiredUrl) {
                const candidateSig = `browser_open:${JSON.stringify({ url: desiredUrl })}`;
                if (!executedToolSigs.has(candidateSig) && lastExecutedToolSig !== candidateSig) {
                  plan = { name: 'browser_open', input: { url: desiredUrl } } as any;
                  planName = 'browser_open';
                }
              } else if (openKeyword) {
                const openTarget = extractOpenTargetText(s);
                if (openTarget) {
                  const q = /[\u0600-\u06FF]/.test(openTarget) ? `${openTarget} الموقع الرسمي` : `${openTarget} official website`;
                  const sig = `web_search_open:${q}`;
                  if (!executedToolSigs.has(sig)) {
                    executedToolSigs.add(sig);
                    plan = { name: 'web_search', input: { query: q } } as any;
                    planName = 'web_search';
                    pendingBrowserOpenFromSearch = { target: openTarget };
                  }
                }
              }
            }
          }

          // Safety: Prevent immediate repeats of same tool execution
          if (['project_detect', 'scaffold_project', 'npm_install', 'npm_build', 'analyze_codebase', 'http_fetch', 'web_search', 'central_answer', 'browser_open', 'browser_run', 'website_full_pipeline'].includes(planName)) {
            const sig = `${planName}:${JSON.stringify((plan as any)?.input || {})}`;

            if (executedToolSigs.has(sig) || lastExecutedToolSig === sig) {
              if (planName === 'browser_open' || planName === 'browser_run') {
                const sidDirect = String((plan as any)?.input?.sessionId || '').trim();
                const sid = sidDirect || String(browserSessionId || '').trim();
                if (sid) {
                  plan = { name: 'browser_get_state', input: { sessionId: sid } } as any;
                  planName = 'browser_get_state';
                } else {
                  const url = String((plan as any)?.input?.url || '').trim();
                  const derived = url ? browserSessionIdFromUrl(url) : '';
                  if (derived) {
                    plan = { name: 'browser_get_state', input: { sessionId: derived } } as any;
                    planName = 'browser_get_state';
                  }
                }
              }
              if (planName === 'browser_get_state') {
                // no-op
              } else {
                const isGeneral = isGeneralKnowledgeQuestion(userTextForOverrides);
                const isFreeProvider = providerKey === 'auto' || providerKey === 'pollinations' || providerKey === 'hack';
                const needsKey = !hasAnyKey && !isFreeProvider;
                plan = {
                  name: 'echo',
                  input: {
                    text: isArabicText(userTextForOverrides)
                      ? (isGeneral
                        ? (needsKey
                          ? '⚠️ تعذّر الإجابة على هذا السؤال لأن مزوّد الذكاء غير مُفعّل (لا يوجد API Key).\nأدخل LLM API Key من نافذة التوكن ثم أعد إرسال السؤال.'
                          : '⚠️ تم تكرار نفس خطوة التخطيط بدون تقدم.\nأعد صياغة السؤال بجملة أبسط أو جرّب مرة أخرى.')
                        : `تم تكرار نفس الخطوة بدون تقدم (${planName}).\nأعد صياغة الطلب أو حدّد الخطوة التالية بشكل أوضح.`)
                      : (isGeneral
                        ? (needsKey
                          ? '⚠️ I can’t answer because the LLM provider isn’t configured (missing API key).\nAdd an LLM API key, then resend your question.'
                          : '⚠️ Planning repeated without progress.\nPlease rephrase your question and try again.')
                        : `The same step repeated without progress (${planName}).\nPlease rephrase or tell me the next concrete action.`),
                  }
                } as any;
                planName = 'echo';
              }
            } else {
              executedToolSigs.add(sig);
            }
          }

          // Safety: Prevent infinite thought loops
          // Safety: Prevent infinite thought loops
          if (planName === 'echo') {
            const txt = (plan as any)?.input?.text;
            // If echo has content (is speaking to user), reset thought steps
            if (typeof txt === 'string' && txt.trim().length > 2) {
              consecutiveThoughtSteps = 0;
            } else {
              consecutiveThoughtSteps++;
            }
          } else if (!planName) {
            consecutiveThoughtSteps++;
          } else {
            consecutiveThoughtSteps = 0;
            executedTools.add(planName);
          }

          if (consecutiveThoughtSteps > 5) {
            if (!thoughtLoopPauseEmitted) {
              const isFreeProvider = providerKey === 'auto' || providerKey === 'pollinations' || providerKey === 'hack';
              const needsKey = !hasAnyKey && !isFreeProvider;
              const hint = lastPlanError ? formatProviderConnectHint(lastPlanError, provider, model, baseUrl) : '';
              const providerLabel = String(providerKey || 'llm').trim() || 'llm';
              const modelLabel = typeof model === 'string' && model.trim() ? model.trim() : '';
              const keyLabel = apiKey ? 'موجود' : (process.env.OPENAI_API_KEY ? 'موجود (System)' : 'غير موجود');
              const baseHost = hostFromUrlMaybe(baseUrl);
              const msg = [
                `⚠️ تم إيقاف التنفيذ مؤقتًا: النظام عالق في حلقة تفكير.`,
                `- المزوّد: ${providerLabel}${modelLabel ? ` / ${modelLabel}` : ''}${baseHost ? ` / ${baseHost}` : ''}`,
                `- المفتاح: ${keyLabel}`,
                `- المفتاح: ${keyLabel}`,
                needsKey ? `- ⚠️ يبدو أنك لم تقم بتفعيل مفتاح API (مثلاً OpenAI/Anthropic). يرجى الذهاب للإعدادات وإضافته.` : `- لم أتمكن من تحديد خطة ذكية لهذا الطلب. هل يمكنك توضيح المزيد؟`,
                hint ? `تلميح: ${hint}` : ``,
                `Debug Info: Provider=${providerKey}, HasKey=${hasAnyKey}, Plan=${planName || 'none'}`
              ].filter(Boolean).join('\n');
              forcedText = msg;
              const now = Date.now();
              const last = loopPauseThrottle.get(String(sessionId));
              if (!last || now - last > 6000) {
                ev({ type: 'text', data: msg });
                assistantTextEmitted = true;
                loopPauseThrottle.set(String(sessionId), now);
              }
              thoughtLoopPauseEmitted = true;
            }
            break;
          }

          const isBrowserTool = /^browser_/.test(planName);
          const awaitingRepoName = historyHasMarker(history as any, 'ASKED_FOR_REPO_NAME');
          let requestedRepoName = extractRequestedRepoName(userTextForOverrides);
          if (!requestedRepoName && awaitingRepoName) {
            const bare = userTextForOverrides.match(/^\s*([A-Za-z0-9._-]{1,100})\s*$/);
            if (bare && bare[1]) requestedRepoName = bare[1].trim();
          }
          const wantsGithubRepo =
            /(github|git\s*hub|جيت\s*هاب|جيتهاب|كت\s*هاب|كتهاب|كيت\s*هاب|كيتهاب)/i.test(userTextForOverrides) &&
            /(repo|repository|ريبو|مستودع)/i.test(userTextForOverrides) &&
            /(create|new|انش(?:ئ|ي)|أنشئ|انشاء|إنشاء)/i.test(userTextForOverrides);
          if (wantsGithubRepo || (awaitingRepoName && requestedRepoName)) {
            if (requestedRepoName) {
              plan = {
                name: 'github_create_repo',
                input: {
                  name: requestedRepoName,
                  private: /(private|خاص)/i.test(userTextForOverrides),
                  sessionId: String(sessionId),
                },
              } as any;
            }
          }
          // Special: List tools command
          const wantsToolsList =
            /(list\s+tools|tools\s+list|show\s+tools)/i.test(userTextForOverrides) ||
            /(سرد|عرض|قائمه|قائمة)\s+الادوات/.test(userTextNorm);
          if (wantsToolsList && (!planName || planName === 'echo')) {
            const base = `${reqProtocol}://${reqHost}`;
            plan = { name: 'http_fetch', input: { url: `${base}/tools` } } as any;
            planName = 'http_fetch';
          }

          const wantsShop = isEcommerceRequest(userTextForOverrides);
          if (wantsShop) {
            // Extract project name if provided, else default
            const nameMatch = userTextForOverrides.match(/(?:named|called|اسم|اسمه)\s+([a-zA-Z0-9_-]+)/i);
            const projName = nameMatch ? nameMatch[1] : 'vivos-store';

            if (steps === 0 && !historyHasMarker(history as any, 'ECOMMERCE_PLAN_EMITTED')) {
              // Silent execution - no text emitted to chat
              // ev({ type: 'text', data: md }); 
              history.push({ role: 'assistant', content: 'ECOMMERCE_PLAN_EMITTED' } as any);
              try {

                await Message.create({ sessionId, role: 'assistant', content: 'ECOMMERCE_PLAN_EMITTED', runId });

              } catch { }

              // Force the smart tool
              plan = {
                name: 'scaffold_full_stack',
                input: {
                  name: projName,
                  type: 'ecommerce',
                  features: ['auth', 'products', 'cart'] // Smart default features
                }
              } as any;
              planName = 'scaffold_full_stack';
              pendingPlan = plan; // ensure immediate execution on first loop
            }

            // Force execution even if AI tries to think
            if (planName === 'echo' || !planName) {
              // If we haven't scaffolded yet (and steps > 0), maybe AI missed it?
              // But if steps=0 we forced it above.
              // If steps > 0, we assume scaffolding is done.
            }
          }

          const wantsWeather = isWeatherLikeQuery(userTextForOverrides);
          if (wantsWeather && (!planName || planName === 'echo')) {
            const city = extractWeatherCity(userTextForOverrides);
            const q = isArabicText(userTextForOverrides)
              ? `كم درجة الحرارة الآن في ${city}؟`
              : `current temperature in ${city} now`;
            plan = { name: 'central_answer', input: { question: q } } as any;
            planName = 'central_answer';
          }

          const wantsGeneralAnswer = isGeneralKnowledgeQuestion(userTextForOverrides);
          if (
            wantsGeneralAnswer &&
            (!planName ||
              planName === 'echo' ||
              planName === 'project_detect' ||
              planName === 'analyze_codebase' ||
              planName === 'scaffold_project' ||
              planName === 'npm_install' ||
              planName === 'npm_build')
          ) {
            plan = { name: 'central_answer', input: { question: userTextForOverrides } } as any;
            planName = 'central_answer';
          }

          if (planName === 'project_detect' && historyHasMarker(history as any, 'PROJECT_DETECT_EMPTY')) {
            const hasAnalyze = historyHasToolCall(history as any, 'analyze_codebase');
            if (!hasAnalyze) {
              plan = { name: 'analyze_codebase', input: { path: '.' } } as any;
              planName = 'analyze_codebase';
            } else {
              plan = {
                name: 'echo',
                input: {
                  text: isArabicText(userTextForOverrides)
                    ? '⚠️ فحص المشروع لم يعثر على مشاريع قابلة للتعرّف (package.json/pyproject/go.mod).\nاذكر مسار مجلد المشروع داخل المستودع أو اطلب قراءة/بحث ملف معيّن.'
                    : '⚠️ Project scan found no recognizable projects (package.json/pyproject/go.mod).\nProvide the project folder path inside the repo, or ask to read/search a specific file.',
                },
              } as any;
              planName = 'echo';
            }
          }

          const wf = !wantsShop ? await detectWorkflowAdvanced(userTextForOverrides, { useAnalyzer: true, workspaceId }) : null;
          if (wf && wf.kind !== 'ecommerce' && (!planName || planName === 'echo')) {
            const marker =
              wf.kind === 'tool_shell' && wf.tool
                ? `WF_START:${wf.kind}:${wf.tool.name}`
                : `WF_START:${wf.kind}:${wf.root}`;

            const alreadyExecuted =
              historyHasToolCall(history as any, 'project_detect') ||
              historyHasToolCall(history as any, 'scaffold_project') ||
              historyHasToolCall(history as any, 'analyze_codebase');

            if (steps === 0 && !historyHasMarker(history as any, marker) && !alreadyExecuted) {
              if (wf.kind !== 'simple_creative') {
                const title =
                  wf.kind === 'tool_shell'
                    ? `### خطة إنشاء أداة (Shell Tool)`
                    : wf.kind === 'static_site'
                      ? `### خطة بناء موقع (Static Website)`
                      : wf.kind === 'node_api'
                        ? `### خطة بناء API (Node/Express)`
                        : `### خطة بناء تطبيق (Fullstack)`;
                const stepList =
                  wf.kind === 'tool_shell'
                    ? [
                      `- 1) project_detect: فحص المشروع والمسارات`,
                      `- 2) command_policy_check: فحص أمان الأمر`,
                      `- 3) tool_create_shell: إنشاء الأداة داخل المصنع (Runtime)`,
                      `- 4) quality_run: تشغيل lint للتأكد`,
                      `- 5) echo: إنهاء`,
                    ]
                    : [
                      `- 1) project_detect: فحص هيكل المشروع والمسارات`,
                      `- 2) analyze_codebase: تحليل سريع للمجلدات والمشاريع`,
                      `- 3) scaffold_project: إنشاء هيكل المشروع`,
                      wf.kind === 'static_site' ? `- 4) echo: إنهاء` : `- 4) npm_install: تثبيت الاعتمادات`,
                      wf.kind === 'static_site' ? `- 5) echo: إنهاء` : `- 5) quality_run: lint/test/build إن وجدت`,
                    ];

                const contextLine =
                  wf.kind === 'tool_shell' && wf.tool
                    ? `- الاسم: ${wf.tool.name}\n- الأمر: ${wf.tool.command}`
                    : `- المجلد: ${wf.root}`;

                const md = [title, contextLine, ...stepList, ``, `سأبدأ الآن بالتنفيذ باستخدام الأدوات.`].join('\n');
                if (!containsBuilderPlanText(userTextForOverrides)) {
                  ev({ type: 'text', data: md });
                }
              }

              history.push({ role: 'assistant', content: marker } as any);

              // Auto-Preview Directive for Simple Creative Requests
              if (wf.kind === 'simple_creative') {
                const directive = isArabicText(userTextForOverrides)
                  ? `[DIRECTIVE]: أنت الآن في وضع "الإنتاج السريع". ابدأ فوراً بكتابة الملفات (مثلاً index.html). بمجرد الانتهاء من إنشاء ملفات الموقع، يجب عليك استدعاء أداة \`dev_server_start\` لتشغيل المعاينة للمستخدم تلقائياً.`
                  : `[DIRECTIVE]: You are in "Rapid Production" mode. Start writing files (e.g., index.html) immediately. Once you finish creating the website files, you MUST call \`dev_server_start\` to trigger the live preview for the user automatically.`;
                history.push({ role: 'system', content: directive } as any);
              }

              // PHASE 2-3 INTEGRATION: Use ProjectPlanner for complex projects
              if (wf.analysis && wf.analysis.complexity && ['complex', 'very_complex'].includes(wf.analysis.complexity)) {
                try {
                  // Create execution plan
                  const { executeTool } = await import('../services/ToolService');
                  const planResult = await executeTool('project_planner', {
                    projectDescription: userTextForOverrides,
                    analysis: wf.analysis
                  }, { sessionId, workspaceId });

                  if (planResult.ok && planResult.output) {
                    const plan = planResult.output;
                    const projectId = `${sessionId}-${Date.now()}`;

                    // Initialize state manager
                    await executeTool('project_state_manager', {
                      action: 'init',
                      projectId,
                      state: {
                        projectName: plan.projectName,
                        totalPhases: plan.totalPhases,
                        pendingTasks: plan.phases?.flatMap((p: any) => p.tasks || []) || []
                      }
                    }, { sessionId, workspaceId });

                    // Store plan in history for reference
                    history.push({
                      role: 'assistant',
                      content: `PROJECT_PLAN:${projectId}:${JSON.stringify(plan)}`
                    } as any);

                    // Inform user about the plan
                    const planSummary = `📋 **خطة المشروع**: ${plan.projectName}\n` +
                      `- عدد المراحل: ${plan.totalPhases}\n` +
                      `- الوقت المقدر: ${plan.estimatedDuration}\n` +
                      `- المرحلة الأولى: ${plan.phases?.[0]?.name || 'غير محدد'}\n\n` +
                      `سأبدأ التنفيذ المرحلي الآن...`;
                    ev({ type: 'text', data: planSummary });
                  }
                } catch (planError) {
                  // Fallback to normal execution if planning fails
                  console.warn('[Integration] ProjectPlanner failed:', planError);
                }
              }

              try {

                await Message.create({ sessionId, role: 'assistant', content: marker, runId });

              } catch { }

              // Inject directive for the AI
              history.push({
                role: 'system',
                content: `BUILD DIRECTIVE: You are executing a workflow (${wf.kind}).
          Follow the plan shown above. Check history for completed steps.
          For scaffolding, use structure: {} and the system will inject the template.`
              } as any);
            }

            // Builder Mode: Start execution if the planner returned echo or empty
            if (!planName || planName === 'echo') {
              const textLower = userTextForOverrides.toLowerCase();

              // Handle "Access/Open GitHub" or generic website access requests
              const wantsAccess = /(ادخل|افتح|access|open|browse|visit|go to)\s+(الى\s+)?(github|جيت\s*هاب|جيتهاب|كتهاب)/i.test(userTextForOverrides);
              if (wantsAccess) {
                plan = { name: 'browser_open', input: { url: 'https://github.com' } } as any;
                planName = 'browser_open';
              } else if (/(ادخل|افتح|access|open|browse|visit|go to)\s+(الى\s+)?(google|جوجل)/i.test(userTextForOverrides)) {
                plan = { name: 'browser_open', input: { url: 'https://www.google.com' } } as any;
                planName = 'browser_open';
              } else if (/(ادخل|افتح|access|open|browse|visit|go to)\s+(الى\s+)?(youtube|يوتيوب)/i.test(userTextForOverrides)) {
                plan = { name: 'browser_open', input: { url: 'https://www.youtube.com' } } as any;
                planName = 'browser_open';
              } else if (/(list|سرد|قائمة)\s*(tools|الأدوات|الادوات)/i.test(userTextForOverrides)) {
                plan = { name: 'http_fetch', input: { url: 'http://localhost:' + (process.env.PORT || 3000) + '/tools' } } as any;
                planName = 'http_fetch';
              } else if (/(show|list|عرض|اعرض)\s*(files|الملفات)/i.test(userTextForOverrides) || /^ls$/.test(textLower)) {
                plan = { name: 'ls', input: { path: '.' } } as any;
                planName = 'ls';
              } else if (/(project|file)\s*(structure|tree|هيكل|شجرة)/i.test(userTextForOverrides)) {
                plan = { name: 'read_file_tree', input: { path: '.', depth: 3 } } as any;
                planName = 'read_file_tree';
              } else if (/(read|اقرأ|قراءة)\s*(file|ملف)\s+(.+)/i.test(userTextForOverrides)) {
                const m = userTextForOverrides.match(/(read|اقرأ|قراءة)\s*(file|ملف)\s+(.+)/i);
                if (m && m[3]) {
                  plan = { name: 'file_read', input: { filePath: m[3].trim() } } as any;
                  planName = 'file_read';
                }
              } else if (/(search|find|grep|ابحث|بحث)\s*(in code|code|الكود|في الكود)?\s*(for|عن)?\s*(.+)/i.test(userTextForOverrides)) {
                const m = userTextForOverrides.match(/(search|find|grep|ابحث|بحث)\s*(in code|code|الكود|في الكود)?\s*(for|عن)?\s*(.+)/i);
                if (m && m[4]) {
                  plan = { name: 'grep_search', input: { query: m[4].trim(), path: '.' } } as any;
                  planName = 'grep_search';
                }
              } else if (/(open|start|launch|افتح|شغل|ابدأ)\s*(the\s+)?(browser|متصفح|المتصفح)/i.test(userTextForOverrides)) {
                // Explicit browser open request
                plan = { name: 'browser_open', input: { url: 'https://www.google.com' } } as any;
                planName = 'browser_open';
              } else if (wf && steps === 0) {
                // Force first step of workflow if no other heuristic matched
                plan = { name: 'project_detect', input: { path: '.' } } as any;
                planName = 'project_detect';
              }
            }
          }

          if (String(plan?.name || '') === 'github_create_repo') {
            const wantsAccess = /(ادخل|افتح|access|open|browse|visit|go to)\s+(الى\s+)?(github|git\s*hub|جيت\s*هاب|جيتهاب|كت\s*هاب|كتهاب|كيت\s*هاب|كيتهاب)/i.test(userTextForOverrides);
            if (wantsAccess) {
              plan = { name: 'browser_open', input: { url: 'https://github.com' } } as any;
            } else if (!wantsGithubRepo && (!planName || planName === 'echo')) {
              plan = { name: 'echo', input: { text: isArabicText(userTextForOverrides) ? 'أقدر أساعدك. ماذا تريد أن أفعل؟' : 'How can I help?' } } as any;
            } else if (!requestedRepoName) {
              plan = { name: 'echo', input: { text: isArabicText(userTextForOverrides) ? 'أكيد. ما اسم المستودع الذي تريد إنشاؤه على GitHub؟' : 'Sure — what should the new GitHub repository be named?' } } as any;
              history.push({ role: 'assistant', content: 'ASKED_FOR_REPO_NAME' } as any);
              try {

                await Message.create({ sessionId, role: 'assistant', content: 'ASKED_FOR_REPO_NAME', runId });

              } catch { }
            }
          }
          if (isBrowserTool) {
            const reqSid = typeof browserSessionId === 'string' ? browserSessionId.trim() : '';
            const inputSid = String((plan as any)?.input?.sessionId || '').trim();
            const hasSid = !!(reqSid || inputSid);
            if (!hasSid) {
              const userText = String(text || '');
              if (isWeatherLikeQuery(userText)) {
                const city = extractWeatherCity(userText);
                plan = {
                  name: 'central_answer',
                  input: { question: isArabicText(userText) ? `كم درجة الحرارة الآن في ${city}؟` : `current temperature in ${city} now` },
                } as any;
              } else {
                const urlMatch = userText.match(/https?:\/\/[^\s"'<>]+/i);
                const urlFromUser = urlMatch?.[0];
                const urlFromInput = String((plan as any)?.input?.url || '').trim();
                const actions = Array.isArray((plan as any)?.input?.actions) ? (plan as any).input.actions : [];
                const goto = actions.find((a: any) => String(a?.type || '').toLowerCase() === 'goto' && typeof a?.url === 'string' && a.url.trim());
                const urlFromActions = goto ? String(goto.url).trim() : '';
                const wantsYoutube = /youtube|يوتيوب/i.test(userText);
                const wantsGithub = /(github|git\s*hub|جيت\s*هاب|جيتهاب|كت\s*هاب|كتهاب|كيت\s*هاب|كيتهاب)/i.test(userText);
                const desiredUrl =
                  (urlFromUser || urlFromInput || urlFromActions || '').trim() ||
                  (wantsYoutube
                    ? 'https://www.youtube.com'
                    : wantsGithub
                      ? 'https://github.com'
                      : isStrictSameSiteUiTask
                        ? 'https://xelitesolutions.com'
                        : 'https://www.google.com');

                if (planName !== 'browser_open') pendingPlan = plan as any;
                plan = { name: 'browser_open', input: { url: desiredUrl } } as any;
              }
            }
          }

          if (isStrictSameSiteUiTask) {
            if (!browserHostLock) updateBrowserLockFromOutput((lastResult as any)?.output);
            if (plan?.name === 'browser_run') {
              const rawActions = Array.isArray((plan as any)?.input?.actions) ? (plan as any).input.actions : [];
              const actions = rawActions.map((a: any) => {
                if (!a || typeof a !== 'object') return a;
                if (String(a.type || '').toLowerCase() === 'goto') {
                  const u = normalizeUrlForGoto(a.url);
                  return { ...a, url: u };
                }
                return a;
              });

              const hasDisallowed = actions.some((a: any) => {
                const t = String(a?.type || '').toLowerCase();
                if (t === 'searchgoogle') return true;
                if (t !== 'goto') return false;
                const u = normalizeUrlForGoto(a?.url);
                if (!u) return true;
                const targetHost = urlToHost(u);
                if (targetHost && /(^|\.)google\./i.test(targetHost)) return true;
                if (!browserHostLock) return false;
                if (!targetHost) return false;
                return !isSameSiteHost(targetHost, browserHostLock);
              });

              if (hasDisallowed) {
                const sid = typeof browserSessionId === 'string' ? browserSessionId.trim() : String((plan as any)?.input?.sessionId || '').trim();
                const origin = browserOriginLock || (browserHostLock ? `https://${browserHostLock}` : '');
                if (!sid) {
                  plan = { name: 'echo', input: { text: 'Cannot run browser actions: missing sessionId.' } } as any;
                } else if (!origin) {
                  plan = { name: 'browser_get_state', input: { sessionId: sid } } as any;
                } else {
                  const safeLoginUrl = new URL('/login', origin).toString();
                  const host = browserHostLock || urlToHost(origin);
                  const isXelite = /(^|\.)xelitesolutions\.com$/i.test(String(host || ''));
                  const fallbackActions = isXelite
                    ? [
                      { type: 'clickText', text: 'Start Now', exact: false, timeoutMs: 9000, attempts: 3 },
                      { type: 'waitForLoad', state: 'domcontentloaded' },
                      { type: 'goto', url: safeLoginUrl, waitUntil: 'domcontentloaded' },
                    ]
                    : [{ type: 'goto', url: safeLoginUrl, waitUntil: 'domcontentloaded' }];
                  plan = { name: 'browser_run', input: { sessionId: sid, actions: fallbackActions } } as any;
                }
              } else {
                (plan as any).input = { ...(plan as any).input, actions };
              }
            }
          }

          if (kind === 'agent' && String(plan?.name || '') === 'browser_open' && typeof browserSessionId === 'string' && browserSessionId.trim()) {
            const raw = String((plan as any)?.input?.url || '').trim();
            const url = normalizeUrlForGoto(raw);
            if (!url) {
              plan = { name: 'browser_get_state', input: { sessionId: browserSessionId.trim() } } as any;
            } else if (isStrictSameSiteUiTask && browserHostLock) {
              const host = urlToHost(url);
              if (host && !isSameSiteHost(host, browserHostLock)) {
                plan = { name: 'browser_get_state', input: { sessionId: browserSessionId.trim() } } as any;
              } else {
                plan = {
                  name: 'browser_run',
                  input: {
                    sessionId: browserSessionId.trim(),
                    actions: [{ type: 'goto', url, waitUntil: 'domcontentloaded' }],
                  },
                } as any;
              }
            } else {
              plan = {
                name: 'browser_run',
                input: {
                  sessionId: browserSessionId.trim(),
                  actions: [{ type: 'goto', url, waitUntil: 'domcontentloaded' }],
                },
              } as any;
            }
          }

          if (
            typeof browserSessionId === 'string' &&
            browserSessionId.trim() &&
            ['browser_run', 'browser_get_state', 'browser_extract'].includes(String(plan?.name || ''))
          ) {
            const input = (plan as any).input;
            if (!input || typeof input !== 'object') (plan as any).input = {};
            if (!(plan as any).input.sessionId) (plan as any).input.sessionId = browserSessionId.trim();
          }

          const isMultiStepBrowserInstruction = (s: string) => {
            const t = String(s || '');
            return /(\bthen\b|\bafter\b|\bnext\b|and then|, then|; then|ثم|وبعد|بعد( ذلك)?|بعدها|ومن ثم|عدة\s+خطوات|خطوات|خطوة|تابع|نفذ|قم\s+ب|رجاء|من\s+فضلك|ابحث|بحث|search|find|lookup|سجل\s*دخول|تسجيل\s*الدخول|login|sign\s*in|انقر|اضغط|click|type|اكتب|املأ|fill|submit|إرسال|scroll|مرر|extract|استخرج|لخص|summarize)/i.test(
              t,
            );
          };

          if (String(plan?.name || '') === 'browser_run') {
            const sid = String((plan as any)?.input?.sessionId || browserSessionId || '').trim();
            const rawActs = Array.isArray((plan as any)?.input?.actions) ? (plan as any).input.actions : [];
            const hasGoto = rawActs.some(
              (a: any) => String(a?.type || '').toLowerCase() === 'goto' && typeof a?.url === 'string' && a.url.trim(),
            );
            const instructionTextInPlan = String((plan as any)?.input?.instructionText || '').trim();
            const urlCandidate = (() => {
              const m1 = userTextForOverrides.match(/https?:\/\/[^\s"'<>]+/i);
              if (m1 && m1[0]) return m1[0].trim();
              const m2 = userTextForOverrides.match(
                /(?:^|\s)(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/[^\s"'<>]*)?/i,
              );
              if (m2 && m2[0]) return m2[0].trim();
              return '';
            })();
            const hasUrlInUserText = Boolean(urlCandidate);
            const openKeyword =
              /(open|start|launch|browse|visit|go to|ادخل|افتح|اذهب|زيارة|شغل|ابدأ|روح|زور|وديني|ودني|ودنا|خلني|خليني|بدي|عايز|عاوز|ابي|ابغى)/i.test(
                userTextForOverrides,
              );
            const browserKeyword = /(\b(browser|web|preview)\b|متصفح|المتصفح|داخل المتصفح|معاينة|المعاينة)/i.test(userTextForOverrides);
            const mentionsKnownSite =
              /(yahoo|ياهو|youtube|يوتيوب|github|git\s*hub|جيت\s*هاب|جيتهاب|قيتهب|كت\s*هاب|كتهاب|كيت\s*هاب|كيتهاب|google|جوجل|microsoft|مايكروسوفت|مايكروسوت|x\.com|\btwitter\b|تويتر|facebook|فيس\s*بوك|الفيس\s*بوك|linkedin|لينكد\s*ان|لينكدإن)/i.test(
                userTextForOverrides,
              );
            const looksLikeOpenIntent = Boolean(hasUrlInUserText || openKeyword || browserKeyword || mentionsKnownSite);

            if (sid && !instructionTextInPlan && rawActs.length === 0) {
              (plan as any).input = { sessionId: sid, instructionText: userTextForOverrides };
            } else if (sid && rawActs.length > 0 && !hasGoto && looksLikeOpenIntent) {
              const directUrl = urlCandidate;
              const wantsYahoo = /(yahoo|ياهو)/i.test(userTextForOverrides);
              const wantsYoutube = /youtube|يوتيوب/i.test(userTextForOverrides);
              const wantsGithub = /(github|git\s*hub|جيت\s*هاب|جيتهاب|قيتهب|كت\s*هاب|كتهاب|كيت\s*هاب|كيتهاب)/i.test(userTextForOverrides);
              const wantsGoogle = /google|جوجل/i.test(userTextForOverrides);
              const wantsMicrosoft = /(microsoft|مايكروسوفت|مايكروسوت)/i.test(userTextForOverrides);
              const wantsX = /(x\.com|\btwitter\b|تويتر)/i.test(userTextForOverrides);
              const wantsFacebook = /(facebook|فيس\s*بوك|الفيس\s*بوك)/i.test(userTextForOverrides);
              const wantsLinkedIn = /(linkedin|لينكد\s*ان|لينكدإن)/i.test(userTextForOverrides);
              const desiredUrlRaw =
                directUrl ||
                (wantsYahoo
                  ? 'https://www.yahoo.com'
                  : wantsYoutube
                    ? 'https://www.youtube.com'
                    : wantsGithub
                      ? 'https://github.com'
                      : wantsGoogle
                        ? 'https://www.google.com'
                        : wantsMicrosoft
                          ? 'https://www.microsoft.com'
                          : wantsX
                            ? 'https://x.com'
                            : wantsFacebook
                              ? 'https://www.facebook.com'
                              : wantsLinkedIn
                                ? 'https://www.linkedin.com'
                                : '');
              const url = normalizeUrlForGoto(desiredUrlRaw);
              if (url) {
                (plan as any).input = {
                  sessionId: sid,
                  actions: [{ type: 'goto', url, waitUntil: 'domcontentloaded' }, ...rawActs],
                };
              } else if (!instructionTextInPlan) {
                (plan as any).input = { sessionId: sid, instructionText: userTextForOverrides };
              }
            }

            const acts = Array.isArray((plan as any)?.input?.actions) ? (plan as any).input.actions : [];
            const onlyGoto =
              acts.length === 1 && String(acts[0]?.type || '').toLowerCase() === 'goto' && typeof acts[0]?.url === 'string' && acts[0].url.trim();
            if (onlyGoto && isMultiStepBrowserInstruction(userTextForOverrides)) {
              if (sid) (plan as any).input = { sessionId: sid, instructionText: userTextForOverrides };
            }
          }

          ev({ type: 'step_done', data: { name: `planning_step_${steps + 1}`, plan } });

          if (plan?.name === 'browser_run') {
            const acts = Array.isArray((plan as any).input?.actions) ? (plan as any).input.actions : [];
            let sensitive = false;
            let actionText = 'browser_run';
            for (const a of acts) {
              const t = String(a?.type || '').toLowerCase();
              if (t === 'uploadfile') sensitive = true;
              if (t === 'fillform') {
                const fields = Array.isArray(a?.fields) ? a.fields : [];
                for (const f of fields) {
                  const s = (String(f?.label || '') + ' ' + String(f?.selector || '')).toLowerCase();
                  if (/(password|card|cvv|iban|ssn|بطاقة|دفع|كلمة المرور|حساسية|حساب)/.test(s)) { sensitive = true; break; }
                }
              }
              if (t === 'click') {
                const s = (String(a?.roleName || '') + ' ' + String(a?.selector || '')).toLowerCase();
                if (/(delete|pay|submit|login|حذف|دفع|ارسال|تسجيل دخول)/.test(s)) sensitive = true;
              }
              if (sensitive) break;
            }
            if (sensitive) {
              const risk = 'high';
              const aRole = authRole;
              const { getSessionRunConfig } = await import('../services/secrets');
              const cfg = getSessionRunConfig(String(sessionId)) || ({} as any);
              const autoAll =
                aRole === 'OWNER' || cfg.autoApproveAll === true ? true : process.env.AUTO_APPROVE_ALL === '1';
              if (autoAll) {
                ev({
                  type: 'step_started',
                  data: { name: `execute:${plan?.name}`, input: redactToolInputForStorage(plan?.name || '', (plan as any)?.input) },
                });
                const result = await executeTool(plan?.name || '', (plan as any)?.input, { sessionId, workspaceId, onThought: (t) => ev({ type: 'thought', data: t }), onProgress: (p) => ev({ type: 'thought', data: `> ${p}` }) });
                const ignoredTools = ['ls', 'list_files', 'list_dir', 'grep_search', 'terminal_resize', 'terminal_input'];
                if (!ignoredTools.includes(String(plan?.name)) && result.ok && result.output) {
                  const answerText = typeof result.output === 'string' ? result.output : String(result.output.note || result.output.text || result.output.summary || '');
                  if (answerText) {
                    ev({ type: 'text', data: answerText });
                    assistantTextEmitted = true;
                  }
                }
                ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${plan?.name}`, result } });
                await Run.findByIdAndUpdate(runId, { $set: { status: result.ok ? 'done' : 'failed' } });
                ev({ type: 'run_finished', data: { runId, ok: result.ok } });
                return res.json({ ok: true, runId, result });
              }

              const ap = await Approval.create({ runId, action: actionText, risk, status: 'pending' });
              ev({ type: 'approval_required', data: { id: ap._id.toString(), runId, risk, action: actionText } });
              await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } });
              const { planContext } = await import('../approvals/context');
              planContext.set(ap._id.toString(), { runId, name: plan?.name || '', input: plan?.input });


              const envAutoSafe = process.env.AUTO_APPROVE_SAFE;
              const auto = cfg.autoApproveSafe === true ? true : envAutoSafe ? envAutoSafe === '1' : true;

              const safe = !/(high|critical)/i.test(String(risk));
              if (autoAll || (auto && safe)) {
                ev({ type: 'step_started', data: { name: `execute:${plan?.name}`, input: redactToolInputForStorage(plan?.name || '', plan?.input) } });
                const result = await executeTool(plan?.name || '', plan?.input, { sessionId, workspaceId, onThought: (t) => ev({ type: 'thought', data: t }), onProgress: (p) => ev({ type: 'thought', data: `> ${p}` }) });
                const ignoredTools = ['ls', 'list_files', 'list_dir', 'grep_search', 'terminal_resize', 'terminal_input'];
                if (!ignoredTools.includes(String(plan?.name)) && result.ok && result.output) {
                  const answerText = typeof result.output === 'string' ? result.output : String(result.output.note || result.output.text || result.output.summary || '');
                  if (answerText) {
                    ev({ type: 'text', data: answerText });
                    assistantTextEmitted = true;
                  }
                }
                ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${plan?.name}`, result } });
                await Run.findByIdAndUpdate(runId, { $set: { status: result.ok ? 'done' : 'failed' } });
                ev({ type: 'run_finished', data: { runId, ok: result.ok } });
                planContext.delete(ap._id.toString());
                if (!res.headersSent) {
                  return res.json({ ok: true, runId, result });
                }
                return;
              }
              if (!res.headersSent) {
                return res.json({ runId, blocked: true, approvalId: ap._id.toString() });
              }
              return;

            }
          }

          if (String(plan?.name || '') === 'git_ops') {
            const input = (plan as any).input;
            if (!input || typeof input !== 'object') (plan as any).input = {};
            if (!(plan as any).input.sessionId) (plan as any).input.sessionId = String(sessionId);
          }
          if (String(plan?.name || '') === 'payments_create_checkout_session') {
            const input = (plan as any).input;
            if (!input || typeof input !== 'object') (plan as any).input = {};
            if (!(plan as any).input.sessionId) (plan as any).input.sessionId = String(sessionId);
          }
          if (String(plan?.name || '') === 'http_fetch') {
            const input = (plan as any).input;
            if (!input || typeof input !== 'object') (plan as any).input = {};
            if (!(plan as any).input.sessionId) (plan as any).input.sessionId = String(sessionId);
          }

          // Intercept scaffold_project to inject templates if structure is missing/empty
          if (plan?.name === 'scaffold_project') {
            const inp = (plan.input as any) || {};
            if (!inp.structure || Object.keys(inp.structure).length === 0) {
              // Legacy template injection has been removed.
              // The agent must provide the structure explicitly or use 'scaffold' from Universal Registry.
              ev({ type: 'text', data: `ℹ️ Standard scaffold request (Legacy templates removed).` });
            }
          }

          if (String(plan?.name || '') === 'browser_run') {
            const bid = String((plan as any)?.input?.sessionId || browserSessionId || '').trim();
            const key = browserRunGuardKey(String(sessionId), bid, String(runId));
            const now0 = Date.now();
            const sigObj = (() => {
              const rawInput: any = (plan as any)?.input || {};
              return {
                instructionText: typeof rawInput?.instructionText === 'string' ? rawInput.instructionText : '',
                actions: Array.isArray(rawInput?.actions) ? rawInput.actions : null,
              };
            })();
            let sig = '';
            try {
              sig = JSON.stringify(sigObj);
            } catch {
              sig = String(sigObj?.instructionText || '');
            }

            const prev =
              browserRunGuard.get(key) ||
              ({
                totalCount: 0,
                lastAt: 0,
                lastSig: '',
                sigCount: 0,
              } as any);

            const since0 = prev.lastAt ? now0 - prev.lastAt : Number.POSITIVE_INFINITY;
            const nextSigCount = prev.lastSig && prev.lastSig === sig ? prev.sigCount + 1 : 1;
            const nextTotal = Number(prev.totalCount || 0) + 1;

            if (nextSigCount > 2 || nextTotal > BROWSER_RUN_MAX_PER_SESSION) {
              const msg = isArabicText(userTextForOverrides)
                ? `⚠️ تم تعليق عمليات المتصفح المتكررة لضمان استقرار الجلسة.\nالسبب: الوصول إلى الحد الأقصى للمحاولات (${BROWSER_RUN_MAX_PER_SESSION}).\nيمكنك إعادة صياغة الطلب أو المحاولة لاحقاً.`
                : `⚠️ Repeated browser operations suspended to ensure session stability.\nReason: Maximum retry limit reached (${BROWSER_RUN_MAX_PER_SESSION}).\nPlease refine your request or try again later.`;
              forcedText = msg;
              ev({ type: 'text', data: msg });
              assistantTextEmitted = true;
              break;
            }
            const isSameSig = Boolean(prev.lastSig && prev.lastSig === sig);
            if (isSameSig && Number.isFinite(since0) && since0 < BROWSER_RUN_MIN_INTERVAL_MS) {
              const waitMs = Math.max(1, BROWSER_RUN_MIN_INTERVAL_MS - since0);
              const waitSec = Math.max(1, Math.ceil(waitMs / 1000));
              const msg = isArabicText(userTextForOverrides)
                ? `🔄 جاري تنسيق الوصول إلى المتصفح... سأباشر التنفيذ تلقائياً خلال ${waitSec} ثانية.`
                : `🔄 Orchestrating browser access... Resuming execution automatically in ${waitSec}s.`;
              ev({ type: 'text', data: msg });
              await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
              if (isRunCancelled(runId)) {
                forcedText = '⛔ تم إيقاف التنفيذ.';
                lastResult = { ok: false, error: 'stopped' };
                break;
              }
            }
            const now = Date.now();
            browserRunGuard.set(key, { totalCount: nextTotal, lastAt: now, lastSig: sig, sigCount: nextSigCount });
          }

          if (isRunCancelled(runId)) {
            forcedText = '⛔ تم إيقاف التنفيذ.';
            lastResult = { ok: false, error: 'stopped' };
            break;
          }

          const persistedInput = redactToolInputForStorage(plan?.name || '', plan?.input);
          ev({ type: 'step_started', data: { name: `execute:${plan?.name}`, input: persistedInput } });
          // [ELITE FIX] Emit specific tool_start event for frontend auto-switching (Browser/Terminal)
          ev({ type: 'tool_start', tool: plan?.name || '', input: plan?.input });
          const callInput =
            userId && plan?.input && typeof plan.input === 'object' ? { ...(plan.input as any), userId: String(userId) } : plan?.input;
          const result = await executeToolWithRateLimitRetry(plan?.name || '', callInput, { sessionId, workspaceId }, {
            runId,
            maxRetries: 2,
            maxWaitMs: 70_000,
            onWait: (waitMs, retryAfterMs) => {
              const waitSec = Math.max(1, Math.ceil(waitMs / 1000));
              const msg = isArabicText(userTextForOverrides)
                ? `⚠️ تم تقييد تنفيذ الأداة مؤقتًا (rate_limited). سأعيد المحاولة تلقائياً بعد حوالي ${waitSec}s.`
                : `⚠️ Tool is rate-limited. I’ll auto-retry in about ${waitSec}s.`;
              const now = Date.now();
              const last = loopPauseThrottle.get(String(sessionId));
              if (!last || now - last > 6000) {
                ev({ type: 'text', data: msg });
                assistantTextEmitted = true;
                loopPauseThrottle.set(String(sessionId), now);
              }
            },
          });
          lastExecutedToolSig = `${String(plan?.name || '')}:${JSON.stringify((plan as any)?.input || {})}`;
          lastExecutedToolName = String(plan?.name || '');
          if (result?.ok && plan?.name === 'browser_open') {
            const sid = String(result?.output?.sessionId || '').trim();
            if (sid) {
              browserSessionId = sid;
              try {
                const { getSessionRunConfig, setSessionRunConfig } = await import('../services/secrets');
                const cur = getSessionRunConfig(String(sessionId)) || ({} as any);
                setSessionRunConfig(String(sessionId), {
                  provider: typeof cur.provider === 'string' ? cur.provider : undefined,
                  apiKey: typeof cur.apiKey === 'string' ? cur.apiKey : undefined,
                  baseUrl: typeof cur.baseUrl === 'string' ? cur.baseUrl : undefined,
                  model: typeof cur.model === 'string' ? cur.model : undefined,
                  kind: cur.kind === 'agent' ? 'agent' : cur.kind === 'chat' ? 'chat' : kind,
                  browserSessionId: sid,
                  autoApproveAll: Boolean(cur.autoApproveAll),
                  autoApproveSafe: Boolean(cur.autoApproveSafe),
                });
              } catch { }
            }
          }

          // Add result to history to prevent infinite loops
          const MAX_INLINE_CHARS = 1800;
          const truncate = (s: string, max = MAX_INLINE_CHARS) => (s.length > max ? `${s.slice(0, max)}…[truncated]` : s);
          const extractTitleFromHtml = (html: string) => {
            const m = html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
            const t = String(m?.[1] || '').replace(/\s+/g, ' ').trim();
            return t || '';
          };
          const normalizeDisplayUrl = (raw: any) => {
            let s = String(raw ?? '').trim();
            while (s.length >= 2) {
              const first = s[0];
              const last = s[s.length - 1];
              const wrap = (c: string) =>
                c === '`' || c === '"' || c === "'" || c === '“' || c === '”' || c === '‘' || c === '’';
              if (wrap(first) && wrap(last)) s = s.slice(1, -1).trim();
              else break;
            }
            s = s.replace(/[)\]`.,;:!?،؛؟]+$/g, '').trim();
            if (!s) return s;
            if (/^https?:\/\//i.test(s)) return s;
            if (/^\/\//.test(s)) return `https:${s}`;
            if (/^(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/|$)/i.test(s)) return `https://${s}`;
            return s;
          };
          const inferSiteLabel = (url: string, dom: string) => {
            const u = normalizeDisplayUrl(url);
            try {
              if (u) {
                const host = new URL(u).hostname.replace(/^www\./i, '');
                if (host) return host;
              }
            } catch { }
            const d = String(dom || '');
            if (/youtube\.com|ytd-app/i.test(d)) return 'youtube.com';
            if (/accounts\.google\.com/i.test(d)) return 'accounts.google.com';
            if (/github\.com/i.test(d)) return 'github.com';
            const title = extractTitleFromHtml(d);
            return title || 'page';
          };
          const summarizeBrowserOutput = (out: any) => {
            if (!out || typeof out !== 'object') return out;
            const isBrowserStateLike =
              typeof (out as any).url === 'string' ||
              typeof (out as any).pageUrl === 'string' ||
              typeof (out as any).dom === 'string' ||
              typeof (out as any).screenshot === 'string' ||
              typeof (out as any).screenshotHref === 'string';
            if (!isBrowserStateLike) return out;
            const urlRaw =
              typeof (out as any).url === 'string' ? (out as any).url : typeof (out as any).pageUrl === 'string' ? (out as any).pageUrl : '';
            const url = normalizeDisplayUrl(urlRaw);
            const dom = typeof (out as any).dom === 'string' ? (out as any).dom : '';
            const title = dom ? extractTitleFromHtml(dom) : '';
            const site = inferSiteLabel(url, dom);
            const domLen = dom ? dom.length : 0;
            const redactionEnabled = typeof (out as any).redactionEnabled === 'boolean' ? Boolean((out as any).redactionEnabled) : undefined;
            const u = String(url || '').toLowerCase();
            const domLower = String(dom || '').toLowerCase();
            const hasPasswordField = /type=["']password["']|name=["']password["']|passw(or)?d|passwd/i.test(domLower);
            const hasLoginFormSignal = /<form\b[\s\S]{0,4000}(type=["']password["']|name=["']password["'])/i.test(dom);
            const urlLooksLogin = /serviceLogin|\/login\b|\/signin\b|accounts\.google\.com/i.test(u);
            const domStrongLogin = /<title[^>]*>[\s\S]*?(sign in|login|تسجيل\s+الدخول)[\s\S]*?<\/title>/i.test(dom) || /ServiceLogin/i.test(dom);
            const loginLike = Boolean((urlLooksLogin && (hasPasswordField || hasLoginFormSignal)) || (domStrongLogin && hasPasswordField));
            const summary: any = { site };
            if (url) summary.url = url;
            if (title) summary.title = title;
            if (loginLike) summary.pageType = 'login';
            if (domLen) summary.domLength = domLen;
            if (typeof redactionEnabled === 'boolean') summary.redactionEnabled = redactionEnabled;
            return summary;
          };
          const sanitizeForInline = (toolName: string, obj: any) => {
            if (obj == null) return obj;
            const t = String(toolName || '');
            if (/^browser_/.test(t)) return summarizeBrowserOutput(obj);
            if (typeof obj === 'string') return truncate(obj);
            if (typeof obj === 'object') {
              try {
                const raw = JSON.stringify(obj);
                if (raw.length <= MAX_INLINE_CHARS) return obj;
                return truncate(raw);
              } catch {
                return '[Result too large or circular]';
              }
            }
            return obj;
          };
          const safeOutput = (toolName: string, obj: any) => {
            try {
              return JSON.stringify(sanitizeForInline(toolName, obj));
            } catch {
              return '"[Result too large or circular]"';
            }
          };

          history.push({
            role: 'assistant',
            content: `Tool Call: ${plan?.name}\nInput: ${safeOutput(plan?.name || '', persistedInput)}\nOutput: ${safeOutput(plan?.name || '', result.output || result.error || 'Done')}`
          });

          // [FIX 3] Preserve file context for multi-turn conversations
          // If there are attached files/images, remind the LLM about them
          if (steps === 0 && (contentParts.length > 0 || attachedText.trim().length > 100)) {
            const fileContextSummary = attachedText.trim().length > 100
              ? attachedText.slice(0, 500) + '...[محتوى مختصر]'
              : attachedText;
            const imageCount = contentParts.filter((p: any) => p.type === 'image_url').length;

            let contextReminder = '[📎 سياق الملفات المرفقة]:\n';
            if (imageCount > 0) {
              contextReminder += `- ${imageCount} صورة/صور مرفقة\n`;
            }
            if (fileContextSummary.trim()) {
              contextReminder += `- محتوى الملف:\n${fileContextSummary}\n`;
            }

            history.push({
              role: 'system',
              content: contextReminder
            });
            console.info('[Run/Context] Injected file context reminder into history');
          }

          lastResult = result;
          if (result?.ok && /^browser_/.test(String(plan?.name || ''))) {
            updateBrowserLockFromOutput((result as any)?.output);
          }


          if (result.logs?.length) {
            for (const line of result.logs) {
              ev({ type: 'evidence_added', data: { kind: 'log', text: line } });
            }
          }

          // Emit artifacts if any
          if (result.artifacts && Array.isArray(result.artifacts)) {
            const suppressChatArtifacts = /^browser_/.test(String(plan?.name || ''));
            for (const art of result.artifacts) {
              if (suppressChatArtifacts) continue;
              ev({ type: 'artifact_created', data: art });

              try { await Artifact.create({ runId, name: String(art.name || 'artifact'), href: String(art.href || '') }); } catch { }

            }
          }

          const eventResult =
            /^browser_/.test(String(plan?.name || '')) && result && typeof result === 'object'
              ? { ...result, output: summarizeBrowserOutput((result as any).output) }
              : result;
          ev({ type: result.ok ? 'step_done' : 'step_failed', data: { name: `execute:${plan?.name}`, result: eventResult } });

          if (String(plan?.name || '') === 'browser_run') {
            lastBrowserRunSummary = String((result as any)?.output?.summary || '').trim();
            lastBrowserRunPageUrl = String((result as any)?.output?.pageUrl || '').trim();
          }
          if (String(plan?.name || '') === 'browser_open') {
            lastBrowserRunSummary = '';
            lastBrowserRunPageUrl = '';
          }

          if (!result.ok && String(plan?.name || '') === 'browser_run') {
            const err = String((result as any)?.error || '').trim();
            if (err === 'timeout') {
              const msg = isArabicText(userTextForOverrides)
                ? `⚠️ انتهت مهلة تنفيذ خطوة في المتصفح (timeout).\nلن أعيد المحاولة تلقائياً لتجنّب حلقة.\nأعد إرسال الأمر إذا كنت تريد المحاولة مرة أخرى.`
                : `⚠️ A browser step timed out.\nI won’t auto-retry to avoid a loop.\nRe-run the command if you want to try again.`;
              forcedText = msg;
              ev({ type: 'text', data: msg });
              assistantTextEmitted = true;
              break;
            }
            if (err === 'browser_unavailable' || err === 'worker_unhealthy') {
              try {
                const bid = String((plan as any)?.input?.sessionId || browserSessionId || '').trim();
                const key = browserRunGuardKey(String(sessionId), bid, String(runId));
                browserRunGuard.delete(key);
              } catch { }
              const code = String((result as any)?.detail?.code || '').trim();
              const detailMsg = String((result as any)?.detail?.message || '').trim();
              const hint = (() => {
                const c = (code || '').toLowerCase();
                const m = (detailMsg || '').toLowerCase();
                if (c === 'display_missing' || /xvfb|display|cannot open display/i.test(m)) {
                  return isArabicText(userTextForOverrides)
                    ? 'على الخادم: شغّل Playwright بوضع headed عبر Xvfb (مثال: xvfb-run) أو فعّل headless.'
                    : 'On the server: run headed Playwright under Xvfb (e.g. xvfb-run) or enable headless.';
                }
                if (c === 'chromium_missing' || /playwright install|executable doesn't exist/i.test(m)) {
                  return isArabicText(userTextForOverrides)
                    ? 'ثبّت متصفحات Playwright على الخادم (مثال: npx playwright install --with-deps).'
                    : 'Install Playwright browsers on the server (e.g. npx playwright install --with-deps).';
                }
                if (c === 'deps_missing' || /gtk|nss|gbm|fontconfig|glibc/i.test(m)) {
                  return isArabicText(userTextForOverrides)
                    ? 'نقص مكتبات نظام لتشغيل Chromium. ثبّت الاعتماديات المطلوبة (Playwright --with-deps).'
                    : 'Missing system deps for Chromium. Install Playwright dependencies (--with-deps).';
                }
                if (c === 'sandbox_blocked' || /no-sandbox|setuid/i.test(m)) {
                  return isArabicText(userTextForOverrides)
                    ? 'السندبوكس مرفوض. جرّب تفعيل BROWSER_NO_SANDBOX=1 على الخادم.'
                    : 'Sandbox blocked. Try setting BROWSER_NO_SANDBOX=1 on the server.';
                }
                return isArabicText(userTextForOverrides)
                  ? 'تحقق من خدمة المتصفح/Playwright على الخادم ثم أعد المحاولة.'
                  : 'Check the browser/Playwright worker on the server and retry.';
              })();
              const msg = isArabicText(userTextForOverrides)
                ? `⚠️ خدمة المتصفح غير متاحة حالياً.\n${code ? `- السبب: ${code}\n` : ''}${hint}`
                : `⚠️ Browser service is currently unavailable.\n${code ? `- reason: ${code}\n` : ''}${hint}`;
              forcedText = msg;
              ev({ type: 'text', data: msg });
              assistantTextEmitted = true;
              break;
            }
            const missingSecrets = Array.isArray((result as any)?.missingSecrets) ? ((result as any).missingSecrets as any[]).map((x) => String(x || '').trim()).filter(Boolean) : [];
            if (err === 'missing_secrets' || err.startsWith('missing_secrets') || missingSecrets.length) {
              try {
                const bid = String((plan as any)?.input?.sessionId || browserSessionId || '').trim();
                const key = browserRunGuardKey(String(sessionId), bid, String(runId));
                browserRunGuard.delete(key);
              } catch { }
              const keysLine = missingSecrets.length ? `\n- الأسرار المطلوبة: ${missingSecrets.join(', ')}` : '';
              const msg = isArabicText(userTextForOverrides)
                ? `⚠️ لا يمكن إكمال خطوة المتصفح لأن هناك بيانات دخول/أسرار ناقصة.${keysLine}\nأدخل الأسرار المطلوبة من نافذة التوكن أو اكتب بيانات الدخول (الإيميل/كلمة المرور) داخل رسالتك ثم أعد إرسال نفس الأمر.`
                : `⚠️ Browser step needs missing secrets.${keysLine}\nProvide the required secrets or include credentials in your message, then re-run the same command.`;
              forcedText = msg;
              ev({ type: 'text', data: msg });
              assistantTextEmitted = true;
              break;
            }
            const terminal =
              err === 'plan_to_actions_empty' ||
              err === 'compiler_failed' ||
              err === 'unsupported_action' ||
              err === 'infinite_retry_blocked' ||
              err === 'sessionId_required';
            if (terminal) {
              const msg = isArabicText(userTextForOverrides)
                ? `❌ تعذّر تنفيذ خطوات المتصفح.\nالسبب: ${err}\nأعد صياغة الطلب أو فعّل وضع التصحيح لرؤية الخطة والإجراءات.`
                : `❌ I couldn’t compile executable browser steps.\nReason: ${err}\nPlease rephrase the instruction or enable debug to see the compiled plan/actions.`;
              forcedText = msg;
              ev({ type: 'text', data: msg });
              assistantTextEmitted = true;
              break;
            }

            const summary = String((result as any)?.output?.summary || '').trim();
            const url = String((result as any)?.output?.pageUrl || '').trim();
            const msg = isArabicText(userTextForOverrides)
              ? `${summary ? summary : `❌ فشل تنفيذ مهمة المتصفح. السبب: ${err || 'unknown'}`}${url ? `\n- الرابط الحالي: ${url}` : ''}\nأعد إرسال الأمر بعد تصحيح البيانات أو أعطني رابط صفحة تسجيل الدخول مباشرة.`
              : `${summary ? summary : `❌ Browser task failed. Reason: ${err || 'unknown'}`}${url ? `\n- Current URL: ${url}` : ''}\nRe-run after fixing credentials or provide the login page URL directly.`;
            forcedText = msg;
            ev({ type: 'text', data: msg });
            assistantTextEmitted = true;
            break;
          }

          if (!result.ok && isStrictSameSiteUiTask && /^browser_/.test(String(plan?.name || '')) && isCrossSiteBlockedError(result.error)) {
            const lock = browserHostLock ? `\n- Locked site: ${browserHostLock}` : '';
            const msg = isArabicText(userTextForOverrides)
              ? `⚠️ تم منع محاولة الانتقال خارج نفس الموقع أثناء وضع STRICT_SAME_SITE_UI.\nلن أحاول جوجل/بحث/روابط خارجية تلقائياً.${lock}\n\nوجّهني بما تريد على نفس الصفحة (مثال: \"اضغط Start Now\" أو \"اذهب إلى /login\").`
              : `⚠️ Navigation was blocked by same-site policy in STRICT_SAME_SITE_UI.\nI won’t auto-switch to Google/search/external sites.${lock}\n\nTell me what to do on the current page (e.g. “click Start Now” or “go to /login”).`;
            forcedText = msg;
            ev({ type: 'text', data: msg });
            assistantTextEmitted = true;
            break;
          }

          if (result.ok && String(plan?.name || '') === 'browser_get_state' && endAfterBrowserState) {
            const url = String((result as any)?.output?.url || '').trim() || lastBrowserRunPageUrl;
            const msg = isSimpleBrowserOpenRequest
              ? isArabicText(initialUserTextForOpen)
                ? `تم فتح ${simpleBrowserOpenLabel || 'الموقع'} في المتصفح.`
                : `Opened ${simpleBrowserOpenLabel || 'the site'} in the browser.`
              : isArabicText(userTextForOverrides)
                ? `${lastBrowserRunSummary ? lastBrowserRunSummary : 'تم تنفيذ خطوات المتصفح.'}${url ? `\n- الرابط الحالي: ${url}` : ''}`
                : `${lastBrowserRunSummary ? lastBrowserRunSummary : 'Browser steps completed.'}${url ? `\n- Current URL: ${url}` : ''}`;
            endAfterBrowserState = false;
            pendingPlan = { name: 'echo', input: { text: msg } } as any;
          }
          if (result.ok && plan?.name === 'web_search' && pendingBrowserOpenFromSearch) {
            const url = pickTopUrlFromSearch((result as any)?.output);
            const target = pendingBrowserOpenFromSearch.target;
            pendingBrowserOpenFromSearch = null;
            if (url) {
              simpleBrowserOpenLabel = target || simpleBrowserOpenLabel || 'الموقع';
              pendingPlan = { name: 'browser_open', input: { url } } as any;
              endAfterBrowserState = true;
            } else {
              const q = String(target || '').trim();
              const searchUrl = q ? `https://www.google.com/search?q=${encodeURIComponent(q)}` : 'https://www.google.com';
              simpleBrowserOpenLabel = q || simpleBrowserOpenLabel || 'الموقع';
              pendingPlan = { name: 'browser_open', input: { url: searchUrl } } as any;
              endAfterBrowserState = true;
            }
          }
          if (plannerUnavailableMode && result.ok && plan?.name === 'web_search' && !pendingPlan) {
            const msg = formatWebSearchResultsText(String((plan as any)?.input?.query || '').trim(), (result as any)?.output, isArabicText(userTextForOverrides));
            forcedText = msg;
            ev({ type: 'text', data: msg });
            assistantTextEmitted = true;
            break;
          }
          // After browser actions, capture page state for accurate reading/sync
          if (result.ok && (String(plan?.name || '') === 'browser_open' || String(plan?.name || '') === 'browser_run')) {
            const sidNext = typeof browserSessionId === 'string' ? browserSessionId.trim() : '';
            if (sidNext && !pendingPlan) pendingPlan = { name: 'browser_get_state', input: { sessionId: sidNext } } as any;
            if (browserIntentThisTurn && (kind === 'agent' || isSimpleBrowserOpenRequest)) endAfterBrowserState = true;
          }
          // Auto post-scaffold steps: install and build
          if (result.ok && String(plan?.name || '') === 'scaffold_full_stack') {
            const rootCreated = String((result as any)?.output?.path || '').trim();
            if (rootCreated && !postScaffoldScheduled) {
              pendingPlan = { name: 'npm_install', input: { cwd: rootCreated } } as any;
              postScaffoldScheduled = true;
            }
          } else if (result.ok && String(plan?.name || '') === 'npm_install') {
            const cwd = String((plan as any)?.input?.cwd || '').trim();
            if (cwd && !postInstallScheduled) {
              pendingPlan = { name: 'npm_build', input: { cwd } } as any;
              postInstallScheduled = true;
            }
          } else if (result.ok && String(plan?.name || '') === 'npm_build') {
            const cwd = String((plan as any)?.input?.cwd || '').trim();
            if (cwd && !postDevScheduled) {
              pendingPlan = { name: 'dev_server_start', input: { cwd } } as any;
              postDevScheduled = true;
            }
          } else if (result.ok && String(plan?.name || '') === 'dev_server_start') {
            const internalUrl = String((result as any)?.output?.previewUrl || '').trim();
            const userUrl = String((result as any)?.output?.userPreviewUrl || internalUrl).trim();

            if (internalUrl && !postPreviewScheduled) {
              pendingPlan = { name: 'browser_open', input: { url: internalUrl } } as any;
              postPreviewScheduled = true;

              // Emit a helpful message with the USER-accessible URL immediately
              ev({
                type: 'text',
                data: isArabicText(userTextForOverrides)
                  ? `🚀 **خادم المعاينة يعمل!**\nيمكنك فتحه في متصفحك: [${userUrl}](${userUrl})`
                  : `🚀 **Preview Server is Running!**\nYou can open it in your browser: [${userUrl}](${userUrl})`
              });
            }
          }

          // Stop on fatal errors (403, verification, etc.)
          if (!result.ok && plan?.name === 'image_generate') {
            const errorMsg = String(result.error || '');
            const logsStr = (result.logs || []).join('\n');
            if (errorMsg.includes('403') || errorMsg.includes('verification') || logsStr.includes('error=403')) {
              const msg = `❌ **Image Generation Failed**\n${errorMsg}\n\nPlease verify your OpenAI organization settings or try a different prompt.`;
              forcedText = msg;
              ev({ type: 'text', data: msg });
              assistantTextEmitted = true;
              break;
            }
          }

          if (result.ok && plan?.name === 'project_detect') {
            const out = result.output as any;
            // Smart Context: If we found Node projects, try to read the root package.json immediately
            // to give the AI context about dependencies without wasting a turn.
            if (out && Array.isArray(out.nodeProjects) && out.nodeProjects.length > 0) {
              const rootNode = out.nodeProjects[0]; // Usually the first one is relevant
              const pkgPath = `${rootNode}/package.json`;
              // Execute file_read silently and inject into history
              console.log(`[Smart Context] Auto-reading ${pkgPath}`);
              const subResult = await executeTool('file_read', { filePath: pkgPath }, { sessionId, workspaceId });
              if (subResult.ok) {
                ev({ type: 'evidence_added', data: { kind: 'log', text: `[Auto-Read] Read ${pkgPath} for context.` } });
                history.push({
                  role: 'assistant',
                  content: `Tool Call: file_read\nInput: {"filePath":"${pkgPath}"}\nOutput: ${safeOutput('file_read', subResult.output)}`
                });
              }
            } else if (isEmptyProjectDetectOutput(out) && !historyHasMarker(history as any, 'PROJECT_DETECT_EMPTY')) {
              history.push({ role: 'assistant', content: 'PROJECT_DETECT_EMPTY' } as any);
              try {

                await Message.create({ sessionId, role: 'assistant', content: 'PROJECT_DETECT_EMPTY', runId });

              } catch { }

              if (!pendingPlan) {
                pendingPlan = { name: 'analyze_codebase', input: { path: '.' } } as any;
              }
            }
          }

          if (!result.ok && plan?.name === 'file_read') {
            const err = String(result.error || '');
            if (err.includes('ENOENT') || err.includes('not found')) {
              // Auto-Correction: File not found? List the directory to help user see what's there.
              const fpath = String(plan?.input?.filePath || '.');
              const dir = fpath.includes('/') ? fpath.split('/').slice(0, -1).join('/') || '.' : '.';
              console.log(`[Auto-Correction] file_read failed for ${fpath}. Listing ${dir}`);
              const subResult = await executeTool('ls', { path: dir }, { sessionId, workspaceId });
              if (subResult.ok) {
                ev({ type: 'text', data: `⚠️ لم أجد الملف "${fpath}". إليك محتويات المجلد "${dir}" للمساعدة:` });
                ev({ type: 'evidence_added', data: { kind: 'log', text: `[Auto-Correction] ls ${dir}: ${JSON.stringify(subResult.output)}` } });
                history.push({
                  role: 'assistant',
                  content: `Tool Call: ls\nInput: {"path":"${dir}"}\nOutput: ${safeOutput('ls', subResult.output)}`
                });
              }
            }
          }

          if (result.ok && plan?.name === 'echo') {
            const text = result.output?.text;
            if (text) {
              const s = String(text).trim();
              forcedText = s;
              ev({ type: 'text', data: s });
              assistantTextEmitted = true;
              if (s && !/^\(system\)/i.test(s)) break;
            }
          }

          if (result.ok && plan?.name === 'image_generate') {
            const href = result.output?.href;
            if (href) {
              // Do not emit markdown image to avoid duplication. The UI handles artifact_created event.
              forcedText = `🎨 Image generated successfully.`;
              ev({ type: 'text', data: forcedText });
              assistantTextEmitted = true;
              break;
            }
          }

          // Emit a user-visible confirmation when a file is created
          if (result.ok && plan?.name === 'file_write') {
            const href = result.output?.href;
            const fname = String(plan?.input?.filename || '').trim();
            const msgParts: string[] = [];
            msgParts.push(`### تم إنشاء ملف`);
            if (fname) msgParts.push(`- الاسم: ${fname}`);
            if (href) msgParts.push(`- رابط المعاينة: ${href}`);
            const msg = msgParts.join('\n');
            forcedText = msg;
            ev({ type: 'text', data: msg });
            assistantTextEmitted = true;
            break;
          }

          const wfForProgress = detectWorkflow(String(text || ''));
          if (result.ok && wfForProgress) {
            if (plan?.name === 'project_detect') ev({ type: 'text', data: `- تم فحص المشروع (project_detect)` });
            if (plan?.name === 'analyze_codebase') ev({ type: 'text', data: `- تم تحليل هيكل الملفات (analyze_codebase)` });
            if (plan?.name === 'command_policy_check') ev({ type: 'text', data: `- تم فحص سياسة الأوامر (command_policy_check)` });
            if (plan?.name === 'grep_search') ev({ type: 'text', data: `- تم البحث في الكود (grep_search)` });
            if (plan?.name === 'file_edit') ev({ type: 'text', data: `- تم تعديل ملف (file_edit)` });
            if (plan?.name === 'scaffold_project') {
              const created = Array.isArray(result.output?.created) ? result.output.created : [];
              const label =
                wfForProgress.kind === 'ecommerce'
                  ? 'المتجر'
                  : wfForProgress.kind === 'static_site'
                    ? 'الموقع'
                    : wfForProgress.kind === 'node_api'
                      ? 'الـ API'
                      : wfForProgress.kind === 'fullstack'
                        ? 'التطبيق'
                        : 'المشروع';
              ev({ type: 'text', data: `- تم إنشاء هيكل ${label} (scaffold_project): ${created.length} عنصر` });
            }
            if (plan?.name === 'npm_install') ev({ type: 'text', data: `- تم تثبيت الحزم (npm_install)` });
            if (plan?.name === 'quality_run') {
              const results = Array.isArray(result.output?.results) ? result.output.results : [];
              const ok = results.filter((r: any) => r && r.ok).length;
              const skipped = results.filter((r: any) => r && r.skipped).length;
              ev({ type: 'text', data: `- تم تشغيل فحوص الجودة (quality_run): ناجح ${ok} / متجاوز ${skipped}` });
            }
          }

          if (result.ok && plan?.name === 'http_fetch') {
            try {
              const urlStr = String(plan?.input?.url || '');
              const u = new URL(urlStr);
              // Tools listing formatting
              if (u.pathname === '/tools') {
                const j = (result as any)?.output?.json || null;
                const total = Number(j?.count || 0);
                const real = Number(j?.realCount || 0);
                const noop = Number(j?.noopCount || 0);
                const names = Array.isArray(j?.tools) ? j.tools.slice(0, 10).map((t: any) => String(t?.name || '')).filter(Boolean) : [];
                const md = [
                  `### سرد الأدوات`,
                  `- العدد الكلي: ${total}`,
                  `- الفعلية: ${real}`,
                  `- الوهمية (noop): ${noop}`,
                  names.length ? `- أمثلة: ${names.join(', ')}` : ''
                ].filter(Boolean).join('\n');
                forcedText = md;
                ev({ type: 'text', data: md });
                assistantTextEmitted = true;
              }
              let base = (u.searchParams.get('base') || '').toUpperCase();
              let sym = (u.searchParams.get('symbols') || u.searchParams.get('sym') || '').toUpperCase();
              if (!base) {
                const m = u.pathname.match(/\/latest\/([A-Z]{3,4})/i);
                if (m) base = m[1].toUpperCase();
              }
              if (!sym && typeof plan?.input?.sym === 'string') {
                sym = String(plan?.input?.sym).toUpperCase();
              }
              if (!base && typeof plan?.input?.base === 'string') {
                base = String(plan?.input?.base).toUpperCase();
              }
              const rates = result.output?.json?.rates || {};
              let rate: number | null = null;
              if (sym && typeof rates[sym] === 'number') {
                rate = rates[sym];
              } else if (typeof result.output?.bodySnippet === 'string') {
                const m = result.output.bodySnippet.match(new RegExp(`"${sym}"\\s*:\\s*([\\d.]+)`));
                if (m) rate = Number(m[1]);
              }
              if (rate !== null && base && sym) {
                const md = [
                  `### سعر العملة`,
                  `- العملة الأساسية: ${base}`,
                  `- العملة المقابلة: ${sym}`,
                  `- السعر اليوم: ${Number(rate).toFixed(4)} ${sym}`
                ].join('\n');
                forcedText = md;
                ev({ type: 'text', data: md });
                assistantTextEmitted = true;
              } else if (base && sym) {
                const fbUrl = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
                ev({ type: 'step_started', data: { name: `execute:http_fetch(fallback)` } });
                const fbRes = await executeTool('http_fetch', { url: fbUrl }, { sessionId, workspaceId });
                ev({ type: fbRes.ok ? 'step_done' : 'step_failed', data: { name: `execute:http_fetch(fallback)`, result: fbRes } });
                let rate2: number | null = null;
                if (typeof fbRes.output?.json?.rates?.[sym] === 'number') {
                  rate2 = fbRes.output.json.rates[sym];
                } else if (typeof fbRes.output?.bodySnippet === 'string') {
                  const m2 = fbRes.output.bodySnippet.match(new RegExp(`"${sym}"\\s*:\\s*([\\d.]+)`));
                  if (m2) rate2 = Number(m2[1]);
                }
                if (rate2 !== null) {
                  const md2 = [
                    `### سعر العملة`,
                    `- العملة الأساسية: ${base}`,
                    `- العملة المقابلة: ${sym}`,
                    `- السعر اليوم: ${Number(rate2).toFixed(4)} ${sym}`
                  ].join('\n');
                  forcedText = md2;
                  ev({ type: 'text', data: md2 });
                  assistantTextEmitted = true;
                }

                if (!offlineMode) {
                  await ToolExecution.create({ runId, name: 'http_fetch', input: { url: fbUrl }, output: fbRes.output, ok: fbRes.ok, logs: fbRes.logs });
                }

              }
              if (u.hostname.includes('wttr.in')) {
                const city = String(plan?.input?.city || 'Istanbul');
                const cc = Array.isArray(result.output?.json?.current_condition) ? result.output.json.current_condition[0] : null;
                const tempC = cc ? Number(cc.temp_C) : null;
                const desc = cc && Array.isArray(cc.weatherDesc) && cc.weatherDesc[0] ? String(cc.weatherDesc[0].value || '') : '';
                const hum = cc && typeof cc.humidity !== 'undefined' ? Number(cc.humidity) : null;
                if (tempC !== null && !Number.isNaN(tempC)) {
                  const parts = [
                    `### الطقس`,
                    `- المدينة: ${city}`,
                    `- درجة الحرارة: ${tempC.toFixed(0)}°C`
                  ];
                  if (desc) parts.push(`- الحالة: ${desc}`);
                  if (hum !== null && !Number.isNaN(hum)) parts.push(`- الرطوبة: ${hum}%`);
                  const mdw = parts.join('\n');
                  forcedText = mdw;
                  ev({ type: 'text', data: mdw });
                  assistantTextEmitted = true;
                }
              }

              if (/(ipapi\.co|ipinfo\.io|ip-api\.com)/i.test(u.hostname)) {
                let lat: number | null = null;
                let lon: number | null = null;

                const j = (result as any)?.output?.json || {};
                if (typeof j?.latitude === 'number' && typeof j?.longitude === 'number') {
                  lat = j.latitude; lon = j.longitude;
                } else if (typeof j?.lat === 'number' && typeof j?.lon === 'number') {
                  lat = j.lat; lon = j.lon;
                } else if (typeof j?.loc === 'string' && j.loc.includes(',')) {
                  const parts = j.loc.split(',').map((x: string) => Number(x.trim()));
                  if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
                    lat = parts[0]; lon = parts[1];
                  }
                }

                if (lat !== null && lon !== null) {
                  const mdLoc = [
                    `### الإحداثيات التقريبية`,
                    `- خط العرض (Latitude): ${lat.toFixed(6)}`,
                    `- خط الطول (Longitude): ${lon.toFixed(6)}`,
                    `- المصدر: مزود تحديد الموقع عبر عنوان IP (تقريبي)`
                  ].join('\n');
                  forcedText = mdLoc;
                  ev({ type: 'text', data: mdLoc });
                  assistantTextEmitted = true;
                } else {
                  const status = Number((result as any)?.output?.status);
                  const host = String(u.hostname || '').toLowerCase();
                  const tryIpinfo = () => {
                    const nextUrl = 'https://ipinfo.io/json';
                    const sig = `http_fetch:${nextUrl}`;
                    if (!executedToolSigs.has(sig)) {
                      pendingPlan = { name: 'http_fetch', input: { url: nextUrl } } as any;
                      executedToolSigs.add(sig);
                    }
                  };
                  const tryIpApi = () => {
                    const nextUrl = 'http://ip-api.com/json';
                    const sig = `http_fetch:${nextUrl}`;
                    if (!executedToolSigs.has(sig)) {
                      pendingPlan = { name: 'http_fetch', input: { url: nextUrl } } as any;
                      executedToolSigs.add(sig);
                    }
                  };
                  if (host.includes('ipapi.co')) {
                    if (status === 429) {
                      tryIpinfo();
                    } else {
                      tryIpinfo();
                    }
                  } else if (host.includes('ipinfo.io')) {
                    tryIpApi();
                  } else if (host.includes('ip-api.com')) {
                    tryIpinfo();
                  }
                }
              }
            } catch { }
          }
          if (result.ok && plan?.name === 'web_search') {
            try {
              const results = Array.isArray(result.output?.results) ? result.output.results : [];
              const top = results && results[0] ? results[0] : null;
              const title = top ? String(top.title || '').trim() : '';
              const url = top ? String(top.url || '').trim() : '';
              if (title || url) {
                ev({ type: 'evidence_added', data: { kind: 'search', text: `${title}${title && url ? ' — ' : ''}${url}` } });
              }
            } catch { }
          }
          if (result.ok && plan?.name === 'html_extract') {
            try {
              const title = String(result.output?.title || '').trim();
              const url = String(plan?.input?.url || '').trim();
              if (title || url) {
                ev({ type: 'evidence_added', data: { kind: 'page', text: `${title}${title && url ? ' — ' : ''}${url}` } });
              }
            } catch { }
          }


          if (!offlineMode) {
            await ToolExecution.create({ runId, sessionId, name: plan?.name || 'unknown', input: persistedInput, output: result.output, ok: result.ok, logs: result.logs });
          }


          if (result.ok && plan?.name === 'central_answer') {
            const ans = String(result.output?.answer || '').trim();
            if (ans) {
              forcedText = ans;
              ev({ type: 'text', data: ans });
              assistantTextEmitted = true;
              break;
            }
          }

          if (result.ok && String(plan?.name || '') === 'http_fetch') {
            const status = Number((result as any)?.output?.status);
            if (status === 401 || status === 403) {
              const urlStr = String((plan as any)?.input?.url || '').trim();
              const msg = [
                `⚠️ الوصول لهذا الرابط يحتاج تسجيل دخول أو توكن.`,
                urlStr ? `- الرابط: ${urlStr}` : ``,
                `- أدخل Bearer Token في نافذة التوكن وأرسله.`,
                `- سيتم حفظ التوكن بشكل آمن لهذا الحساب ولن يظهر في المحادثة.`,
              ].filter(Boolean).join('\n');

              ev({ type: 'text', data: msg });
              ev({
                type: 'secret_required',
                data: {
                  sessionId,
                  runId,
                  provider: 'generic',
                  key: 'HTTP_BEARER_TOKEN',
                  label: 'Bearer Token',
                  reason: `HTTP ${status}`,
                },
              });

              const { setPendingTool } = await import('../services/secrets');
              setPendingTool(String(sessionId), { runId, name: String(plan?.name || ''), input: plan?.input });


              try { await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } }); } catch { }


              return res.json({
                runId,
                sessionId,
                blocked: true,
                secretRequired: true,
                secret: { provider: 'generic', key: 'HTTP_BEARER_TOKEN', label: 'Bearer Token' },
              });
            }
          }

          if (!result.ok) {
            let errorMsg = String(result.error || '');
            if ((result as any).detail) {
              try {
                const det = (result as any).detail;
                errorMsg += `\nDetail: ${typeof det === 'object' ? JSON.stringify(det) : String(det)}`;
              } catch { }
            }
            if (!errorMsg && result.logs) errorMsg = result.logs.join('\n');
            if (!errorMsg) errorMsg = 'Unknown error';

            if (String(plan?.name || '') === 'git_ops' && isGitAuthError(errorMsg)) {
              const msg = [
                `⚠️ مطلوب تسجيل دخول قبل دفع التحديثات إلى GitHub.`,
                `- أدخل توكن GitHub (Personal Access Token) في نافذة التوكن وأرسله.`,
                `- سيتم حفظ التوكن بشكل آمن لهذا الحساب ولن يظهر في المحادثة.`,
              ].join('\n');

              ev({ type: 'text', data: msg });
              ev({
                type: 'secret_required',
                data: {
                  sessionId,
                  runId,
                  provider: 'github',
                  key: 'GITHUB_TOKEN',
                  label: 'GitHub Token',
                  reason: 'git push يحتاج مصادقة',
                },
              });

              const { setPendingTool } = await import('../services/secrets');
              setPendingTool(String(sessionId), { runId, name: String(plan?.name || ''), input: plan?.input });


              try { await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } }); } catch { }


              return res.json({
                runId,
                sessionId,
                blocked: true,
                secretRequired: true,
                secret: { provider: 'github', key: 'GITHUB_TOKEN', label: 'GitHub Token' },
              });
            }

            if (String(plan?.name || '') === 'payments_create_checkout_session' && isStripeAuthError(errorMsg)) {
              const msg = [
                `⚠️ مطلوب مفتاح Stripe لإنشاء جلسة دفع.`,
                `- أدخل STRIPE_API_KEY في نافذة التوكن وأرسله.`,
                `- سيتم حفظ المفتاح بشكل آمن لهذا الحساب ولن يظهر في المحادثة.`,
              ].join('\n');

              ev({ type: 'text', data: msg });
              ev({
                type: 'secret_required',
                data: {
                  sessionId,
                  runId,
                  provider: 'stripe',
                  key: 'STRIPE_API_KEY',
                  label: 'Stripe Secret Key',
                  reason: 'إنشاء جلسة دفع يحتاج مصادقة',
                },
              });

              const { setPendingTool } = await import('../services/secrets');
              setPendingTool(String(sessionId), { runId, name: String(plan?.name || ''), input: plan?.input });


              try { await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } }); } catch { }


              return res.json({
                runId,
                sessionId,
                blocked: true,
                secretRequired: true,
                secret: { provider: 'stripe', key: 'STRIPE_API_KEY', label: 'Stripe Secret Key' },
              });
            }

            if (String(plan?.name || '') === 'github_create_repo' && isGithubAuthError(errorMsg)) {
              const msg = [
                `⚠️ مطلوب توكن GitHub لإنشاء مستودع جديد عبر API.`,
                `- أدخل GitHub Personal Access Token في نافذة التوكن وأرسله.`,
                `- سيتم حفظ التوكن بشكل آمن لهذا الحساب ولن يظهر في المحادثة.`,
              ].join('\n');

              ev({ type: 'text', data: msg });
              ev({
                type: 'secret_required',
                data: {
                  sessionId,
                  runId,
                  provider: 'github',
                  key: 'GITHUB_TOKEN',
                  label: 'GitHub Token',
                  reason: 'إنشاء ريبو يحتاج مصادقة',
                },
              });

              const { setPendingTool } = await import('../services/secrets');
              setPendingTool(String(sessionId), { runId, name: String(plan?.name || ''), input: plan?.input });


              try { await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } }); } catch { }


              return res.json({
                runId,
                sessionId,
                blocked: true,
                secretRequired: true,
                secret: { provider: 'github', key: 'GITHUB_TOKEN', label: 'GitHub Token' },
              });
            }
            if (String(plan?.name || '') === 'github_create_or_update_file' && isGithubAuthError(errorMsg)) {
              const msg = [
                `⚠️ مطلوب توكن GitHub لإنشاء/تعديل ملفات داخل المستودع عبر API.`,
                `- أدخل GitHub Personal Access Token في نافذة التوكن وأرسله.`,
                `- سيتم حفظ التوكن بشكل آمن لهذا الحساب ولن يظهر في المحادثة.`,
              ].join('\n');

              ev({ type: 'text', data: msg });
              ev({
                type: 'secret_required',
                data: {
                  sessionId,
                  runId,
                  provider: 'github',
                  key: 'GITHUB_TOKEN',
                  label: 'GitHub Token',
                  reason: 'تعديل ملفات الريبو يحتاج مصادقة',
                },
              });

              const { setPendingTool } = await import('../services/secrets');
              setPendingTool(String(sessionId), { runId, name: String(plan?.name || ''), input: plan?.input });


              try { await Run.findByIdAndUpdate(runId, { $set: { status: 'blocked' } }); } catch { }


              return res.json({
                runId,
                sessionId,
                blocked: true,
                secretRequired: true,
                secret: { provider: 'github', key: 'GITHUB_TOKEN', label: 'GitHub Token' },
              });
            }

            // Self-Healing Notification (user-facing, simplified)
            const userFriendlyError = isArabicText(userTextForOverrides)
              ? `⚠️ حدث خطأ أثناء تنفيذ الأداة '${plan?.name}'.\\n**السبب**: ${String(errorMsg).slice(0, 200)}`
              : `⚠️ An error occurred while executing tool '${plan?.name}'.\\n**Reason**: ${String(errorMsg).slice(0, 200)}`;
            ev({ type: 'text', data: userFriendlyError });
            assistantTextEmitted = true;

            // Internal history for AI self-healing (not shown to user)
            history.push({
              role: 'assistant',
              content: `INTERNAL: Tool '${plan?.name}' FAILED with error: ${errorMsg}. 
Analyze this error. If it's a network/connection issue (localhost vs container hostname), check your network configuration. 
If this is a browser_open failure, DO NOT automatically retry the same URL. Ask the user for clarification or skip the preview step.`
            });
          } else {
            history.push({ role: 'assistant', content: `Tool '${plan?.name}' executed. tool call: ${plan?.name}. Result: ${safeOutput(String(plan?.name || ''), result.output)}` });
          }

          steps++;

          // If echo, we are done
          if (plan?.name === 'echo') {
            forcedText = String(plan?.input?.text || '');
            break;
          }
        }

        const MAX_FINAL_INLINE_CHARS = 1800;
        const truncateFinal = (s: string, max = MAX_FINAL_INLINE_CHARS) => (s.length > max ? `${s.slice(0, max)}…[truncated]` : s);
        const extractTitleFromHtmlFinal = (html: string) => {
          const m = html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i);
          const t = String(m?.[1] || '').replace(/\s+/g, ' ').trim();
          return t || '';
        };
        const normalizeDisplayUrlFinal = (raw: any) => {
          let s = String(raw ?? '').trim();
          while (s.length >= 2) {
            const first = s[0];
            const last = s[s.length - 1];
            const wrap = (c: string) =>
              c === '`' || c === '"' || c === "'" || c === '“' || c === '”' || c === '‘' || c === '’';
            if (wrap(first) && wrap(last)) s = s.slice(1, -1).trim();
            else break;
          }
          s = s.replace(/[)\]`.,;:!?،؛؟]+$/g, '').trim();
          if (!s) return s;
          if (/^https?:\/\//i.test(s)) return s;
          if (/^\/\//.test(s)) return `https:${s}`;
          if (/^(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/|$)/i.test(s)) return `https://${s}`;
          return s;
        };
        const inferSiteLabelFinal = (url: string, dom: string) => {
          const u = normalizeDisplayUrlFinal(url);
          try {
            if (u) {
              const host = new URL(u).hostname.replace(/^www\./i, '');
              if (host) return host;
            }
          } catch { }
          const d = String(dom || '');
          if (/youtube\.com|ytd-app/i.test(d)) return 'youtube.com';
          if (/accounts\.google\.com/i.test(d)) return 'accounts.google.com';
          if (/github\.com/i.test(d)) return 'github.com';
          const title = extractTitleFromHtmlFinal(d);
          return title || 'page';
        };
        const summarizeBrowserOutputFinal = (out: any) => {
          if (!out || typeof out !== 'object') return out;
          const urlRaw =
            typeof (out as any).url === 'string' ? (out as any).url : typeof (out as any).pageUrl === 'string' ? (out as any).pageUrl : '';
          const url = normalizeDisplayUrlFinal(urlRaw);
          const dom = typeof (out as any).dom === 'string' ? (out as any).dom : '';
          const title = dom ? extractTitleFromHtmlFinal(dom) : '';
          const site = inferSiteLabelFinal(url, dom);
          const domLen = dom ? dom.length : 0;
          const redactionEnabled = typeof (out as any).redactionEnabled === 'boolean' ? Boolean((out as any).redactionEnabled) : undefined;
          const u = String(url || '').toLowerCase();
          const domLower = String(dom || '').toLowerCase();
          const hasPasswordField = /type=["']password["']|name=["']password["']|passw(or)?d|passwd/i.test(domLower);
          const hasLoginFormSignal = /<form\b[\s\S]{0,4000}(type=["']password["']|name=["']password["'])/i.test(dom);
          const urlLooksLogin = /serviceLogin|\/login\b|\/signin\b|accounts\.google\.com/i.test(u);
          const domStrongLogin = /<title[^>]*>[\s\S]*?(sign in|login|تسجيل\s+الدخول)[\s\S]*?<\/title>/i.test(dom) || /ServiceLogin/i.test(dom);
          const loginLike = Boolean((urlLooksLogin && (hasPasswordField || hasLoginFormSignal)) || (domStrongLogin && hasPasswordField));
          const summary: any = { site };
          if (url) summary.url = url;
          if (title) summary.title = title;
          if (loginLike) summary.pageType = 'login';
          if (domLen) summary.domLength = domLen;
          if (typeof redactionEnabled === 'boolean') summary.redactionEnabled = redactionEnabled;
          return summary;
        };
        const sanitizeFinalForInline = (toolName: string, obj: any) => {
          if (obj == null) return obj;
          const t = String(toolName || '');
          if (/^browser_/.test(t)) return summarizeBrowserOutputFinal(obj);
          if (typeof obj === 'string') return truncateFinal(obj);
          if (typeof obj === 'object') {
            try {
              const raw = JSON.stringify(obj);
              if (raw.length <= MAX_FINAL_INLINE_CHARS) return obj;
              return truncateFinal(raw);
            } catch {
              return '[Result too large or circular]';
            }
          }
          return obj;
        };

        const finalContent =
          forcedText ||
          (() => {
            const toolName = String(lastExecutedToolName || '');
            const raw = (lastResult as any)?.output ?? (lastResult as any)?.error ?? 'No output';
            const sanitized = sanitizeFinalForInline(toolName, raw);
            if (typeof sanitized === 'string') return sanitized;
            try {
              return JSON.stringify(sanitized);
            } catch {
              return 'Output too large';
            }
          })();

        if (!assistantTextEmitted) {
          ev({ type: 'text', data: finalContent });
        }

        ev({ type: 'run_completed', data: { runId, result: lastResult } });
        ev({ type: 'run_finished', data: { runId, status: 'done' } });


        await Message.create({ sessionId, role: 'assistant', content: finalContent, runId });
        await Run.findByIdAndUpdate(runId, { $set: { status: lastResult?.ok ? 'done' : 'failed', response: finalContent } });

        cancelledRuns.delete(String(runId));

        if (!res.headersSent) {
          return res.json({
            runId,
            sessionId,
            status: 'done',
          });
        }
      } catch (globalErr: any) {
        console.error('[FATAL /runs/start Background]', globalErr);
        // Log to run object
        try {
          if (runId) {
            await Run.findByIdAndUpdate(runId, { $set: { status: 'failed', response: `Fatal Background Error: ${globalErr.message}` } });
          }
        } catch { }
      }
    })();
  } catch (globalErr: any) {
    console.error('[FATAL /runs/start]', globalErr);
    if (!res.headersSent) {
      const msg = typeof globalErr?.message === 'string' ? globalErr.message : String(globalErr);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: msg.slice(0, 500),
      });
    }
  }
});

export default router;
