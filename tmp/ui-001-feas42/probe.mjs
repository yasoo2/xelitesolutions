/* Muse UI-001 feasibility probe 40 (2026-10-01).
 * Cheap, bounded, fresh provider-availability evidence. Uses the same anonymous/
 * keyless endpoints Joe's own providers use; at most two tiny chat calls total.
 * No Joe services imported, no UI run, no files written outside this dir.
 * Run: node probe.mjs  (writes results.json)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const out = { startedUtc: new Date().toISOString(), checks: {} };

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
  // 1. DuckAI anonymous handshake (quota-free status call, cf. duckai.ts getVqd).
  try {
    const { res, ms } = await timedFetch('https://duckduckgo.com/duckchat/v1/status', {
      headers: { 'x-vqd-accept': '1', 'User-Agent': UA, 'Accept': 'text/event-stream', 'Cache-Control': 'no-store' },
    }, 15000);
    const vqd = res.headers.get('x-vqd-4') || res.headers.get('x-vqd-hash-1');
    out.checks.duckHandshake = { ok: res.ok, status: res.status, ms, vqdPresent: !!vqd };
    // 2. One minimal chat only if the handshake yields a token.
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

  // 3. LLM7 model discovery (GET /models, no chat quota) + one minimal chat.
  try {
    const { res, ms } = await timedFetch('https://api.llm7.io/v1/models', {
      headers: { 'Authorization': 'Bearer unused' },
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
          headers: { 'Authorization': 'Bearer unused', 'Content-Type': 'application/json' },
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

  // 4. Local Ollama inventory (fast; no generation — SMOKE-OK already proven twice,
  //    and local planning-scale generation is established as too slow for Joe's leash).
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
