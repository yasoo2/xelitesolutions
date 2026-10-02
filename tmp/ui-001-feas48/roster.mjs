/* Muse UI-001 feasibility probe 48 (2026-10-02, ~03:00Z, pre-reset).
 * ROSTER-ONLY: zero chats, zero quota cost. Adapts feas47/probe.mjs by
 * deleting both chat calls; keeps DuckAI handshake (status only), LLM7
 * GET /models, Ollama /api/tags. No Joe services imported, no UI run,
 * no files written outside this dir.
 * Run: node roster.mjs  (writes results.json)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const out = { startedUtc: new Date().toISOString(), mode: 'ROSTER_ONLY_ZERO_CHATS', checks: {} };

async function timedFetch(url, opts, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const ms = Date.now() - start;
    return { res, ms };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  // 1. DuckAI anonymous handshake ONLY (no chat).
  try {
    const { res, ms } = await timedFetch('https://duckduckgo.com/duckchat/v1/status', {
      headers: { 'x-vqd-accept': '1', 'User-Agent': UA, 'Accept': 'text/event-stream', 'Cache-Control': 'no-store' },
    }, 15000);
    const vqd = res.headers.get('x-vqd-4') || res.headers.get('x-vqd-hash-1');
    out.checks.duckHandshake = { ok: res.ok, status: res.status, ms, vqdPresent: !!vqd };
  } catch (e) {
    out.checks.duckHandshake = { ok: false, error: String(e && e.message || e).slice(0, 200) };
  }
  out.checks.duckChat = { skipped: 'roster-only probe; no chat by design (pre-reset)' };

  // 2. LLM7 model discovery ONLY (GET /models, no chat quota).
  try {
    const { res, ms } = await timedFetch('https://api.llm7.io/v1/models', {
      headers: { 'Authorization': 'Bearer unused' },
    }, 20000);
    const text = await res.text().catch(() => '');
    try {
      const j = JSON.parse(text);
      const ids = (j.data || []).map((m) => m.id).filter(Boolean);
      const firstFree = ids.find((id) => !/claude|gpt-5|\bo1\b|\bo3\b|\bo4\b|grok|gemini-2\.5-pro|image|video|audio|embed|tts|whisper/i.test(id)) || ids[0] || null;
      out.checks.llm7models = { ok: res.ok, status: res.status, ms, count: ids.length, firstFree };
    } catch {
      out.checks.llm7models = { ok: res.ok, status: res.status, ms, parseError: true, bytes: text.length };
    }
  } catch (e) {
    out.checks.llm7models = { ok: false, error: String(e && e.message || e).slice(0, 200) };
  }
  out.checks.llm7chat = { skipped: 'roster-only probe; no chat by design (pre-reset)' };

  // 3. Local Ollama inventory (tags only, no generation).
  try {
    const { res, ms } = await timedFetch('http://127.0.0.1:11434/api/tags', {}, 10000);
    const text = await res.text().catch(() => '');
    let models = [];
    try { models = (JSON.parse(text).models || []).map((m) => m.name); } catch { /* keep raw */ }
    out.checks.ollama = { ok: res.ok, status: res.status, ms, models };
  } catch (e) {
    out.checks.ollama = { ok: false, error: String(e && e.message || e).slice(0, 200) };
  }

  out.finishedUtc = new Date().toISOString();
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}

main().catch((e) => { console.error('PROBE_FATAL', e); process.exit(2); });
