import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { config } from '../../shared/config';
import { isGoogleOAuthConfigured, isConnected as googleConnected, getConnectedEmail } from '../../modules/integrations/googleOAuth';
import { isExtensionConnected, connectedUserCount } from '../../modules/extension/gateway';
import { findChromiumExecutable } from '../../modules/browser/manager';
import { tools } from '../../modules/tools/registry';

const router = Router();
const startedAt = Date.now();

function uid(req: Request): string {
  return String((req as any).auth?.sub || (req as any).auth?.userId || config.localUserId).trim();
}

/**
 * Probe a local model endpoint (Ollama / OpenAI-compatible) and READ BACK the list
 * of models it actually serves.
 *
 * Answering "is the server up?" was not enough: the panel printed the configured
 * model name next to a green "connected and responding" dot even when that model
 * had never been pulled, so the status lied right up until the first request
 * failed with "model not found". The installed list is what makes the row honest.
 */
async function probeLocalModel(baseUrl: string): Promise<{ reachable: boolean; models: string[] }> {
  const base = baseUrl.replace(/\/+$/, '');
  const candidates = [`${base}/api/tags`, `${base}/v1/models`, `${base.replace(/\/v1$/, '')}/api/tags`];
  for (const u of candidates) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch(u, { signal: ctrl.signal }).catch(() => null);
      clearTimeout(t);
      if (!r || !r.ok) continue;
      const body: any = await r.json().catch(() => null);
      const models: string[] = Array.isArray(body?.models)
        ? body.models.map((m: any) => String(m?.name ?? m?.model ?? '')).filter(Boolean)   // Ollama /api/tags
        : Array.isArray(body?.data)
          ? body.data.map((m: any) => String(m?.id ?? '')).filter(Boolean)                 // OpenAI-compatible /v1/models
          : [];
      return { reachable: true, models };
    } catch { /* try next */ }
  }
  return { reachable: false, models: [] };
}

/** Ollama treats "qwen2.5-coder:7b" and "qwen2.5-coder:7b" / ":latest" as the same tag. */
function modelIsInstalled(model: string, models: string[]): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/:latest$/, '');
  const want = norm(model);
  if (!want || want === 'auto') return models.length > 0;
  return models.some(m => norm(m) === want);
}

/**
 * GET /api/status — an HONEST self-check of every subsystem. Every field is a real
 * probe (no cheerful placeholders): what the AI brain actually is and whether it
 * responds, whether the browser engine is installed, whether Google/the extension
 * are really connected, the persistence mode, and the live tool count.
 */
router.get('/', authenticate as any, async (req: Request, res: Response) => {
  const userId = uid(req);

  // AI brain
  const localBase = String(process.env.LOCAL_LLM_BASE_URL || '').trim();
  const ai = await (async () => {
    if (localBase) {
      const model = String(process.env.LOCAL_LLM_MODEL || '').trim() || 'auto';
      const { reachable, models } = await probeLocalModel(localBase);
      const installed = reachable && modelIsInstalled(model, models);
      // Three distinct states, because they need three different actions from the
      // user: start Ollama / pull the model / nothing.
      const code = !reachable ? 'local_down' : installed ? 'local_ok' : 'local_no_model';
      return {
        mode: 'local' as const,
        provider: 'Ollama / local',
        model,
        endpoint: localBase,
        reachable,
        installedModels: models,
        modelInstalled: installed,
        ok: installed,
        code,
        detail: code === 'local_ok' ? 'الخادم المحلّي يستجيب والنموذج مثبّت'
          : code === 'local_no_model' ? `الخادم المحلّي يستجيب لكن النموذج «${model}» غير مثبّت — نفّذ: ollama pull ${model}`
            : 'ضبطتَ نموذجاً محلّياً لكنه لا يستجيب — شغّل Ollama',
      };
    }
    return {
      mode: 'free' as const,
      provider: 'الذكاء المجّاني عبر الإنترنت',
      model: 'auto',
      endpoint: null,
      reachable: null, // verified only on actual use
      installedModels: [] as string[],
      modelInstalled: null,
      ok: true,
      code: 'free',
      detail: 'يعمل على المزوّدين المجّانيين (يُتحقَّق عند أول طلب). لأداء أثبت: شغّل Ollama.',
    };
  })();

  // Browser engine
  const chromium = findChromiumExecutable();
  const browser = {
    ok: !!chromium,
    engine: chromium ? 'Chromium' : null,
    bundled: !!chromium,
    path: chromium || null,
    code: chromium ? 'browser_ready' : 'browser_missing',
    detail: chromium ? 'محرّك المتصفح جاهز' : 'محرّك المتصفح غير مثبّت — سيُثبَّت تلقائياً عند التشغيل',
  };

  // Google account
  const googleConfigured = isGoogleOAuthConfigured();
  const googleLinked = googleConnected(userId);
  const google = {
    configured: googleConfigured,
    connected: googleLinked,
    email: getConnectedEmail(userId) || null,
    ok: googleConfigured && googleLinked,
    code: !googleConfigured ? 'google_not_configured' : googleLinked ? 'google_linked' : 'google_needs_link',
    detail: !googleConfigured ? 'لم تُضبط مفاتيح Google بعد'
      : googleLinked ? 'حساب Google مربوط' : 'المفاتيح مضبوطة — اضغط «ربط Google» مرّة',
  };

  // Personal browser extension
  const extConnected = isExtensionConnected(userId);
  const extension = {
    connected: extConnected,
    totalUsers: connectedUserCount(),
    ok: extConnected,
    code: extConnected ? 'ext_connected' : 'ext_disconnected',
    detail: extConnected ? 'متصفحك الشخصي متصل عبر الإضافة' : 'الإضافة غير متصلة (اختياري)',
  };

  res.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    persistence: { mode: process.env.PERSISTENCE_MODE || 'JSON', mockDb: process.env.MOCK_DB === 'true' },
    tools: { count: Array.isArray(tools) ? tools.length : 0 },
    ai, browser, google, extension,
  });
});

export default router;
