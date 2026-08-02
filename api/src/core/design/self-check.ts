/**
 * Self-check — every site Joe delivers carries the discipline he was taught:
 * «افحص، وأصلح، وأعد الفحص». The owner of the finished site can run a REAL
 * in-browser audit of their own page at any time, with no tools installed.
 *
 * How the owner uses it: open the site with `?joe-check` in the address
 * (e.g. mysite.com/?joe-check). A small overlay appears listing only
 * MEASURED facts — never guesses:
 *   - images that actually failed to load (complete && naturalWidth === 0)
 *   - anchors pointing at ids that do not exist on the page
 *   - placeholder links (href="#") that go nowhere
 *   - form fields a screen reader cannot name (no label/aria-label)
 *   - JavaScript errors that fired since page load
 *
 * Ordinary visitors never see any of this: without the flag the script
 * returns immediately and renders nothing. The overlay is self-contained —
 * inline styles, zero network requests, zero dependencies.
 */

export function selfCheckScript(isArabic: boolean): string {
    const L = isArabic
        ? {
            title: 'فحص جو الذاتي',
            clean: 'لا مشاكل قابلة للقياس في هذه الصفحة ✓',
            imgs: (n: number) => `${n} صورة لم تُحمَّل`,
            anchors: (n: number) => `${n} رابط داخلي يشير إلى قسم غير موجود`,
            placeholders: (n: number) => `${n} رابط لا يذهب إلى أي مكان (href="#")`,
            unlabeled: (n: number) => `${n} حقل إدخال بلا تسمية لقارئ الشاشة`,
            jsErrors: (n: number) => `${n} خطأ JavaScript منذ فتح الصفحة`,
            close: 'إغلاق',
            dir: 'rtl',
        }
        : {
            title: 'Joe self-check',
            clean: 'No measurable problems on this page ✓',
            imgs: (n: number) => `${n} image(s) failed to load`,
            anchors: (n: number) => `${n} internal link(s) point at a missing section`,
            placeholders: (n: number) => `${n} link(s) go nowhere (href="#")`,
            unlabeled: (n: number) => `${n} form field(s) unnamed for screen readers`,
            jsErrors: (n: number) => `${n} JavaScript error(s) since load`,
            close: 'Close',
            dir: 'ltr',
        };

    // The labels are baked in as an array of [count-fn-template] pairs the
    // runtime fills with real numbers. Kept as a plain template string so the
    // page stays dependency-free.
    //
    // WRAPPED IN <script> TAGS — this is not a style choice. Every other
    // runtime Joe injects (uiKitScript, chromeRuntime, themeRuntime …) returns
    // a complete <script> element, and assemblePage concatenates them straight
    // into the <body>. This one returned BARE JavaScript, so on every
    // section-wise build the whole self-check landed as VISIBLE TEXT at the
    // end of the page — the user photographed it: «يوجد كودات لم يتم اصلاحها
    // وتم عرضها بالنظام». A build product that renders its own source is the
    // exact defect this file exists to detect.
    return `<script>
/* Joe self-check — runs ONLY when the address contains ?joe-check */
(function(){
  if (!/[?&#]joe-check/.test(location.search + location.hash)) return;
  var jsErrors = [];
  window.addEventListener('error', function(e){ jsErrors.push(String(e.message||'error')); });
  function run(){
    var findings = [];
    var brokenImgs = Array.prototype.filter.call(document.images, function(im){
      return im.complete && im.naturalWidth === 0 && im.getAttribute('src');
    });
    if (brokenImgs.length) findings.push(${JSON.stringify(isArabic ? '¤ صورة لم تُحمَّل' : '¤ image(s) failed to load')}.replace('¤', brokenImgs.length));
    var dead = [], placeholders = 0;
    Array.prototype.forEach.call(document.querySelectorAll('a[href^="#"]'), function(a){
      var h = a.getAttribute('href');
      if (h === '#') { placeholders++; return; }
      try { if (!document.getElementById(decodeURIComponent(h.slice(1)))) dead.push(h); } catch(_){}
    });
    if (dead.length) findings.push(${JSON.stringify(isArabic ? '¤ رابط داخلي يشير إلى قسم غير موجود' : '¤ internal link(s) point at a missing section')}.replace('¤', dead.length));
    if (placeholders) findings.push(${JSON.stringify(isArabic ? '¤ رابط لا يذهب إلى أي مكان (href="#")' : '¤ link(s) go nowhere (href="#")')}.replace('¤', placeholders));
    var unlabeled = Array.prototype.filter.call(
      document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select'),
      function(el){
        if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return false;
        if (el.id && document.querySelector('label[for="' + el.id.replace(/"/g,'') + '"]')) return false;
        var p = el.closest && el.closest('label');
        return !p;
      });
    if (unlabeled.length) findings.push(${JSON.stringify(isArabic ? '¤ حقل إدخال بلا تسمية لقارئ الشاشة' : '¤ form field(s) unnamed for screen readers')}.replace('¤', unlabeled.length));
    if (jsErrors.length) findings.push(${JSON.stringify(isArabic ? '¤ خطأ JavaScript منذ فتح الصفحة' : '¤ JavaScript error(s) since load')}.replace('¤', jsErrors.length));

    var panel = document.createElement('div');
    panel.id = 'joe-self-check';
    panel.setAttribute('dir', ${JSON.stringify(L.dir)});
    panel.style.cssText = 'position:fixed;bottom:16px;inset-inline-start:16px;z-index:2147483000;max-width:340px;'
      + 'background:#101418;color:#e8ecef;border:1px solid rgba(62,207,142,.35);border-radius:14px;'
      + 'padding:14px 16px;font:13px/1.7 system-ui,sans-serif;box-shadow:0 16px 44px rgba(0,0,0,.45)';
    var head = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-weight:700">'
      + '<span style="width:8px;height:8px;border-radius:50%;background:' + (findings.length ? '#f59e0b' : '#3ecf8e') + '"></span>'
      + ${JSON.stringify(L.title)} + '</div>';
    var body = findings.length
      ? '<ul style="margin:0;padding-inline-start:18px">' + findings.map(function(f){ return '<li>' + f + '</li>'; }).join('') + '</ul>'
      : '<div>' + ${JSON.stringify(L.clean)} + '</div>';
    var closeBtn = '<button id="joe-self-check-x" style="margin-top:10px;background:none;border:1px solid rgba(255,255,255,.18);'
      + 'color:#9aa4ab;border-radius:8px;padding:4px 12px;cursor:pointer;font:inherit">' + ${JSON.stringify(L.close)} + '</button>';
    panel.innerHTML = head + body + closeBtn;
    document.body.appendChild(panel);
    var x = document.getElementById('joe-self-check-x');
    if (x) x.addEventListener('click', function(){ panel.remove(); });
  }
  if (document.readyState === 'complete') setTimeout(run, 400);
  else window.addEventListener('load', function(){ setTimeout(run, 400); });
})();
</script>`;
}
