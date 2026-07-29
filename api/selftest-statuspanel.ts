/* Renders the SystemStatusPanel markup+styles (same as the React component) with
   REAL sample data, in light and dark, and screenshots it — to preview the design. */
import path from 'path';
import { getBrowserSession, stopSession } from './src/modules/browser/manager';

const OUT = process.argv[2] || '/tmp';

const dot = { ok: '#22c55e', warn: '#f59e0b', error: '#ef4444' };
const rows = [
  { icon: '🧠', title: 'محرّك الذكاء', value: 'qwen2.5-coder:7b (محلّي)', detail: 'النموذج المحلّي متصل ويستجيب', level: 'ok' },
  { icon: '🌐', title: 'محرّك المتصفح', value: 'Chromium (مرفق)', detail: 'محرّك المتصفح جاهز', level: 'ok' },
  { icon: '📧', title: 'حساب Google', value: 'غير مُعدّ', detail: 'لم تُضبط مفاتيح Google بعد', level: 'warn' },
  { icon: '🧩', title: 'متصفحك الشخصي (إضافة)', value: 'غير متصل', detail: 'الإضافة غير متصلة (اختياري)', level: 'warn' },
];

function html(theme: 'light' | 'dark'): string {
  const rowsHtml = rows.map(r => `
    <div class="row"><div class="ricon">${r.icon}</div>
      <div class="rmid"><div class="rtitle">${r.title}</div><div class="rdetail">${r.detail}</div></div>
      <div class="rval"><span class="rdot" style="background:${(dot as any)[r.level]};box-shadow:0 0 8px ${(dot as any)[r.level]}"></span><span class="rvtext">${r.value}</span></div>
    </div>`).join('');
  const vars = theme === 'dark'
    ? `--bg:#0e1420;--panel:#131c2b;--line:#233046;--text:#e8eef7;--muted:#93a4bd;--shadow:0 12px 40px -18px rgba(0,0,0,.6);`
    : `--bg:#ffffff;--panel:#f8fafc;--line:#e6ebf2;--text:#0f172a;--muted:#64748b;--shadow:0 10px 34px -18px rgba(15,23,42,.35);`;
  const page = theme === 'dark' ? '#0a0f18' : '#eef2f8';
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
    body{margin:0;background:${page};padding:28px;font-family:system-ui,'Segoe UI',Tahoma,Arial}
    .joe-status{${vars}color:var(--text);width:440px}
    .card{background:var(--bg);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);overflow:hidden;--hc:${dot.ok}}
    .head{display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,color-mix(in srgb,var(--hc) 10%,transparent),transparent)}
    .badge{width:11px;height:11px;border-radius:50%;background:var(--hc);box-shadow:0 0 0 4px color-mix(in srgb,var(--hc) 18%,transparent)}
    .head h3{margin:0;font-size:16px;font-weight:700}.head .sub{font-size:12px;color:var(--muted)}
    .refresh{border:1px solid var(--line);background:var(--panel);color:var(--muted);border-radius:10px;padding:6px 10px;font-size:12px}
    .rows{padding:8px;display:flex;flex-direction:column;gap:6px}
    .row{display:flex;align-items:center;gap:12px;padding:12px}
    .ricon{width:38px;height:38px;display:grid;place-items:center;font-size:19px;border-radius:11px;background:var(--panel);border:1px solid var(--line)}
    .rmid{flex:1}.rtitle{font-size:13.5px;font-weight:650}.rdetail{font-size:11.5px;color:var(--muted);margin-top:2px;line-height:1.5}
    .rval{display:flex;align-items:center;gap:8px}.rdot{width:9px;height:9px;border-radius:50%}.rvtext{font-size:12px;font-weight:600}
    .foot{display:flex;gap:8px 18px;padding:12px 18px;border-top:1px solid var(--line);color:var(--muted);font-size:11.5px}.foot b{color:var(--text)}
  </style></head><body><div class="joe-status"><div class="card">
    <div class="head"><span class="badge"></span><div style="flex:1"><h3>حالة النظام</h3><div class="sub">جاهز — بعض الإضافات اختيارية غير مُفعّلة</div></div><button class="refresh">↻ تحديث</button></div>
    <div class="rows">${rowsHtml}</div>
    <div class="foot"><span>الأدوات: <b>122</b></span><span>التخزين: <b>JSON</b></span><span>مدّة التشغيل: <b>3د 12ث</b></span></div>
  </div></div></body></html>`;
}

async function main() {
  process.env.BROWSER_HEADED = '0';
  for (const theme of ['dark', 'light'] as const) {
    const sid = `status-${theme}`;
    const s = await getBrowserSession(sid);
    await s.page.setViewportSize({ width: 500, height: 460 });
    await s.page.setContent(html(theme), { waitUntil: 'load' });
    await s.page.screenshot({ path: path.join(OUT, `status-panel-${theme}.png`) });
    console.log('shot', theme);
    await stopSession(sid);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
