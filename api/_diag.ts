process.env.OFFLINE_MODE = 'true';
import fs from 'fs'; import os from 'os'; import path from 'path'; import http from 'http';
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diag-'));
  const jpg = fs.readFileSync('/dev/urandom').slice(0, 0);  // replaced below
  const { chromium } = require('playwright');
  const { getChromiumLaunchOptions } = require('./src/modules/browser/manager');
  const b = await chromium.launch({ ...getChromiumLaunchOptions(), headless: true });
  const p0 = await b.newPage({ viewport: { width: 1200, height: 800 } });
  await p0.setContent('<body style="margin:0"><div style="width:1200px;height:800px;background:conic-gradient(from 20deg,#1a7,#7d3,#194)"></div></body>');
  const buf = await p0.screenshot({ type: 'jpeg', quality: 92 });
  await b.close();
  let port = 0;
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://x');
    if (u.pathname === '/openverse') {
      const q = String(u.searchParams.get('q') || '');
      console.log('   ARCHIVE ASKED FOR:', JSON.stringify(q));
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ results: [{ url: `http://127.0.0.1:${port}/p.jpg`, thumbnail: `http://127.0.0.1:${port}/p.jpg`,
        title: q, description: q, tags: q.split(/\s+/).map((name: string) => ({ name })), width: 1200, height: 800,
        creator: 'أرشيف الاختبار', license: 'CC0', foreign_landing_url: 'http://127.0.0.1/l' }] }));
    }
    if (u.pathname === '/p.jpg') { res.writeHead(200, { 'content-type': 'image/jpeg' }); return res.end(buf); }
    res.writeHead(404); res.end();
  });
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
  port = (srv.address() as any).port;
  process.env.JOE_IMAGE_API = `http://127.0.0.1:${port}/openverse`;
  const { sourceImage, takeSourceOutcomes, takeRelevanceTally } = await import('./src/core/design/images');
  const got = await sourceImage(dir, 'نخيل برحي مشتل نباتات', 15000, 0, 'card');
  console.log('   RESULT:', JSON.stringify(got));
  console.log('   OUTCOMES:', JSON.stringify(takeSourceOutcomes()));
  console.log('   RELEVANCE:', JSON.stringify(takeRelevanceTally()));
  console.log('   FILES:', fs.readdirSync(dir));
  srv.close();
}
main().catch(e => { console.error(e); process.exit(1); });
