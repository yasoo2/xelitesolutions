// src/index.ts
import express from "express";
import { WebSocket, WebSocketServer } from "ws";
import { chromium, devices } from "playwright";
import dotenv from "dotenv";
import pino from "pino";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
dotenv.config();
var logger = pino({
  transport: { target: "pino-pretty", options: { translateTime: "SYS:standard", colorize: true } }
});
var SESSIONS = /* @__PURE__ */ new Map();
var TTL_MS = Number(process.env.SESSION_TTL_MS || 30 * 60 * 1e3);
var API_KEY = process.env.WORKER_API_KEY || "change-me";
var STORAGE_DIR = process.env.WORKER_STORAGE_DIR || "/tmp/joe-browser-worker";
var PORT = Number(process.env.PORT || 7070);
if (!fs.existsSync(STORAGE_DIR)) {
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  } catch {
  }
}
function auth(req, res, next) {
  const key = req.headers["x-worker-key"] || req.query.key;
  if (String(key) !== API_KEY) return res.status(401).json({ error: "unauthorized" });
  next();
}
async function launchChromium() {
  const args = ["--no-sandbox", "--disable-dev-shm-usage"];
  const browser = await chromium.launch({ args, headless: true });
  return browser;
}
async function createSession(opts) {
  const browser = await launchChromium();
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1280, height: 800 },
    userAgent: opts.userAgent,
    locale: opts.locale || "en-US",
    acceptDownloads: true,
    recordVideo: { dir: path.join(STORAGE_DIR, "videos") }
  });
  const page = await context.newPage();
  const id = uuidv4();
  const session2 = {
    id,
    browser,
    context,
    page,
    viewport: opts.viewport || { width: 1280, height: 800 },
    userAgent: opts.userAgent,
    locale: opts.locale,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    downloads: []
  };
  page.on("download", async (dl) => {
    try {
      const safeName = dl.suggestedFilename();
      const fileId = uuidv4();
      const filePath = path.join(STORAGE_DIR, "downloads", `${fileId}-${safeName}`);
      const dir = path.dirname(filePath);
      try {
        await fs.promises.mkdir(dir, { recursive: true });
      } catch {
      }
      await dl.saveAs(filePath);
      const stat = await fs.promises.stat(filePath);
      const size = stat.size;
      const href = `/downloads/${path.basename(filePath)}`;
      session2.downloads.push({ id: fileId, filename: safeName, href, size });
      logger.info({ fileId, safeName, size }, "download_saved");
    } catch (e) {
      logger.error(e, "download_failed");
    }
  });
  SESSIONS.set(id, session2);
  return session2;
}
async function closeSession(id) {
  const s = SESSIONS.get(id);
  if (!s) return;
  try {
    await s.page.close();
  } catch {
  }
  try {
    await s.context.close();
  } catch {
  }
  try {
    await s.browser.close();
  } catch {
  }
  SESSIONS.delete(id);
}
async function runActions(session, actions) {
  const outputs = [];
  const notify = (type, data) => {
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type, ...data }));
    }
  };
  for (const a of actions) {
    session.lastActiveAt = Date.now();
    notify("action_start", { action: a });
    try {
      switch (a.type) {
        case "goto": {
          const allowlist = (process.env.WORKER_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean);
          try {
            const u = new URL(a.url);
            if (allowlist.length && !allowlist.includes(u.hostname)) {
              outputs.push({ type: "goto_blocked", url: a.url, reason: "domain_not_allowed" });
              break;
            }
          } catch {
          }
          await session.page.goto(a.url, { waitUntil: a.waitUntil || "load" });
          outputs.push({ type: "goto", url: a.url });
          try {
            const u = new URL(a.url);
            if (/(^|\\.)google\\./i.test(u.hostname)) {
              const selectors = [
                "#L2AGLb",
                'button[aria-label*="Agree"]',
                "text=I agree",
                "text=Agree",
                "text=Accept all",
                "text=Accept",
                "text=\u0623\u0648\u0627\u0641\u0642",
                "text=\u0642\u0628\u0648\u0644 \u0627\u0644\u0643\u0644",
                "text=\u0645\u0648\u0627\u0641\u0642"
              ];
              for (const sel of selectors) {
                const loc = session.page.locator(sel);
                const c = await loc.count().catch(() => 0);
                if (c > 0) {
                  await loc.first().click({ timeout: 1e3 });
                  outputs.push({ type: "cookie_consent_click", selector: sel });
                  break;
                }
              }
            }
          } catch {
          }
          break;
        }
        case "goBack": {
          await session.page.goBack();
          outputs.push({ type: "goBack" });
          break;
        }
        case "goForward": {
          await session.page.goForward();
          outputs.push({ type: "goForward" });
          break;
        }
        case "reload": {
          await session.page.reload();
          outputs.push({ type: "reload" });
          break;
        }
        case "type": {
          await session.page.keyboard.type(a.text, { delay: a.delay || 20 });
          outputs.push({ type: "type", text: a.text.length });
          break;
        }
        case "press": {
          await session.page.keyboard.press(a.key);
          outputs.push({ type: "press", key: a.key });
          break;
        }
        case "mouseMove": {
          await session.page.mouse.move(a.x, a.y, { steps: a.steps || 1 });
          notify("cursor_move", { x: a.x, y: a.y });
          outputs.push({ type: "mouseMove", x: a.x, y: a.y });
          break;
        }
        case "click": {
          if (a.selector) {
            try {
              const loc = session.page.locator(a.selector).first();
              const box = await loc.boundingBox({ timeout: 1e3 }).catch(() => null);
              if (box) {
                const cx = box.x + box.width / 2;
                const cy = box.y + box.height / 2;
                notify("cursor_move", { x: cx, y: cy });
                await new Promise((r) => setTimeout(r, 150));
              }
              await loc.click();
            } catch (e) {
              await session.page.click(a.selector);
            }
          } else if (a.roleName && a.role) {
            try {
              const loc = session.page.getByRole(a.role, { name: a.roleName }).first();
              const box = await loc.boundingBox({ timeout: 1e3 }).catch(() => null);
              if (box) {
                const cx = box.x + box.width / 2;
                const cy = box.y + box.height / 2;
                notify("cursor_move", { x: cx, y: cy });
                await new Promise((r) => setTimeout(r, 150));
              }
              await loc.click();
            } catch {
              await session.page.getByRole(a.role, { name: a.roleName }).click();
            }
          } else if (typeof a.x === "number" && typeof a.y === "number") {
            await session.page.mouse.click(a.x, a.y, { button: a.button || "left" });
            notify("cursor_click", { x: a.x, y: a.y });
          }
          outputs.push({ type: "click" });
          break;
        }
        case "locate": {
          let box = null;
          if (a.selector) {
            const el = await session.page.$(a.selector);
            if (el) box = await el.boundingBox();
          } else if (a.roleName && a.role) {
            const locator = session.page.getByRole(a.role, { name: a.roleName });
            const el = await locator.elementHandle();
            if (el) box = await el.boundingBox();
          }
          outputs.push({ type: "locate", boundingBox: box });
          break;
        }
        case "waitForRole": {
          const locator = session.page.getByRole(a.role, { name: a.roleName });
          await locator.waitFor({ state: "visible", timeout: a.timeoutMs || 8e3 });
          outputs.push({ type: "waitForRole", role: a.role, roleName: a.roleName });
          break;
        }
        case "waitForSelector": {
          await session.page.waitForSelector(a.selector, { state: "visible", timeout: a.timeoutMs || 8e3 });
          outputs.push({ type: "waitForSelector", selector: a.selector });
          break;
        }
        case "scroll": {
          await session.page.evaluate((dy) => window.scrollBy(0, dy), a.deltaY);
          outputs.push({ type: "scroll", deltaY: a.deltaY });
          break;
        }
        case "scrollTo": {
          await session.page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }, a.selector);
          outputs.push({ type: "scrollTo", selector: a.selector });
          break;
        }
        case "wait": {
          await new Promise((r) => setTimeout(r, a.ms));
          outputs.push({ type: "wait", ms: a.ms });
          break;
        }
        case "waitForLoad": {
          await session.page.waitForLoadState(a.state);
          outputs.push({ type: "waitForLoad", state: a.state });
          break;
        }
        case "screenshot": {
          const buf = await session.page.screenshot({ type: "jpeg", quality: a.quality || 60, fullPage: a.fullPage || false });
          const name = `s-${Date.now()}.jpg`;
          const p = path.join(STORAGE_DIR, "shots", name);
          const dir = path.dirname(p);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(p, buf);
          outputs.push({ type: "screenshot", href: `/shots/${name}` });
          break;
        }
        case "snapshot.dom": {
          const html = await session.page.content();
          outputs.push({ type: "snapshot.dom", length: html.length });
          break;
        }
        case "snapshot.a11y": {
          const snap = await session.page.accessibility.snapshot();
          outputs.push({ type: "snapshot.a11y", nodes: (snap?.children || []).length });
          break;
        }
        case "extract": {
          const result2 = await session.page.evaluate((schema) => {
            function pick(el, s) {
              const out = {};
              for (const [k, v] of Object.entries(s.fields || {})) {
                const sel = v.selector || "";
                const node = sel ? el.querySelector(sel) : el;
                if (!node) {
                  out[k] = null;
                  continue;
                }
                const attr = v.attr;
                let val = attr ? node.getAttribute(attr) || null : (node.textContent || "").trim();
                if (attr === "href" && typeof val === "string") {
                  try {
                    const u = new URL(val, location.origin);
                    if (u.hostname.includes("google") && u.pathname === "/url") {
                      const q = u.searchParams.get("q") || u.searchParams.get("url");
                      val = q || u.href;
                    } else {
                      val = u.href;
                    }
                  } catch {
                  }
                }
                out[k] = val;
              }
              return out;
            }
            if (schema.list) {
              const elements = Array.from(document.querySelectorAll(schema.list.selector));
              return elements.map((el) => pick(el, schema.list));
            }
            if (schema.single) {
              const base = document.querySelector(schema.single.selector);
              return base ? pick(base, schema.single) : null;
            }
            return null;
          }, a.schema);
          outputs.push({ type: "extract", json: result2, confidence: 0.7 });
          break;
        }
        case "fillForm": {
          for (const f of a.fields) {
            if (f.selector) {
              if (f.kind === "file") {
              } else {
                await session.page.fill(f.selector, String(f.value ?? ""));
              }
            } else if (f.label) {
              const locator = session.page.getByLabel(f.label);
              if (f.kind === "checkbox") await locator.check();
              else if (f.kind === "radio") await locator.check();
              else await locator.fill(String(f.value ?? ""));
            }
          }
          outputs.push({ type: "fillForm", count: a.fields.length });
          break;
        }
        case "uploadFile": {
          const res = await fetch(a.fileUrl);
          const arrayBuf = await res.arrayBuffer();
          const ext = path.extname(new URL(a.fileUrl).pathname);
          const tmpPath = path.join(STORAGE_DIR, "uploads", `u-${Date.now()}${ext}`);
          const dir = path.dirname(tmpPath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(tmpPath, Buffer.from(arrayBuf));
          await session.page.setInputFiles(a.selector, tmpPath);
          outputs.push({ type: "uploadFile", selector: a.selector });
          break;
        }
        case "evaluate": {
          const result = await session.page.evaluate((code) => {
            return eval(code);
          }, a.script);
          outputs.push({ type: "evaluate", result });
          break;
        }
      }
      notify("action_done", { type: a.type });
    } catch (err) {
      logger.warn({ action: a, error: err.message }, "action_failed");
      notify("action_error", { type: a.type, error: err.message });
      outputs.push({ type: "error", action: a.type, message: err.message });
    }
  }
  return outputs;
}
var app = express();
app.use(express.json({ limit: "10mb" }));
app.get("/health", (_req, res) => res.json({ status: "OK" }));
app.use("/downloads", express.static(path.join(STORAGE_DIR, "downloads")));
app.use("/shots", express.static(path.join(STORAGE_DIR, "shots")));
app.post("/session/create", auth, async (req, res) => {
  try {
    const { viewport, userAgent, locale, device } = req.body || {};
    const s = await createSession({ viewport, userAgent, locale });
    if (device && devices[device]) {
      await s.context.close();
      await s.browser.close();
      const browser = await launchChromium();
      const ctx = await browser.newContext({ ...devices[device], acceptDownloads: true, recordVideo: { dir: path.join(STORAGE_DIR, "videos") } });
      const page = await ctx.newPage();
      s.browser = browser;
      s.context = ctx;
      s.page = page;
      const preset = devices[device];
      s.viewport = preset && preset.viewport ? preset.viewport : s.viewport;
    }
    res.json({ sessionId: s.id, wsUrl: `/ws/${s.id}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/session/:id/close", auth, async (req, res) => {
  await closeSession(req.params.id);
  res.json({ ok: true });
});
app.post("/session/:id/job/run", auth, async (req, res) => {
  const s = SESSIONS.get(req.params.id);
  if (!s) return res.status(404).json({ error: "session_not_found" });
  const actions2 = Array.isArray(req.body?.actions) ? req.body.actions : [];
  const outputs2 = await runActions(s, actions2);
  res.json({ ok: true, outputs: outputs2, artifacts: s.downloads });
});
app.post("/session/:id/snapshot", auth, async (req, res) => {
  const s = SESSIONS.get(req.params.id);
  if (!s) return res.status(404).json({ error: "session_not_found" });
  const [html, a11ySnap, buf] = await Promise.all([
    s.page.content(),
    s.page.accessibility ? s.page.accessibility.snapshot().catch(() => null) : Promise.resolve(null),
    s.page.screenshot({ type: "jpeg", quality: 60 })
  ]);
  const name = `snap-${Date.now()}.jpg`;
  const p = path.join(STORAGE_DIR, "shots", name);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, buf);
  res.json({ dom: html.slice(0, 1e5), a11y: a11ySnap, screenshot: `/shots/${name}` });
});
app.post("/session/:id/extract", auth, async (req, res) => {
  const s = SESSIONS.get(req.params.id);
  if (!s) return res.status(404).json({ error: "session_not_found" });
  const schema = req.body?.schema;
  if (!schema) return res.status(400).json({ error: "schema_required" });
  const outputs2 = await runActions(s, [{ type: "extract", schema }]);
  const out = outputs2.find((o) => o.type === "extract");
  res.json({ json: out?.json, confidence: out?.confidence ?? 0.7 });
});
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of SESSIONS.entries()) {
    if (now - s.lastActiveAt > TTL_MS) {
      logger.info({ id }, "session_ttl_close");
      closeSession(id).catch(() => {
      });
    }
  }
}, 3e4);
var wss = new WebSocketServer({ noServer: true });
var server = app.listen(PORT, "0.0.0.0", () => {
  logger.info({ port: PORT }, "worker_listening");
});
server.on("upgrade", async (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const reject = (status, message) => {
    try {
      socket.write(
        `HTTP/1.1 ${status} ${message}\r
Connection: close\r
Content-Type: text/plain\r
Content-Length: ${Buffer.byteLength(message)}\r
\r
` + message
      );
    } catch {
    }
    try {
      socket.destroy();
    } catch {
    }
  };
  if (!url.pathname.startsWith("/ws/")) return reject(404, "Not Found");
  const sessionId = url.pathname.split("/").pop();
  const key = url.searchParams.get("key");
  if (key !== API_KEY) return reject(401, "Unauthorized");
  const s = SESSIONS.get(String(sessionId));
  if (!s) return reject(404, "Session Not Found");
  wss.handleUpgrade(req, socket, head, (ws) => {
    s.ws = ws;
    s.lastActiveAt = Date.now();
    ws.send(JSON.stringify({ type: "stream_start", w: s.viewport.width, h: s.viewport.height }));
    let running = true;
    ws.on("close", () => {
      running = false;
      s.ws = void 0;
    });
    ws.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "action") {
          s.lastActiveAt = Date.now();
          const a2 = msg.action;
          await runActions(s, [a2]);
        }
      } catch {
      }
    });
    const loop = async () => {
      while (running) {
        try {
          s.lastActiveAt = Date.now();
          const buf = await s.page.screenshot({ type: "jpeg", quality: 50 });
          ws.send(JSON.stringify({ type: "frame", jpegBase64: buf.toString("base64"), ts: Date.now(), w: s.viewport.width, h: s.viewport.height }));
          await new Promise((r) => setTimeout(r, 200));
        } catch (e) {
          break;
        }
      }
    };
    loop();
  });
});
