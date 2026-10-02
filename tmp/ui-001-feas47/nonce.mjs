/* One-shot nonce discriminator: is LLM7 chat live generation or cached echo? */
const nonce = 'zxq' + Math.floor(1000 + Math.random() * 9000);
console.log('NONCE=' + nonce);
const controller = new AbortController();
const t = setTimeout(() => controller.abort(), 90000);
try {
  const res = await fetch('https://api.llm7.io/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer [REDACTED]', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'DeepSeek-V4-Flash-0731', messages: [{ role: 'user', content: 'Reply with exactly this code and nothing else: ' + nonce }], max_tokens: 32 }),
    signal: controller.signal,
  });
  const text = await res.text();
  console.log('STATUS=' + res.status);
  console.log('BYTES=' + text.length);
  console.log('CONTAINS_NONCE=' + text.includes(nonce));
  console.log('HEAD=' + text.slice(0, 300));
  const fs = await import('fs');
  fs.writeFileSync('llm7-nonce-check.json', JSON.stringify({ nonce, status: res.status, containsNonce: text.includes(nonce), body: text.slice(0, 2000) }, null, 1));
} finally {
  clearTimeout(t);
}
