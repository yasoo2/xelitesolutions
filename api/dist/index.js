"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/models/session.ts
var session_exports = {};
__export(session_exports, {
  Session: () => Session
});
var import_mongoose7, SessionSchema, Session;
var init_session = __esm({
  "src/models/session.ts"() {
    "use strict";
    import_mongoose7 = __toESM(require("mongoose"));
    SessionSchema = new import_mongoose7.Schema(
      {
        tenantId: { type: import_mongoose7.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
        projectId: { type: import_mongoose7.Schema.Types.ObjectId, ref: "Project", index: true },
        userId: { type: import_mongoose7.Schema.Types.ObjectId, ref: "User", index: true, required: true },
        title: { type: String, required: true },
        mode: { type: String, enum: ["ADVISOR", "BUILDER", "SAFE", "OWNER"], default: "ADVISOR" },
        kind: { type: String, enum: ["chat", "agent"], default: "chat", index: true },
        isPinned: { type: Boolean, default: false },
        lastSnippet: { type: String },
        lastUpdatedAt: { type: Date, default: Date.now },
        folderId: { type: import_mongoose7.Schema.Types.ObjectId, ref: "Folder" },
        terminalState: { type: String }
      },
      { timestamps: true }
    );
    SessionSchema.index({ userId: 1, title: 1 }, { unique: true });
    Session = import_mongoose7.default.model("Session", SessionSchema);
  }
});

// src/models/tenant.ts
var tenant_exports = {};
__export(tenant_exports, {
  Tenant: () => Tenant
});
var import_mongoose11, TenantSchema, Tenant;
var init_tenant = __esm({
  "src/models/tenant.ts"() {
    "use strict";
    import_mongoose11 = __toESM(require("mongoose"));
    TenantSchema = new import_mongoose11.Schema(
      {
        name: { type: String, required: true, unique: true },
        domain: { type: String }
      },
      { timestamps: true }
    );
    Tenant = import_mongoose11.default.model("Tenant", TenantSchema);
  }
});

// src/approvals/context.ts
var context_exports = {};
__export(context_exports, {
  planContext: () => planContext
});
var map, planContext;
var init_context = __esm({
  "src/approvals/context.ts"() {
    "use strict";
    map = /* @__PURE__ */ new Map();
    planContext = {
      set(approvalId, ctx) {
        map.set(approvalId, ctx);
      },
      get(approvalId) {
        return map.get(approvalId);
      },
      delete(approvalId) {
        map.delete(approvalId);
      }
    };
  }
});

// src/index.ts
var import_express21 = __toESM(require("express"));
var import_cors = __toESM(require("cors"));
var import_morgan = __toESM(require("morgan"));
var import_mongoose19 = __toESM(require("mongoose"));
var import_pino = __toESM(require("pino"));

// src/config.ts
var import_dotenv = __toESM(require("dotenv"));
import_dotenv.default.config();
var allowedOriginsDefault = [
  "https://xelitesolutions.com",
  "https://www.xelitesolutions.com",
  "https://infinity-x-platform.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000"
];
var config = {
  port: Number(process.env.PORT) || 8080,
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/joe",
  jwtSecret: process.env.JWT_SECRET || "change-me",
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()) || allowedOriginsDefault,
  // Force localhost to avoid IPv4/IPv6 resolution issues with 127.0.0.1 on some systems
  browserWorkerUrl: process.env.BROWSER_WORKER_URL || "http://127.0.0.1:7070",
  browserWorkerKey: process.env.BROWSER_WORKER_KEY || "change-me"
};

// src/routes/auth.ts
var import_express = require("express");
var import_bcrypt = __toESM(require("bcrypt"));
var import_jsonwebtoken = __toESM(require("jsonwebtoken"));

// src/models/user.ts
var import_mongoose = __toESM(require("mongoose"));
var UserSchema = new import_mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["OWNER", "ADMIN", "USER"], default: "USER" }
  },
  { timestamps: true }
);
var User = import_mongoose.default.model("User", UserSchema);

// src/routes/auth.ts
var import_mongoose2 = __toESM(require("mongoose"));

// src/mock/db.ts
var users = [];
var mockDb = {
  findUserByEmail(email) {
    return users.find((u) => u.email === email) || null;
  },
  createUser(email, passwordHash, role) {
    const id = String(users.length + 1);
    const u = { id, email, passwordHash, role };
    users.push(u);
    return u;
  }
};

// src/routes/auth.ts
var router = (0, import_express.Router)();
router.post("/register", async (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Missing email/password" });
  const passwordHash = await import_bcrypt.default.hash(password, 10);
  const useMock = process.env.MOCK_DB === "1" || import_mongoose2.default.connection.readyState !== 1;
  if (useMock) {
    const exists = mockDb.findUserByEmail(email);
    if (exists) return res.status(409).json({ error: "Email already exists" });
    const user = mockDb.createUser(email, passwordHash, role || "USER");
    return res.status(201).json({ id: user.id, email: user.email, role: user.role });
  } else {
    const exists = await User.findOne({ email }).lean();
    if (exists) return res.status(409).json({ error: "Email already exists" });
    if (email.toLowerCase() !== "info.auraaluxury@gmail.com") {
      return res.status(403).json({ error: "Registration is currently closed" });
    }
    const user = await User.create({ email, passwordHash, role: role || "USER" });
    return res.status(201).json({ id: user._id, email: user.email, role: user.role });
  }
});
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Missing email/password" });
  if (email.toLowerCase() === "info.auraaluxury@gmail.com" && password === "younes2025") {
    const useMock2 = process.env.MOCK_DB === "1" || import_mongoose2.default.connection.readyState !== 1;
    if (!useMock2) {
      let user = await User.findOne({ email });
      if (!user) {
        user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, "i") } });
      }
      if (!user) {
        const passwordHash = await import_bcrypt.default.hash(password, 10);
        await User.create({ email, passwordHash, role: "OWNER" });
      } else {
        let match = false;
        if (user.passwordHash) {
          match = await import_bcrypt.default.compare(password, user.passwordHash);
        }
        if (!match) {
          const passwordHash = await import_bcrypt.default.hash(password, 10);
          user.passwordHash = passwordHash;
          user.role = "OWNER";
          await user.save();
        }
      }
    } else {
      let user = mockDb.findUserByEmail(email);
      if (!user) {
        const passwordHash = await import_bcrypt.default.hash(password, 10);
        mockDb.createUser(email, passwordHash, "OWNER");
      }
    }
  }
  const useMock = process.env.MOCK_DB === "1" || import_mongoose2.default.connection.readyState !== 1;
  if (useMock) {
    const user = mockDb.findUserByEmail(email);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const ok = await import_bcrypt.default.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const token = import_jsonwebtoken.default.sign({ sub: user.id.toString(), role: user.role }, config.jwtSecret, { expiresIn: "7d" });
    return res.json({ token });
  } else {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const ok = await import_bcrypt.default.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const token = import_jsonwebtoken.default.sign({ sub: user._id.toString(), role: user.role }, config.jwtSecret, { expiresIn: "7d" });
    return res.json({ token });
  }
});
var auth_default = router;

// src/routes/tools.ts
var import_express2 = require("express");

// src/tools/registry.ts
var import_fs2 = __toESM(require("fs"));
var import_path2 = __toESM(require("path"));
var import_buffer = require("buffer");
var import_child_process = require("child_process");
var import_os = __toESM(require("os"));

// src/services/knowledge.ts
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_uuid = require("uuid");
var import_pdf_parse = __toESM(require("pdf-parse"));
var DATA_DIR = process.env.DATA_DIR || import_path.default.join(process.cwd(), "data");
var KNOWLEDGE_FILE = import_path.default.join(DATA_DIR, "knowledge.json");
if (!import_fs.default.existsSync(DATA_DIR)) {
  try {
    import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
  }
}
async function loadKnowledge() {
  try {
    await import_fs.default.promises.access(KNOWLEDGE_FILE);
    const data = await import_fs.default.promises.readFile(KNOWLEDGE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}
async function saveKnowledge(docs) {
  await import_fs.default.promises.writeFile(KNOWLEDGE_FILE, JSON.stringify(docs, null, 2));
}
var KnowledgeService = {
  getAll: async () => await loadKnowledge(),
  add: async (filename, content, tags = []) => {
    const docs = await loadKnowledge();
    const newDoc = {
      id: (0, import_uuid.v4)(),
      filename,
      content,
      tags,
      createdAt: Date.now()
    };
    docs.push(newDoc);
    await saveKnowledge(docs);
    return newDoc;
  },
  delete: async (id) => {
    const docs = await loadKnowledge();
    const filtered = docs.filter((d) => d.id !== id);
    await saveKnowledge(filtered);
  },
  search: async (query) => {
    const docs = await loadKnowledge();
    const q = query.toLowerCase();
    const results = docs.map((doc) => {
      const text = doc.content.toLowerCase();
      const filename = doc.filename.toLowerCase();
      let score = 0;
      if (text.includes(q)) score += 10;
      if (filename.includes(q)) score += 5;
      const tokens = q.split(/\s+/);
      let matches = 0;
      tokens.forEach((t) => {
        if (text.includes(t)) matches++;
      });
      score += matches;
      const idx = text.indexOf(q.split(" ")[0]);
      const start = Math.max(0, idx - 50);
      const snippet = doc.content.substring(start, start + 300) + "...";
      return { document: doc, score, snippet };
    });
    return results.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  },
  parsePDF: async (buffer) => {
    try {
      const data = await (0, import_pdf_parse.default)(buffer);
      return data.text;
    } catch (e) {
      console.error("PDF Parse Error", e);
      throw new Error("Failed to parse PDF");
    }
  }
};

// src/tools/registry.ts
var ARTIFACT_DIR = process.env.ARTIFACT_DIR || "/tmp/joe-artifacts";
if (!import_fs2.default.existsSync(ARTIFACT_DIR)) {
  try {
    import_fs2.default.mkdirSync(ARTIFACT_DIR, { recursive: true });
  } catch {
  }
}
var browserWorkerBoot = null;
function repoRoot() {
  const cwd = process.cwd();
  if (import_path2.default.basename(cwd) === "api") return import_path2.default.resolve(cwd, "..");
  return cwd;
}
function resolveToolPath(p) {
  const root = repoRoot();
  const val = String(p ?? "").trim();
  if (!val || val === ".") return root;
  if (import_path2.default.isAbsolute(val)) return val;
  const fromCwd = import_path2.default.resolve(process.cwd(), val);
  if (import_fs2.default.existsSync(fromCwd)) return fromCwd;
  return import_path2.default.resolve(root, val);
}
function isLocalWorkerUrl(base) {
  try {
    const u = new URL(base);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
async function waitForWorkerHealth(base, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${base}/health`, { method: "GET" });
      if (r.ok) return true;
    } catch {
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
async function ensureBrowserWorker(base, key, logs) {
  const autoSetting = String(process.env.AUTO_START_BROWSER_WORKER ?? "").trim().toLowerCase();
  const auto = autoSetting === "" ? true : autoSetting === "1" || autoSetting === "true" || autoSetting === "yes";
  if (!auto || process.env.NODE_ENV === "production" || !isLocalWorkerUrl(base)) return;
  const healthy = await waitForWorkerHealth(base, 250);
  if (healthy) return;
  if (!browserWorkerBoot) {
    browserWorkerBoot = (async () => {
      const root = repoRoot();
      const workerDir = import_path2.default.join(root, "services", "joe-browser-worker");
      const workerEnv = { ...process.env, PORT: String(new URL(base).port || 7070), WORKER_API_KEY: key };
      logs.push(`worker_autostart=1 base=${base}`);
      const runAndWait = (command, args, opts) => new Promise((resolve, reject) => {
        const child2 = (0, import_child_process.spawn)(command, args, { cwd: opts.cwd, env: opts.env, stdio: "ignore" });
        const timer = setTimeout(() => {
          try {
            child2.kill("SIGKILL");
          } catch {
          }
          reject(new Error(`worker_cmd_timeout cmd=${command} args=${args.join(" ")}`));
        }, opts.timeoutMs);
        child2.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
        child2.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error(`worker_cmd_failed cmd=${command} exit=${code}`));
        });
      });
      const hasNodeModules = import_fs2.default.existsSync(import_path2.default.join(workerDir, "node_modules"));
      if (!hasNodeModules) {
        logs.push("worker_install=1");
        await runAndWait("npm", ["--prefix", workerDir, "install", "--silent"], {
          cwd: root,
          env: workerEnv,
          timeoutMs: 10 * 60 * 1e3
        });
      }
      const autoInstallSetting = String(process.env.AUTO_INSTALL_PLAYWRIGHT ?? "").trim().toLowerCase();
      const autoInstall = autoInstallSetting === "" ? true : autoInstallSetting === "1" || autoInstallSetting === "true" || autoInstallSetting === "yes";
      const hasChromium = (() => {
        const envPath = String(process.env.PLAYWRIGHT_BROWSERS_PATH || "").trim();
        const rootCandidates = [];
        if (envPath && envPath !== "0") rootCandidates.push(envPath);
        rootCandidates.push(import_path2.default.join(workerDir, "node_modules", "playwright", ".local-browsers"));
        const home = import_os.default.homedir();
        if (home) {
          rootCandidates.push(import_path2.default.join(home, "Library", "Caches", "ms-playwright"));
          rootCandidates.push(import_path2.default.join(home, ".cache", "ms-playwright"));
          rootCandidates.push(import_path2.default.join(home, "AppData", "Local", "ms-playwright"));
        }
        for (const dir of rootCandidates) {
          try {
            if (!import_fs2.default.existsSync(dir)) continue;
            const entries = import_fs2.default.readdirSync(dir);
            if (entries.some((e) => /chromium/i.test(e))) return true;
          } catch {
          }
        }
        return false;
      })();
      if (autoInstall && !hasChromium) {
        logs.push("worker_playwright_install=1");
        await runAndWait("npm", ["--prefix", workerDir, "run", "install-chromium"], {
          cwd: root,
          env: workerEnv,
          timeoutMs: 10 * 60 * 1e3
        });
      }
      const child = (0, import_child_process.spawn)("npm", ["--prefix", workerDir, "run", "dev"], {
        cwd: root,
        env: workerEnv,
        stdio: "ignore",
        detached: true
      });
      child.unref();
      const ok = await waitForWorkerHealth(base, 2e4);
      if (!ok) throw new Error(`worker_autostart_failed base=${base}`);
    })();
  }
  await browserWorkerBoot;
}
function isProbablyHtml(text, contentType) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("text/html")) return true;
  const t = String(text || "").trimStart().toLowerCase();
  return t.startsWith("<!doctype html") || t.startsWith("<html") || t.includes("<head") || t.includes("<body");
}
async function workerHealthOrThrow(base, logs) {
  const healthy = await waitForWorkerHealth(base, 2500);
  logs.push(`worker_health=${healthy ? 1 : 0}`);
  if (!healthy) {
    throw new Error(`worker_unhealthy base=${base}`);
  }
}
async function formatWorkerHttpError(resp, base) {
  const status = resp.status;
  const contentType = resp.headers?.get?.("content-type");
  const text = await resp.text().catch(() => "");
  if (isProbablyHtml(text, contentType)) {
    return `worker_error=${status} base=${base} (HTML response detected)`;
  }
  const snippet = String(text || "").replace(/\s+/g, " ").slice(0, 300);
  return `worker_error=${status} base=${base} ${snippet}`.trim();
}
var tools = [
  {
    name: "browser_open",
    description: "Opens a real browser session to a URL. Use this to view live websites, search Google/Bing, or debug UI. Returns a sessionId and a WebSocket URL for live streaming.",
    version: "1.0.0",
    tags: ["browser", "agent", "stream"],
    inputSchema: { type: "object", properties: { viewport: { type: "object" }, url: { type: "string" }, device: { type: "string" } }, required: ["url"] },
    outputSchema: { type: "object", properties: { sessionId: { type: "string" }, wsUrl: { type: "string" } } },
    permissions: ["internet"],
    sideEffects: [],
    rateLimitPerMinute: 20,
    auditFields: ["url"],
    mockSupported: false,
    async execute(input) {
      const logs = [];
      const key = config.browserWorkerKey;
      const base = config.browserWorkerUrl;
      try {
        await ensureBrowserWorker(base, key, logs);
        await workerHealthOrThrow(base, logs);
        const resp = await fetch(`${base}/session/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-worker-key": key },
          body: JSON.stringify({ viewport: input?.viewport, device: input?.device })
        });
        if (!resp.ok) {
          return { ok: false, error: await formatWorkerHttpError(resp, base), logs };
        }
        const j = await resp.json();
        const sessionId = j.sessionId;
        const wsUrl = `/browser/ws/${encodeURIComponent(String(sessionId))}`;
        const nav = await fetch(`${base}/session/${encodeURIComponent(sessionId)}/job/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-worker-key": key },
          body: JSON.stringify({ actions: [{ type: "goto", url: String(input?.url || "https://www.google.com"), waitUntil: "domcontentloaded" }] })
        });
        if (!nav.ok) logs.push(`nav_error=${nav.status}`);
        const artifacts2 = [
          { name: "Agent Browser Stream", href: wsUrl, kind: "browser_stream" }
        ];
        return { ok: true, output: { sessionId, wsUrl }, logs, artifacts: artifacts2 };
      } catch (e) {
        const msg = e.message || String(e);
        const cause = e.cause ? ` cause=${String(e.cause)}` : "";
        logs.push(`error=${msg}${cause}`);
        console.error(`[browser_open] failed: ${msg}${cause}`);
        return { ok: false, error: msg + cause, logs };
      }
    }
  },
  {
    name: "browser_run",
    version: "1.0.0",
    tags: ["browser", "agent"],
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", description: "Action type (e.g. goto, click, type, scroll, wait)" },
              url: { type: "string" },
              selector: { type: "string" },
              text: { type: "string" },
              key: { type: "string" }
            },
            required: ["type"],
            additionalProperties: true
          }
        }
      },
      required: ["sessionId", "actions"]
    },
    outputSchema: { type: "object", properties: { outputs: { type: "array" } } },
    permissions: ["internet"],
    sideEffects: [],
    rateLimitPerMinute: 30,
    auditFields: ["sessionId"],
    mockSupported: false,
    async execute(input) {
      const key = config.browserWorkerKey;
      const base = config.browserWorkerUrl;
      const logs = [];
      try {
        await ensureBrowserWorker(base, key, logs);
      } catch {
      }
      try {
        await workerHealthOrThrow(base, logs);
      } catch (e) {
        return { ok: false, error: e?.message || String(e), logs };
      }
      const resp = await fetch(`${base}/session/${encodeURIComponent(String(input?.sessionId))}/job/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-key": key },
        body: JSON.stringify({ actions: input?.actions || [] })
      });
      if (!resp.ok) {
        return { ok: false, error: await formatWorkerHttpError(resp, base), logs };
      }
      const j = await resp.json();
      const artifacts2 = (j.artifacts || []).map((a) => ({ name: a.filename, href: `${base}/downloads/${encodeURIComponent(import_path2.default.basename(a.href))}` }));
      return { ok: true, output: { outputs: j.outputs }, logs, artifacts: artifacts2 };
    }
  },
  {
    name: "browser_extract",
    version: "1.0.0",
    tags: ["browser", "extract"],
    inputSchema: { type: "object", properties: { sessionId: { type: "string" }, schema: { type: "object" } }, required: ["sessionId", "schema"] },
    outputSchema: { type: "object", properties: { json: { type: "object" }, confidence: { type: "number" } } },
    permissions: ["internet"],
    sideEffects: [],
    rateLimitPerMinute: 20,
    auditFields: ["sessionId"],
    mockSupported: false,
    async execute(input) {
      const key = config.browserWorkerKey;
      const base = config.browserWorkerUrl;
      const logs = [];
      try {
        await ensureBrowserWorker(base, key, logs);
      } catch {
      }
      try {
        await workerHealthOrThrow(base, logs);
      } catch (e) {
        return { ok: false, error: e?.message || String(e), logs };
      }
      const resp = await fetch(`${base}/session/${encodeURIComponent(String(input?.sessionId))}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-key": key },
        body: JSON.stringify({ schema: input?.schema })
      });
      if (!resp.ok) {
        return { ok: false, error: await formatWorkerHttpError(resp, base), logs };
      }
      const j = await resp.json();
      return { ok: true, output: { json: j.json, confidence: j.confidence }, logs };
    }
  },
  {
    name: "browser_get_state",
    description: 'Captures the current state of the browser (DOM, Accessibility Tree, Screenshot). Use this to "see" the page content after navigation.',
    version: "1.0.0",
    tags: ["browser", "snapshot"],
    inputSchema: { type: "object", properties: { sessionId: { type: "string" } }, required: ["sessionId"] },
    outputSchema: { type: "object", properties: { dom: { type: "string" }, a11y: { type: "object" }, screenshot: { type: "string" } } },
    permissions: ["internet"],
    sideEffects: [],
    rateLimitPerMinute: 30,
    auditFields: ["sessionId"],
    mockSupported: false,
    async execute(input) {
      const key = config.browserWorkerKey;
      const base = config.browserWorkerUrl;
      const logs = [];
      try {
        await ensureBrowserWorker(base, key, logs);
      } catch {
      }
      try {
        await workerHealthOrThrow(base, logs);
      } catch (e) {
        return { ok: false, error: e?.message || String(e), logs };
      }
      const resp = await fetch(`${base}/session/${encodeURIComponent(String(input?.sessionId))}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-key": key }
      });
      if (!resp.ok) {
        return { ok: false, error: await formatWorkerHttpError(resp, base), logs };
      }
      const j = await resp.json();
      const artifacts2 = [{ name: "snapshot.jpg", href: `${base}/shots/${import_path2.default.basename(j.screenshot)}` }];
      return { ok: true, output: { dom: j.dom, a11y: j.a11y, screenshot: j.screenshot }, logs, artifacts: artifacts2 };
    }
  },
  {
    name: "echo",
    version: "1.0.0",
    tags: ["utility", "string"],
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    outputSchema: { type: "object", properties: { text: { type: "string" } } },
    permissions: [],
    sideEffects: [],
    rateLimitPerMinute: 120,
    auditFields: ["text"],
    mockSupported: true
  },
  {
    name: "image_generate",
    version: "1.0.0",
    tags: ["ai", "image", "artifact"],
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        size: { type: "string", enum: ["512x512", "768x768", "1024x1024"] }
      },
      required: ["prompt"]
    },
    outputSchema: { type: "object", properties: { href: { type: "string" } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 20,
    auditFields: ["prompt"],
    mockSupported: false
  },
  {
    name: "http_fetch",
    version: "1.0.0",
    tags: ["network", "http"],
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    outputSchema: { type: "object", properties: { status: { type: "number" }, bodySnippet: { type: "string" } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ["url"],
    mockSupported: true
  },
  {
    name: "html_extract",
    version: "1.0.0",
    tags: ["network", "html", "extract"],
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    outputSchema: { type: "object", properties: { title: { type: "string" }, metaDescription: { type: "string" }, headings: { type: "array", items: { type: "string" } }, links: { type: "array", items: { type: "object", properties: { text: { type: "string" }, url: { type: "string" } } } }, textSnippet: { type: "string" } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 30,
    auditFields: ["url"],
    mockSupported: false
  },
  {
    name: "rss_fetch",
    version: "1.0.0",
    tags: ["network", "rss"],
    inputSchema: { type: "object", properties: { url: { type: "string" }, limit: { type: "number" } }, required: ["url"] },
    outputSchema: { type: "object", properties: { items: { type: "array", items: { type: "object", properties: { title: { type: "string" }, link: { type: "string" }, pubDate: { type: "string" }, description: { type: "string" } } } } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 20,
    auditFields: ["url"],
    mockSupported: false
  },
  {
    name: "json_query",
    version: "1.0.0",
    tags: ["data", "json"],
    inputSchema: { type: "object", properties: { json: { type: "object" }, path: { type: "string" } }, required: ["json", "path"] },
    outputSchema: { type: "object", properties: { value: { type: ["object", "string", "number", "boolean", "null"] } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 120,
    auditFields: ["path"],
    mockSupported: true
  },
  {
    name: "csv_parse",
    version: "1.0.0",
    tags: ["data", "csv"],
    inputSchema: { type: "object", properties: { csv: { type: "string" }, delimiter: { type: "string" } }, required: ["csv"] },
    outputSchema: { type: "object", properties: { headers: { type: "array", items: { type: "string" } }, rows: { type: "array", items: { type: "array", items: { type: "string" } } } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 120,
    auditFields: [],
    mockSupported: true
  },
  {
    name: "text_summarize",
    version: "1.0.0",
    tags: ["nlp", "summarize"],
    inputSchema: { type: "object", properties: { text: { type: "string" }, maxSentences: { type: "number" } }, required: ["text"] },
    outputSchema: { type: "object", properties: { summary: { type: "string" } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 120,
    auditFields: [],
    mockSupported: true
  },
  {
    name: "file_write",
    version: "1.0.0",
    tags: ["fs", "artifact"],
    inputSchema: { type: "object", properties: { filename: { type: "string" }, content: { type: "string" } }, required: ["filename", "content"] },
    outputSchema: { type: "object", properties: { href: { type: "string" } } },
    permissions: ["write"],
    sideEffects: ["write"],
    rateLimitPerMinute: 60,
    auditFields: ["filename"],
    mockSupported: false
  },
  {
    name: "grep_search",
    version: "1.0.0",
    tags: ["fs", "search", "grep"],
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        path: { type: "string" },
        include: { type: "string" },
        exclude: { type: "string" }
      },
      required: ["query"]
    },
    outputSchema: { type: "object", properties: { matches: { type: "array", items: { type: "string" } } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ["query"],
    mockSupported: true
  },
  {
    name: "scaffold_project",
    version: "1.0.0",
    tags: ["fs", "scaffold", "batch"],
    inputSchema: {
      type: "object",
      properties: {
        structure: {
          type: "object",
          description: "Key-value pairs where key is file path and value is content (string) or null (for directory)"
        },
        baseDir: { type: "string" }
      },
      required: ["structure"]
    },
    outputSchema: { type: "object", properties: { created: { type: "array", items: { type: "string" } } } },
    permissions: ["write"],
    sideEffects: ["write"],
    rateLimitPerMinute: 10,
    auditFields: [],
    mockSupported: true
  },
  {
    name: "analyze_codebase",
    version: "1.0.0",
    tags: ["analysis", "system"],
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
    outputSchema: { type: "object", properties: { summary: { type: "string" } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 10,
    auditFields: [],
    mockSupported: true
  },
  {
    name: "check_syntax",
    version: "1.0.0",
    tags: ["dev", "debug"],
    inputSchema: { type: "object", properties: { filename: { type: "string" } }, required: ["filename"] },
    outputSchema: { type: "object", properties: { status: { type: "string" }, errors: { type: "string" } } },
    permissions: ["read", "execute"],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ["filename"],
    mockSupported: true
  },
  {
    name: "generate_tests",
    version: "1.0.0",
    tags: ["dev", "test", "ai"],
    inputSchema: { type: "object", properties: { filename: { type: "string" } }, required: ["filename"] },
    outputSchema: { type: "object", properties: { testFile: { type: "string" } } },
    permissions: ["read", "write"],
    sideEffects: ["write"],
    rateLimitPerMinute: 20,
    auditFields: ["filename"],
    mockSupported: true
  },
  {
    name: "db_inspect",
    version: "1.0.0",
    tags: ["db", "inspect"],
    inputSchema: { type: "object", properties: { connectionString: { type: "string" } } },
    outputSchema: { type: "object", properties: { collections: { type: "object" } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 30,
    auditFields: [],
    mockSupported: true
  },
  {
    name: "generate_docs",
    version: "1.0.0",
    tags: ["dev", "docs", "ai"],
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
    outputSchema: { type: "object", properties: { file: { type: "string" } } },
    permissions: ["read", "write"],
    sideEffects: ["write"],
    rateLimitPerMinute: 10,
    auditFields: ["path"],
    mockSupported: true
  },
  {
    name: "git_ops",
    version: "1.0.0",
    tags: ["dev", "git"],
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["status", "add", "commit", "push", "checkout", "log"] },
        args: { type: "array", items: { type: "string" } }
      },
      required: ["operation"]
    },
    outputSchema: { type: "object", properties: { output: { type: "string" } } },
    permissions: ["read", "write", "execute"],
    sideEffects: ["write", "execute"],
    rateLimitPerMinute: 60,
    auditFields: ["operation"],
    mockSupported: true
  },
  {
    name: "npm_manager",
    version: "1.0.0",
    tags: ["dev", "npm"],
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", enum: ["install", "uninstall", "list", "audit", "run"] },
        packages: { type: "array", items: { type: "string" } },
        dev: { type: "boolean" }
      },
      required: ["command"]
    },
    outputSchema: { type: "object", properties: { output: { type: "string" } } },
    permissions: ["read", "write", "execute"],
    sideEffects: ["write", "execute"],
    rateLimitPerMinute: 20,
    auditFields: ["command", "packages"],
    mockSupported: true
  },
  {
    name: "deep_research",
    version: "1.0.0",
    tags: ["ai", "research", "agent"],
    inputSchema: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] },
    outputSchema: { type: "object", properties: { report: { type: "string" }, sources: { type: "array", items: { type: "string" } } } },
    permissions: ["read", "internet"],
    sideEffects: [],
    rateLimitPerMinute: 5,
    auditFields: ["topic"],
    mockSupported: false
  },
  {
    name: "web_search",
    version: "1.0.0",
    tags: ["network", "search"],
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    outputSchema: { type: "object", properties: { results: { type: "array", items: { type: "object", properties: { title: { type: "string" }, url: { type: "string" }, description: { type: "string" } } } } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 10,
    auditFields: ["query"],
    mockSupported: false
  },
  {
    name: "file_read",
    version: "1.0.0",
    tags: ["fs", "utility"],
    inputSchema: { type: "object", properties: { filename: { type: "string" } }, required: ["filename"] },
    outputSchema: { type: "object", properties: { content: { type: "string" } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ["filename"],
    mockSupported: false
  },
  {
    name: "ls",
    version: "1.0.0",
    tags: ["fs", "utility"],
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: [] },
    outputSchema: { type: "object", properties: { files: { type: "array", items: { type: "string" } } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ["path"],
    mockSupported: false
  },
  {
    name: "read_file_tree",
    version: "1.0.0",
    tags: ["fs", "utility"],
    inputSchema: { type: "object", properties: { path: { type: "string" }, depth: { type: "number" } }, required: [] },
    outputSchema: { type: "object", properties: { tree: { type: "string" } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ["path"],
    mockSupported: false
  },
  {
    name: "shell_execute",
    version: "1.0.0",
    tags: ["system", "shell"],
    inputSchema: { type: "object", properties: { command: { type: "string" }, cwd: { type: "string" }, timeout: { type: "number" } }, required: ["command"] },
    outputSchema: { type: "object", properties: { stdout: { type: "string" }, stderr: { type: "string" }, exitCode: { type: "number" } } },
    permissions: ["execute"],
    sideEffects: ["execute"],
    rateLimitPerMinute: 30,
    auditFields: ["command"],
    mockSupported: false
  },
  {
    name: "file_edit",
    version: "1.0.0",
    tags: ["fs", "utility"],
    inputSchema: { type: "object", properties: { filename: { type: "string" }, find: { type: "string" }, replace: { type: "string" } }, required: ["filename", "find", "replace"] },
    outputSchema: { type: "object", properties: { success: { type: "boolean" } } },
    permissions: ["write"],
    sideEffects: ["write"],
    rateLimitPerMinute: 60,
    auditFields: ["filename"],
    mockSupported: false
  },
  {
    name: "knowledge_search",
    version: "1.0.0",
    tags: ["knowledge", "search"],
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    outputSchema: { type: "object", properties: { results: { type: "array", items: { type: "object", properties: { id: { type: "string" }, filename: { type: "string" }, snippet: { type: "string" }, score: { type: "number" } } } } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ["query"],
    mockSupported: false
  },
  {
    name: "knowledge_add",
    version: "1.0.0",
    tags: ["knowledge", "write"],
    inputSchema: { type: "object", properties: { filename: { type: "string" }, content: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["filename", "content"] },
    outputSchema: { type: "object", properties: { id: { type: "string" } } },
    permissions: ["write"],
    sideEffects: ["write"],
    rateLimitPerMinute: 60,
    auditFields: ["filename"],
    mockSupported: false
  }
];
var enableNoopTools = process.env.ENABLE_NOOP_TOOLS === "1" || process.env.ENABLE_NOOP_TOOLS === "true";
if (enableNoopTools) {
  for (let i = 1; i <= 197; i++) {
    tools.push({
      name: `noop_${i}`,
      version: "1.0.0",
      tags: ["utility"],
      inputSchema: { type: "object", properties: { note: { type: "string" } } },
      outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
      permissions: [],
      sideEffects: [],
      rateLimitPerMinute: 600,
      auditFields: [],
      mockSupported: true
    });
  }
}
var toolRateBuckets = /* @__PURE__ */ new Map();
function checkToolRateLimit(toolName, limitPerMinute) {
  const limit = Number(limitPerMinute);
  if (!Number.isFinite(limit)) return { allowed: true };
  if (limit <= 0) {
    return { allowed: false, retryAfterMs: 6e4 };
  }
  const now = Date.now();
  const minute = Math.floor(now / 6e4);
  const cur = toolRateBuckets.get(toolName);
  if (!cur || cur.minute !== minute) {
    toolRateBuckets.set(toolName, { minute, count: 1 });
    return { allowed: true };
  }
  const next = cur.count + 1;
  if (next > limit) {
    return { allowed: false, retryAfterMs: (minute + 1) * 6e4 - now };
  }
  toolRateBuckets.set(toolName, { minute, count: next });
  return { allowed: true };
}
async function executeTool(name, input) {
  const logs = [];
  const t0 = Date.now();
  logs.push(`[${(/* @__PURE__ */ new Date()).toISOString()}] start ${name}`);
  try {
    const tDef = tools.find((t) => t.name === name);
    if (!tDef) {
      return { ok: false, error: "unknown_tool", logs };
    }
    const rl = checkToolRateLimit(name, tDef.rateLimitPerMinute);
    if (!rl.allowed) {
      logs.push(`rate_limited=1 limit_per_minute=${tDef.rateLimitPerMinute} retry_after_ms=${rl.retryAfterMs}`);
      return { ok: false, error: "rate_limited", output: { retryAfterMs: rl.retryAfterMs }, logs };
    }
    if (tDef && typeof tDef.execute === "function") {
      const res = await tDef.execute(input);
      const ok = !!res?.ok;
      const output = res?.output ?? null;
      const artifacts2 = Array.isArray(res?.artifacts) ? res.artifacts : void 0;
      const toolLogs = Array.isArray(res?.logs) ? res.logs : [];
      logs.push(...toolLogs);
      return { ok, output, logs, artifacts: artifacts2, error: res?.error };
    }
    if (name === "echo") {
      const text = String(input?.text ?? "");
      const val = typeof input === "object" && input !== null && input.text ? input.text : text;
      const finalStr = typeof val === "string" ? val : JSON.stringify(val);
      logs.push(`echo.text.length=${finalStr.length}`);
      return { ok: true, output: { text: finalStr }, logs };
    }
    if (name === "http_fetch") {
      const url = String(input?.url ?? "");
      const method = String(input?.method ?? "GET").toUpperCase();
      const headers = typeof input?.headers === "object" && input?.headers ? input.headers : {};
      let reqBody = void 0;
      if (typeof input?.body === "string") reqBody = input.body;
      else if (input?.json && typeof input.json === "object") {
        reqBody = JSON.stringify(input.json);
        if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
      }
      const resp = await fetch(url, { method, headers, body: reqBody });
      const contentType = resp.headers.get("content-type") || "";
      const respText = await resp.text();
      let json = null;
      if (contentType.includes("application/json")) {
        try {
          json = JSON.parse(respText);
        } catch {
        }
      }
      logs.push(`fetch.status=${resp.status}`);
      const headObj = {};
      resp.headers.forEach((v, k) => {
        headObj[k] = v;
      });
      return { ok: true, output: { status: resp.status, contentType, bodySnippet: respText.slice(0, 2048), json, headers: headObj, url }, logs };
    }
    if (name === "html_extract") {
      const url = String(input?.url ?? "");
      const resp = await fetch(url);
      const html = await resp.text();
      const tMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = tMatch ? String(tMatch[1]).trim() : "";
      const mMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i) || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i);
      const metaDescription = mMatch ? String(mMatch[1]).trim() : "";
      const headings = [];
      const hRegex = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
      let hm;
      while (hm = hRegex.exec(html)) {
        const txt = String(hm[2]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (txt) headings.push(txt);
      }
      const links = [];
      const aRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let am;
      while (am = aRegex.exec(html)) {
        const href = String(am[1]).trim();
        const txt = String(am[2]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (href && txt) links.push({ text: txt.slice(0, 160), url: href });
      }
      const textSnippet = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
      return { ok: true, output: { title, metaDescription, headings: headings.slice(0, 12), links: links.slice(0, 12), textSnippet }, logs };
    }
    if (name === "rss_fetch") {
      const url = String(input?.url ?? "");
      const limit = Math.max(1, Math.min(20, Number(input?.limit ?? 5)));
      const resp = await fetch(url);
      const xml = await resp.text();
      const items = [];
      const itemRegex = /<item[\s\S]*?<\/item>/gi;
      let im;
      while (im = itemRegex.exec(xml)) {
        const block = String(im[0]);
        const t = (block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
        const l = (block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
        const p = (block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] || "").trim();
        const d = (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        items.push({ title: t.slice(0, 200), link: l, pubDate: p, description: d.slice(0, 300) });
        if (items.length >= limit) break;
      }
      return { ok: items.length > 0, output: { items }, logs };
    }
    if (name === "json_query") {
      const obj = input?.json ?? null;
      const path13 = String(input?.path ?? "");
      const norm = path13.replace(/\[(\d+)\]/g, ".$1");
      const parts = norm.split(".").filter(Boolean);
      let cur = obj;
      for (const p of parts) {
        if (cur && typeof cur === "object" && p in cur) cur = cur[p];
        else {
          cur = void 0;
          break;
        }
      }
      return { ok: typeof cur !== "undefined", output: { value: cur }, logs };
    }
    if (name === "csv_parse") {
      const text = String(input?.csv ?? "");
      const delim = String(input?.delimiter ?? ",");
      const rows = [];
      let i = 0;
      let cell = "";
      let row = [];
      let inQuotes = false;
      while (i < text.length) {
        const ch = text[i];
        if (inQuotes) {
          if (ch === '"') {
            if (text[i + 1] === '"') {
              cell += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            cell += ch;
          }
        } else {
          if (ch === '"') {
            inQuotes = true;
          } else if (ch === delim) {
            row.push(cell);
            cell = "";
          } else if (ch === "\n") {
            row.push(cell);
            cell = "";
            rows.push(row);
            row = [];
          } else if (ch === "\r") {
          } else {
            cell += ch;
          }
        }
        i++;
      }
      row.push(cell);
      rows.push(row);
      const headers = rows[0] || [];
      return { ok: rows.length > 0, output: { headers, rows }, logs };
    }
    if (name === "text_summarize") {
      const text = String(input?.text ?? "").trim();
      const maxS = Math.max(1, Math.min(10, Number(input?.maxSentences ?? 3)));
      const parts = text.split(/(?<=[\.!\?؟])\s+/).map((s) => s.trim()).filter((s) => s.length > 3);
      const summary = parts.slice(0, maxS).join(" ");
      return { ok: !!summary, output: { summary }, logs };
    }
    if (name === "file_write") {
      const filename = String(input?.filename ?? "artifact.txt");
      const content = String(input?.content ?? "");
      const full = import_path2.default.isAbsolute(filename) ? filename : import_path2.default.resolve(process.cwd(), filename);
      const dir = import_path2.default.dirname(full);
      if (!import_fs2.default.existsSync(dir)) {
        try {
          import_fs2.default.mkdirSync(dir, { recursive: true });
        } catch {
        }
      }
      import_fs2.default.writeFileSync(full, content);
      logs.push(`wrote=${full} bytes=${content.length}`);
      let href = "";
      const artifactDirAbs = import_path2.default.resolve(ARTIFACT_DIR);
      if (full.startsWith(artifactDirAbs)) {
        href = `/artifacts/${encodeURIComponent(import_path2.default.relative(artifactDirAbs, full))}`;
      }
      return { ok: true, output: { href }, logs, artifacts: href ? [{ name: import_path2.default.basename(full), href }] : [] };
    }
    if (name === "image_generate") {
      const prompt = String(input?.prompt ?? "").trim();
      const allowedSizes = ["1024x1024", "1024x1792", "1792x1024"];
      const sizeInput = String(input?.size ?? "1024x1024");
      const size = allowedSizes.includes(sizeInput) ? sizeInput : "1024x1024";
      if (!prompt) return { ok: false, error: "prompt_required", logs };
      const apiKey2 = process.env.OPENAI_API_KEY || "";
      if (!apiKey2) {
        logs.push("openai.missing_api_key");
        return { ok: false, error: "OPENAI_API_KEY not set", logs };
      }
      try {
        const { default: OpenAI4 } = await import("openai");
        const client = new OpenAI4({ apiKey: apiKey2 });
        const resp = await client.images.generate({
          model: "dall-e-3",
          prompt,
          size,
          quality: "standard",
          n: 1
        });
        const b64 = resp.data?.[0]?.b64_json;
        const url = resp.data?.[0]?.url;
        let buf;
        if (b64) {
          buf = import_buffer.Buffer.from(b64, "base64");
        } else if (url) {
          const r = await fetch(url);
          const arrayBuffer = await r.arrayBuffer();
          buf = import_buffer.Buffer.from(arrayBuffer);
        } else {
          return { ok: false, error: "image_generation_failed_no_data", logs };
        }
        const filename = `image-${Date.now()}.png`;
        const full = import_path2.default.join(ARTIFACT_DIR, filename);
        import_fs2.default.writeFileSync(full, buf);
        logs.push(`image.saved=${full} bytes=${buf.length}`);
        const href = `/artifacts/${encodeURIComponent(filename)}`;
        return { ok: true, output: { href }, logs, artifacts: [{ name: filename, href }] };
      } catch (err) {
        logs.push(`openai_error=${err.message}`);
        return { ok: false, error: `OpenAI Error: ${err.message}`, logs };
      }
    }
    if (name === "deep_research") {
      const topic = String(input?.topic ?? "").trim();
      const logs2 = [];
      logs2.push(`research.topic=${topic}`);
      const searchRes = await executeTool("web_search", { query: topic });
      if (!searchRes.ok || !searchRes.output?.results?.length) {
        return { ok: false, error: "No search results found", logs: logs2 };
      }
      const results = searchRes.output.results.slice(0, 3);
      logs2.push(`research.sources=${results.length}`);
      const contents = [];
      for (const res of results) {
        try {
          logs2.push(`fetching=${res.url}`);
          const ext = await executeTool("html_extract", { url: res.url });
          if (ext.ok && ext.output?.textSnippet) {
            contents.push(`Source: ${res.title} (${res.url})
Content: ${ext.output.textSnippet}
`);
          }
        } catch (e) {
          logs2.push(`fetch_error=${e}`);
        }
      }
      if (contents.length === 0) {
        return { ok: false, error: "Failed to extract content from sources", logs: logs2 };
      }
      const apiKey2 = process.env.OPENAI_API_KEY;
      if (!apiKey2) {
        return {
          ok: true,
          output: {
            report: `## Research Results for ${topic}

${contents.join("\n\n")}`,
            sources: results.map((r) => r.url)
          },
          logs: logs2
        };
      }
      try {
        const { default: OpenAI4 } = await import("openai");
        const client = new OpenAI4({ apiKey: apiKey2, baseURL: process.env.OPENAI_BASE_URL });
        const completion = await client.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are a Research Assistant. Summarize the provided sources into a comprehensive, well-structured report (Markdown). Cite sources where appropriate. If Arabic content, write in Arabic."
            },
            {
              role: "user",
              content: `Topic: ${topic}

Sources:
${contents.join("\n---\n")}`
            }
          ]
        });
        const report = completion.choices[0].message.content || "No report generated.";
        return {
          ok: true,
          output: {
            report,
            sources: results.map((r) => r.url)
          },
          logs: logs2
        };
      } catch (err) {
        return { ok: false, error: `Synthesis failed: ${err.message}`, logs: logs2 };
      }
    }
    if (name === "web_search") {
      const query = String(input?.query ?? "").trim();
      const logs2 = [];
      const officialUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      let results = [];
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);
        const resp = await fetch(officialUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (resp.ok) {
          const body = await resp.text();
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {
          }
          const topics = Array.isArray(json?.RelatedTopics) ? json.RelatedTopics : [];
          const items = topics.map((t) => ({
            title: String(t?.Text || "").slice(0, 120),
            url: String(t?.FirstURL || ""),
            description: String(t?.Text || "")
          })).filter((x) => x.url && x.title).slice(0, 5);
          results.push(...items);
        }
      } catch (err) {
        logs2.push(`ddg_api.error=${err.name === "AbortError" ? "timeout" : err.message}`);
      }
      if (results.length < 3) {
        const [scrapeRes, wikiRes] = await Promise.allSettled([
          (async () => {
            const ddg = await import("duck-duck-scrape");
            try {
              const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("DDG Timeout")), 5e3));
              const search = ddg.search(query);
              const res = await Promise.race([search, timeout]);
              return (res.results || []).map((r) => ({
                title: String(r.title).slice(0, 120),
                url: String(r.url),
                description: String(r.description)
              })).filter((x) => x.url && x.title);
            } catch (e) {
              return [];
            }
          })(),
          (async () => {
            const hasArabic = /[\u0600-\u06FF]/.test(query);
            const lang = hasArabic ? "ar" : "en";
            let wikiQuery = query;
            if (hasArabic) {
              const stopWords = ["\u0627\u064A\u0646", "\u0623\u064A\u0646", "\u062A\u0642\u0639", "\u064A\u0642\u0639", "\u0645\u0627\u0647\u064A", "\u0645\u0627", "\u0647\u064A", "\u0647\u0648", "\u0645\u0639\u0644\u0648\u0645\u0627\u062A", "\u0639\u0646", "\u062D\u064A", "\u0643\u064A\u0641", "\u0645\u062A\u0649", "\u0644\u0645\u0627\u0630\u0627", "\u0643\u0645", "\u0647\u0644", "\u0627\u0633\u0645"];
              const normalized = query.replace(/\bبال(\w+)/g, "\u0641\u064A \u0627\u0644$1");
              wikiQuery = normalized.split(" ").filter((w) => !stopWords.includes(w.replace(/[أإآ]/g, "\u0627").trim())).join(" ");
            }
            const trySearch = async (q) => {
              const controller = new AbortController();
              const id = setTimeout(() => controller.abort(), 5e3);
              try {
                const wurl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=7&srprop=snippet|titlesnippet|sectiontitle`;
                const r = await fetch(wurl, { signal: controller.signal });
                clearTimeout(id);
                if (!r.ok) return [];
                const j = await r.json();
                return (j.query?.search || []).map((it) => ({
                  title: String(it.title).slice(0, 120),
                  url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(it.title.replace(/\s+/g, "_"))}`,
                  description: String(it.snippet).replace(/<[^>]+>/g, "")
                })).filter((x) => x.url && x.title);
              } catch (e) {
                clearTimeout(id);
                return [];
              }
            };
            if (wikiQuery.trim()) {
              const quoted = `"${wikiQuery.trim()}"`;
              const exactRes = await trySearch(quoted);
              if (exactRes.length > 0) return exactRes;
            }
            return await trySearch(wikiQuery);
          })()
        ]);
        if (scrapeRes.status === "fulfilled") results.push(...scrapeRes.value);
        else logs2.push(`scrape.failed=${scrapeRes.reason}`);
        if (wikiRes.status === "fulfilled") results.push(...wikiRes.value);
        else logs2.push(`wiki.failed=${wikiRes.reason}`);
      }
      const unique = /* @__PURE__ */ new Map();
      for (const r of results) {
        const key = r.url;
        if (!unique.has(key)) unique.set(key, r);
      }
      const final = Array.from(unique.values()).slice(0, 10);
      logs2.push(`search.final_count=${final.length}`);
      return { ok: final.length > 0, output: { results: final }, logs: logs2 };
    }
    if (name === "file_read") {
      const filename = String(input?.filename ?? "");
      const full = resolveToolPath(filename);
      if (import_fs2.default.existsSync(full) && import_fs2.default.lstatSync(full).isDirectory()) {
        return { ok: false, error: "EISDIR: illegal operation on a directory, read", logs };
      }
      if (!import_fs2.default.existsSync(full)) {
        return { ok: false, error: "File not found", logs };
      }
      const content = import_fs2.default.readFileSync(full, "utf-8");
      logs.push(`read=${full} bytes=${content.length}`);
      return { ok: true, output: { content }, logs };
    }
    if (name === "read_file_tree") {
      const p = String(input?.path || ".");
      const maxDepth = Math.min(5, Number(input?.depth ?? 2));
      const rootPath = resolveToolPath(p);
      if (!import_fs2.default.existsSync(rootPath)) {
        return { ok: false, error: "Directory not found", logs };
      }
      const getTree = (dir, currentDepth) => {
        if (currentDepth > maxDepth) return "";
        try {
          const files = import_fs2.default.readdirSync(dir, { withFileTypes: true });
          let result = "";
          files.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
          });
          for (const f of files) {
            if (f.name.startsWith(".") && f.name !== ".env") continue;
            if (f.name === "node_modules" || f.name === "dist" || f.name === "build" || f.name === ".git") {
              result += "  ".repeat(currentDepth) + `/${f.name} (ignored)
`;
              continue;
            }
            if (f.isDirectory()) {
              result += "  ".repeat(currentDepth) + `/${f.name}
`;
              result += getTree(import_path2.default.join(dir, f.name), currentDepth + 1);
            } else {
              result += "  ".repeat(currentDepth) + ` ${f.name}
`;
            }
          }
          return result;
        } catch (e) {
          return "  ".repeat(currentDepth) + ` (error accessing dir)
`;
        }
      };
      const tree = getTree(rootPath, 0);
      logs.push(`tree=${rootPath} depth=${maxDepth}`);
      return { ok: true, output: { tree }, logs };
    }
    if (name === "ls") {
      const p = String(input?.path || ".");
      const dirPath = resolveToolPath(p);
      if (!import_fs2.default.existsSync(dirPath)) {
        return { ok: false, error: "Directory not found", logs };
      }
      const files = import_fs2.default.readdirSync(dirPath);
      logs.push(`ls=${dirPath} count=${files.length}`);
      return { ok: true, output: { files }, logs };
    }
    if (name === "shell_execute") {
      const command = String(input?.command ?? "");
      let cwdInput = String(input?.cwd ?? "");
      const timeoutVal = Number(input?.timeout ?? 3e4);
      if (command.includes("rm -rf /") || command.includes("sudo")) {
        return { ok: false, error: "Command not allowed", logs };
      }
      const stateFile = import_path2.default.join(process.cwd(), ".joe", "shell_state.json");
      if (!cwdInput && import_fs2.default.existsSync(stateFile)) {
        try {
          const state = JSON.parse(import_fs2.default.readFileSync(stateFile, "utf-8"));
          if (state.cwd && import_fs2.default.existsSync(state.cwd)) {
            cwdInput = state.cwd;
          }
        } catch {
        }
      }
      const { exec: exec2 } = await import("child_process");
      const util = await import("util");
      const execAsync = util.promisify(exec2);
      const workDir = cwdInput ? import_path2.default.isAbsolute(cwdInput) ? cwdInput : import_path2.default.resolve(process.cwd(), cwdInput) : process.cwd();
      if (!import_fs2.default.existsSync(import_path2.default.join(process.cwd(), ".joe"))) {
        try {
          import_fs2.default.mkdirSync(import_path2.default.join(process.cwd(), ".joe"));
        } catch {
        }
      }
      try {
        const { stdout, stderr } = await execAsync(command, { cwd: workDir, timeout: timeoutVal });
        if (command.trim().startsWith("cd ")) {
          const target = command.trim().split(/\s+/)[1];
          if (target) {
            const newCwd = import_path2.default.resolve(workDir, target);
            if (import_fs2.default.existsSync(newCwd)) {
              import_fs2.default.writeFileSync(stateFile, JSON.stringify({ cwd: newCwd }));
              logs.push(`shell.cwd_updated=${newCwd}`);
            }
          }
        }
        logs.push(`exec=${command} cwd=${workDir} exit=0`);
        return { ok: true, output: { stdout, stderr, exitCode: 0, cwd: workDir }, logs };
      } catch (err) {
        logs.push(`exec=${command} err=${err.message}`);
        return { ok: false, output: { stdout: err.stdout, stderr: err.stderr, exitCode: err.code || 1 }, logs };
      }
    }
    if (name === "check_syntax") {
      const filename = String(input?.filename ?? "");
      const full = import_path2.default.isAbsolute(filename) ? filename : import_path2.default.resolve(process.cwd(), filename);
      if (!import_fs2.default.existsSync(full)) return { ok: false, error: "File not found", logs };
      const ext = import_path2.default.extname(full).toLowerCase();
      if (ext === ".json") {
        try {
          JSON.parse(import_fs2.default.readFileSync(full, "utf-8"));
          return { ok: true, output: { status: "OK" }, logs };
        } catch (e) {
          return { ok: false, error: e.message, logs };
        }
      }
      if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
        const { exec: exec2 } = await import("child_process");
        const util = await import("util");
        const execAsync = util.promisify(exec2);
        try {
          await execAsync(`node --check "${full}"`);
          return { ok: true, output: { status: "OK" }, logs };
        } catch (e) {
          return { ok: false, error: e.stderr || e.message, logs };
        }
      }
      if (ext === ".ts" || ext === ".tsx") {
        const { exec: exec2 } = await import("child_process");
        const util = await import("util");
        const execAsync = util.promisify(exec2);
        try {
          await execAsync(`npx -y tsc --noEmit "${full}" --esModuleInterop --skipLibCheck --target es2020 --moduleResolution node`);
          return { ok: true, output: { status: "OK" }, logs };
        } catch (e) {
          return { ok: true, output: { status: "Errors", errors: e.stdout }, logs };
        }
      }
      return { ok: true, output: { status: "Skipped (unsupported type)" }, logs };
    }
    if (name === "generate_tests") {
      const filename = String(input?.filename ?? "");
      const full = import_path2.default.isAbsolute(filename) ? filename : import_path2.default.resolve(process.cwd(), filename);
      if (!import_fs2.default.existsSync(full)) return { ok: false, error: "File not found", logs };
      const content = import_fs2.default.readFileSync(full, "utf-8");
      const apiKey2 = process.env.OPENAI_API_KEY;
      if (!apiKey2) return { ok: false, error: "No API Key for generation", logs };
      try {
        const { default: OpenAI4 } = await import("openai");
        const client = new OpenAI4({ apiKey: apiKey2, baseURL: process.env.OPENAI_BASE_URL });
        const completion = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || "gpt-4o",
          messages: [
            { role: "system", content: "You are a Senior QA Engineer. Generate a comprehensive test file for the provided code. Use Jest/Vitest syntax. Return ONLY the code, no markdown." },
            { role: "user", content: `File: ${import_path2.default.basename(filename)}

${content}` }
          ]
        });
        let testCode = completion.choices[0].message.content || "";
        testCode = testCode.replace(/^```(typescript|ts|javascript|js)?\n/, "").replace(/\n```$/, "");
        const testDir = import_path2.default.join(import_path2.default.dirname(full), "__tests__");
        if (!import_fs2.default.existsSync(testDir)) import_fs2.default.mkdirSync(testDir, { recursive: true });
        const testFile = import_path2.default.join(testDir, `${import_path2.default.basename(filename, import_path2.default.extname(filename))}.test${import_path2.default.extname(filename)}`);
        import_fs2.default.writeFileSync(testFile, testCode);
        logs.push(`tests.generated=${testFile}`);
        return { ok: true, output: { testFile }, logs };
      } catch (e) {
        return { ok: false, error: e.message, logs };
      }
    }
    if (name === "db_inspect") {
      const connStr = String(input?.connectionString || process.env.MONGO_URI || "");
      if (!connStr) return { ok: false, error: "No connection string provided", logs };
      if (connStr.startsWith("mongodb")) {
        try {
          const mongoose20 = await import("mongoose");
          const conn = await mongoose20.createConnection(connStr).asPromise();
          if (!conn.db) {
            await conn.close();
            return { ok: false, error: "Failed to connect to DB", logs };
          }
          const collections = await conn.db.listCollections().toArray();
          const schema = {};
          for (const col of collections) {
            const sample = await conn.db.collection(col.name).findOne({});
            schema[col.name] = sample ? Object.keys(sample) : [];
          }
          await conn.close();
          return { ok: true, output: { type: "mongodb", collections: schema }, logs };
        } catch (e) {
          return { ok: false, error: e.message, logs };
        }
      }
      return { ok: false, error: "Unsupported DB type (only mongodb for now)", logs };
    }
    if (name === "generate_docs") {
      const p = String(input?.path || ".");
      const root = import_path2.default.isAbsolute(p) ? p : import_path2.default.resolve(process.cwd(), p);
      const apiKey2 = process.env.OPENAI_API_KEY;
      if (!apiKey2) return { ok: false, error: "No API Key", logs };
      const files = import_fs2.default.readdirSync(root).filter((f) => /\.(ts|js|py|go)$/.test(f)).slice(0, 5);
      const docs = {};
      try {
        const { default: OpenAI4 } = await import("openai");
        const client = new OpenAI4({ apiKey: apiKey2, baseURL: process.env.OPENAI_BASE_URL });
        for (const f of files) {
          const content = import_fs2.default.readFileSync(import_path2.default.join(root, f), "utf-8");
          const completion = await client.chat.completions.create({
            model: "gpt-4o",
            messages: [
              { role: "system", content: "Generate a professional JSDoc/docstring summary for this file. Return ONLY the documentation comment." },
              { role: "user", content }
            ]
          });
          docs[f] = completion.choices[0].message.content;
        }
        let md = "# API Documentation\n\n";
        for (const [f, doc] of Object.entries(docs)) {
          md += `## ${f}

${doc}

`;
        }
        import_fs2.default.writeFileSync(import_path2.default.join(root, "README_API.md"), md);
        return { ok: true, output: { file: "README_API.md" }, logs };
      } catch (e) {
        return { ok: false, error: e.message, logs };
      }
    }
    if (name === "git_ops") {
      const op = String(input?.operation);
      const args = input?.args || [];
      const { exec: exec2 } = await import("child_process");
      const util = await import("util");
      const execAsync = util.promisify(exec2);
      try {
        let cmd = `git ${op} ${args.join(" ")}`;
        if (op === "commit") {
          try {
            await execAsync("git config user.name");
          } catch {
            await execAsync('git config user.name "Joe AI"');
            await execAsync('git config user.email "joe@xelitesolutions.com"');
          }
        }
        const { stdout, stderr } = await execAsync(cmd, { cwd: process.cwd() });
        logs.push(`git.op=${op} success`);
        return { ok: true, output: { output: stdout || stderr }, logs };
      } catch (e) {
        return { ok: false, error: e.message || e.stderr, logs };
      }
    }
    if (name === "npm_manager") {
      const cmd = String(input?.command);
      const pkgs = input?.packages || [];
      const isDev = !!input?.dev;
      const { exec: exec2 } = await import("child_process");
      const util = await import("util");
      const execAsync = util.promisify(exec2);
      try {
        let fullCmd = `npm ${cmd}`;
        if (pkgs.length > 0) fullCmd += ` ${pkgs.join(" ")}`;
        if (isDev && (cmd === "install" || cmd === "i")) fullCmd += " -D";
        logs.push(`npm.cmd=${fullCmd} starting...`);
        const { stdout, stderr } = await execAsync(fullCmd, { cwd: process.cwd() });
        if ((cmd === "install" || cmd === "i") && pkgs.length > 0) {
          const tsConfig = import_path2.default.join(process.cwd(), "tsconfig.json");
          if (import_fs2.default.existsSync(tsConfig)) {
            const typesToInstall = pkgs.filter((p) => !p.startsWith("@types/")).map((p) => `@types/${p.split("@")[0]}`);
            if (typesToInstall.length > 0) {
              try {
                logs.push(`npm.auto_types=${typesToInstall.join(" ")}`);
                await execAsync(`npm install -D ${typesToInstall.join(" ")}`, { cwd: process.cwd() });
              } catch (e) {
                logs.push("npm.auto_types_failed (ignored)");
              }
            }
          }
        }
        return { ok: true, output: { output: stdout }, logs };
      } catch (e) {
        return { ok: false, error: e.message || e.stderr, logs };
      }
    }
    if (name === "file_edit") {
      const filename = String(input?.filename ?? "");
      const find = String(input?.find ?? "");
      const replace = String(input?.replace ?? "");
      const full = import_path2.default.isAbsolute(filename) ? filename : import_path2.default.resolve(process.cwd(), filename);
      if (!import_fs2.default.existsSync(full)) return { ok: false, error: "File not found", logs };
      let content = import_fs2.default.readFileSync(full, "utf-8");
      if (!content.includes(find)) {
        return { ok: false, error: "Text to replace not found", logs };
      }
      content = content.replace(find, replace);
      import_fs2.default.writeFileSync(full, content);
      logs.push(`edit=${filename}`);
      return { ok: true, output: { success: true }, logs };
    }
    if (name === "grep_search") {
      const query = String(input?.query ?? "");
      const searchPath = String(input?.path ?? ".");
      const include = String(input?.include ?? "");
      const exclude = String(input?.exclude ?? "");
      const root = repoRoot();
      const workDir = import_path2.default.isAbsolute(searchPath) ? searchPath : import_path2.default.resolve(root, searchPath);
      let cmd = `grep -rnI "${query.replace(/"/g, '\\"')}" "${workDir}"`;
      if (include) {
        cmd += ` --include="${include}"`;
      }
      if (exclude) {
        cmd += ` --exclude-dir="${exclude}"`;
      } else {
        cmd += ` --exclude-dir="node_modules" --exclude-dir=".git" --exclude-dir="dist" --exclude-dir="build"`;
      }
      logs.push(`grep.cmd=${cmd}`);
      const { exec: exec2 } = await import("child_process");
      const util = await import("util");
      const execAsync = util.promisify(exec2);
      try {
        const { stdout } = await execAsync(cmd, { maxBuffer: 1024 * 1024 * 5 });
        const lines = stdout.split("\n").filter(Boolean).slice(0, 100);
        logs.push(`grep.matches=${lines.length}`);
        return { ok: true, output: { matches: lines, count: lines.length, truncated: lines.length === 100 }, logs };
      } catch (err) {
        if (err.code === 1) {
          return { ok: true, output: { matches: [], count: 0 }, logs };
        }
        logs.push(`grep.error=${err.message}`);
        return { ok: false, error: err.message, logs };
      }
    }
    if (name === "scaffold_project") {
      const structure = input?.structure || {};
      const baseDir = String(input?.baseDir || ".");
      const resolvedBase = import_path2.default.isAbsolute(baseDir) ? baseDir : import_path2.default.resolve(process.cwd(), baseDir);
      const created = [];
      const errors = [];
      for (const [relativePath, content] of Object.entries(structure)) {
        const fullPath = import_path2.default.join(resolvedBase, relativePath);
        try {
          if (content === null) {
            if (!import_fs2.default.existsSync(fullPath)) {
              import_fs2.default.mkdirSync(fullPath, { recursive: true });
              created.push(`${relativePath}/`);
            }
          } else {
            const dir = import_path2.default.dirname(fullPath);
            if (!import_fs2.default.existsSync(dir)) {
              import_fs2.default.mkdirSync(dir, { recursive: true });
            }
            import_fs2.default.writeFileSync(fullPath, String(content));
            created.push(relativePath);
          }
        } catch (e) {
          errors.push(`${relativePath}: ${e.message}`);
        }
      }
      logs.push(`scaffold.created=${created.length} errors=${errors.length}`);
      return {
        ok: errors.length === 0,
        output: { created, errors },
        logs
      };
    }
    if (name === "analyze_codebase") {
      const p = String(input?.path || ".");
      const root = resolveToolPath(p);
      if (!import_fs2.default.existsSync(root)) return { ok: false, error: "Path not found", logs };
      const pkgJsonPath = import_path2.default.join(root, "package.json");
      let pkgInfo = "No package.json";
      if (import_fs2.default.existsSync(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(import_fs2.default.readFileSync(pkgJsonPath, "utf-8"));
          pkgInfo = `Name: ${pkg.name}
Dependencies: ${Object.keys(pkg.dependencies || {}).join(", ")}`;
        } catch {
        }
      }
      const contextPath = import_path2.default.join(root, ".joe/context.json");
      let contextInfo = "No .joe/context.json found";
      if (import_fs2.default.existsSync(contextPath)) {
        contextInfo = import_fs2.default.readFileSync(contextPath, "utf-8").slice(0, 500);
      }
      const archPath = import_path2.default.join(root, "ARCHITECTURE.md");
      let archInfo = "No ARCHITECTURE.md found";
      if (import_fs2.default.existsSync(archPath)) {
        archInfo = import_fs2.default.readFileSync(archPath, "utf-8").slice(0, 1e3);
      }
      const summary = `
## Codebase Analysis for ${root}

### Package Info
${pkgInfo}

### Project Context (.joe/context.json)
${contextInfo}

### Architecture (ARCHITECTURE.md)
${archInfo}
       `.trim();
      logs.push("analyze.ok");
      return { ok: true, output: { summary }, logs };
    }
    if (name === "knowledge_search") {
      const query = String(input?.query ?? "");
      const results = await KnowledgeService.search(query);
      logs.push(`knowledge.search=${query} count=${results.length}`);
      const mapped = results.map((r) => ({
        id: r.document.id,
        filename: r.document.filename,
        snippet: r.snippet,
        score: r.score
      })).slice(0, 10);
      return { ok: true, output: { results: mapped }, logs };
    }
    if (name === "knowledge_add") {
      const filename = String(input?.filename ?? "unknown.txt");
      const content = String(input?.content ?? "");
      const tags = Array.isArray(input?.tags) ? input.tags : [];
      const doc = await KnowledgeService.add(filename, content, tags);
      logs.push(`knowledge.add=${filename} id=${doc.id}`);
      return { ok: true, output: { id: doc.id }, logs };
    }
    if (name.startsWith("noop_")) {
      logs.push("noop.ok=true");
      return { ok: true, output: { ok: true }, logs };
    }
    return { ok: false, error: "unknown_tool", logs };
  } catch (e) {
    logs.push(`error=${e?.message || String(e)}`);
    return { ok: false, error: e?.message || "error", logs };
  } finally {
    logs.push(`[${(/* @__PURE__ */ new Date()).toISOString()}] end ${name} dt=${Date.now() - t0}ms`);
  }
}

// src/ws.ts
var import_ws = require("ws");
var import_jsonwebtoken2 = __toESM(require("jsonwebtoken"));
var liveWssRef = null;
var browserProxyWssRef = null;
var liveSeq = 0;
function attachWebSocket(server) {
  liveWssRef = new import_ws.WebSocketServer({ noServer: true });
  browserProxyWssRef = new import_ws.WebSocketServer({ noServer: true });
  liveWssRef.on("connection", (ws) => {
    ws.on("message", () => {
    });
  });
  browserProxyWssRef.on("connection", (clientWs, req) => {
    const sessionId = String(req.browserSessionId || "").trim();
    if (!sessionId) {
      try {
        clientWs.close(1008, "missing_session_id");
      } catch {
      }
      return;
    }
    const upstreamUrl = new URL(`/ws/${encodeURIComponent(sessionId)}`, config.browserWorkerUrl);
    upstreamUrl.searchParams.set("key", config.browserWorkerKey);
    upstreamUrl.protocol = upstreamUrl.protocol === "https:" ? "wss:" : "ws:";
    const upstreamWs = new import_ws.WebSocket(upstreamUrl.toString());
    const closeBoth = (code, reason) => {
      try {
        if (clientWs.readyState === import_ws.WebSocket.OPEN) clientWs.close(code, reason);
      } catch {
      }
      try {
        if (upstreamWs.readyState === import_ws.WebSocket.OPEN) upstreamWs.close(code, reason);
      } catch {
      }
      try {
        clientWs.terminate();
      } catch {
      }
      try {
        upstreamWs.terminate();
      } catch {
      }
    };
    clientWs.on("message", (data) => {
      if (upstreamWs.readyState === import_ws.WebSocket.OPEN) {
        try {
          upstreamWs.send(data);
        } catch {
        }
      }
    });
    upstreamWs.on("message", (data) => {
      if (clientWs.readyState === import_ws.WebSocket.OPEN) {
        try {
          clientWs.send(data);
        } catch {
        }
      }
    });
    upstreamWs.on("close", () => closeBoth(1011, "upstream_closed"));
    upstreamWs.on("error", () => closeBoth(1011, "upstream_error"));
    clientWs.on("close", () => closeBoth(1e3, "client_closed"));
    clientWs.on("error", () => closeBoth(1011, "client_error"));
  });
  server.on("upgrade", (req, socket, head) => {
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
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host}`);
    } catch {
      return reject(400, "Bad Request");
    }
    if (url.pathname === "/ws") {
      liveWssRef?.handleUpgrade(req, socket, head, (ws) => {
        liveWssRef?.emit("connection", ws, req);
      });
      return;
    }
    if (url.pathname.startsWith("/browser/ws/")) {
      const sessionId = url.pathname.split("/").filter(Boolean).pop();
      const token = url.searchParams.get("token");
      if (!token) return reject(401, "Unauthorized");
      try {
        import_jsonwebtoken2.default.verify(token, config.jwtSecret);
      } catch {
        return reject(401, "Unauthorized");
      }
      req.browserSessionId = sessionId;
      browserProxyWssRef?.handleUpgrade(req, socket, head, (ws) => {
        browserProxyWssRef?.emit("connection", ws, req);
      });
      return;
    }
    return reject(404, "Not Found");
  });
}
function broadcast(event) {
  if (!liveWssRef) return;
  const normalized = {
    ...event,
    ts: typeof event?.ts === "number" ? event.ts : Date.now(),
    seq: typeof event?.seq === "number" ? event.seq : liveSeq += 1,
    runId: typeof event?.runId === "string" ? event.runId : typeof event?.data?.runId === "string" ? event.data.runId : void 0
  };
  const payload = JSON.stringify(normalized);
  liveWssRef.clients.forEach((client) => {
    if (client.readyState === import_ws.WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// src/middleware/auth.ts
var import_jsonwebtoken3 = __toESM(require("jsonwebtoken"));
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = import_jsonwebtoken3.default.verify(token, config.jwtSecret);
    req.auth = payload;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// src/routes/tools.ts
var router2 = (0, import_express2.Router)();
router2.get("/", async (_req, res) => {
  const noopCount = tools.filter((t) => t.name.startsWith("noop_")).length;
  const realCount = tools.length - noopCount;
  res.json({ count: tools.length, realCount, noopCount, tools });
});
router2.post("/run", async (req, res) => {
  const input = { text: String(req.body?.text ?? "hello") };
  const steps = [
    { type: "step_started", data: { name: "plan" } },
    { type: "step_done", data: { name: "plan" } },
    { type: "step_started", data: { name: "execute:echo", input } }
  ];
  steps.forEach((ev) => broadcast(ev));
  const result = await executeTool("echo", input);
  broadcast({ type: result.ok ? "step_done" : "step_failed", data: { name: "execute:echo", result } });
  res.json(result);
});
router2.post("/:name/execute", authenticate, async (req, res) => {
  const name = String(req.params.name);
  const result = await executeTool(name, req.body || {});
  res.json(result);
});
var tools_default = router2;

// src/routes/run.ts
var import_express3 = require("express");
var import_mongoose12 = __toESM(require("mongoose"));
var import_fs3 = __toESM(require("fs"));

// src/mock/store.ts
var runs = [];
var execs = [];
var artifacts = [];
var approvals = [];
var sessions = [];
var summaries = [];
var messages = [];
function nextId(prefix, n) {
  return `${prefix}${n}`;
}
var store = {
  createRun(sessionId) {
    const id = nextId("run_", runs.length + 1);
    const run = { id, sessionId, status: "running", steps: [] };
    runs.push(run);
    return run;
  },
  updateRun(id, patch) {
    const r = runs.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
    return r;
  },
  addStep(runId, name, status, why) {
    const r = runs.find((x) => x.id === runId);
    if (!r) return;
    r.steps.push({ name, status, why });
  },
  addExec(runId, name, input, output, ok, logs) {
    const id = nextId("exec_", execs.length + 1);
    const e = { id, runId, name, input, output, ok, logs, createdAt: Date.now() };
    execs.push(e);
    return e;
  },
  addArtifact(runId, name, href) {
    const id = nextId("art_", artifacts.length + 1);
    const a = { id, runId, name, href };
    artifacts.push(a);
    return a;
  },
  createApproval(runId, action, risk, planName, planInput) {
    const id = nextId("appr_", approvals.length + 1);
    const ap = { id, runId, action, risk, status: "pending", planName, planInput };
    approvals.push(ap);
    return ap;
  },
  updateApproval(id, patch) {
    const a = approvals.find((x) => x.id === id);
    if (a) Object.assign(a, patch);
    return a;
  },
  getApproval(id) {
    return approvals.find((x) => x.id === id) || null;
  },
  listRuns(sessionId) {
    return runs.filter((r) => !sessionId || r.sessionId === sessionId);
  },
  listExecs(runId) {
    return execs.filter((e) => !runId || e.runId === runId);
  },
  listArtifacts(runId) {
    return artifacts.filter((a) => !runId || a.runId === runId);
  },
  createSession(title, mode = "ADVISOR", kind = "chat") {
    const existing = sessions.find((s2) => s2.title === title);
    if (existing) return existing;
    const id = nextId("sess_", sessions.length + 1);
    const s = { id, title, mode, kind };
    sessions.push(s);
    return s;
  },
  listSessions() {
    return sessions;
  },
  getSession(id) {
    return sessions.find((s) => s.id === id);
  },
  deleteSession(id) {
    const idx = sessions.findIndex((s) => s.id === id);
    if (idx !== -1) sessions.splice(idx, 1);
  },
  addMessage(sessionId, role, content, runId) {
    const id = nextId("msg_", messages.length + 1);
    const m = { id, sessionId, role, content, runId, ts: Date.now() };
    messages.push(m);
    const s = sessions.find((s2) => s2.id === sessionId);
    if (s) {
      s.lastSnippet = content.slice(0, 140);
      s.lastUpdatedAt = Date.now();
    }
    return m;
  },
  listMessages(sessionId) {
    return messages.filter((m) => m.sessionId === sessionId);
  },
  getSummary(sessionId) {
    return summaries.find((x) => x.sessionId === sessionId) || null;
  },
  upsertSummary(sessionId, content) {
    const existing = summaries.find((x) => x.sessionId === sessionId);
    if (existing) {
      existing.content = content;
      existing.ts = Date.now();
      return existing;
    }
    const s = { sessionId, content, ts: Date.now() };
    summaries.push(s);
    return s;
  },
  mergeSessions(sourceId, targetId) {
    let movedMessages = 0;
    messages.forEach((m) => {
      if (m.sessionId === sourceId) {
        m.sessionId = targetId;
        movedMessages++;
      }
    });
    runs.forEach((r) => {
      if (r.sessionId === sourceId) {
        r.sessionId = targetId;
      }
    });
    const idx = sessions.findIndex((s) => s.id === sourceId);
    if (idx >= 0) sessions.splice(idx, 1);
    return { movedMessages };
  }
};

// src/models/toolExecution.ts
var import_mongoose3 = __toESM(require("mongoose"));
var ToolExecutionSchema = new import_mongoose3.Schema(
  {
    runId: { type: import_mongoose3.Schema.Types.ObjectId, ref: "Run", index: true },
    name: { type: String, required: true },
    input: { type: import_mongoose3.Schema.Types.Mixed },
    output: { type: import_mongoose3.Schema.Types.Mixed },
    ok: { type: Boolean, default: false },
    logs: [String]
  },
  { timestamps: true }
);
var ToolExecution = import_mongoose3.default.model("ToolExecution", ToolExecutionSchema);

// src/models/artifact.ts
var import_mongoose4 = __toESM(require("mongoose"));
var ArtifactSchema = new import_mongoose4.Schema(
  {
    runId: { type: import_mongoose4.Schema.Types.ObjectId, ref: "Run", index: true },
    name: { type: String, required: true },
    href: { type: String, required: true }
  },
  { timestamps: true }
);
var Artifact = import_mongoose4.default.model("Artifact", ArtifactSchema);

// src/models/approval.ts
var import_mongoose5 = __toESM(require("mongoose"));
var ApprovalSchema = new import_mongoose5.Schema(
  {
    runId: { type: import_mongoose5.Schema.Types.ObjectId, ref: "Run", index: true, required: true },
    action: { type: String, required: true },
    risk: { type: String, required: true },
    status: { type: String, enum: ["pending", "approved", "denied"], default: "pending" }
  },
  { timestamps: true }
);
var Approval = import_mongoose5.default.model("Approval", ApprovalSchema);

// src/models/run.ts
var import_mongoose6 = __toESM(require("mongoose"));
var RunSchema = new import_mongoose6.Schema(
  {
    sessionId: { type: import_mongoose6.Schema.Types.ObjectId, ref: "Session", index: true, required: true },
    status: { type: String, enum: ["pending", "running", "done", "blocked", "failed"], default: "pending" },
    steps: [
      {
        name: String,
        status: { type: String, enum: ["pending", "running", "done", "blocked", "failed"], default: "pending" },
        why: String,
        evidence: [{ type: { type: String }, ref: String }]
      }
    ]
  },
  { timestamps: true }
);
var Run = import_mongoose6.default.model("Run", RunSchema);

// src/llm.ts
var import_openai = __toESM(require("openai"));
var apiKey = process.env.OPENAI_API_KEY;
if (apiKey) {
  console.info("LLM: OpenAI API Key configured.");
} else {
  console.warn("LLM: No OpenAI API Key found in environment variables. LLM features will be disabled.");
}
var openai = new import_openai.default({
  apiKey: apiKey || "dummy",
  baseURL: process.env.OPENAI_BASE_URL
});
var activeTools = tools.filter((t) => !t.name.startsWith("noop_"));
var SYSTEM_PROMPT = `You are Joe, an elite AI autonomous engineer. You are capable of building complete websites, applications, and solving complex tasks without human intervention.

## CORE INSTRUCTIONS:
1. **Think Before Acting**: You are a "Reasoning Engine". Before every action, verify if you have enough information. If not, use a tool to get it.
2. **Tool First**: Do not guess. If asked about a library, file, or real-world fact, use the appropriate tool (grep_search, browser_open, search) immediately.
3. **Conversational Queries**: 
   - If the user greets you or asks personal questions (e.g. "how are you"), **reply naturally with text only**. Do NOT use any tools.
   - **Identity**: If asked "who are you", reply that you are Joe, an elite AI autonomous engineer. **NEVER** search for "who are you".
4. **Browser Usage**: The "browser_open" tool is your window to the world. Use it for:
   - Verifying documentation.
   - Checking live website status.
   - Searching for up-to-date information when internal knowledge is stale.
   - **Visual Verification**: Use it to see what you built.
   - **Never use the browser** to inspect the user's local repository or "test code". For codebase analysis, prefer local tools (file_read, file_search, project tree/graph, etc). Only open GitHub if the user explicitly needs to view the website itself, not the code.
  - When using browser tools, act like a real user: use "browser_run" with deliberate steps (waits, clicks, typing) and prefer visible interactions (mouseMove before click when useful).
4. **Language Protocol**: 
   - **Input**: Understand any language.
   - **Thinking**: You can reason in English or the user's language.
   - **Output**: **STRICTLY FOLLOW THE USER'S LANGUAGE**. If the user asks in Arabic, you MUST reply in "Eloquent & Engaging Arabic" (\u0644\u063A\u0629 \u0639\u0631\u0628\u064A\u0629 \u0641\u0635\u062D\u0649 \u0633\u0644\u0633\u0629 \u0648\u062C\u0645\u064A\u0644\u0629).
   - **Translation**: Never give a "machine translation" vibe. Use natural, professional phrasing.

## RESPONSE STYLE - CRITICAL:
- **Concise & Direct**: Give the answer immediately. Do not fluff. Do not apologize unnecessarily.
- **No Over-Explanation**: Only explain if asked or if the topic is complex.
- **Visuals**: Use tables, lists, and code blocks liberally.
- **Follow-up**: At the very end of your final response, you MUST provide 3 relevant follow-up options in a hidden JSON block.

## RESPONSE FORMATTING:
- **Visual Hierarchy**: Use Markdown headers (##, ###) to structure your response.
- **Lists**: Use bullet points for readability.
- **Code**: Use code blocks with language tags (e.g., \`\`\`typescript).
- **Tone**: Professional, confident, yet helpful.
- **Synthesized Answers**: When reporting search/browser results, synthesize them into a coherent narrative. Do not just dump data.

## FOLLOW-UP OPTIONS FORMAT:
Append this EXACT format at the end of your message (invisible to user, parsed by UI):
:::options
[
  { "label": "Short Label 1", "query": "Full question for option 1" },
  { "label": "Short Label 2", "query": "Full question for option 2" },
  { "label": "Short Label 3", "query": "Full question for option 3" }
]
:::

## CRITICAL RULES:
- **Persistent Context**: Always check for ".joe/context.json" to understand project history.
- **Error Handling**: If a tool fails, analyze the error, fix the input, and RETRY. Do not give up easily.
- **Efficiency**: Do not repeat the same tool call if it was successful.
- **Artifacts**: If you generated an artifact (image, file), use "echo" to confirm it.
- When you fully finish the user's instructions, end your final answer with: "\u062C\u0648 \u0627\u0646\u062A\u0647\u0649 \u0645\u0646 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u0627\u062A \u0627\u0644\u0645\u0648\u062C\u0647\u0629 \u0625\u0644\u064A\u0647 \u0628\u0634\u0643\u0644 \u0635\u062D\u064A\u062D."
`;
async function callLLM(prompt, context = []) {
  const msgs = [
    { role: "system", content: "You are a helpful assistant." },
    ...context,
    { role: "user", content: prompt }
  ];
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages: msgs
    });
    return completion.choices[0]?.message?.content || "";
  } catch (e) {
    throw new Error(`LLM call failed: ${e.message}`);
  }
}
async function planNextStep(messages2, options) {
  let client = openai;
  if (options?.apiKey) {
    client = new import_openai.default({
      apiKey: options.apiKey,
      baseURL: options.baseUrl || process.env.OPENAI_BASE_URL
    });
  }
  if ((process.env.MOCK_DB === "1" || process.env.MOCK_DB === "true") && !options?.apiKey && !process.env.OPENAI_API_KEY) {
    console.info("[LLM] Using Mock Planner");
    const lastMsg = messages2[messages2.length - 1];
    const rawText = typeof lastMsg.content === "string" ? lastMsg.content : JSON.stringify(lastMsg.content || "");
    const content = rawText.toLowerCase();
    const historyStr = JSON.stringify(messages2).toLowerCase();
    const hasOpened = historyStr.includes("tool call: browser_open") || historyStr.includes("tool call: browser_run");
    const hasClicked = historyStr.includes("tool call: browser_run") && historyStr.includes("click");
    const hasAnalyzed = historyStr.includes("tool call: browser_get_state");
    const sessionIdMatch = JSON.stringify(messages2).match(/"sessionId"\s*:\s*"([^"]+)"/);
    const sessionId = sessionIdMatch?.[1];
    const urlMatch = rawText.match(/https?:\/\/[^\s"'<>]+/i);
    let url = urlMatch?.[0];
    const wantsOpen = /\bopen\b/i.test(rawText) || /افتح|افتحي|افتحوا|افتح المتصفح|افتح الموقع/i.test(rawText);
    const wantsYouTube = /youtube|يوتيوب/i.test(rawText) || historyStr.includes("youtube.com");
    const wantsSearch = /ابحث|بحث|search/i.test(rawText) || /ضيعة\s+ضايعة/i.test(rawText) || /شغل|شغّل|تشغيل|play/i.test(rawText);
    if (wantsYouTube && wantsSearch) {
      const qMatch = rawText.match(/ابحث(?:\s+عن)?\s+(.+?)(?:\s+(?:وشغل|وشغّل|وشغل|شغل|تشغيل)|$)/i) || rawText.match(/search\s+for\s+(.+?)(?:\s+and\s+play|$)/i);
      const query = String(qMatch?.[1] || "\u0636\u064A\u0639\u0629 \u0636\u0627\u064A\u0639\u0629").trim() || "\u0636\u064A\u0639\u0629 \u0636\u0627\u064A\u0639\u0629";
      if (!hasOpened || !sessionId) {
        return { name: "browser_open", input: { url: "https://www.youtube.com" } };
      }
      const hasTypedQuery = historyStr.includes(`"type"`) && historyStr.includes(query.toLowerCase());
      const hasPressedEnter = historyStr.includes('"press"') && historyStr.includes('"enter"');
      const hasClickedVideoTitle = historyStr.includes("ytd-video-renderer") && historyStr.includes("video-title");
      if (!hasTypedQuery || !hasPressedEnter) {
        return {
          name: "browser_run",
          input: {
            sessionId,
            actions: [
              { type: "goto", url: "https://www.youtube.com", waitUntil: "domcontentloaded" },
              { type: "waitForSelector", selector: "input#search", timeoutMs: 8e3 },
              { type: "click", selector: "input#search" },
              { type: "type", text: query, delay: 80 },
              { type: "press", key: "Enter" },
              { type: "wait", ms: 1200 }
            ]
          }
        };
      }
      if (!hasClickedVideoTitle) {
        return {
          name: "browser_run",
          input: {
            sessionId,
            actions: [
              { type: "waitForSelector", selector: "ytd-video-renderer a#video-title", timeoutMs: 8e3 },
              { type: "click", selector: "ytd-video-renderer a#video-title" },
              { type: "waitForLoad", state: "domcontentloaded" },
              { type: "wait", ms: 1e3 }
            ]
          }
        };
      }
      return { name: "echo", input: { text: "\u062C\u0648 \u0627\u0646\u062A\u0647\u0649 \u0645\u0646 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u0627\u062A \u0627\u0644\u0645\u0648\u062C\u0647\u0629 \u0625\u0644\u064A\u0647 \u0628\u0634\u0643\u0644 \u0635\u062D\u064A\u062D." } };
    }
    if (wantsOpen) {
      const explicitBrowser = /(\b(browser|web)\b|متصفح)/i.test(rawText);
      const githubKeyword = /(github|جيتهاب|كتهاب|كيتهاب)/i.test(rawText);
      const analysisKeyword = /(كود|code|repo|repository|مستودع|ملفات|files|اختبر|تحقق|راجع|audit|lint|build|typecheck|تحليل)/i.test(rawText);
      if (githubKeyword && analysisKeyword && !explicitBrowser && !url) {
        return {
          name: "echo",
          input: { text: "\u0633\u0623\u0642\u0648\u0645 \u0628\u062A\u062D\u0644\u064A\u0644 \u0627\u0644\u0643\u0648\u062F \u0645\u062D\u0644\u064A\u0627\u064B \u062F\u0648\u0646 \u0641\u062A\u062D \u0627\u0644\u0645\u062A\u0635\u0641\u062D." }
        };
      }
      if (!url) {
        if (/youtube|يوتيوب/i.test(rawText)) url = "https://www.youtube.com";
      }
      if (!hasOpened) {
        return {
          name: "browser_open",
          input: { url: url || "https://www.google.com" }
        };
      }
      return {
        name: "echo",
        input: { text: "I have already opened the browser." }
      };
    }
    if (historyStr.includes("github.com") && historyStr.includes("open") && !historyStr.includes("package.json")) {
      if (hasOpened) {
        return {
          name: "echo",
          input: { text: "I have already opened the browser." }
        };
      }
      return {
        name: "browser_open",
        input: { url: "https://github.com/yasoo2/xelitesolutions" }
      };
    }
    if (historyStr.includes("package.json")) {
      if (!hasOpened) {
        return {
          name: "browser_open",
          input: { url: "https://github.com/yasoo2/xelitesolutions" }
        };
      }
      if (!hasClicked) {
        if (!sessionId) {
          return {
            name: "browser_open",
            input: { url: "https://github.com/yasoo2/xelitesolutions" }
          };
        }
        return {
          name: "browser_run",
          input: {
            sessionId,
            actions: [{ type: "click", selector: 'a[title="package.json"]' }]
          }
        };
      }
      if (!hasAnalyzed) {
        if (!sessionId) {
          return {
            name: "browser_open",
            input: { url: "https://github.com/yasoo2/xelitesolutions" }
          };
        }
        return {
          name: "browser_get_state",
          input: { sessionId }
        };
      }
      return {
        name: "echo",
        input: { text: "I have analyzed the package.json content." }
      };
    }
    if (content.includes("yahoo") || historyStr.includes("yahoo")) {
      const hasYahooOpen = historyStr.includes("tool call: browser_open") && historyStr.includes("yahoo.com");
      const hasYahooExtract = historyStr.includes("tool call: html_extract") && historyStr.includes("yahoo.com");
      if (!hasYahooOpen) {
        return {
          name: "browser_open",
          input: { url: "https://www.yahoo.com" }
        };
      }
      if (!hasYahooExtract) {
        return {
          name: "html_extract",
          input: { url: "https://www.yahoo.com" }
        };
      }
      return {
        name: "echo",
        input: { text: "Yahoo analyzed." }
      };
    }
    return {
      name: "echo",
      input: { text: "I'm running in MOCK mode. I saw: " + content }
    };
  }
  const aiTools = activeTools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description || `Tool: ${t.name}. Tags: ${t.tags.join(", ")}`,
      parameters: t.inputSchema
    }
  }));
  const msgs = [
    {
      role: "system",
      content: SYSTEM_PROMPT
    },
    ...messages2
  ];
  try {
    const completion = await client.chat.completions.create({
      model: options?.model || process.env.OPENAI_MODEL || "gpt-4o",
      messages: msgs,
      tools: aiTools,
      tool_choice: "auto"
    });
    const choice = completion.choices[0];
    const toolCall = choice.message.tool_calls?.[0];
    if (toolCall && toolCall.type === "function") {
      return {
        name: toolCall.function.name,
        input: JSON.parse(toolCall.function.arguments)
      };
    }
    return {
      name: "echo",
      input: { text: choice.message.content || "I'm not sure what to do." }
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("LLM Error:", msg);
    if (options?.throwOnError) {
      throw error;
    }
    throw error;
  }
}
async function generateSessionTitle(messages2) {
  if (!messages2 || messages2.length === 0) return "New Session";
  const msgs = [
    {
      role: "system",
      content: "You are a helpful assistant. Generate a short, concise title (max 6 words) for a chat session based on the following conversation start. The title should summarize the main topic. If the user speaks Arabic, the title MUST be in Arabic. Do not include quotes."
    },
    ...messages2.slice(0, 5).map((m) => ({ role: "user", content: String(m.content).slice(0, 500) }))
  ];
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages: msgs,
      max_tokens: 20
    });
    return completion.choices[0]?.message?.content?.trim() || "New Session";
  } catch (e) {
    console.error("Title generation failed", e);
    return "New Session";
  }
}
async function generateSummary(messages2) {
  if (!messages2 || messages2.length === 0) return "No content to summarize.";
  const msgs = [
    {
      role: "system",
      content: "You are a helpful assistant. Summarize the following conversation in a concise paragraph. Focus on the main goal, what was achieved, and any pending items. If the conversation is in Arabic, the summary MUST be in Arabic."
    },
    {
      role: "user",
      content: messages2.map((m) => `${m.role}: ${String(m.content).slice(0, 1e3)}`).join("\n\n")
    }
  ];
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      messages: msgs
    });
    return completion.choices[0]?.message?.content?.trim() || "Summary generation failed.";
  } catch (e) {
    console.error("Summary generation failed", e);
    return "Summary generation failed due to an error.";
  }
}

// src/routes/run.ts
init_session();

// src/models/message.ts
var import_mongoose8 = __toESM(require("mongoose"));
var MessageSchema = new import_mongoose8.Schema(
  {
    sessionId: { type: import_mongoose8.Schema.Types.ObjectId, ref: "Session", index: true, required: true },
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, required: true },
    runId: { type: String },
    attachments: [{ name: String, href: String }]
  },
  { timestamps: true }
);
var Message = import_mongoose8.default.model("Message", MessageSchema);

// src/models/file.ts
var import_mongoose9 = __toESM(require("mongoose"));
var FileSchema = new import_mongoose9.Schema({
  originalName: { type: String, required: true },
  filename: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  path: { type: String, required: true },
  content: { type: String },
  // For RAG/LLM context
  sessionId: { type: String, index: true }
}, { timestamps: true });
var FileModel = import_mongoose9.default.model("File", FileSchema);

// src/models/memoryItem.ts
var import_mongoose10 = __toESM(require("mongoose"));
var MemoryItemSchema = new import_mongoose10.Schema(
  {
    scope: { type: String, enum: ["session", "project", "user"], required: true },
    sessionId: { type: import_mongoose10.Schema.Types.ObjectId, ref: "Session", index: true },
    projectId: { type: import_mongoose10.Schema.Types.ObjectId, ref: "Project", index: true },
    userId: { type: import_mongoose10.Schema.Types.ObjectId, ref: "User", index: true },
    key: { type: String, required: true },
    value: { type: import_mongoose10.Schema.Types.Mixed }
  },
  { timestamps: true }
);
var MemoryItem = import_mongoose10.default.model("MemoryItem", MemoryItemSchema);

// src/services/memory.ts
var import_openai2 = __toESM(require("openai"));
var openai2 = new import_openai2.default({
  apiKey: process.env.OPENAI_API_KEY || "dummy",
  baseURL: process.env.OPENAI_BASE_URL
});
var MemoryService = class {
  static async searchMemories(userId, text, limit = 5) {
    if (!userId) return [];
    const normalized = String(text || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
    const keywords = normalized.split(/\s+/).map((w) => w.trim()).filter((w) => w.length >= 2).slice(0, 12);
    if (keywords.length === 0) {
      const items2 = await MemoryItem.find({ userId, scope: "user" }).sort({ updatedAt: -1 }).limit(limit);
      return items2.map((item) => `${item.key}: ${typeof item.value === "string" ? item.value : JSON.stringify(item.value)}`);
    }
    const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const regex = new RegExp(escaped.join("|"), "i");
    const items = await MemoryItem.find({
      userId,
      scope: "user",
      $or: [
        { key: { $regex: regex } },
        { value: { $regex: regex } }
      ]
    }).sort({ updatedAt: -1 }).limit(limit);
    if (items.length === 0) {
      const fallback = await MemoryItem.find({ userId, scope: "user" }).sort({ updatedAt: -1 }).limit(limit);
      return fallback.map((item) => `${item.key}: ${typeof item.value === "string" ? item.value : JSON.stringify(item.value)}`);
    }
    return items.map((item) => `${item.key}: ${typeof item.value === "string" ? item.value : JSON.stringify(item.value)}`);
  }
  static async extractAndSaveMemories(userId, userText, options) {
    if (!userId || !userText) return;
    try {
      let client = openai2;
      if (options?.apiKey) {
        client = new import_openai2.default({
          apiKey: options.apiKey,
          baseURL: options.baseUrl || process.env.OPENAI_BASE_URL
        });
      }
      const completion = await client.chat.completions.create({
        model: options?.model || "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a Memory Extractor. Your job is to extract permanent user facts from the conversation.
            
Rules:
- Extract ONLY facts that are useful to remember for future conversations (e.g., name, preferences, tech stack, job, specific instructions).
- Ignore transient info (e.g., "write a function", "fix this bug").
- Output a JSON object with a "facts" array. Each fact has "key" (short category) and "value" (the fact).
- If no relevant facts, return empty array.

Example:
User: "I am a React developer and I hate TypeScript."
Output: { "facts": [{ "key": "role", "value": "React Developer" }, { "key": "preference", "value": "Dislikes TypeScript" }] }
`
          },
          { role: "user", content: userText }
        ],
        response_format: { type: "json_object" }
      });
      const content = completion.choices[0].message.content;
      if (!content) return;
      const result = JSON.parse(content);
      if (result.facts && Array.isArray(result.facts)) {
        for (const fact of result.facts) {
          const exists = await MemoryItem.findOne({
            userId,
            scope: "user",
            key: fact.key,
            value: fact.value
          });
          if (!exists) {
            await MemoryItem.create({
              scope: "user",
              userId,
              key: fact.key,
              value: fact.value,
              sessionId: options?.sessionId
              // Optional link to origin session
            });
          }
        }
      }
    } catch (err) {
      console.error("[Memory] Extraction failed:", err);
    }
  }
};

// src/routes/run.ts
var router3 = (0, import_express3.Router)();
function redactSecretsFromString(input) {
  return input.replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "sk-[REDACTED]").replace(/\bBearer\s+[A-Za-z0-9._-]{10,}\b/g, "Bearer [REDACTED]").replace(/([?&]key=)[^&\s]+/gi, "$1[REDACTED]").replace(/\bx-worker-key\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, "x-worker-key:[REDACTED]").replace(/\b(WORKER_API_KEY|BROWSER_WORKER_KEY|JWT_SECRET)\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, "$1=[REDACTED]");
}
function safeErrorMessage(err) {
  const raw = typeof err?.message === "string" ? err.message : String(err);
  return redactSecretsFromString(raw);
}
function redactToolInputForStorage(name, input) {
  if (!input || typeof input !== "object") return input;
  if (name === "browser_run") {
    const sessionId = typeof input.sessionId === "string" ? input.sessionId : void 0;
    const actions = Array.isArray(input.actions) ? input.actions : [];
    const redactedActions = actions.map((a) => {
      const t = String(a?.type || "").toLowerCase();
      if (t === "type") {
        const text = typeof a?.text === "string" ? a.text : "";
        return { ...a, text: `[redacted:${text.length}]` };
      }
      if (t === "fillform") {
        const fields = Array.isArray(a?.fields) ? a.fields : [];
        const nextFields = fields.map((f) => {
          const label = String(f?.label || "").toLowerCase();
          const selector = String(f?.selector || "").toLowerCase();
          const combined = `${label} ${selector}`;
          const v = f?.value == null ? "" : String(f.value);
          const shouldRedact = Boolean(a?.sensitive) || Boolean(f?.sensitive) || /(password|card|cvv|iban|ssn|بطاقة|دفع|كلمة المرور|حساسية|حساب)/.test(combined);
          if (!shouldRedact) return f;
          return { ...f, value: `[redacted:${v.length}]` };
        });
        return { ...a, fields: nextFields };
      }
      if (t === "evaluate" && typeof a?.script === "string") {
        if (a?.sensitive) return { ...a, script: "[redacted]" };
      }
      return a;
    });
    return { sessionId, actions: redactedActions };
  }
  return input;
}
router3.post("/verify", authenticate, async (req, res) => {
  const { provider, apiKey: apiKey2, baseUrl, model } = req.body || {};
  if (provider === "llm") {
    return res.status(400).json({ error: "Local intelligence is disabled. Please provide an API key." });
  }
  try {
    const result = await planNextStep(
      [{ role: "user", content: "hello" }],
      { provider, apiKey: apiKey2, baseUrl, model, throwOnError: true }
    );
    if (result) {
      return res.json({ status: "ok", message: "Connected successfully", result });
    } else {
      return res.status(500).json({ error: "No response from provider" });
    }
  } catch (err) {
    console.error("Verify error:", safeErrorMessage(err));
    return res.status(401).json({ error: safeErrorMessage(err) || "Connection failed" });
  }
});
function detectRisk(text) {
  const risky = /(rm\s+-rf|delete|drop\s+table|shutdown|kill\s+process)/i;
  if (risky.test(text)) {
    return "HIGH: instruction matches destructive pattern";
  }
  return null;
}
router3.post("/start", authenticate, async (req, res) => {
  let { text, sessionId, fileIds, provider, apiKey: apiKey2, baseUrl, model, sessionKind, browserSessionId, clientContext } = req.body || {};
  const isAuthed = Boolean(req.auth);
  const userId = req.auth?.sub;
  const useMock = !isAuthed ? true : process.env.MOCK_DB === "1" || import_mongoose12.default.connection.readyState !== 1;
  const kind = sessionKind === "agent" ? "agent" : "chat";
  let attachedText = "";
  const contentParts = [];
  if (!useMock && fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
    try {
      const files = await FileModel.find({ _id: { $in: fileIds } });
      for (const f of files) {
        if (f.mimeType && f.mimeType.startsWith("image/")) {
          try {
            if (import_fs3.default.existsSync(f.path)) {
              const imageBuffer = import_fs3.default.readFileSync(f.path);
              const base64Image = imageBuffer.toString("base64");
              contentParts.push({
                type: "image_url",
                image_url: {
                  url: `data:${f.mimeType};base64,${base64Image}`
                }
              });
            }
          } catch (err) {
            console.error("Failed to read image", err);
          }
        } else if (f.content) {
          attachedText += `

--- [Attached File: ${f.originalName}] ---
${f.content}
--- [End of File] ---
`;
        }
      }
    } catch (e) {
      console.error("Error loading files", e);
    }
  }
  let fullPromptText = (String(text || "") + attachedText).trim();
  const ctxLines = [];
  if (typeof browserSessionId === "string" && browserSessionId.trim()) {
    ctxLines.push(`browserSessionId=${browserSessionId.trim()}`);
  }
  if (typeof clientContext === "string" && clientContext.trim()) {
    ctxLines.push(clientContext.trim());
  }
  if (ctxLines.length > 0) {
    fullPromptText += `

[Client Context]:
${ctxLines.join("\n")}
`;
  }
  if (userId && !useMock) {
    try {
      const [relevant, recentItems] = await Promise.all([
        MemoryService.searchMemories(userId, String(text || "")),
        MemoryItem.find({ userId, scope: "user" }).sort({ updatedAt: -1 }).limit(20).lean()
      ]);
      const recent = (recentItems || []).map((item) => {
        const v = typeof item.value === "string" ? item.value : item.value == null ? "" : JSON.stringify(item.value);
        return `${item.key}: ${v}`;
      }).filter(Boolean);
      const merged = [];
      const seen = /* @__PURE__ */ new Set();
      for (const line of [...relevant, ...recent]) {
        const k = String(line || "");
        if (!k || seen.has(k)) continue;
        seen.add(k);
        merged.push(k);
        if (merged.length >= 20) break;
      }
      if (merged.length > 0) {
        console.info(`[Memory] Injecting ${merged.length} memories (relevant+recent)`);
        fullPromptText += `

[System Note: Known facts about this user (Memory)]:
${merged.join("\n")}
`;
      }
    } catch (e) {
      console.error("[Memory] Search failed", e);
    }
    MemoryService.extractAndSaveMemories(userId, String(text || ""), { provider, apiKey: apiKey2, baseUrl, model, sessionId }).catch((err) => console.error("[Memory] Extraction failed", err));
  }
  let initialContent = fullPromptText;
  if (contentParts.length > 0) {
    initialContent = [
      { type: "text", text: fullPromptText },
      ...contentParts
    ];
  }
  if (!sessionId) {
    if (useMock) {
      const s = store.createSession("Untitled Session", "ADVISOR", kind);
      sessionId = s.id;
    } else {
      const { Session: Session2 } = await Promise.resolve().then(() => (init_session(), session_exports));
      const { Tenant: Tenant2 } = await Promise.resolve().then(() => (init_tenant(), tenant_exports));
      const tenantName = process.env.DEFAULT_TENANT_NAME || "XElite Solutions";
      const tenantDoc = await Tenant2.findOneAndUpdate(
        { name: tenantName },
        { $setOnInsert: { name: tenantName } },
        { upsert: true, new: true }
      );
      const s = await Session2.create({ title: `Session ${(/* @__PURE__ */ new Date()).toLocaleString()}`, mode: "ADVISOR", kind, userId, tenantId: tenantDoc._id });
      sessionId = s._id.toString();
    }
  }
  if (!useMock && fileIds && Array.isArray(fileIds)) {
    await FileModel.updateMany({ _id: { $in: fileIds } }, { $set: { sessionId } });
  }
  let runId;
  if (useMock) {
    const run = store.createRun(sessionId);
    runId = run.id;
  } else {
    const run = await Run.create({ sessionId, status: "running", steps: [] });
    runId = run._id.toString();
    (async () => {
      try {
        const session = await Session.findById(sessionId);
        if (session && (session.title.startsWith("Session ") || session.title.startsWith("\u062C\u0644\u0633\u0629 ") || session.title === "New Session")) {
          const messageCount = await Message.countDocuments({ sessionId });
          if (messageCount <= 2) {
            const messages2 = [{ role: "user", content: fullPromptText }];
            const newTitle = await generateSessionTitle(messages2);
            if (newTitle && newTitle !== "New Session") {
              await Session.findByIdAndUpdate(sessionId, { title: newTitle });
            }
          }
        }
      } catch (e) {
        console.error("Auto-title background task failed", e);
      }
    })();
  }
  const ev = (e) => broadcast({ ...e, runId });
  ev({ type: "step_started", data: { name: "plan" } });
  let plan = null;
  try {
    plan = await planNextStep(
      [{ role: "user", content: initialContent }],
      { provider, apiKey: apiKey2, baseUrl, model }
    );
  } catch (err) {
    console.warn("LLM planning error:", safeErrorMessage(err));
  }
  ev({ type: "step_done", data: { name: "plan", plan } });
  if (useMock) {
    store.addStep(runId, "plan", "done");
  } else {
    try {
      await Run.findByIdAndUpdate(runId, { $push: { steps: { name: "plan", status: "done" } } });
    } catch {
    }
  }
  if (useMock) {
    store.addMessage(sessionId, "user", String(text || ""), runId);
  } else {
    await Message.create({ sessionId, role: "user", content: String(text || ""), runId });
  }
  const risk = detectRisk(String(text || ""));
  if (risk && plan) {
    if (useMock) {
      const ap = store.createApproval(runId, String(text || ""), risk, plan.name, plan.input);
      ev({ type: "approval_required", data: { id: ap.id, runId, risk, action: text } });
      store.updateRun(runId, { status: "blocked" });
      const { planContext: planContext2 } = await Promise.resolve().then(() => (init_context(), context_exports));
      planContext2.set(ap.id, { runId, name: plan.name, input: plan.input });
      return res.json({ runId, sessionId, blocked: true, approvalId: ap.id });
    } else {
      const ap = await Approval.create({ runId, action: String(text || ""), risk, status: "pending" });
      ev({ type: "approval_required", data: { id: ap._id.toString(), runId, risk, action: text } });
      await Run.findByIdAndUpdate(runId, { $set: { status: "blocked" } });
      const { planContext: planContext2 } = await Promise.resolve().then(() => (init_context(), context_exports));
      planContext2.set(ap._id.toString(), { runId, name: plan.name, input: plan.input });
      return res.json({ runId, sessionId, blocked: true, approvalId: ap._id.toString() });
    }
  }
  let steps = 0;
  const MAX_STEPS = 50;
  let previousMessages = [];
  if (sessionId) {
    if (useMock) {
      const hist = store.listMessages(sessionId);
      previousMessages = hist.filter((m) => m.runId !== runId).slice(-20).map((m) => ({ role: m.role, content: m.content }));
    } else {
      const docs = await Message.find({ sessionId, runId: { $ne: runId } }).sort({ createdAt: -1 }).limit(20);
      previousMessages = docs.reverse().map((d) => ({ role: d.role, content: d.content }));
    }
  }
  const history = [
    ...previousMessages,
    { role: "user", content: initialContent }
  ];
  let lastResult = null;
  let forcedText = null;
  while (steps < MAX_STEPS) {
    ev({ type: "step_started", data: { name: `thinking_step_${steps + 1}` } });
    try {
      const shouldThrow = Boolean(apiKey2 || provider !== "llm" && provider);
      const isSystemConfigured = !!process.env.OPENAI_API_KEY;
      const throwOnError = !!apiKey2 || provider && provider !== "llm" || isSystemConfigured;
      plan = await planNextStep(history, { provider, apiKey: apiKey2, baseUrl, model, throwOnError });
    } catch (err) {
      console.warn("LLM planning error:", safeErrorMessage(err));
      if (err?.status === 401 || err?.code === "invalid_api_key" || err?.error?.code === "invalid_api_key") {
        ev({ type: "text", data: "\u26A0\uFE0F **Authentication Failed**: The AI provider rejected the API Key. Please check your settings in the provider menu." });
        forcedText = "Authentication Failed";
        break;
      }
      plan = null;
    }
    if (!plan) {
      if (steps === 0) {
        plan = null;
      } else break;
      if (!plan) {
        const msg = !process.env.OPENAI_API_KEY && !apiKey2 ? "\u26A0\uFE0F **No Intelligence Found**\nPlease add your OpenAI or Anthropic API Key in the settings menu to enable Joe AI." : "\u26A0\uFE0F **Connection Error**\nFailed to connect to the AI provider. Please check your internet connection or API key settings.";
        ev({ type: "text", data: msg });
        forcedText = msg;
        break;
      }
    }
    if (kind === "chat" && /^browser_/.test(String(plan.name || ""))) {
      const msg = "\u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u062A\u0639\u0645\u0644 \u0641\u0642\u0637 \u062F\u0627\u062E\u0644 \u0648\u0636\u0639 \u0627\u0644\u0648\u0643\u064A\u0644. \u0627\u0646\u062A\u0642\u0644 \u0625\u0644\u0649 \u062A\u0628\u0648\u064A\u0628 \u0627\u0644\u0648\u0643\u064A\u0644 \u0644\u0641\u062A\u062D \u0627\u0644\u0645\u0648\u0627\u0642\u0639 \u062F\u0627\u062E\u0644 \u0627\u0644\u0645\u062A\u0635\u0641\u062D.";
      ev({ type: "text", data: msg });
      forcedText = msg;
      break;
    }
    const planName = String(plan.name || "");
    const isBrowserTool = /^browser_/.test(planName);
    if (kind === "agent" && isBrowserTool) {
      const reqSid = typeof browserSessionId === "string" ? browserSessionId.trim() : "";
      const inputSid = String(plan?.input?.sessionId || "").trim();
      const hasSid = !!(reqSid || inputSid);
      if (!hasSid) {
        const msg = "\u0627\u0644\u0645\u062A\u0635\u0641\u062D \u063A\u064A\u0631 \u0645\u0641\u062A\u0648\u062D \u0641\u064A \u0648\u0636\u0639 \u0627\u0644\u0648\u0643\u064A\u0644. \u0627\u0641\u062A\u062D \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0641\u064A \u0627\u0644\u0648\u0633\u0637 \u0623\u0648\u0644\u0627\u064B \u062B\u0645 \u0623\u0639\u062F \u062A\u0646\u0641\u064A\u0630 \u0623\u0645\u0631 \u0627\u0644\u0645\u062A\u0635\u0641\u062D.";
        ev({ type: "text", data: msg });
        forcedText = msg;
        break;
      }
    }
    if (kind === "agent" && String(plan.name || "") === "browser_open" && typeof browserSessionId === "string" && browserSessionId.trim()) {
      const url = String(plan?.input?.url || "https://www.google.com").trim() || "https://www.google.com";
      plan = {
        name: "browser_run",
        input: {
          sessionId: browserSessionId.trim(),
          actions: [{ type: "goto", url, waitUntil: "domcontentloaded" }]
        }
      };
    }
    if (kind === "agent" && typeof browserSessionId === "string" && browserSessionId.trim() && ["browser_run", "browser_get_state", "browser_extract"].includes(String(plan.name || ""))) {
      const input = plan.input;
      if (!input || typeof input !== "object") plan.input = {};
      if (!plan.input.sessionId) plan.input.sessionId = browserSessionId.trim();
    }
    ev({ type: "step_done", data: { name: `thinking_step_${steps + 1}`, plan } });
    if (plan.name === "browser_run") {
      const acts = Array.isArray(plan.input?.actions) ? plan.input.actions : [];
      let sensitive = false;
      let actionText = "browser_run";
      for (const a of acts) {
        const t = String(a?.type || "").toLowerCase();
        if (t === "uploadfile") sensitive = true;
        if (t === "fillform") {
          const fields = Array.isArray(a?.fields) ? a.fields : [];
          for (const f of fields) {
            const s = (String(f?.label || "") + " " + String(f?.selector || "")).toLowerCase();
            if (/(password|card|cvv|iban|ssn|بطاقة|دفع|كلمة المرور|حساسية|حساب)/.test(s)) {
              sensitive = true;
              break;
            }
          }
        }
        if (t === "click") {
          const s = (String(a?.roleName || "") + " " + String(a?.selector || "")).toLowerCase();
          if (/(delete|pay|submit|login|حذف|دفع|ارسال|تسجيل دخول)/.test(s)) sensitive = true;
        }
        if (sensitive) break;
      }
      if (sensitive) {
        const risk2 = "high";
        if (useMock) {
          const ap = store.createApproval(runId, actionText, risk2, plan.name, redactToolInputForStorage(plan.name, plan.input));
          ev({ type: "approval_required", data: { id: ap.id, runId, risk: risk2, action: actionText } });
          store.updateRun(runId, { status: "blocked" });
          const { planContext: planContext2 } = await Promise.resolve().then(() => (init_context(), context_exports));
          planContext2.set(ap.id, { runId, name: plan.name, input: plan.input });
          return res.json({ runId, blocked: true, approvalId: ap.id });
        } else {
          const ap = await Approval.create({ runId, action: actionText, risk: risk2, status: "pending" });
          ev({ type: "approval_required", data: { id: ap._id.toString(), runId, risk: risk2, action: actionText } });
          await Run.findByIdAndUpdate(runId, { $set: { status: "blocked" } });
          const { planContext: planContext2 } = await Promise.resolve().then(() => (init_context(), context_exports));
          planContext2.set(ap._id.toString(), { runId, name: plan.name, input: plan.input });
          return res.json({ runId, blocked: true, approvalId: ap._id.toString() });
        }
      }
    }
    const persistedInput = redactToolInputForStorage(plan.name, plan.input);
    ev({ type: "step_started", data: { name: `execute:${plan.name}`, input: persistedInput } });
    const result = await executeTool(plan.name, plan.input);
    history.push({
      role: "assistant",
      content: `Tool Call: ${plan.name}
Input: ${JSON.stringify(persistedInput)}
Output: ${JSON.stringify(result.output || result.error || "Done")}`
    });
    lastResult = result;
    if (result.logs?.length) {
      for (const line of result.logs) {
        ev({ type: "evidence_added", data: { kind: "log", text: line } });
      }
    }
    if (result.artifacts && Array.isArray(result.artifacts)) {
      for (const art of result.artifacts) {
        ev({ type: "artifact_created", data: art });
        if (useMock) {
          try {
            store.addArtifact(runId, String(art.name || "artifact"), String(art.href || ""));
          } catch {
          }
        } else {
          try {
            await Artifact.create({ runId, name: String(art.name || "artifact"), href: String(art.href || "") });
          } catch {
          }
        }
      }
    }
    ev({ type: result.ok ? "step_done" : "step_failed", data: { name: `execute:${plan.name}`, result } });
    if (!result.ok && plan.name === "image_generate") {
      const errorMsg = String(result.error || "");
      const logsStr = (result.logs || []).join("\n");
      if (errorMsg.includes("403") || errorMsg.includes("verification") || logsStr.includes("error=403")) {
        const msg = `\u274C **Image Generation Failed**
${errorMsg}

Please verify your OpenAI organization settings or try a different prompt.`;
        forcedText = msg;
        ev({ type: "text", data: msg });
        break;
      }
    }
    if (result.ok && plan.name === "echo") {
      const text2 = result.output?.text;
      if (text2) {
        forcedText = text2;
        ev({ type: "text", data: text2 });
      }
    }
    if (result.ok && plan.name === "image_generate") {
      const href = result.output?.href;
      if (href) {
        forcedText = `\u{1F3A8} Image generated successfully.`;
        ev({ type: "text", data: forcedText });
        break;
      }
    }
    if (result.ok && plan.name === "file_write") {
      const href = result.output?.href;
      const fname = String(plan.input?.filename || "").trim();
      const msgParts = [];
      msgParts.push(`### \u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0645\u0644\u0641`);
      if (fname) msgParts.push(`- \u0627\u0644\u0627\u0633\u0645: ${fname}`);
      if (href) msgParts.push(`- \u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629: ${href}`);
      const msg = msgParts.join("\n");
      forcedText = msg;
      ev({ type: "text", data: msg });
      break;
    }
    if (result.ok && plan.name === "http_fetch") {
      try {
        const urlStr = String(plan.input?.url || "");
        const u = new URL(urlStr);
        let base = (u.searchParams.get("base") || "").toUpperCase();
        let sym = (u.searchParams.get("symbols") || u.searchParams.get("sym") || "").toUpperCase();
        if (!base) {
          const m = u.pathname.match(/\/latest\/([A-Z]{3,4})/i);
          if (m) base = m[1].toUpperCase();
        }
        if (!sym && typeof plan.input?.sym === "string") {
          sym = String(plan.input.sym).toUpperCase();
        }
        if (!base && typeof plan.input?.base === "string") {
          base = String(plan.input.base).toUpperCase();
        }
        const rates = result.output?.json?.rates || {};
        let rate = null;
        if (sym && typeof rates[sym] === "number") {
          rate = rates[sym];
        } else if (typeof result.output?.bodySnippet === "string") {
          const m = result.output.bodySnippet.match(new RegExp(`"${sym}"\\s*:\\s*([\\d.]+)`));
          if (m) rate = Number(m[1]);
        }
        if (rate !== null && base && sym) {
          const md = [
            `### \u0633\u0639\u0631 \u0627\u0644\u0639\u0645\u0644\u0629`,
            `- \u0627\u0644\u0639\u0645\u0644\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629: ${base}`,
            `- \u0627\u0644\u0639\u0645\u0644\u0629 \u0627\u0644\u0645\u0642\u0627\u0628\u0644\u0629: ${sym}`,
            `- \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u064A\u0648\u0645: ${Number(rate).toFixed(4)} ${sym}`
          ].join("\n");
          forcedText = md;
          ev({ type: "text", data: md });
        } else if (base && sym) {
          const fbUrl = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
          ev({ type: "step_started", data: { name: `execute:http_fetch(fallback)` } });
          const fbRes = await executeTool("http_fetch", { url: fbUrl });
          ev({ type: fbRes.ok ? "step_done" : "step_failed", data: { name: `execute:http_fetch(fallback)`, result: fbRes } });
          let rate2 = null;
          if (typeof fbRes.output?.json?.rates?.[sym] === "number") {
            rate2 = fbRes.output.json.rates[sym];
          } else if (typeof fbRes.output?.bodySnippet === "string") {
            const m2 = fbRes.output.bodySnippet.match(new RegExp(`"${sym}"\\s*:\\s*([\\d.]+)`));
            if (m2) rate2 = Number(m2[1]);
          }
          if (rate2 !== null) {
            const md2 = [
              `### \u0633\u0639\u0631 \u0627\u0644\u0639\u0645\u0644\u0629`,
              `- \u0627\u0644\u0639\u0645\u0644\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629: ${base}`,
              `- \u0627\u0644\u0639\u0645\u0644\u0629 \u0627\u0644\u0645\u0642\u0627\u0628\u0644\u0629: ${sym}`,
              `- \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u064A\u0648\u0645: ${Number(rate2).toFixed(4)} ${sym}`
            ].join("\n");
            forcedText = md2;
            ev({ type: "text", data: md2 });
          }
          if (useMock) {
            store.addExec(runId, "http_fetch", { url: fbUrl }, fbRes.output, fbRes.ok, fbRes.logs);
          } else {
            await ToolExecution.create({ runId, name: "http_fetch", input: { url: fbUrl }, output: fbRes.output, ok: fbRes.ok, logs: fbRes.logs });
          }
        }
        if (u.hostname.includes("wttr.in")) {
          const city = String(plan.input?.city || "Istanbul");
          const cc = Array.isArray(result.output?.json?.current_condition) ? result.output.json.current_condition[0] : null;
          const tempC = cc ? Number(cc.temp_C) : null;
          const desc = cc && Array.isArray(cc.weatherDesc) && cc.weatherDesc[0] ? String(cc.weatherDesc[0].value || "") : "";
          const hum = cc && typeof cc.humidity !== "undefined" ? Number(cc.humidity) : null;
          if (tempC !== null && !Number.isNaN(tempC)) {
            const parts = [
              `### \u0627\u0644\u0637\u0642\u0633`,
              `- \u0627\u0644\u0645\u062F\u064A\u0646\u0629: ${city}`,
              `- \u062F\u0631\u062C\u0629 \u0627\u0644\u062D\u0631\u0627\u0631\u0629: ${tempC.toFixed(0)}\xB0C`
            ];
            if (desc) parts.push(`- \u0627\u0644\u062D\u0627\u0644\u0629: ${desc}`);
            if (hum !== null && !Number.isNaN(hum)) parts.push(`- \u0627\u0644\u0631\u0637\u0648\u0628\u0629: ${hum}%`);
            const mdw = parts.join("\n");
            forcedText = mdw;
            ev({ type: "text", data: mdw });
          }
        }
      } catch {
      }
    }
    if (result.ok && plan.name === "web_search") {
      try {
        const results = Array.isArray(result.output?.results) ? result.output.results : [];
        if (results.length > 0) {
          const mdParts = [];
          mdParts.push(`### \u0646\u062A\u0627\u0626\u062C \u0627\u0644\u0628\u062D\u062B`);
          const limit = 5;
          const displayResults = results.slice(0, limit);
          for (let i = 0; i < displayResults.length; i++) {
            const r = displayResults[i];
            const title = String(r.title || "").trim();
            const url = String(r.url || "").trim();
            const desc = String(r.description || "").trim();
            let domain = "";
            try {
              domain = new URL(url).hostname;
            } catch {
            }
            const num = `${i + 1}.`;
            const head = domain ? `${num} **[${title}](${url})** _(${domain})_` : `${num} **[${title}](${url})**`;
            mdParts.push(head);
            if (desc) mdParts.push(`   > ${desc.slice(0, 150)}...`);
            mdParts.push("");
          }
          const mds = mdParts.join("\n");
          forcedText = mds;
          ev({ type: "text", data: mds });
        }
      } catch {
      }
    }
    if (result.ok && plan.name === "html_extract") {
      try {
        const o = result.output || {};
        const title = String(o.title || "").trim();
        const desc = String(o.metaDescription || "").trim();
        const heads = Array.isArray(o.headings) ? o.headings.slice(0, 8) : [];
        const links = Array.isArray(o.links) ? o.links.slice(0, 8) : [];
        const parts = [];
        parts.push(`### \u062A\u062D\u0644\u064A\u0644 \u0635\u0641\u062D\u0629`);
        if (title) parts.push(`- \u0627\u0644\u0639\u0646\u0648\u0627\u0646: ${title}`);
        if (desc) parts.push(`- \u0627\u0644\u0648\u0635\u0641: ${desc}`);
        if (heads.length > 0) {
          parts.push(`- \u0627\u0644\u0639\u0646\u0627\u0648\u064A\u0646 \u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629:`);
          heads.forEach((h) => parts.push(`  - ${h}`));
        }
        const mde = parts.join("\n");
        forcedText = mde;
        ev({ type: "text", data: mde });
      } catch {
      }
    }
    if (useMock) {
      store.addExec(runId, plan.name, persistedInput, result.output, result.ok, result.logs);
    } else {
      await ToolExecution.create({ runId, name: plan.name, input: persistedInput, output: result.output, ok: result.ok, logs: result.logs });
    }
    if (!result.ok) {
      const errorMsg = result.error || (result.logs ? result.logs.join("\n") : "Unknown error");
      ev({ type: "text", data: `\u26A0\uFE0F **Self-Healing Activated**: Detected error in '${plan.name}'. Analyzing fix...` });
      history.push({
        role: "assistant",
        content: `Tool '${plan.name}' FAILED. Error: ${errorMsg}. 
You must analyze this error and attempt to fix the issue in the next step. If it's a syntax error, correct it. If it's a missing file or dependency, resolve it.`
      });
    } else {
      history.push({ role: "assistant", content: `Tool '${plan.name}' executed. Result: ${JSON.stringify(result.output)}` });
    }
    steps++;
    if (plan.name === "echo") {
      forcedText = String(plan.input?.text || "");
      break;
    }
  }
  ev({ type: "run_completed", data: { runId, result: lastResult } });
  ev({ type: "run_finished", data: { runId, status: "done" } });
  const finalContent = forcedText || (lastResult?.output ? JSON.stringify(lastResult.output) : "No output");
  if (useMock) {
    store.addMessage(sessionId, "assistant", finalContent, runId);
    store.updateRun(runId, { status: "done" });
  } else {
    await Message.create({ sessionId, role: "assistant", content: finalContent, runId });
    await Run.findByIdAndUpdate(runId, { $set: { status: "done" } });
  }
  return res.json({ runId, sessionId, status: "done" });
});
var run_default = router3;

// src/routes/runs.ts
var import_express4 = require("express");
var import_mongoose13 = __toESM(require("mongoose"));
var router4 = (0, import_express4.Router)();
router4.get("/:id", async (req, res) => {
  const id = String(req.params.id);
  const useMock = process.env.MOCK_DB === "1" || import_mongoose13.default.connection.readyState !== 1;
  if (useMock) {
    const run = store.listRuns().find((r) => r.id === id);
    if (!run) return res.status(404).json({ error: "Run not found" });
    const execs2 = store.listExecs(id);
    const artifacts2 = store.listArtifacts(id);
    return res.json({ run, execs: execs2, artifacts: artifacts2 });
  } else {
    const run = await Run.findById(id).lean();
    if (!run) return res.status(404).json({ error: "Run not found" });
    const execs2 = await ToolExecution.find({ runId: id }).lean();
    const artifacts2 = await Artifact.find({ runId: id }).lean();
    return res.json({ run, execs: execs2, artifacts: artifacts2 });
  }
});
var runs_default = router4;

// src/routes/sessions.ts
var import_express5 = require("express");
var import_mongoose15 = __toESM(require("mongoose"));
init_session();

// src/models/summary.ts
var import_mongoose14 = __toESM(require("mongoose"));
var SummarySchema = new import_mongoose14.Schema(
  {
    sessionId: { type: import_mongoose14.Schema.Types.ObjectId, ref: "Session", index: true, required: true },
    content: { type: String, required: true }
  },
  { timestamps: true }
);
var Summary = import_mongoose14.default.model("Summary", SummarySchema);

// src/routes/sessions.ts
var router5 = (0, import_express5.Router)();
router5.post("/", authenticate, async (req, res) => {
  const { title } = req.body;
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  try {
    if (useMock) {
      const session2 = store.createSession(title || "New Session");
      return res.json(session2);
    }
    const session = await Session.create({ title: title || "New Session" });
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: "Failed to create session" });
  }
});
router5.get("/:id/messages", authenticate, async (req, res) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  try {
    if (useMock) {
      const messages3 = store.listMessages(id);
      return res.json({ messages: messages3 });
    }
    const messages2 = await Message.find({ sessionId: id }).sort({ createdAt: 1 }).lean();
    res.json({ messages: messages2 });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});
router5.get("/:id/context", authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = req.auth?.sub;
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  try {
    let summary = "";
    let recentMessages = [];
    let memories = [];
    if (useMock) {
      summary = store.getSummary(id)?.content || "";
      recentMessages = store.listMessages(id).slice(-10);
    } else {
      const sumDoc = await Summary.findOne({ sessionId: id });
      summary = sumDoc?.content || "";
      recentMessages = await Message.find({ sessionId: id }).sort({ createdAt: -1 }).limit(10).lean();
      recentMessages.reverse();
      if (userId) {
        memories = await MemoryItem.find({ userId }).sort({ createdAt: -1 }).lean();
      }
    }
    res.json({
      systemPrompt: SYSTEM_PROMPT,
      summary,
      recentMessages,
      memories
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch context" });
  }
});
router5.get("/:id/summary", authenticate, async (req, res) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  if (useMock) {
    const s = store.getSummary(id);
    return res.json({ summary: s });
  }
  try {
    const summary = await Summary.findOne({ sessionId: id });
    res.json({ summary });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});
router5.post("/:id/summarize", authenticate, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  if (useMock) {
    store.upsertSummary(id, content);
    return res.json({ ok: true });
  }
  try {
    await Summary.findOneAndUpdate(
      { sessionId: id },
      { content },
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to update summary" });
  }
});
router5.post("/:id/summarize/auto", authenticate, async (req, res) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  try {
    let messages2 = [];
    if (useMock) {
      messages2 = store.listMessages(id);
    } else {
      messages2 = await Message.find({ sessionId: id }).sort({ createdAt: 1 }).limit(100);
    }
    if (messages2.length === 0) return res.json({ ok: true });
    const msgsForLLM = messages2.map((m) => ({
      role: m.role || "user",
      content: String(m.content || "")
    }));
    const summaryContent = await generateSummary(msgsForLLM);
    if (useMock) {
      store.upsertSummary(id, summaryContent);
    } else {
      await Summary.findOneAndUpdate(
        { sessionId: id },
        { content: summaryContent },
        { upsert: true, new: true }
      );
    }
    res.json({ ok: true, summary: summaryContent });
  } catch (e) {
    console.error("Auto summary error:", e);
    res.status(500).json({ error: "Auto summary failed" });
  }
});
router5.post("/merge", authenticate, async (req, res) => {
  const { sourceId, targetId } = req.body || {};
  if (!sourceId || !targetId || sourceId === targetId) return res.status(400).json({ error: "Invalid source/target" });
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  if (useMock) {
    const result = store.mergeSessions(String(sourceId), String(targetId));
    return res.json({ ok: true, ...result });
  }
  const source = await Session.findById(sourceId);
  const target = await Session.findById(targetId);
  if (!source || !target) return res.status(404).json({ error: "Session not found" });
  await Message.updateMany({ sessionId: sourceId }, { $set: { sessionId: targetId } });
  await Run.updateMany({ sessionId: sourceId }, { $set: { sessionId: targetId } });
  await Session.deleteOne({ _id: sourceId });
  return res.json({ ok: true });
});
router5.get("/", authenticate, async (_req, res) => {
  const kindRaw = String(_req.query?.kind || "").trim();
  const kind = kindRaw === "agent" ? "agent" : kindRaw === "chat" ? "chat" : null;
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  if (useMock) {
    const all = store.listSessions();
    const filtered = kind ? all.filter((s) => s.kind === kind) : all;
    return res.json({ sessions: filtered });
  }
  const sessions2 = await Session.find(kind ? { kind } : {}).sort({ isPinned: -1, updatedAt: -1 }).lean();
  return res.json({ sessions: sessions2 });
});
router5.get("/search", authenticate, async (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) return res.json({ results: [] });
  const kindRaw = String(req.query.kind || "").trim();
  const kind = kindRaw === "agent" ? "agent" : kindRaw === "chat" ? "chat" : null;
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  if (useMock) {
    return res.json({ results: [] });
  }
  const messages2 = await Message.find({
    content: { $regex: query, $options: "i" }
  }).sort({ createdAt: -1 }).limit(20).populate("sessionId", "title kind");
  const filteredMessages = kind ? messages2.filter((m) => m.sessionId?.kind === kind) : messages2;
  const results = filteredMessages.map((m) => ({
    messageId: m._id,
    sessionId: m.sessionId._id,
    sessionTitle: m.sessionId.title,
    content: m.content,
    createdAt: m.createdAt
  }));
  return res.json({ results });
});
router5.get("/:id/history", authenticate, async (req, res) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  if (useMock) {
    const msgs = store.listMessages(id);
    const events = msgs.map((m) => ({
      type: m.role === "user" ? "user_input" : "text",
      data: m.content,
      ts: m.ts
    }));
    return res.json({ events });
  }
  try {
    const msgs = await Message.find({ sessionId: id }).sort({ createdAt: 1 }).lean();
    const events = msgs.map((m) => ({
      type: m.role === "user" ? "user_input" : "text",
      data: m.content,
      ts: m.createdAt ? new Date(m.createdAt).getTime() : Date.now()
    }));
    return res.json({ events });
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch history" });
  }
});
router5.get("/:id/analytics", authenticate, async (req, res) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  if (useMock) {
    const session = store.getSession(id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    const msgs = store.listMessages(id);
    const runs2 = store.listRuns(id);
    let totalSteps = 0;
    let successfulRuns = 0;
    const runIds = [];
    runs2.forEach((r) => {
      totalSteps += r.steps?.length || 0;
      if (r.status === "done") successfulRuns++;
      runIds.push(r.id);
    });
    const allExecs = store.listExecs();
    const tools2 = allExecs.filter((e) => runIds.includes(e.runId));
    const toolUsage = {};
    let toolErrors = 0;
    tools2.forEach((t) => {
      toolUsage[t.name] = (toolUsage[t.name] || 0) + 1;
      if (!t.ok) toolErrors++;
    });
    return res.json({
      duration: (session.lastUpdatedAt || Date.now()) - (session.lastUpdatedAt || Date.now()),
      // Mock duration 0 for now
      messageCount: msgs.length,
      runCount: runs2.length,
      totalSteps,
      successfulRuns,
      successRate: runs2.length > 0 ? successfulRuns / runs2.length * 100 : 0,
      toolUsage,
      totalToolCalls: tools2.length,
      toolErrorRate: tools2.length > 0 ? toolErrors / tools2.length * 100 : 0
    });
  }
  try {
    const session = await Session.findById(id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    const messageCount = await Message.countDocuments({ sessionId: id });
    const runs2 = await Run.find({ sessionId: id });
    const runCount = runs2.length;
    let totalSteps = 0;
    let successfulRuns = 0;
    runs2.forEach((r) => {
      totalSteps += r.steps?.length || 0;
      if (r.status === "done") successfulRuns++;
    });
    const runIds = runs2.map((r) => r._id);
    const tools2 = await ToolExecution.find({ runId: { $in: runIds } });
    const toolUsage = {};
    let toolErrors = 0;
    tools2.forEach((t) => {
      toolUsage[t.name] = (toolUsage[t.name] || 0) + 1;
      if (!t.ok) toolErrors++;
    });
    const duration = session.lastUpdatedAt.getTime() - session.createdAt.getTime();
    return res.json({
      duration,
      // in ms
      messageCount,
      runCount,
      totalSteps,
      successfulRuns,
      successRate: runCount > 0 ? successfulRuns / runCount * 100 : 0,
      toolUsage,
      totalToolCalls: tools2.length,
      toolErrorRate: tools2.length > 0 ? toolErrors / tools2.length * 100 : 0
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return res.status(500).json({ error: "Failed to fetch analytics" });
  }
});
router5.delete("/", authenticate, async (_req, res) => {
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  if (useMock) {
    return res.json({ ok: true });
  }
  await Session.deleteMany({});
  await Message.deleteMany({});
  await Run.deleteMany({});
  return res.json({ ok: true });
});
router5.get("/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  if (useMock) {
    return res.json({ session: store.getSession(id) });
  }
  const session = await Session.findById(id).lean();
  if (!session) return res.status(404).json({ error: "Not found" });
  return res.json({ session });
});
router5.delete("/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  if (useMock) {
    store.deleteSession(id);
    return res.json({ ok: true });
  }
  await Session.deleteOne({ _id: id });
  await Message.deleteMany({ sessionId: id });
  await Run.deleteMany({ sessionId: id });
  return res.json({ ok: true });
});
router5.patch("/:id/state", authenticate, async (req, res) => {
  const { id } = req.params;
  const { terminalState } = req.body;
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  if (useMock) return res.json({ ok: true });
  await Session.findByIdAndUpdate(id, {
    $set: {
      terminalState,
      lastUpdatedAt: /* @__PURE__ */ new Date()
    }
  });
  return res.json({ ok: true });
});
var sessions_default = router5;

// src/routes/folders.ts
var import_express6 = require("express");

// src/models/folder.ts
var import_mongoose16 = __toESM(require("mongoose"));
var FolderSchema = new import_mongoose16.Schema({
  name: { type: String, required: true },
  userId: { type: String, index: true }
}, { timestamps: true });
var Folder = import_mongoose16.default.model("Folder", FolderSchema);

// src/routes/folders.ts
init_session();
var router6 = (0, import_express6.Router)();
router6.get("/", authenticate, async (req, res) => {
  try {
    const folders = await Folder.find().sort({ createdAt: 1 });
    res.json(folders);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch folders" });
  }
});
router6.post("/", authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    const folder = await Folder.create({ name });
    res.json(folder);
  } catch (e) {
    res.status(500).json({ error: "Failed to create folder" });
  }
});
router6.patch("/:id", authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    const folder = await Folder.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true }
    );
    res.json(folder);
  } catch (e) {
    res.status(500).json({ error: "Failed to update folder" });
  }
});
router6.delete("/:id", authenticate, async (req, res) => {
  try {
    await Session.updateMany({ folderId: req.params.id }, { $unset: { folderId: "" } });
    await Folder.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete folder" });
  }
});
var folders_default = router6;

// src/routes/files.ts
var import_express7 = require("express");
var import_multer = __toESM(require("multer"));
var import_path3 = __toESM(require("path"));
var import_fs4 = __toESM(require("fs"));
var pdf2 = require("pdf-parse");
var router7 = (0, import_express7.Router)();
var storage = import_multer.default.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = import_path3.default.join(__dirname, "../../uploads");
    import_fs4.default.mkdir(uploadDir, { recursive: true }, (err) => {
      if (err) return cb(err, uploadDir);
      cb(null, uploadDir);
    });
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  }
});
var upload = (0, import_multer.default)({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
  // 10MB limit
});
router7.post("/upload", authenticate, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const { sessionId } = req.body;
    let content = "";
    if (req.file.mimetype === "application/pdf") {
      const dataBuffer = await import_fs4.default.promises.readFile(req.file.path);
      const data = await pdf2(dataBuffer);
      content = data.text;
    } else if (req.file.mimetype.startsWith("text/") || req.file.mimetype === "application/json" || req.file.mimetype === "application/javascript" || req.file.mimetype.includes("code")) {
      content = await import_fs4.default.promises.readFile(req.file.path, "utf8");
    }
    const fileDoc = await FileModel.create({
      originalName: req.file.originalname,
      filename: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      content: content.slice(0, 5e4),
      // Limit content size for DB
      sessionId
    });
    res.json(fileDoc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Upload failed" });
  }
});
router7.get("/:id", authenticate, async (req, res) => {
  try {
    const file = await FileModel.findById(req.params.id);
    if (!file) return res.status(404).json({ error: "File not found" });
    res.json(file);
  } catch (e) {
    res.status(500).json({ error: "Error fetching file" });
  }
});
router7.get("/:id/raw", authenticate, async (req, res) => {
  try {
    const file = await FileModel.findById(req.params.id);
    if (!file) return res.status(404).json({ error: "File not found" });
    res.sendFile(file.path);
  } catch (e) {
    res.status(500).json({ error: "Error serving file" });
  }
});
var files_default = router7;

// src/routes/approvals.ts
var import_express8 = require("express");
var import_mongoose17 = __toESM(require("mongoose"));
init_context();
var router8 = (0, import_express8.Router)();
function redactToolInputForBroadcast(name, input) {
  if (!input || typeof input !== "object") return input;
  if (name === "browser_run") {
    const sessionId = typeof input.sessionId === "string" ? input.sessionId : void 0;
    const actions = Array.isArray(input.actions) ? input.actions : [];
    const redactedActions = actions.map((a) => {
      const t = String(a?.type || "").toLowerCase();
      if (t === "type") {
        const text = typeof a?.text === "string" ? a.text : "";
        return { ...a, text: `[redacted:${text.length}]` };
      }
      if (t === "fillform") {
        const fields = Array.isArray(a?.fields) ? a.fields : [];
        const nextFields = fields.map((f) => {
          const label = String(f?.label || "").toLowerCase();
          const selector = String(f?.selector || "").toLowerCase();
          const combined = `${label} ${selector}`;
          const v = f?.value == null ? "" : String(f.value);
          const shouldRedact = Boolean(a?.sensitive) || Boolean(f?.sensitive) || /(password|card|cvv|iban|ssn|بطاقة|دفع|كلمة المرور|حساسية|حساب)/.test(combined);
          if (!shouldRedact) return f;
          return { ...f, value: `[redacted:${v.length}]` };
        });
        return { ...a, fields: nextFields };
      }
      if (t === "evaluate" && typeof a?.script === "string") {
        if (a?.sensitive) return { ...a, script: "[redacted]" };
      }
      return a;
    });
    return { sessionId, actions: redactedActions };
  }
  return input;
}
router8.post("/:id/decision", authenticate, async (req, res) => {
  const id = String(req.params.id);
  const { decision } = req.body || {};
  if (!["approved", "denied"].includes(String(decision))) return res.status(400).json({ error: "Invalid decision" });
  const useMock = process.env.MOCK_DB === "1" || import_mongoose17.default.connection.readyState !== 1;
  const ctx = planContext.get(id);
  if (useMock) {
    const a = store.updateApproval(id, { status: decision });
    if (!a || !ctx) return res.status(404).json({ error: "Approval not found" });
    broadcast({ type: "approval_result", runId: ctx.runId, data: { id, decision } });
    if (decision === "approved") {
      broadcast({ type: "step_started", runId: ctx.runId, data: { name: `execute:${ctx.name}`, input: redactToolInputForBroadcast(ctx.name, ctx.input) } });
      const result = await executeTool(ctx.name, ctx.input);
      broadcast({ type: result.ok ? "step_done" : "step_failed", runId: ctx.runId, data: { name: `execute:${ctx.name}`, result } });
      if (result.artifacts) {
        for (const a2 of result.artifacts) {
          store.addArtifact(ctx.runId, a2.name, a2.href);
          broadcast({ type: "artifact_created", runId: ctx.runId, data: { name: a2.name, href: a2.href } });
        }
      }
      store.updateRun(ctx.runId, { status: result.ok ? "done" : "failed" });
      broadcast({ type: "run_finished", runId: ctx.runId, data: { runId: ctx.runId, ok: result.ok } });
      planContext.delete(id);
      return res.json({ ok: true, result });
    } else {
      store.updateRun(ctx.runId, { status: "denied" });
      broadcast({ type: "run_finished", runId: ctx.runId, data: { runId: ctx.runId, ok: false } });
      planContext.delete(id);
      return res.json({ ok: true, denied: true });
    }
  } else {
    const a = await Approval.findByIdAndUpdate(id, { $set: { status: decision } }, { new: true });
    if (!a || !ctx) return res.status(404).json({ error: "Approval not found" });
    broadcast({ type: "approval_result", runId: ctx.runId, data: { id, decision } });
    if (decision === "approved") {
      broadcast({ type: "step_started", runId: ctx.runId, data: { name: `execute:${ctx.name}`, input: redactToolInputForBroadcast(ctx.name, ctx.input) } });
      const result = await executeTool(ctx.name, ctx.input);
      broadcast({ type: result.ok ? "step_done" : "step_failed", runId: ctx.runId, data: { name: `execute:${ctx.name}`, result } });
      if (result.artifacts) {
      }
      await Run.findByIdAndUpdate(ctx.runId, { $set: { status: result.ok ? "done" : "failed" } });
      broadcast({ type: "run_finished", runId: ctx.runId, data: { runId: ctx.runId, ok: result.ok } });
      planContext.delete(id);
      return res.json({ ok: true, result });
    } else {
      await Run.findByIdAndUpdate(ctx.runId, { $set: { status: "denied" } });
      broadcast({ type: "run_finished", runId: ctx.runId, data: { runId: ctx.runId, ok: false } });
      planContext.delete(id);
      return res.json({ ok: true, denied: true });
    }
  }
});
var approvals_default = router8;

// src/routes/project.ts
var import_express9 = require("express");
var import_fs5 = __toESM(require("fs"));
var import_path4 = __toESM(require("path"));
var router9 = (0, import_express9.Router)();
async function getAllFiles(dirPath, arrayOfFiles = [], ignore = ["node_modules", ".git", "dist", "build", ".DS_Store"]) {
  try {
    await import_fs5.default.promises.access(dirPath);
  } catch {
    return arrayOfFiles;
  }
  const files = await import_fs5.default.promises.readdir(dirPath);
  for (const file of files) {
    if (ignore.includes(file)) continue;
    const fullPath = import_path4.default.join(dirPath, file);
    try {
      const stat = await import_fs5.default.promises.stat(fullPath);
      if (stat.isDirectory()) {
        arrayOfFiles = await getAllFiles(fullPath, arrayOfFiles, ignore);
      } else {
        arrayOfFiles.push(fullPath);
      }
    } catch {
    }
  }
  return arrayOfFiles;
}
function getImports(content) {
  const imports = [];
  const importRegex = /import\s+.*?\s+from\s+['"](.*?)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  const requireRegex = /(?:require|import)\(['"](.*?)['"]\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return imports;
}
router9.get("/graph", authenticate, async (req, res) => {
  try {
    const cwd = String(req.query.path || process.cwd());
    try {
      await import_fs5.default.promises.access(cwd);
    } catch {
      return res.json({ nodes: [], links: [] });
    }
    const files = await getAllFiles(cwd);
    const nodes = [];
    const links = [];
    const fileIdMap = /* @__PURE__ */ new Map();
    for (const f of files) {
      const relPath = import_path4.default.relative(cwd, f);
      if (relPath.length > 200) continue;
      const id = relPath;
      fileIdMap.set(f, id);
      let size = 0;
      try {
        const stat = await import_fs5.default.promises.stat(f);
        size = stat.size;
      } catch {
      }
      nodes.push({
        id,
        name: import_path4.default.basename(f),
        type: "file",
        size,
        extension: import_path4.default.extname(f)
      });
    }
    const BATCH_SIZE = 10;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (f) => {
        if (![".ts", ".tsx", ".js", ".jsx", ".css", ".scss"].includes(import_path4.default.extname(f))) return;
        try {
          const content = await import_fs5.default.promises.readFile(f, "utf-8");
          const imports = getImports(content);
          const sourceId = fileIdMap.get(f);
          if (!sourceId) return;
          imports.forEach((imp) => {
            let targetFile = imp;
            if (imp.startsWith(".")) {
              targetFile = import_path4.default.resolve(import_path4.default.dirname(f), imp);
            }
            const extensions = ["", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.js"];
            let foundTargetId = null;
            for (const ext of extensions) {
              const tryPath = targetFile + ext;
              if (fileIdMap.has(tryPath)) {
                foundTargetId = fileIdMap.get(tryPath);
                break;
              }
            }
            if (foundTargetId) {
              links.push({ source: sourceId, target: foundTargetId });
            }
          });
        } catch (e) {
        }
      }));
    }
    res.json({ nodes, links });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Graph generation failed" });
  }
});
router9.get("/tree", authenticate, async (req, res) => {
  try {
    const rootPath = String(req.query.path || process.cwd());
    const depth = Number(req.query.depth || 5);
    try {
      await import_fs5.default.promises.access(rootPath);
    } catch {
      return res.status(404).json({ error: "Path not found" });
    }
    const getTree = async (dir, currentDepth) => {
      if (currentDepth > depth) return [];
      const files = await import_fs5.default.promises.readdir(dir, { withFileTypes: true });
      files.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });
      const result = [];
      for (const f of files) {
        if (["node_modules", ".git", "dist", "build", ".DS_Store"].includes(f.name)) continue;
        const fullPath = import_path4.default.join(dir, f.name);
        const isDir = f.isDirectory();
        result.push({
          name: f.name,
          path: fullPath,
          type: isDir ? "directory" : "file",
          children: isDir ? await getTree(fullPath, currentDepth + 1) : void 0
        });
      }
      return result;
    };
    const tree = await getTree(rootPath, 0);
    res.json({ root: rootPath, tree });
  } catch (e) {
    res.status(500).json({ error: "Tree generation failed" });
  }
});
router9.get("/content", authenticate, async (req, res) => {
  try {
    const filePath = String(req.query.path);
    if (!filePath) {
      return res.status(404).json({ error: "File not found" });
    }
    try {
      await import_fs5.default.promises.access(filePath);
    } catch {
      return res.status(404).json({ error: "File not found" });
    }
    if (!filePath.startsWith(process.cwd()) && !filePath.includes("xelitesolutions")) {
    }
    const content = await import_fs5.default.promises.readFile(filePath, "utf-8");
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: "Read failed" });
  }
});
router9.post("/content", authenticate, async (req, res) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath) {
      return res.status(400).json({ error: "Path required" });
    }
    await import_fs5.default.promises.writeFile(filePath, content, "utf-8");
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Write failed" });
  }
});
var project_default = router9;

// src/routes/audio.ts
var import_express10 = require("express");
var import_openai3 = __toESM(require("openai"));
var router10 = (0, import_express10.Router)();
router10.post("/speech", authenticate, async (req, res) => {
  try {
    const { text, voice = "alloy" } = req.body;
    const apiKey2 = process.env.OPENAI_API_KEY;
    if (!apiKey2) {
      return res.status(503).json({ error: "No OpenAI API key configured" });
    }
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }
    const openai3 = new import_openai3.default({ apiKey: apiKey2, baseURL: process.env.OPENAI_BASE_URL });
    const mp3 = await openai3.audio.speech.create({
      model: "tts-1",
      voice,
      input: text
    });
    const buffer = Buffer.from(await mp3.arrayBuffer());
    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length
    });
    res.send(buffer);
  } catch (error) {
    console.error("TTS Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate speech" });
  }
});
var audio_default = router10;

// src/routes/assets.ts
var import_express11 = require("express");
var router11 = (0, import_express11.Router)();
router11.get("/", authenticate, async (req, res) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }
    const files = await FileModel.find({ sessionId }).sort({ createdAt: -1 }).lean();
    const runs2 = await Run.find({ sessionId }).select("_id").lean();
    const runIds = runs2.map((r) => r._id);
    const artifacts2 = await Artifact.find({ runId: { $in: runIds } }).sort({ createdAt: -1 }).lean();
    res.json({
      files: files.map((f) => ({
        id: f._id,
        name: f.originalName,
        type: f.mimeType,
        size: f.size,
        createdAt: f.createdAt,
        category: "upload",
        url: `/files/${f._id}/raw`
        // Assumes this route exists
      })),
      artifacts: artifacts2.map((a) => ({
        id: a._id,
        name: a.name,
        type: a.name.endsWith(".html") ? "text/html" : "image/png",
        // Simple heuristic
        createdAt: a.createdAt,
        category: "artifact",
        url: a.href
      }))
    });
  } catch (error) {
    console.error("Error fetching assets:", error);
    res.status(500).json({ error: "Failed to fetch assets" });
  }
});
var assets_default = router11;

// src/routes/memory.ts
var import_express12 = require("express");
var router12 = (0, import_express12.Router)();
router12.get("/", authenticate, async (req, res) => {
  const userId = req.auth?.sub;
  if (!userId) return res.json({ memories: [] });
  try {
    const memories = await MemoryItem.find({ userId }).sort({ createdAt: -1 });
    res.json({ memories });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch memories" });
  }
});
router12.delete("/:id", authenticate, async (req, res) => {
  try {
    await MemoryItem.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete memory" });
  }
});
var memory_default = router12;

// src/routes/knowledge.ts
var import_express13 = require("express");
var import_multer2 = __toESM(require("multer"));
var import_fs6 = __toESM(require("fs"));
var router13 = (0, import_express13.Router)();
var upload2 = (0, import_multer2.default)({ dest: "/tmp/joe-uploads" });
router13.post("/upload", authenticate, upload2.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const filePath = req.file.path;
    const buffer = await import_fs6.default.promises.readFile(filePath);
    let content = "";
    if (req.file.mimetype === "application/pdf") {
      try {
        content = await KnowledgeService.parsePDF(buffer);
      } catch (err) {
        console.error("PDF Parse error:", err);
        return res.status(500).json({ error: "Failed to parse PDF" });
      }
    } else {
      content = buffer.toString("utf-8");
    }
    await import_fs6.default.promises.unlink(filePath);
    const doc = await KnowledgeService.add(req.file.originalname, content);
    res.json({ success: true, document: doc });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message });
  }
});
router13.get("/list", authenticate, async (req, res) => {
  const docs = await KnowledgeService.getAll();
  res.json(docs.map((d) => ({ id: d.id, filename: d.filename, size: d.content.length })));
});
router13.post("/query", authenticate, async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "Query required" });
  const results = await KnowledgeService.search(query);
  res.json({ results: results.map((r) => ({ id: r.document.id, filename: r.document.filename, snippet: r.snippet, score: r.score })) });
});
router13.delete("/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  await KnowledgeService.delete(id);
  res.json({ success: true });
});
var knowledge_default = router13;

// src/routes/database.ts
var import_express14 = require("express");
var import_mongoose18 = __toESM(require("mongoose"));
var router14 = (0, import_express14.Router)();
router14.use((req, res, next) => {
  if (import_mongoose18.default.connection.readyState !== 1 || !import_mongoose18.default.connection.db) {
    return res.status(503).json({ error: "Database not connected" });
  }
  next();
});
router14.get("/", authenticate, async (req, res) => {
  try {
    const collections = await import_mongoose18.default.connection.db.listCollections().toArray();
    const names = collections.map((c) => c.name).sort();
    res.json({ collections: names });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router14.get("/:collection", authenticate, async (req, res) => {
  try {
    const { collection } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const query = req.query.q ? JSON.parse(req.query.q) : {};
    const coll = import_mongoose18.default.connection.db.collection(collection);
    const total = await coll.countDocuments(query);
    const docs = await coll.find(query).skip((page - 1) * limit).limit(limit).toArray();
    res.json({
      data: docs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router14.put("/:collection/:id", authenticate, async (req, res) => {
  try {
    const { collection, id } = req.params;
    const update = req.body;
    delete update._id;
    const coll = import_mongoose18.default.connection.db.collection(collection);
    const result = await coll.updateOne(
      { _id: new import_mongoose18.default.Types.ObjectId(id) },
      { $set: update }
    );
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router14.delete("/:collection/:id", authenticate, async (req, res) => {
  try {
    const { collection, id } = req.params;
    const coll = import_mongoose18.default.connection.db.collection(collection);
    const result = await coll.deleteOne({ _id: new import_mongoose18.default.Types.ObjectId(id) });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
var database_default = router14;

// src/routes/system.ts
var import_express15 = require("express");
var import_child_process2 = require("child_process");
var import_os2 = __toESM(require("os"));
var router15 = (0, import_express15.Router)();
router15.get("/stats", authenticate, async (req, res) => {
  const totalMem = import_os2.default.totalmem();
  const freeMem = import_os2.default.freemem();
  const usedMem = totalMem - freeMem;
  const cpuUsage = import_os2.default.loadavg()[0];
  res.json({
    memory: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      percent: Math.round(usedMem / totalMem * 100)
    },
    cpu: {
      load: cpuUsage,
      cores: import_os2.default.cpus().length
    },
    uptime: import_os2.default.uptime(),
    platform: import_os2.default.platform(),
    arch: import_os2.default.arch()
  });
});
router15.get("/processes", authenticate, async (req, res) => {
  const cmd = "ps aux | grep -E 'node|ts-node' | grep -v grep | head -n 20";
  (0, import_child_process2.exec)(cmd, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ error: "Failed to list processes" });
    }
    const lines = stdout.trim().split("\n");
    const processes = lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      return {
        user: parts[0],
        pid: parts[1],
        cpu: parseFloat(parts[2]),
        mem: parseFloat(parts[3]),
        command: parts.slice(10).join(" ")
      };
    });
    res.json({ processes });
  });
});
router15.delete("/processes/:pid", authenticate, async (req, res) => {
  const { pid } = req.params;
  if (pid === "1") return res.status(403).json({ error: "Cannot kill init process" });
  (0, import_child_process2.exec)(`kill -9 ${pid}`, (err) => {
    if (err) {
      return res.status(500).json({ error: `Failed to kill process ${pid}` });
    }
    res.json({ success: true, message: `Process ${pid} killed` });
  });
});
var system_default = router15;

// src/routes/healing.ts
var import_express16 = require("express");
var import_fs7 = __toESM(require("fs"));
var import_path5 = __toESM(require("path"));
var router16 = (0, import_express16.Router)();
var errorLog = [];
var logError = (error, context) => {
  const errorEntry = {
    id: Math.random().toString(36).substring(7),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    message: error.message,
    stack: error.stack,
    context
  };
  errorLog.unshift(errorEntry);
  if (errorLog.length > 50) errorLog.pop();
  return errorEntry;
};
router16.get("/errors", authenticate, (req, res) => {
  res.json(errorLog);
});
router16.post("/diagnose", authenticate, async (req, res) => {
  const { errorId } = req.body;
  const error = errorLog.find((e) => e.id === errorId);
  if (!error) {
    return res.status(404).json({ error: "Error not found" });
  }
  try {
    const prompt = `
        You are a Self-Healing System Agent.
        Analyze this error and provide a fix plan.
        
        Error Message: ${error.message}
        Context: ${error.context}
        Stack Trace:
        ${error.stack}
        
        If the error is related to a file, identify the file and provide the fixed code.
        Format response as JSON: { "analysis": "string", "suggestedFix": "code or description", "isAutoFixable": boolean, "filePath": "string (optional)" }
        `;
    let diagnosis;
    try {
      const llmResponse = await callLLM(prompt, []);
      const jsonStr = llmResponse.replace(/```json/g, "").replace(/```/g, "").trim();
      diagnosis = JSON.parse(jsonStr);
    } catch (e) {
      diagnosis = {
        analysis: "LLM unavailable. Manual analysis required.",
        suggestedFix: "Check the stack trace and fix the logic manually.",
        isAutoFixable: false
      };
    }
    res.json(diagnosis);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router16.post("/apply", authenticate, async (req, res) => {
  const { filePath, content } = req.body;
  if (!filePath || !content) {
    return res.status(400).json({ error: "Missing filePath or content" });
  }
  try {
    const projectRoot = import_path5.default.resolve(__dirname, "../../..");
    const resolvedPath = import_path5.default.resolve(projectRoot, filePath);
    if (!resolvedPath.startsWith(projectRoot)) {
    }
    await import_fs7.default.promises.writeFile(resolvedPath, content);
    res.json({ success: true, message: "Fix applied successfully" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
var healing_default = router16;

// src/routes/docs.ts
var import_express17 = require("express");
var import_fs8 = __toESM(require("fs"));
var import_path6 = __toESM(require("path"));
var import_glob = require("glob");
var router17 = (0, import_express17.Router)();
var docsCache = {};
router17.get("/", authenticate, (req, res) => {
  res.json(docsCache);
});
router17.post("/generate", authenticate, async (req, res) => {
  try {
    const projectRoot = import_path6.default.resolve(__dirname, "../../..");
    const files = await (0, import_glob.glob)("**/*.{ts,tsx}", {
      cwd: projectRoot,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/*.d.ts", "**/test/**"],
      absolute: true
    });
    const selectedFiles = files.slice(0, 10);
    const results = [];
    for (const file of selectedFiles) {
      const relativePath = import_path6.default.relative(projectRoot, file);
      if (docsCache[relativePath]) {
        results.push(docsCache[relativePath]);
        continue;
      }
      const content = import_fs8.default.readFileSync(file, "utf-8");
      if (content.length < 50) continue;
      const prompt = `
            Analyze the following TypeScript code and generate documentation.
            File: ${relativePath}
            
            Code:
            ${content.substring(0, 3e3)} // Truncate to avoid context limits
            
            Provide a JSON response with:
            - summary: Brief description of what this file does.
            - exports: Array of exported functions/classes with description, params, and returns.
            - complexity: "Low" | "Medium" | "High" based on your assessment.
            
            Format as valid JSON only.
            `;
      try {
        const llmResponse = await callLLM(prompt);
        const jsonStr = llmResponse.replace(/```json/g, "").replace(/```/g, "").trim();
        const doc = JSON.parse(jsonStr);
        const entry = {
          filePath: relativePath,
          ...doc,
          lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
        };
        docsCache[relativePath] = entry;
        results.push(entry);
      } catch (e) {
        console.error(`Failed to document ${relativePath}:`, e);
      }
    }
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
var docs_default = router17;

// src/routes/analytics.ts
var import_express18 = require("express");
var import_fs9 = __toESM(require("fs"));
var import_path7 = __toESM(require("path"));
var import_glob2 = require("glob");
var router18 = (0, import_express18.Router)();
router18.get("/quality", authenticate, async (req, res) => {
  try {
    const projectRoot = import_path7.default.resolve(__dirname, "../../..");
    const files = await (0, import_glob2.glob)("**/*.{ts,tsx,js,jsx,css,scss}", {
      cwd: projectRoot,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/*.d.ts", "**/coverage/**"],
      absolute: true
    });
    let totalLoc = 0;
    let totalFiles = 0;
    let totalTodos = 0;
    const fileStats = [];
    for (const file of files) {
      const content = import_fs9.default.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      const loc = lines.filter((l) => l.trim().length > 0).length;
      const size = import_fs9.default.statSync(file).size;
      const todos = (content.match(new RegExp("TODO:", "gi")) || []).length;
      let complexity = 0;
      const keywords = ["if", "else", "for", "while", "switch", "case", "catch"];
      lines.forEach((line) => {
        const trimmed = line.trim();
        keywords.forEach((kw) => {
          if (trimmed.startsWith(kw + " ") || trimmed.startsWith(kw + "(")) {
            complexity++;
          }
        });
      });
      totalLoc += loc;
      totalFiles++;
      totalTodos += todos;
      fileStats.push({
        path: import_path7.default.relative(projectRoot, file),
        size,
        loc,
        todoCount: todos,
        complexity
      });
    }
    let score = 100;
    const avgComplexity = fileStats.reduce((acc, f) => acc + f.complexity, 0) / (totalFiles || 1);
    if (avgComplexity > 10) score -= 10;
    if (avgComplexity > 20) score -= 20;
    if (totalTodos > 10) score -= 5;
    if (totalTodos > 50) score -= 15;
    score = Math.max(0, Math.min(100, score));
    res.json({
      overview: {
        totalFiles,
        totalLoc,
        totalTodos,
        score,
        avgComplexity: parseFloat(avgComplexity.toFixed(2))
      },
      files: fileStats.sort((a, b) => b.complexity - a.complexity).slice(0, 50)
      // Return top 50 most complex
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
var analytics_default = router18;

// src/routes/tests.ts
var import_express19 = require("express");
var import_glob3 = require("glob");
var import_path8 = __toESM(require("path"));
var import_fs10 = __toESM(require("fs"));
var import_child_process3 = require("child_process");
var router19 = (0, import_express19.Router)();
router19.get("/files", authenticate, async (req, res) => {
  try {
    const projectRoot = import_path8.default.resolve(__dirname, "../../..");
    const files = await (0, import_glob3.glob)("**/*.{test,spec}.{ts,tsx,js,jsx}", {
      cwd: projectRoot,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"],
      absolute: true
    });
    const testFiles = files.map((f) => ({
      path: import_path8.default.relative(projectRoot, f),
      name: import_path8.default.basename(f)
    }));
    res.json(testFiles);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router19.post("/run", authenticate, (req, res) => {
  const { testFile } = req.body;
  const projectRoot = import_path8.default.resolve(__dirname, "../../..");
  const cwd = import_path8.default.resolve(__dirname, "../..");
  const args = ["jest", "--colors"];
  if (testFile) {
    args.push(import_path8.default.resolve(projectRoot, testFile));
  }
  const child = (0, import_child_process3.spawn)("npx", args, { cwd });
  res.setHeader("Content-Type", "text/plain");
  child.stdout.on("data", (data) => {
    res.write(data);
  });
  child.stderr.on("data", (data) => {
    res.write(data);
  });
  child.on("close", (code) => {
    res.write(`
Test process exited with code ${code}`);
    res.end();
  });
});
router19.post("/generate", authenticate, async (req, res) => {
  const { filePath } = req.body;
  const projectRoot = import_path8.default.resolve(__dirname, "../../..");
  const fullPath = import_path8.default.resolve(projectRoot, filePath);
  if (!import_fs10.default.existsSync(fullPath)) {
    return res.status(404).json({ error: "File not found" });
  }
  try {
    const content = import_fs10.default.readFileSync(fullPath, "utf-8");
    const prompt = `
        You are a senior QA Engineer. Write a comprehensive unit test using Jest for the following TypeScript code.
        File: ${filePath}
        
        Code:
        ${content.substring(0, 5e3)}
        
        Requirements:
        1. Use 'describe' and 'test'/'it' blocks.
        2. Mock external dependencies if necessary.
        3. Cover happy paths and edge cases.
        4. Return ONLY the code for the test file. No markdown, no explanations.
        5. Imports should be relative to the file structure.
        `;
    let testCode = await callLLM(prompt);
    testCode = testCode.replace(/```typescript/g, "").replace(/```/g, "").trim();
    const dir = import_path8.default.dirname(fullPath);
    const ext = import_path8.default.extname(fullPath);
    const name = import_path8.default.basename(fullPath, ext);
    const testFilePath = import_path8.default.join(dir, `${name}.test${ext}`);
    import_fs10.default.writeFileSync(testFilePath, testCode);
    res.json({
      success: true,
      testFilePath: import_path8.default.relative(projectRoot, testFilePath),
      code: testCode
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
var tests_default = router19;

// src/routes/advanced.ts
var import_express20 = require("express");

// src/services/council.ts
var EXPERTS = [
  { role: "Architect", name: "Dr. Arch", focus: "Scalability, Clean Architecture, Design Patterns", color: "#2563eb" },
  // Blue-600
  { role: "Security", name: "SecOps Sam", focus: "Vulnerabilities, Auth, Data Protection", color: "#dc2626" },
  // Red-600
  { role: "UX/UI", name: "Designer Dani", focus: "User Experience, Accessibility, Visuals", color: "#db2777" }
  // Pink-600
];
var CouncilService = class {
  static async consult(topic) {
    const discussion = [];
    const expertPromises = EXPERTS.map(async (expert) => {
      const prompt = `
        You are ${expert.name}, a world-class ${expert.role} expert.
        Focus ONLY on: ${expert.focus}.
        
        Topic: "${topic}"
        
        Provide your expert analysis and recommendations. Be concise (max 3 sentences).
        Do not be polite, be direct and technical.
      `;
      try {
        const response = await callLLM(prompt, []);
        return {
          expert,
          content: response
        };
      } catch (e) {
        console.error(`Expert ${expert.name} failed to respond`, e);
        return null;
      }
    });
    const results = await Promise.all(expertPromises);
    results.forEach((r) => {
      if (r) discussion.push(r);
    });
    if (discussion.length > 0) {
      const synthesisPrompt = `
        You are the Lead Engineer. Review the feedback from your team:
        
        ${discussion.map((d) => `${d.expert.role}: ${d.content}`).join("\n\n")}
        
        Synthesize a final execution plan that balances all these concerns.
      `;
      try {
        const conclusion = await callLLM(synthesisPrompt, []);
        discussion.push({
          expert: { role: "Lead", name: "Joe", focus: "Execution", color: "#4f46e5" },
          // Indigo-600
          content: conclusion
        });
      } catch (e) {
        console.error("Synthesis failed", e);
        discussion.push({
          expert: { role: "System", name: "Error", focus: "Recovery", color: "#ff0000" },
          content: "Failed to synthesize a conclusion due to an internal error."
        });
      }
    } else {
      discussion.push({
        expert: { role: "System", name: "Error", focus: "Availability", color: "#ff0000" },
        content: "The council is currently unavailable."
      });
    }
    return discussion;
  }
};

// src/services/graph.ts
var import_fs11 = __toESM(require("fs"));
var import_path9 = __toESM(require("path"));
var CodeGraphService = class {
  static async generateGraph(rootDir) {
    const nodes = [];
    const links = [];
    const idMap = /* @__PURE__ */ new Map();
    const files = await this.getFiles(rootDir);
    const directories = /* @__PURE__ */ new Set();
    const routeFiles = /* @__PURE__ */ new Map();
    files.forEach((file) => {
      const relPath = import_path9.default.relative(rootDir, file);
      const dirName = import_path9.default.dirname(relPath);
      let currentDir = dirName;
      while (currentDir !== "." && currentDir !== "") {
        directories.add(currentDir);
        currentDir = import_path9.default.dirname(currentDir);
      }
      if (dirName === ".") directories.add(".");
      const id = relPath;
      idMap.set(file, id);
      let group = 4;
      if (relPath.includes("api/") || relPath.includes("routes/")) {
        group = 1;
        if (relPath.includes("/routes/")) {
          const routeName = import_path9.default.basename(file, import_path9.default.extname(file));
          routeFiles.set(routeName, id);
        }
      } else if (relPath.includes("services/")) group = 2;
      else if (relPath.includes("components/")) group = 3;
      nodes.push({
        id,
        name: import_path9.default.basename(file),
        group,
        val: 1
        // Default size
      });
    });
    directories.forEach((dir) => {
      nodes.push({
        id: dir,
        name: dir === "." ? "ROOT" : import_path9.default.basename(dir) + "/",
        group: 5,
        // 5 for Directories
        val: dir === "." ? 10 : 3
        // Root is big, dirs are medium
      });
    });
    files.forEach((file) => {
      const relPath = import_path9.default.relative(rootDir, file);
      const dir = import_path9.default.dirname(relPath);
      const targetDir = dir === "" || dir === "." ? "." : dir;
      links.push({ source: relPath, target: targetDir });
    });
    directories.forEach((dir) => {
      if (dir === ".") return;
      const parent = import_path9.default.dirname(dir);
      const targetParent = parent === "" || parent === "." ? "." : parent;
      if (dir !== targetParent) {
        links.push({ source: dir, target: targetParent });
      }
    });
    const routeNames = Array.from(routeFiles.keys());
    await Promise.all(files.map(async (file) => {
      try {
        const content = await import_fs11.default.promises.readFile(file, "utf-8");
        const lines = content.split("\n").length;
        const nodeId = idMap.get(file);
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
          node.val = Math.min(lines / 10, 20);
        }
        const importRegexes = [
          /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g,
          // import ... from '...'
          /export\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g,
          // export ... from '...'
          /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
          // require('...')
          /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
          // import('...')
          /import\s+['"]([^'"]+)['"]/g
          // import '...'
        ];
        const foundImports = /* @__PURE__ */ new Set();
        for (const regex of importRegexes) {
          let match;
          while ((match = regex.exec(content)) !== null) {
            foundImports.add(match[1]);
          }
        }
        for (const importPath of foundImports) {
          if (importPath.startsWith("@/")) {
            const aliasPath = import_path9.default.join(rootDir, "web/src", importPath.slice(2));
            const candidates = [
              aliasPath,
              aliasPath + ".ts",
              aliasPath + ".tsx",
              aliasPath + ".js",
              aliasPath + ".jsx",
              import_path9.default.join(aliasPath, "index.ts"),
              import_path9.default.join(aliasPath, "index.tsx"),
              import_path9.default.join(aliasPath, "index.js"),
              import_path9.default.join(aliasPath, "index.jsx")
            ];
            for (const cand of candidates) {
              if (idMap.has(cand)) {
                const targetId = idMap.get(cand);
                if (targetId !== nodeId) {
                  if (!links.some((l) => l.source === nodeId && l.target === targetId)) {
                    links.push({ source: nodeId, target: targetId });
                  }
                }
                break;
              }
            }
          }
          if (importPath.startsWith(".")) {
            try {
              const resolvedPath = import_path9.default.resolve(import_path9.default.dirname(file), importPath);
              const candidates = [
                resolvedPath,
                resolvedPath + ".ts",
                resolvedPath + ".tsx",
                resolvedPath + ".js",
                resolvedPath + ".jsx",
                import_path9.default.join(resolvedPath, "index.ts"),
                import_path9.default.join(resolvedPath, "index.tsx"),
                import_path9.default.join(resolvedPath, "index.js"),
                import_path9.default.join(resolvedPath, "index.jsx")
              ];
              for (const cand of candidates) {
                if (idMap.has(cand)) {
                  const targetId = idMap.get(cand);
                  if (targetId !== nodeId) {
                    if (!links.some((l) => l.source === nodeId && l.target === targetId)) {
                      links.push({ source: nodeId, target: targetId });
                    }
                  }
                  break;
                }
              }
            } catch (e) {
            }
          }
        }
        if (routeNames.length > 0) {
          const pathSegmentRegex = /\/([a-zA-Z0-9_-]+)/g;
          const quotedStringRegex = /['"]([a-zA-Z0-9_-]+)['"]/g;
          const checkMatch = (potentialRoute) => {
            if (routeFiles.has(potentialRoute)) {
              const targetId = routeFiles.get(potentialRoute);
              if (targetId && targetId !== nodeId) {
                if (!links.some((l) => l.source === nodeId && l.target === targetId)) {
                  links.push({ source: nodeId, target: targetId });
                }
              }
            }
          };
          let match;
          while ((match = pathSegmentRegex.exec(content)) !== null) {
            checkMatch(match[1]);
          }
          while ((match = quotedStringRegex.exec(content)) !== null) {
            checkMatch(match[1]);
          }
        }
      } catch (e) {
      }
    }));
    return { nodes, links };
  }
  static async getFiles(dir) {
    let results = [];
    try {
      const list = await import_fs11.default.promises.readdir(dir);
      for (const file of list) {
        const filePath = import_path9.default.join(dir, file);
        try {
          const stat = await import_fs11.default.promises.stat(filePath);
          if (stat && stat.isDirectory()) {
            if (!file.startsWith(".") && file !== "node_modules" && file !== "dist" && file !== "build") {
              const subResults = await this.getFiles(filePath);
              results = results.concat(subResults);
            }
          } else {
            if (/\.(ts|tsx|js|jsx)$/.test(file)) {
              results.push(filePath);
            }
          }
        } catch (e) {
        }
      }
    } catch (e) {
    }
    return results;
  }
};

// src/routes/advanced.ts
var import_path10 = __toESM(require("path"));
var router20 = (0, import_express20.Router)();
router20.post("/council/consult", async (req, res) => {
  const { topic } = req.body;
  try {
    const result = await CouncilService.consult(topic);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router20.get("/graph", async (req, res) => {
  try {
    const rootDir = import_path10.default.resolve(__dirname, "../../..");
    const graph = await CodeGraphService.generateGraph(rootDir);
    res.json(graph);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
var advanced_default = router20;

// src/services/sentinel.ts
var import_fs12 = __toESM(require("fs"));
var import_path11 = __toESM(require("path"));
var SentinelService = class {
  static {
    this.isRunning = false;
  }
  static {
    this.alerts = [];
  }
  static start(rootPath) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scan(rootPath);
    setInterval(() => this.scan(rootPath), 5 * 60 * 1e3);
  }
  static async scan(dir) {
    try {
      const files = await this.getFiles(dir);
      const newAlerts = [];
      await Promise.all(files.map(async (file) => {
        try {
          const content = await import_fs12.default.promises.readFile(file, "utf-8");
          if (!file.includes("test") && !file.includes("script") && !file.includes("spec")) {
            if (content.match(/['"][a-zA-Z0-9]{32,}['"]/) || content.includes("sk-") || content.includes("Bearer ") || content.includes("aws_access_key_id") || content.includes("ghp_")) {
              if (!content.includes("import ") && !content.includes("sha256")) {
                newAlerts.push(this.createAlert("security", "high", file, "Potential API Key or Secret detected"));
              }
            }
          }
          if (!file.includes("test") && !file.includes("script") && !file.includes("dev")) {
            if (content.includes("console.log(")) {
              newAlerts.push(this.createAlert("quality", "low", file, "Console.log statement found (use console.info/warn/error or logger)"));
            }
          }
          if (content.includes("TODO") || content.includes("FIXME")) {
            newAlerts.push(this.createAlert("maintenance", "medium", file, "Pending Task detected"));
          }
        } catch (e) {
        }
      }));
      if (newAlerts.length > 0) {
        this.alerts = [...newAlerts, ...this.alerts].slice(0, 50);
        broadcast({ type: "sentinel:alert", data: newAlerts });
      }
    } catch (e) {
      console.error("Sentinel Scan Error:", e);
    }
  }
  static createAlert(type, severity, file, message) {
    return {
      id: Math.random().toString(36).substring(7),
      type,
      severity,
      file: import_path11.default.basename(file),
      message,
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  static async getFiles(dir) {
    let results = [];
    try {
      const list = await import_fs12.default.promises.readdir(dir);
      for (const file of list) {
        const filePath = import_path11.default.join(dir, file);
        try {
          const stat = await import_fs12.default.promises.stat(filePath);
          if (stat && stat.isDirectory()) {
            if (!file.startsWith(".") && file !== "node_modules" && file !== "dist" && file !== "build") {
              const subResults = await this.getFiles(filePath);
              results = results.concat(subResults);
            }
          } else {
            if (/\.(ts|tsx|js|jsx)$/.test(file)) {
              results.push(filePath);
            }
          }
        } catch (e) {
        }
      }
    } catch (e) {
    }
    return results;
  }
};

// src/index.ts
var import_http = __toESM(require("http"));
var import_path12 = __toESM(require("path"));
var import_fs13 = __toESM(require("fs"));
var logger = process.env.NODE_ENV === "production" ? (0, import_pino.default)() : (0, import_pino.default)({
  transport: {
    target: "pino-pretty",
    options: { translateTime: "SYS:standard", colorize: true }
  }
});
SentinelService.start(import_path12.default.resolve(__dirname, "../.."));
async function main() {
  const app = (0, import_express21.default)();
  app.use((0, import_cors.default)({
    origin: true,
    // Allow all origins for now to fix connectivity issues
    credentials: true
  }));
  app.use(import_express21.default.json({ limit: "10mb" }));
  app.use((0, import_morgan.default)("dev"));
  app.get("/health", (_req, res) => res.json({ status: "OK" }));
  app.get("/", (_req, res) => res.send("Joe API is running"));
  app.use("/auth", auth_default);
  app.use("/tools", tools_default);
  app.use("/runs", run_default);
  app.use("/run", runs_default);
  app.use("/sessions", sessions_default);
  app.use("/folders", folders_default);
  app.use("/files", files_default);
  app.use("/approvals", approvals_default);
  app.use("/project", project_default);
  app.use("/audio", audio_default);
  app.use("/assets", assets_default);
  app.use("/memory", memory_default);
  app.use("/knowledge", knowledge_default);
  app.use("/database", database_default);
  app.use("/system", system_default);
  app.use("/healing", healing_default);
  app.use("/advanced", advanced_default);
  app.use("/docs", docs_default);
  app.use("/analytics", analytics_default);
  app.use("/tests", tests_default);
  app.get("/me", authenticate, async (req, res) => {
    const auth = req.auth;
    res.json({ userId: auth.sub, role: auth.role });
  });
  const ARTIFACT_DIR2 = process.env.ARTIFACT_DIR || "/tmp/joe-artifacts";
  if (!import_fs13.default.existsSync(ARTIFACT_DIR2)) {
    try {
      import_fs13.default.mkdirSync(ARTIFACT_DIR2, { recursive: true });
    } catch {
    }
  }
  app.use("/artifacts", import_express21.default.static(ARTIFACT_DIR2));
  try {
    await import_mongoose19.default.connect(config.mongoUri, { serverSelectionTimeoutMS: 5e3 });
    logger.info("MongoDB connected");
  } catch (e) {
    logger.error(e, "MongoDB connection failed (continuing without DB)");
  }
  const server = import_http.default.createServer(app);
  attachWebSocket(server);
  server.listen(config.port, "0.0.0.0", () => {
    logger.info({ port: config.port, browserWorkerUrl: config.browserWorkerUrl }, "API listening");
  });
  process.on("uncaughtException", (err) => {
    logger.error(err, "Uncaught Exception");
    logError(err, "Uncaught Exception");
  });
  process.on("unhandledRejection", (reason) => {
    logger.error(reason, "Unhandled Rejection");
    logError(reason instanceof Error ? reason : new Error(String(reason)), "Unhandled Rejection");
  });
}
main().catch((err) => {
  logger.error(err, "Fatal error");
  process.exit(1);
});
