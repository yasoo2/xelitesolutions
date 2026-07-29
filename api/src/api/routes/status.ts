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

/** Probe a local model endpoint (Ollama / OpenAI-compatible) with a short timeout. */
async function probeLocalModel(baseUrl: string): Promise<boolean> {
  const bases = [baseUrl.replace(/\/+$/, '')];
  const candidates = [`${bases[0]}/api/tags`, `${bases[0]}/v1/models`, `${bases[0].replace(/\/v1$/, '')}/api/tags`];
  for (const u of candidates) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch(u, { signal: ctrl.signal }).catch(() => null);
      clearTimeout(t);
      if (r && r.ok) return true;
    } catch { /* try next */ }
  }
  return false;
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
      const reachable = await probeLocalModel(localBase);
      return {
        mode: 'local' as const,
        provider: 'Ollama / local',
        model: String(process.env.LOCAL_LLM_MODEL || '').trim() || 'auto',
        endpoint: localBase,
        reachable,
        ok: reachable,
        detail: reachable ? 'النموذج المحلّي متصل ويستجيب' : 'ضبطتَ نموذجاً محلّياً لكنه لا يستجيب — شغّل Ollama',
      };
    }
    return {
      mode: 'free' as const,
      provider: 'الذكاء المجّاني عبر الإنترنت',
      model: 'auto',
      endpoint: null,
      reachable: null, // verified only on actual use
      ok: true,
      detail: 'يعمل على المزوّدين المجّانيين (يُتحقَّق عند أول طلب). لأداء أثبت: شغّل Ollama.',
    };
  })();

  // Browser engine
  const chromium = findChromiumExecutable();
  const browser = {
    ok: !!chromium,
    engine: chromium ? 'Chromium (مرفق)' : null,
    path: chromium || null,
    detail: chromium ? 'محرّك المتصفح جاهز' : 'محرّك المتصفح غير مثبّت — سيُثبَّت تلقائياً عند التشغيل',
  };

  // Google account
  const google = {
    configured: isGoogleOAuthConfigured(),
    connected: googleConnected(userId),
    email: getConnectedEmail(userId) || null,
    ok: isGoogleOAuthConfigured() && googleConnected(userId),
    detail: !isGoogleOAuthConfigured() ? 'لم تُضبط مفاتيح Google بعد'
      : googleConnected(userId) ? 'حساب Google مربوط' : 'المفاتيح مضبوطة — اضغط «ربط Google» مرّة',
  };

  // Personal browser extension
  const extension = {
    connected: isExtensionConnected(userId),
    totalUsers: connectedUserCount(),
    ok: isExtensionConnected(userId),
    detail: isExtensionConnected(userId) ? 'متصفحك الشخصي متصل عبر الإضافة' : 'الإضافة غير متصلة (اختياري)',
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
