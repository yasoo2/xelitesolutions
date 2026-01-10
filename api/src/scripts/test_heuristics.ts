
import assert from 'node:assert/strict';

function pickToolFromText(text: string) {
  const t = text.toLowerCase();
  const tn = t
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآ]/g, 'ا'); // Normalize Alefs to bare Alef

  const urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i);
  const domainMatch = !urlMatch
    ? text.match(/(?:^|\s)((?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/[^\s"'<>]*)?)/i)
    : null;
  // Browser open heuristics (Arabic/English)
  // Normalized: "افتح", "ابدا", "ادخل", "اذهب"
  // Removed "browser" to avoid "info about browser" false positive
  // Added "فتح" (opening) and "دخول" (entering)
  if (/(open|افتح|ابدا|launch|go\s+to|ادخل|اذهب|فتح|دخول|زيارة|شغل|روح|زور|وديني|ودني|ودنا|خلني|خليني|بدي|عايز|عاوز|ابي|ابغى)/i.test(tn)) {
    let url = urlMatch ? urlMatch[0] : '';
    if (!url && domainMatch?.[1]) {
      const candidate = String(domainMatch[1]).replace(/[)\].,;:!?]+$/g, '').trim();
      const isLocal =
        /^localhost(?::\d+)?(?:\/|$)/i.test(candidate) ||
        /^127\.0\.0\.1(?::\d+)?(?:\/|$)/.test(candidate) ||
        /^\d+\.\d+\.\d+\.\d+(?::\d+)?(?:\/|$)/.test(candidate);
      url = `${isLocal ? 'http' : 'https'}://${candidate.replace(/^\/\//, '')}`;
    }
    if (!url) url = 'https://www.google.com';
    // Fallback for known sites if no URL
    if (!urlMatch) {
        if (/(google|جوجل)/i.test(tn)) url = 'https://www.google.com';
        else if (/(youtube|يوتيوب)/i.test(tn)) url = 'https://www.youtube.com';
        else if (/(twitter|تويتر)/i.test(tn)) url = 'https://www.twitter.com';
        else if (/(linkedin|لينكد)/i.test(tn)) url = 'https://www.linkedin.com';
        else if (/(github|جيت)/i.test(tn)) url = 'https://www.github.com';
        else if (/(open\s*a\s*i|open\s*ai|openai|اوبن\s*اي\s*اي|اوبن\s*اي)/i.test(tn)) url = 'https://platform.openai.com/';
    }
    return { name: 'browser_open', input: { url } };
  }
  
  if (/(ابحث|بحث|search|find|lookup|اعطيني|معلومات|info)/.test(t) || /^(من|ما|ماذا|متى|اين|أين|كيف|هل|لماذا|why|what|who|when|where|how)\s/.test(t)) {
    const qMatch = text.match(/(?:عن|حول)\s+(.+)/i);
    const query = qMatch ? qMatch[1] : text;
    return { name: 'web_search', input: { query } };
  }

  return { name: 'echo', input: { text } };
}

function isSimpleBrowserOpenRequestText(text: string) {
  const s = String(text || '');
  if (!s.trim()) return false;
  const hasUrl =
    /https?:\/\/[^\s"'<>]+/i.test(s) ||
    /(?:^|\s)(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/[^\s"'<>]*)?(?:\s|$)/i.test(s);
  const openKeyword =
    /(open|start|launch|browse|visit|go to|ادخل|افتح|اذهب|زيارة|شغل|ابدأ|روح|زور|وديني|ودني|ودنا|خلني|خليني|بدي|عايز|عاوز|ابي|ابغى)/i.test(
      s,
    );
  const browserKeyword = /(\b(browser|web|preview)\b|متصفح|المتصفح|داخل المتصفح|معاينة|المعاينة)/i.test(s);
  const multiStepKeyword =
    /(\bthen\b|\bafter\b|\bnext\b|and then|, then|; then|ثم|وبعد|بعد( ذلك)?|بعدها|ومن ثم|عدة\s+خطوات|خطوات|خطوة|تابع|نفذ|قم\s+ب|رجاء|من\s+فضلك|ابحث|بحث|search|find|lookup|سجل\s*دخول|تسجيل\s*الدخول|login|sign\s*in|انقر|اضغط|click|type|اكتب|املأ|fill|submit|إرسال|scroll|مرر|extract|استخرج|لخص|summarize)/i.test(
      s,
    );
  const isFileOp = /(file|folder|directory|ملف|مجلد|مسار|path|terminal|command|أمر|ترمينال)/i.test(s);
  const analysisKeyword = /(كود|code|repo|repository|مستودع|ملفات|files|اختبر|تحقق|راجع|audit|lint|build|typecheck|تحليل)/i.test(s);
  const hasSiteKeyword =
    /(github|جيتهاب|كتهاب|كيتهاب|yahoo|ياهو|google|جوجل|youtube|يوتيوب|open\s*a\s*i|open\s*ai|openai|اوبن\s*اي\s*اي|اوبن\s*اي)/i.test(
      s,
    ) ||
    /(?:^|\s)(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\:\d+)?(?:\/[^\s"'<>]*)?(?:\s|$)/i.test(s);
  if (!hasUrl && !hasSiteKeyword) return false;
  if (!(openKeyword || browserKeyword || hasUrl)) return false;
  if (multiStepKeyword) return false;
  if (isFileOp && !hasUrl) return false;
  if (analysisKeyword) return false;
  return true;
}

const inputs = [
    "طلبت من جو فتح المتصفح والدخول الى جوجل ولكنه لم يستجيب",
    "افتح المتصفح والدخول الى جوجل",
    "افتح جوجل",
    "افتح موقع open ai",
    "روح xelitesolutions.com",
    "أفتح المتصفح",
    "إفتح المتصفح",
    "ابدأ المتصفح",
    "أبدأ المتصفح",
    "Open browser and go to google",
    "اعطيني معلومات عن اسطنبول",
    "أعطيني معلومات",
    "فتح المتصفح",
    "Info about browser",
    "معلومات عن المتصفح",
    "google",
    "جوجل",
    "open ai"
];

inputs.forEach(input => {
    console.log(`Input: "${input}"`);
    console.log(`Result:`, pickToolFromText(input));
    console.log('---');
});

assert.equal(isSimpleBrowserOpenRequestText('افتح جوجل'), true);
assert.equal(isSimpleBrowserOpenRequestText('افتح https://www.google.com'), true);
assert.equal(isSimpleBrowserOpenRequestText('افتح جوجل ثم ابحث عن سعر الدولار'), false);
assert.equal(isSimpleBrowserOpenRequestText('افتح https://www.google.com ثم ابحث عن سعر الدولار'), false);
assert.equal(isSimpleBrowserOpenRequestText('open google then search for exchange rates'), false);
