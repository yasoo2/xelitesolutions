import { ToolDefinition } from '../types';
import { getAccessToken, isConnected, getConnectedEmail } from '../../integrations/googleOAuth';

/** Resolve the acting user id from the run context (falls back to a local id;
 *  the token store also falls back to the last-connected account locally). */
function ctxUser(context: any): string {
  return String((context && (context.userId || context.auth?.sub)) || process.env.DEFAULT_USER_ID || 'local-user').trim();
}

const isAr = (t: string) => /[؀-ۿ]/.test(String(t || ''));
async function gfetch(token: string, url: string, init?: any) {
  const res = await fetch(url, { ...(init || {}), headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
  const text = await res.text();
  let json: any = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { ok: res.ok, status: res.status, json, text };
}
function b64urlEncode(s: string) { return Buffer.from(s, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function header(payload: any, name: string): string {
  const h = (payload?.headers || []).find((x: any) => String(x.name).toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

/* ============================================================
   google_account — act in the user's connected Google account via
   official APIs (Gmail read/send, Calendar, Drive). Requires the user
   to have connected their account through OAuth first. No passwords,
   nothing bypassed — operates within the granted authorization.
   ============================================================ */
export class GoogleAccountTool implements ToolDefinition {
  name = 'google_account';
  version = '1.0.0';
  description = 'Act in the user\'s connected Google account through official APIs. actions: profile | gmail_list | gmail_read | gmail_send | calendar_list | drive_list. Requires the user to have connected Google (OAuth) first.';
  tags = ['google', 'gmail', 'calendar', 'drive', 'account', 'integration'];
  inputSchema = {
    type: 'object' as const,
    properties: {
      action: { type: 'string' as const, description: 'profile | gmail_list | gmail_read | gmail_send | calendar_list | drive_list' },
      query: { type: 'string' as const, description: 'Gmail search query (gmail_list) or message id (gmail_read)' },
      to: { type: 'string' as const, description: 'Recipient email (gmail_send)' },
      subject: { type: 'string' as const, description: 'Subject (gmail_send)' },
      body: { type: 'string' as const, description: 'Body text (gmail_send)' },
      max: { type: 'number' as const, description: 'Max results for list actions (default 10)' },
    },
    required: ['action'],
  };
  get parameters() { return this.inputSchema; }
  outputSchema = { type: 'object' as const }; permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

  async execute(input: any, context?: any) {
    const userId = ctxUser(context);
    const action = String(input?.action || '').trim();
    const ar = isAr(action) || isAr(String(input?.request || input?.body || ''));

    if (!isConnected(userId)) {
      return { ok: false, error: 'google_not_connected', output: { message: ar
        ? '🔗 لم يتم ربط حساب Google بعد. افتح الإعدادات واضغط «ربط حساب Google» مرّة واحدة، ثم أعد المحاولة.'
        : 'Google account not connected. Click "Connect Google" once, then retry.' } };
    }
    const token = await getAccessToken(userId);
    if (!token) return { ok: false, error: 'google_token_unavailable', output: { message: ar ? '⚠️ تعذّر الحصول على إذن Google (قد تحتاج لإعادة الربط).' : 'Could not obtain a Google token (you may need to reconnect).' } };
    const email = getConnectedEmail(userId) || '';
    const max = Math.min(Math.max(Number(input?.max) || 10, 1), 25);

    try {
      switch (action) {
        case 'profile': {
          const r = await gfetch(token, 'https://www.googleapis.com/oauth2/v3/userinfo');
          if (!r.ok) return { ok: false, error: 'profile_failed', output: { message: r.text?.slice(0, 200) } };
          return { ok: true, output: { message: `👤 ${r.json?.name || ''} <${r.json?.email || email}>`, profile: r.json } };
        }
        case 'gmail_list': {
          const q = String(input?.query || '').trim();
          const r = await gfetch(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
          if (!r.ok) return { ok: false, error: 'gmail_list_failed', output: { message: r.text?.slice(0, 200) } };
          const ids = (r.json?.messages || []).map((m: any) => m.id).slice(0, max);
          const items: any[] = [];
          for (const id of ids) {
            const d = await gfetch(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`);
            if (d.ok) items.push({ id, from: header(d.json?.payload, 'From'), subject: header(d.json?.payload, 'Subject'), date: header(d.json?.payload, 'Date'), snippet: d.json?.snippet || '' });
          }
          const lines = items.map((m, i) => `${i + 1}. ${m.subject || '(بلا عنوان)'} — ${m.from}`).join('\n');
          return { ok: true, output: { message: `📧 آخر ${items.length} رسالة (${email}):\n${lines || 'لا شيء'}`, messages: items } };
        }
        case 'gmail_read': {
          const id = String(input?.query || input?.id || '').trim();
          if (!id) return { ok: false, error: 'no_message_id', output: { message: ar ? 'حدّد معرّف الرسالة (query).' : 'Provide a message id.' } };
          const d = await gfetch(token, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`);
          if (!d.ok) return { ok: false, error: 'gmail_read_failed', output: { message: d.text?.slice(0, 200) } };
          const p = d.json?.payload;
          const decodePart = (part: any): string => {
            if (part?.body?.data) { try { return Buffer.from(part.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8'); } catch { return ''; } }
            if (Array.isArray(part?.parts)) return part.parts.map(decodePart).join('\n');
            return '';
          };
          const bodyText = decodePart(p).replace(/\s+\n/g, '\n').slice(0, 4000);
          return { ok: true, output: { message: `📩 ${header(p, 'Subject')}\nمن: ${header(p, 'From')}\n\n${bodyText}`, id, from: header(p, 'From'), subject: header(p, 'Subject'), body: bodyText } };
        }
        case 'gmail_send': {
          const to = String(input?.to || '').trim();
          const subject = String(input?.subject || '').trim();
          const body = String(input?.body || '').trim();
          if (!to || !body) return { ok: false, error: 'missing_fields', output: { message: ar ? 'حدّد المستلم (to) والنص (body).' : 'Provide "to" and "body".' } };
          const raw = [
            `To: ${to}`, `Subject: ${subject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset="UTF-8"', '', body,
          ].join('\r\n');
          const r = await gfetch(token, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: b64urlEncode(raw) }),
          });
          if (!r.ok) return { ok: false, error: 'gmail_send_failed', output: { message: r.text?.slice(0, 200) } };
          return { ok: true, output: { message: `✅ أُرسِل البريد إلى ${to} من ${email}.`, id: r.json?.id } };
        }
        case 'calendar_list': {
          const now = new Date().toISOString();
          const r = await gfetch(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=${max}&timeMin=${encodeURIComponent(now)}&singleEvents=true&orderBy=startTime`);
          if (!r.ok) return { ok: false, error: 'calendar_failed', output: { message: r.text?.slice(0, 200) } };
          const items = (r.json?.items || []).map((e: any) => ({ summary: e.summary || '(بلا عنوان)', start: e.start?.dateTime || e.start?.date || '' }));
          const lines = items.map((e: any, i: number) => `${i + 1}. ${e.start} — ${e.summary}`).join('\n');
          return { ok: true, output: { message: `📅 المواعيد القادمة (${items.length}):\n${lines || 'لا شيء'}`, events: items } };
        }
        case 'drive_list': {
          const r = await gfetch(token, `https://www.googleapis.com/drive/v3/files?pageSize=${max}&orderBy=modifiedTime desc&fields=${encodeURIComponent('files(name,mimeType,modifiedTime)')}`);
          if (!r.ok) return { ok: false, error: 'drive_failed', output: { message: r.text?.slice(0, 200) } };
          const items = (r.json?.files || []).map((f: any) => ({ name: f.name, type: f.mimeType, modified: f.modifiedTime }));
          const lines = items.map((f: any, i: number) => `${i + 1}. ${f.name}`).join('\n');
          return { ok: true, output: { message: `📁 آخر ${items.length} ملف في Drive:\n${lines || 'لا شيء'}`, files: items } };
        }
        default:
          return { ok: false, error: 'unknown_action', output: { message: ar ? `إجراء غير معروف: ${action}. المتاح: profile, gmail_list, gmail_read, gmail_send, calendar_list, drive_list.` : `Unknown action: ${action}.` } };
      }
    } catch (e: any) {
      return { ok: false, error: `google_account_failed: ${e?.message || e}` };
    }
  }
}
