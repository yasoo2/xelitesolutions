/* Muse UI-001 feasibility probe 49 (2026-10-02, ~04:08Z, POST-RESET window).
 * SINGLE-CHAT GATE back-to-back per run44 stop rule option (c)-evidence:
 * at most two tiny chat calls total (1x DuckAI, 1x LLM7), each one short
 * marker-echo prompt. No Joe services imported, no UI run, no files
 * written outside this dir. Expected-BLOCKED; a 200 gate alone does NOT
 * authorize a full run (run44 proved gate-200 does not survive planning).
 * Run: node gate.mjs  (writes results-gate.json)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const out = { startedUtc: new Date().toISOString(), mode: 'SINGLE_CHAT_GATE_POST_RESET', checks: {} };

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
  // 1. Local health: official :5002 and dev :5000 (liveness only).
  for (const [key, url] of [['health5002', 'http://127.0.0.1:5002/api/health'], ['health5000', 'http://127.0.0.1:5000/api/health']]) {
    try {
      const { res, ms } = await timedFetch(url, {}, 10000);
      const text = await res.text().catch(() => '');
      let uptime = null, version = null;
      try { const j = JSON.parse(text); uptime = j.uptime ?? null; version = j.version ?? null; } catch { /* raw */ }
      out.checks[key] = { ok: res.ok, status: res.status, ms, uptime, version };
    } catch (e) {
      out.checks[key] = { ok: false, error: String(e && e.message || e).slice(0, 200) };
    }
  }

  // 2. DuckAI handshake + ONE minimal chat if token present.
  try {
    const { res, ms } = await timedFetch('https://duckduckgo.com/duckchat/v1/status', {
      headers: { 'x-vqd-accept': '1', 'User-Agent': UA, 'Accept': 'text/event-stream', 'Cache-Control': 'no-store' },
    }, 15000);
    const vqd = res.headers.get('x-vqd-4') || res.headers.get('x-vqd-hash-1');
    out.checks.duckHandshake = { ok: res.ok, status: res.status, ms, vqdPresent: !!vqd };
    if (res.ok && vqd) {
      try {
        const { res: c, ms: cms } = await timedFetch('https://duckduckgo.com/duckchat/v1/chat', {
          method: 'POST',
          headers: { 'x-vqd-4': vqd, 'Content-Type': 'application/json', 'User-Agent': UA, 'Accept': 'text/event-stream', 'Origin': 'https://duckduckgo.com', 'Referer': 'https://duckduckgo.com/' },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Reply with exactly: FEAS-OK' }] }),
        }, 90000);
        const raw = await c.text().catch(() => '');
        out.checks.duckChat = { ok: c.ok, status: c.status, ms: cms, bytes: raw.length, containsMarker: raw.includes('FEAS-OK') };
      } catch (e) {
        out.checks.duckChat = { ok: false, error: String(e && e.message || e).slice(0, 200) };
      }
    } else {
      out.checks.duckChat = { skipped: 'no handshake token' };
    }
  } catch (e) {
    out.checks.duckHandshake = { ok: false, error: String(e && e.message || e).slice(0, 200) };
    out.checks.duckChat = { skipped: 'handshake failed' };
  }

  // 3. LLM7 discovery + ONE minimal chat on firstFree.
  try {
    const { res, ms } = await timedFetch('https://api.llm7.io/v1/models', {
      headers: { 'Authorization': 'Bearer [REDACTED]' },
    }, 20000);
    const text = await res.text().catch(() => '');
    let firstFree = null;
    try {
      const j = JSON.parse(text);
      const ids = (j.data || []).map((m) => m.id).filter(Boolean);
      firstFree = ids.find((id) => !/claude|gpt-5|\bo1\b|\bo3\b|\bo4\b|grok|gemini-2\.5-pro|image|video|audio|embed|tts|whisper/i.test(id)) || ids[0] || null;
      out.checks.llm7models = { ok: res.ok, status: res.status, ms, count: ids.length, firstFree };
    } catch {
      out.checks.llm7models = { ok: res.ok, status: res.status, ms, parseError: true, bytes: text.length };
    }
    if (res.ok && firstFree) {
      try {
        const { res: c, ms: cms } = await timedFetch('https://api.llm7.io/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer [REDACTED]', 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: firstFree, messages: [{ role: 'user', content: 'Reply with exactly: FEAS-OK' }], max_tokens: 16 }),
        }, 90000);
        const ctext = await c.text().catch(() => '');
        const retry = /retry after (\d+)/i.exec(ctext);
        out.checks.llm7chat = { ok: c.ok, status: c.status, ms: cms, bytes: ctext.length, containsMarker: ctext.includes('FEAS-OK'), retryAfterSec: retry ? parseInt(retry[1], 10) : null, bodyHead: ctext.slice(0, 200) };
      } catch (e) {
        out.checks.llm7chat = { ok: false, error: String(e && e.message || e).slice(0, 200) };
      }
    } else {
      out.checks.llm7chat = { skipped: 'no model listing' };
    }
  } catch (e) {
    out.checks.llm7models = { ok: false, error: String(e && e.message || e).slice(0, 200) };
    out.checks.llm7chat = { skipped: 'discovery failed' };
  }

  // 4. Local Ollama inventory (tags only, no generation).
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
  fs.writeFileSync(path.join(__dirname, 'results-gate.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}

main().catch((e) => { console.error('PROBE_FATAL', e); process.exit(2); });
