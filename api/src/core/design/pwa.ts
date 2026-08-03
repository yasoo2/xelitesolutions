/**
 * MOBILE APPS — «جو لا يبني تطبيقات اندرويد للهواتف ولا للهواتف ابل».
 *
 * Joe runs on a Windows laptop with no Android SDK and no Xcode, so a native
 * .apk/.ipa is a promise he cannot keep. What he CAN keep — fully, honestly,
 * and testably — is an installable app: a PWA. The same page he builds gains
 * a web-app manifest, real generated icons, iOS meta tags and an offline
 * service worker; Chrome on Android offers «إضافة إلى الشاشة الرئيسية» and
 * iOS installs it from Share → Add to Home Screen. It opens full-screen in
 * its own window, works offline after the first visit, and after «انشر
 * المشروع» (HTTPS on GitHub Pages) installs on any phone.
 */
import zlib from 'zlib';

/** Does the request ask for a PHONE app? Gated on a phone word so an ordinary
 *  «تطبيق ويب» stays a web page. */
export function wantsMobileApp(text: string): boolean {
    const t = String(text || '');
    const phone = /(اندرويد|أندرويد|آيفون|ايفون|أيفون|آبل|ابل\b|جوال|موبايل|للهاتف|الهاتف|هواتف|android|iphone|ios\b|mobile|smart\s*phone)/i.test(t);
    const app = /(تطبيق|ابلكيشن|أبلكيشن|app\b|application)/i.test(t);
    const install = /(يتثبت|تثبيت|أثبته|يتنزل|home\s*screen|installable|pwa)/i.test(t);
    return (phone && app) || /\bpwa\b/i.test(t) || (phone && install);
}

/* ---------- a real PNG, generated from scratch -------------------------------
 * The manifest needs raster icons (192/512). No image library is guaranteed on
 * the user's machine, but PNG itself is just zlib + CRC — both in node core.
 * A rounded square in the brand colour, opaque inside the radius, transparent
 * outside: enough for the install prompt and the maskable home-screen icon. */

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(buf: Buffer): number {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}
function hexToRgb(hex: string): [number, number, number] {
    const m = String(hex || '').trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return [110, 49, 216]; // Joe's default brand
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A size×size rounded-square PNG in `hex`, corner radius ~22%. */
export function iconPng(size: number, hex: string): Buffer {
    const [r, g, b] = hexToRgb(hex);
    const radius = Math.round(size * 0.22);
    const raw = Buffer.alloc((size * 4 + 1) * size);
    for (let y = 0; y < size; y++) {
        const row = y * (size * 4 + 1);
        raw[row] = 0; // filter: none
        for (let x = 0; x < size; x++) {
            // Distance test against the nearest corner circle.
            const cx = x < radius ? radius : x >= size - radius ? size - 1 - radius : x;
            const cy = y < radius ? radius : y >= size - radius ? size - 1 - radius : y;
            const inside = (x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius
                || (x >= radius && x < size - radius) || (y >= radius && y < size - radius);
            const o = row + 1 + x * 4;
            raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = inside ? 255 : 0;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // colour type RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

export interface PwaOptions {
    /** App name shown under the icon and in the installer. */
    name: string;
    shortName?: string;
    description?: string;
    themeColor: string;      // hex, e.g. #6e31d8
    backgroundColor?: string; // hex
    isArabic?: boolean;
}

export function manifestJson(o: PwaOptions): string {
    return JSON.stringify({
        name: o.name,
        short_name: (o.shortName || o.name).slice(0, 24),
        description: o.description || o.name,
        lang: o.isArabic ? 'ar' : 'en',
        dir: o.isArabic ? 'rtl' : 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: o.themeColor,
        background_color: o.backgroundColor || '#ffffff',
        icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
    }, null, 0);
}

/** Offline-first app shell. Network-updated cache; navigation falls back to the shell. */
export function serviceWorkerJs(): string {
    return `/* Joe PWA — the app works offline after its first visit. */
var CACHE='joe-app-v1';
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return c.addAll(['./','./index.html','./styles.css','./script.js','./manifest.webmanifest']).catch(function(){});
  }).then(function(){return self.skipWaiting()}));
});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim())});
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  e.respondWith(
    caches.match(e.request).then(function(hit){
      var net=fetch(e.request).then(function(res){
        if(res&&res.ok){var cp=res.clone();caches.open(CACHE).then(function(c){c.put(e.request,cp)}).catch(function(){})}
        return res;
      }).catch(function(){return hit||caches.match('./index.html')});
      return hit||net;
    })
  );
});`;
}

/**
 * Inject the app plumbing into the page head: manifest link, iOS meta, and
 * the service-worker registration. Idempotent — a rebuild replaces its own
 * block instead of stacking another.
 */
export function ensurePwaMarkup(html: string, o: PwaOptions): string {
    let out = String(html || '');
    out = out.replace(/<!-- joe-pwa -->[\s\S]*?<!-- \/joe-pwa -->\n?/g, '');
    const block = `<!-- joe-pwa -->
<link rel="manifest" href="manifest.webmanifest">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="${(o.shortName || o.name).replace(/"/g, '&quot;').slice(0, 24)}">
<link rel="apple-touch-icon" href="icon-192.png">
<script>if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('./sw.js').catch(function(){})})}</script>
<!-- /joe-pwa -->`;
    if (/<\/head>/i.test(out)) return out.replace(/<\/head>/i, `${block}\n</head>`);
    return `${block}\n${out}`;
}

/** The install instructions the user is told, in their language. */
export function installNote(isArabic: boolean): string {
    return isArabic
        ? `📱 هذا تطبيق قابل للتثبيت (PWA):
   • أندرويد: افتح الرابط في كروم → قائمة ⋮ → «إضافة إلى الشاشة الرئيسية» — يعمل بملء الشاشة وبدون إنترنت بعد أول فتح.
   • آيفون: افتحه في سفاري → زر المشاركة → «إضافة إلى الشاشة الرئيسية».
   • للتثبيت على هاتفك يلزم رابط إنترنت: أرسل «انشر المشروع» وسأنشره على رابط HTTPS دائم.`
        : `📱 This is an installable app (PWA):
   • Android: open in Chrome → ⋮ menu → "Add to Home screen" — full screen, works offline after the first visit.
   • iPhone: open in Safari → Share → "Add to Home Screen".
   • To install on a phone you need a public URL: say "انشر المشروع" and I'll publish it over HTTPS.`;
}
