/**
 * LIVE PROOF — the build→publish chain, measured with the server OFF.
 *
 * The claim under test: after «انشر المشروع», the published folder is
 * self-contained — the page Joe built, entry named index.html, photographs
 * loading from files INSIDE the folder, no reference back to Joe's local
 * server. The proof opens the staged folder over file:// (no server exists
 * there at all) in a real Chromium and asks the browser whether the image
 * PIXELS actually arrived.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_publish_chain.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

// A real 1×1 JPEG, so naturalWidth is a real measurement, not a guess.
const JPG_1x1 = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
    'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64');

async function main() {
    const { findBuiltArtifact, stageForPages } = await import('../../core/deploy/publish-source');

    // The artifacts dir exactly as a finished build leaves it: a split project
    // whose page references its licensed photo through /artifacts/images/….
    const art = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-art-'));
    fs.mkdirSync(path.join(art, 'images'), { recursive: true });
    fs.writeFileSync(path.join(art, 'images', 'store-hero.jpg'), JPG_1x1);
    fs.mkdirSync(path.join(art, 'joe-pub1'), { recursive: true });
    fs.writeFileSync(path.join(art, 'joe-pub1', 'index.html'), `<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>متجر</title>
<link rel="stylesheet" href="styles.css"></head>
<body><img id="hero" src="/artifacts/images/store-hero.jpg" alt="واجهة المتجر">
<div id="band" class="band">أهلاً</div><script src="script.js"></script></body></html>`);
    fs.writeFileSync(path.join(art, 'joe-pub1', 'styles.css'),
        '.band{background-image:url("/artifacts/images/store-hero.jpg");padding:2rem}');
    fs.writeFileSync(path.join(art, 'joe-pub1', 'script.js'), 'window.__ran = true;');

    // 1) Resolution: the session's build is found.
    const built = findBuiltArtifact({ sessionId: 'pub1', artifactDir: art });
    // 2) Staging: the folder «انشر» pushes to gh-pages.
    const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-stage-'));
    const staged = built ? stageForPages(built, stage, art) : null;

    const indexOut = fs.existsSync(path.join(stage, 'index.html'))
        ? fs.readFileSync(path.join(stage, 'index.html'), 'utf-8') : '';
    const cssOut = fs.existsSync(path.join(stage, 'styles.css'))
        ? fs.readFileSync(path.join(stage, 'styles.css'), 'utf-8') : '';

    // 3) The browser, on the staged folder alone. file:// has no Joe server —
    // if anything still points at /artifacts/, the image cannot load.
    let chromium: any;
    try { ({ chromium } = require('playwright-core')); }
    catch { ({ chromium } = require('playwright')); }
    const exe = process.env.BROWSER_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';
    const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
    const page = await (await browser.newContext()).newPage();
    const failedRequests: string[] = [];
    page.on('requestfailed', (r: any) => failedRequests.push(r.url()));
    await page.goto('file://' + path.join(stage, 'index.html'));
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
        const img = document.getElementById('hero') as HTMLImageElement;
        const band = document.getElementById('band')!;
        return {
            imgLoaded: !!img && img.complete && img.naturalWidth > 0,
            cssBg: getComputedStyle(band).backgroundImage,
            jsRan: (window as any).__ran === true,
        };
    });
    await browser.close();

    const checks: Array<[string, boolean]> = [
        ['the session\'s built project is what «انشر» resolves', !!built && built.kind === 'project'],
        [`staging localized the photo (${staged?.assetsLocalized} asset(s), 0 unresolved)`,
            !!staged && staged.assetsLocalized === 1 && staged.unresolved.length === 0],
        ['no /artifacts/ reference survives in the published HTML', !/\/artifacts\//.test(indexOut)],
        ['no /artifacts/ reference survives in the published CSS', !/\/artifacts\//.test(cssOut)],
        ['the photo PIXELS load with no Joe server at all (file://)', m.imgLoaded],
        [`the CSS background resolves to the local copy → ${m.cssBg.slice(0, 60)}`, /store-hero\.jpg/.test(m.cssBg) && !/\/artifacts\//.test(m.cssBg)],
        ['script.js still runs from the staged folder', m.jsRan],
        [`zero failed network requests (got: ${failedRequests.length})`, failedRequests.length === 0],
    ];

    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; }
    console.log(failed === 0
        ? '\nPROOF COMPLETE: the published folder is self-contained — «انشر المشروع» ships the page Joe built, images included, no local server needed.'
        : `\n${failed} CHECK(S) FAILED`);
    fs.rmSync(art, { recursive: true, force: true });
    fs.rmSync(stage, { recursive: true, force: true });
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
