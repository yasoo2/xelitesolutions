/* Run43 launch gate: ONE minimal LLM7 keyless chat with a fresh nonce.
 * Per run42 stop rule: launch only if this shows a real 200 generation
 * back-to-back with SEND. Zero other quota spent this cycle.
 */
const nonce = 'kxq' + Math.floor(Math.random() * 9000 + 1000);
(async () => {
  const t0 = Date.now();
  const res = await fetch('https://api.llm7.io/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer [REDACTED]', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Reply with exactly: ' + nonce }], max_tokens: 16 }),
  });
  const ms = Date.now() - t0;
  const text = await res.text().catch(() => '');
  const retry = /retry after (\d+)/i.exec(text);
  console.log(JSON.stringify({ nonce, status: res.status, ok: res.ok, ms, echo: text.includes(nonce), retryAfterSec: retry ? parseInt(retry[1], 10) : null, head: text.slice(0, 160) }));
})().catch((e) => { console.error('GATE_FATAL ' + String((e && e.message) || e).slice(0, 200)); process.exit(2); });
