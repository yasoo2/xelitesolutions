/**
 * ⛔ AN INSTALLABLE APP'S MANIFEST IS SHOWN TO THE JUDGE.
 *
 * The eleventh live check, 2026-11-11 (L191, a beauty salon's offline-first PWA): the
 * acceptance judge ruled «R1 unprovable: the page links a manifest, but manifest.webmanifest
 * and its icons are not shown» and «R6 unprovable: manifest.webmanifest itself is not in the
 * source». The judge read .json, never .webmanifest — the very name the web standard gives
 * the file — and Joe renamed it manifest.json to be read. It is shown as configuration now.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { judgeSource } from '../core/engine/verify';

test('manifest.webmanifest is part of the source the acceptance judge reads', async () => {
    const root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-judge-pwa-'));
    try {
        fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html lang="ar" dir="rtl"><head><link rel="manifest" href="manifest.webmanifest"></head><body><h1>صالون</h1><script src="app.js"></script></body></html>');
        fs.writeFileSync(path.join(root, 'app.js'), "if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');");
        fs.writeFileSync(path.join(root, 'sw.js'), "self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));");
        fs.writeFileSync(path.join(root, 'manifest.webmanifest'), JSON.stringify({
            name: 'صالون الجمال', short_name: 'الصالون', start_url: './', display: 'standalone', dir: 'rtl', lang: 'ar',
            icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }],
        }));
        const { text } = await judgeSource(root);
        expect(text).toContain('manifest.webmanifest');
        expect(text).toContain('"display":"standalone"');
        expect(text).toContain('icon-512.png');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
