
function pickToolFromText(text: string) {
  const t = text.toLowerCase();
  const tn = t
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآ]/g, 'ا'); // Normalize Alefs to bare Alef

  const urlMatch = text.match(/https?:\/\/\S+/);
  // Browser open heuristics (Arabic/English)
  // Normalized: "افتح", "ابدا", "ادخل", "اذهب"
  // Removed "browser" to avoid "info about browser" false positive
  // Added "فتح" (opening) and "دخول" (entering)
  if (/(open|افتح|ابدا|launch|go\s+to|ادخل|اذهب|فتح|دخول)/i.test(tn)) {
    let url = urlMatch ? urlMatch[0] : 'https://www.google.com';
    // Fallback for known sites if no URL
    if (!urlMatch) {
        if (/(google|جوجل)/i.test(tn)) url = 'https://www.google.com';
        else if (/(youtube|يوتيوب)/i.test(tn)) url = 'https://www.youtube.com';
        else if (/(twitter|تويتر)/i.test(tn)) url = 'https://www.twitter.com';
        else if (/(linkedin|لينكد)/i.test(tn)) url = 'https://www.linkedin.com';
        else if (/(github|جيت)/i.test(tn)) url = 'https://www.github.com';
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

const inputs = [
    "طلبت من جو فتح المتصفح والدخول الى جوجل ولكنه لم يستجيب",
    "افتح المتصفح والدخول الى جوجل",
    "افتح جوجل",
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
    "جوجل"
];

inputs.forEach(input => {
    console.log(`Input: "${input}"`);
    console.log(`Result:`, pickToolFromText(input));
    console.log('---');
});
