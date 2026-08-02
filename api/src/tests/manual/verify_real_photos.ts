/**
 * LIVE PROOF — «اريد حل جذري … وتتأكد ان الصور سوف تظهر».
 *
 * The measured failure: resolveImages downloaded four real licensed photos
 * and wrote them as src="/artifacts/images/x.jpg"; groundImageSrcs resolved
 * that root-absolute path OUTSIDE the artifact dir, declared every file
 * missing, and swapped each real photograph for a gradient. The page shipped
 * with zero photos and the photographers still credited at the bottom.
 *
 * This proof runs the EXACT pipeline order on the exact address format, then
 * serves the result over a real HTTP server — the same /artifacts mapping
 * Joe's own server uses — and asks Chromium whether the photo PIXELS arrived.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_real_photos.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';

const JPG_1x1 = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64');

async function main() {
    const { groundImageSrcs, imagesToMarkers, IMAGE_MARKER, gradientPlaceholder } = await import('../../core/design/images');

    // The artifact dir as resolveImages leaves it: a real photo on disk.
    const art = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-photos-'));
    fs.mkdirSync(path.join(art, 'images'), { recursive: true });
    fs.writeFileSync(path.join(art, 'images', 'hero.jpg'), JPG_1x1);

    // The page as it stands right after resolveImages: one REAL photo (the
    // exact address format the pipeline writes), one that failed to resolve.
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>p</title></head><body>
<img id="real" src="/artifacts/images/hero.jpg" alt="Designer portrait">
<img id="fallback" src="/artifacts/images/never-found.jpg" alt="studio desk{{">
</body></html>`;

    // Pipeline order: markers pass (must NOT touch the real photo)…
    const conv = imagesToMarkers(html, art);
    html = conv.html;
    // …the sweep for any marker it created…
    html = html.replace(IMAGE_MARKER, (_m: string, q: string) =>
        gradientPlaceholder(String(q).split('|').pop()!.trim(), 20));
    // …then the reality check that used to kill the real photo.
    const g = groundImageSrcs(html, art, 20);
    html = g.html;
    html = html.replace(/(alt="[^"]*?)\s*[}{]{2,}\s*(")/gi, '$1$2');
    fs.writeFileSync(path.join(art, 'page.html'), html, 'utf-8');

    // Joe's own serving model: /artifacts/<path> answered from the artifact dir.
    const server = http.createServer((req, res) => {
        const p = decodeURIComponent(String(req.url || '').split('?')[0]);
        const rel = p.startsWith('/artifacts/') ? p.slice('/artifacts/'.length) : p.replace(/^\//, '');
        const abs = path.join(art, rel);
        if (abs.startsWith(art) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
            res.writeHead(200, { 'Content-Type': abs.endsWith('.html') ? 'text/html' : 'image/jpeg' });
            res.end(fs.readFileSync(abs));
        } else { res.writeHead(404); res.end('nope'); }
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as any).port;

    let chromium: any;
    try { ({ chromium } = require('playwright-core')); } catch { ({ chromium } = require('playwright')); }
    const exe = process.env.BROWSER_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';
    const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
    const page = await (await browser.newContext()).newPage();
    const failed: string[] = [];
    page.on('requestfailed', (r: any) => failed.push(r.url()));
    const resp: number[] = [];
    page.on('response', (r: any) => { if (r.status() >= 400) resp.push(r.status()); });
    await page.goto(`http://127.0.0.1:${port}/artifacts/page.html`);
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
        const real = document.getElementById('real') as HTMLImageElement;
        const fb = document.getElementById('fallback') as HTMLImageElement;
        return {
            realLoaded: real.complete && real.naturalWidth > 0,
            realIsPhoto: real.src.includes('/artifacts/images/hero.jpg'),
            fbLoaded: fb.complete && fb.naturalWidth > 0,
            fbIsGradient: fb.src.startsWith('data:image/svg+xml'),
            fbAlt: fb.getAttribute('alt'),
        };
    });
    await browser.close();
    server.close();

    const checks: Array<[string, boolean]> = [
        ['imagesToMarkers left the pipeline\'s own photo untouched', conv.converted <= 1 && m.realIsPhoto],
        ['groundImageSrcs did NOT replace the real photo (the killer bug)', m.realIsPhoto],
        ['the real photograph\'s PIXELS loaded over HTTP, like Joe serves it', m.realLoaded],
        ['the unresolvable image became an on-palette gradient that renders', m.fbLoaded && m.fbIsGradient],
        [`alt debris cleaned → "${m.fbAlt}"`, m.fbAlt === 'studio desk'],
        [`zero broken requests on the page (${failed.length} failed, ${resp.length} 4xx)`, failed.length === 0 && resp.length === 0],
    ];
    let bad = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) bad++; }
    console.log(bad === 0
        ? '\nPROOF COMPLETE: real photographs survive every pass and their pixels reach the screen.'
        : `\n${bad} CHECK(S) FAILED`);
    fs.rmSync(art, { recursive: true, force: true });
    process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
