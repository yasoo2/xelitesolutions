import { ToolDefinition, ToolPermission } from '../types';
import { sendCommand, isExtensionConnected } from '../../extension/gateway';
import { config } from '../../../shared/config';

function ctxUser(context: any): string {
  return String((context && (context.userId || context.auth?.sub)) || config.localUserId).trim();
}
const isAr = (t: string) => /[؀-ۿ]/.test(String(t || ''));

/* ============================================================
   user_browser — drive the user's OWN real browser (with their logins, any
   site) through the installed Joe extension. This is the online path: the
   server holds no cookies; the extension executes in the user's actual browser.
   actions: open | read | screenshot | click | type | status
   ============================================================ */
export class UserBrowserTool implements ToolDefinition {
  name = 'user_browser';
  version = '1.0.0';
  description = 'Drive the user\'s OWN real browser (their logins, any website) via the installed Joe browser extension. actions: open(url) | read | screenshot | click(text|selector) | type(text) | status. Requires the user to have installed & connected the Joe extension.';
  tags = ['browser', 'extension', 'user', 'real', 'remote'];
  inputSchema = {
    type: 'object' as const,
    properties: {
      action: { type: 'string' as const, description: 'open | read | screenshot | click | type | status' },
      url: { type: 'string' as const, description: 'URL for action=open' },
      text: { type: 'string' as const, description: 'Text to type (type) or the visible text to click (click)' },
      selector: { type: 'string' as const, description: 'CSS selector for click' },
    },
    required: ['action'],
  };
  get parameters() { return this.inputSchema; }
  outputSchema = { type: 'object' as const }; permissions: ToolPermission[] = ['internet']; sideEffects: ToolPermission[] = []; rateLimitPerMinute = 20; auditFields = []; mockSupported = false;

  async execute(input: any, context?: any) {
    const userId = ctxUser(context);
    const action = String(input?.action || '').trim();
    const ar = isAr(action) || isAr(String(input?.text || input?.request || ''));

    if (action === 'status') {
      const connected = isExtensionConnected(userId);
      return { ok: true, output: { connected, message: connected ? (ar ? '✅ متصفحك متصل بجو.' : 'Your browser is connected.') : (ar ? '⚠️ متصفحك غير متصل. ثبّت إضافة جو وافتح جو في تبويب.' : 'Your browser is not connected. Install the Joe extension.') } };
    }

    if (!isExtensionConnected(userId)) {
      return { ok: false, error: 'extension_not_connected', output: { message: ar
        ? '🧩 لاستخدام متصفحك الحقيقي أونلاين، ثبّت إضافة جو مرّة واحدة (من مجلد extension أو المتجر) وافتح جو في تبويب. بعدها ينفّذ جو أوامرك في متصفحك بحساباتك.'
        : 'Install the Joe browser extension once and keep a Joe tab open; then Joe can act in your real browser.' } };
    }

    try {
      switch (action) {
        case 'open': {
          const url = String(input?.url || '').trim();
          if (!url) return { ok: false, error: 'no_url' };
          const r = await sendCommand(userId, 'navigate', { url });
          return { ok: true, output: { message: `🌐 فتحتُ ${r?.url || url} في متصفحك.`, url: r?.url || url, title: r?.title } };
        }
        case 'read': {
          const r = await sendCommand(userId, 'read', {});
          const text = String(r?.text || '').slice(0, 4000);
          return { ok: true, output: { message: `📄 ${r?.title || ''}\n${text}`, title: r?.title, url: r?.url, text } };
        }
        case 'screenshot': {
          const r = await sendCommand(userId, 'screenshot', {});
          return { ok: true, output: { message: '🖼️ لقطة من متصفحك.', screenshot: r?.dataUrl || r?.data, url: r?.url } };
        }
        case 'click': {
          const r = await sendCommand(userId, 'click', { text: input?.text || '', selector: input?.selector || '' });
          return { ok: !!r?.clicked, output: { message: r?.clicked ? `🖱️ نقرتُ «${r?.label || input?.text || input?.selector}».` : 'لم أجد العنصر.', ...r } };
        }
        case 'type': {
          const r = await sendCommand(userId, 'type', { text: String(input?.text || ''), selector: input?.selector || '' });
          return { ok: true, output: { message: `⌨️ كتبتُ في متصفحك.`, ...r } };
        }
        default:
          return { ok: false, error: 'unknown_action', output: { message: `Unknown action: ${action}` } };
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes('timeout')) return { ok: false, error: 'timeout', output: { message: ar ? '⏱️ لم يردّ متصفحك في الوقت المحدّد.' : 'Your browser did not respond in time.' } };
      return { ok: false, error: `user_browser_failed: ${msg}` };
    }
  }
}
