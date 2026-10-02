/* Run43 gate attempt 2: firstFree-model chat with fresh nonce.
 * Attempt 1 (gpt-4o-mini) returned 400 model_unavailable (no generation).
 * Roster has 55 models; DeepSeek-V4-Flash-0731 passes the feas47 firstFree filter.
 */
const nonce = 'qzx' + Math.floor(Math.random() * 9000 + 1000);
const t0 = Date.now();
const res = await fetch('https://api.llm7.io/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: 'Bearer [REDACTED]', 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: 'DeepSeek-V4-Flash-0731', messages: [{ role: 'user', content: 'Reply with exactly: ' + nonce }], max_tokens: 16 }),
});
const ms = Date.now() - t0;
const text = await res.text().catch(() => '');
const retry = /retry after (\d+)/i.exec(text);
console.log(JSON.stringify({ nonce, status: res.status, ok: res.ok, ms, echo: text.includes(nonce), retryAfterSec: retry ? parseInt(retry[1], 10) : null, head: text.slice(0, 200) }));
