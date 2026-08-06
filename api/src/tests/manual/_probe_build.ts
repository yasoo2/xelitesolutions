export {};
process.env.JWT_SECRET = 'x'; process.env.OFFLINE_MODE = 'true';
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http';
async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-probe-'));
  process.env.JOE_CHAT_STORE_DIR = path.join(root, 'store'); fs.mkdirSync(process.env.JOE_CHAT_STORE_DIR, { recursive: true });
  const { ReactProjectTool } = require('../../modules/tools/definitions/ReactProjectTool');
  const res: any = await new ReactProjectTool().execute({ request: 'ابنِ موقع react لمقهى الفحص', root, skipImages: true }, { sessionId: 'probe' });
  const dist = path.join(res.output.path, 'dist');
  const srv = http.createServer((q, r) => {
    const rel = decodeURIComponent(String(q.url||'/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const f = path.join(dist, rel);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' });
    r.end(fs.readFileSync(f));
  });
  await new Promise<void>(k => srv.listen(0, '127.0.0.1', () => k()));
  const { chromium } = require('playwright');
  const b = await chromium.launch({ headless: true });
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`http://127.0.0.1:${(srv.address() as any).port}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const vw = 390;
    const wide: string[] = [];
    document.querySelectorAll('body *').forEach(el => {
      const b = el.getBoundingClientRect();
      if (b.width > vw + 4 && b.height > 0 && wide.length < 10) wide.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class')||'').split(/\s+/).slice(0,2).join('.')} w=${Math.round(b.width)} x=${Math.round(b.left)}`);
    });
    const tiny: string[] = [];
    document.querySelectorAll('a[href],button,input,select,[role="button"]').forEach(el => {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && b.height > 0 && (b.width < 40 || b.height < 40) && tiny.length < 12)
        tiny.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class')||'').split(/\s+/).slice(0,2).join('.')} ${Math.round(b.width)}x${Math.round(b.height)} «${(el.textContent||'').trim().slice(0,18)}»`);
    });
    const heads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => h.tagName + ':' + (h.textContent||'').trim().slice(0,20));
    return { scrollW: document.documentElement.scrollWidth, bodyW: document.body.scrollWidth, wide, tiny, heads: heads.slice(0, 12) };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close(); srv.close(); fs.rmSync(root, { recursive: true, force: true });
}
main().catch(e => { console.error(e); process.exit(1); });
