/* Run44 launch gate: quota-free /models GET + ONE minimal LLM7 keyless chat.
 * Bearer 'unused' is the router's own keyless method (llm7.ts:123-124), no secret.
 * Result 2026-10-02T02:27Z: models 200/55 firstFree DeepSeek-V4-Flash-0731;
 * chat 200, nonce echoed live. SEND followed ~5min later; run BLOCKED mid-planning.
 */
const nonce = 'xqz' + Math.floor(Math.random() * 9000 + 1000);
(async () => {
  const m = await fetch('https://api.llm7.io/v1/models', { headers: { Authorization: 'Bearer unused' } });
  const ids = ((await m.json())?.data || []).map((x) => x.id);
  console.log(JSON.stringify({ modelsStatus: m.status, modelCount: ids.length }));
  const t0 = Date.now();
  const res = await fetch('https://api.llm7.io/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer unused', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'DeepSeek-V4-Flash-0731', messages: [{ role: 'user', content: 'Reply with exactly: ' + nonce }], max_tokens: 16 }),
  });
  const ms = Date.now() - t0;
  const text = await res.text().catch(() => '');
  const retry = /retry after (\d+)/i.exec(text);
  console.log(JSON.stringify({ nonce, status: res.status, ok: res.ok, ms, echo: text.includes(nonce), retryAfterSec: retry ? parseInt(retry[1], 10) : null, head: text.slice(0, 160) }));
})().catch((e) => { console.error('GATE_FATAL ' + String((e && e.message) || e).slice(0, 200)); process.exit(2); });
