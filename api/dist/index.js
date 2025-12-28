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

// src/services/secrets.ts
var secrets_exports = {};
__export(secrets_exports, {
  clearSessionSecrets: () => clearSessionSecrets,
  getSessionSecret: () => getSessionSecret,
  popPendingTool: () => popPendingTool,
  setPendingTool: () => setPendingTool,
  setSessionSecret: () => setSessionSecret,
  setSessionSecretEncrypted: () => setSessionSecretEncrypted
});
function nowMs() {
  return Date.now();
}
function getMasterKeyBytes() {
  const raw = String(process.env.SECRETS_MASTER_KEY || process.env.JWT_SECRET || "").trim();
  if (!raw) return null;
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}
function encrypt(value) {
  const key = getMasterKeyBytes();
  if (!key) return null;
  const crypto = require("crypto");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const c1 = cipher.update(value, "utf8");
  const c2 = cipher.final();
  const tag = cipher.getAuthTag();
  const buf = Buffer.concat([c1, c2]);
  return { value: buf.toString("base64"), ivB64: iv.toString("base64"), tagB64: tag.toString("base64") };
}
function decrypt(entry) {
  if (!entry.enc) return entry.value;
  const key = getMasterKeyBytes();
  if (!key) return null;
  const crypto = require("crypto");
  const iv = Buffer.from(entry.enc.ivB64, "base64");
  const tag = Buffer.from(entry.enc.tagB64, "base64");
  const decipher = crypto.createDecipheriv(entry.enc.alg, key, iv);
  decipher.setAuthTag(tag);
  const c1 = decipher.update(Buffer.from(entry.value, "base64"));
  const c2 = decipher.final();
  return Buffer.concat([c1, c2]).toString("utf8");
}
function purgeExpired(bucket) {
  const now = nowMs();
  for (const [k, v] of bucket.entries()) {
    if (typeof v.expiresAt === "number" && v.expiresAt > 0 && v.expiresAt <= now) bucket.delete(k);
  }
}
function setSessionSecret(sessionId, key, value) {
  const sid = String(sessionId || "").trim();
  const k = String(key || "").trim();
  if (!sid || !k) return;
  let bucket = sessionSecrets.get(sid);
  if (!bucket) {
    bucket = /* @__PURE__ */ new Map();
    sessionSecrets.set(sid, bucket);
  }
  purgeExpired(bucket);
  bucket.set(k, { value });
}
function getSessionSecret(sessionId, key) {
  const sid = String(sessionId || "").trim();
  const k = String(key || "").trim();
  if (!sid || !k) return null;
  const bucket = sessionSecrets.get(sid);
  if (!bucket) return null;
  purgeExpired(bucket);
  const entry = bucket.get(k);
  if (!entry) return null;
  if (typeof entry.expiresAt === "number" && entry.expiresAt > 0 && entry.expiresAt <= nowMs()) {
    bucket.delete(k);
    return null;
  }
  const plain = decrypt(entry);
  return plain ?? null;
}
function clearSessionSecrets(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return;
  sessionSecrets.delete(sid);
}
function setSessionSecretEncrypted(sessionId, key, value, ttlSeconds) {
  const sid = String(sessionId || "").trim();
  const k = String(key || "").trim();
  if (!sid || !k) return null;
  let bucket = sessionSecrets.get(sid);
  if (!bucket) {
    bucket = /* @__PURE__ */ new Map();
    sessionSecrets.set(sid, bucket);
  }
  purgeExpired(bucket);
  const ttl = typeof ttlSeconds === "number" && Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : void 0;
  const expiresAt = ttl ? nowMs() + ttl * 1e3 : void 0;
  const enc = encrypt(String(value ?? ""));
  if (enc) {
    bucket.set(k, { value: enc.value, expiresAt, enc: { alg: "aes-256-gcm", ivB64: enc.ivB64, tagB64: enc.tagB64 } });
  } else {
    bucket.set(k, { value: String(value ?? ""), expiresAt });
  }
  return expiresAt ?? null;
}
function setPendingTool(sessionId, ctx) {
  const sid = String(sessionId || "").trim();
  if (!sid) return;
  pendingToolBySession.set(sid, ctx);
}
function popPendingTool(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  const ctx = pendingToolBySession.get(sid) || null;
  pendingToolBySession.delete(sid);
  return ctx;
}
var sessionSecrets, pendingToolBySession;
var init_secrets = __esm({
  "src/services/secrets.ts"() {
    "use strict";
    sessionSecrets = /* @__PURE__ */ new Map();
    pendingToolBySession = /* @__PURE__ */ new Map();
  }
});

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
var import_express15 = __toESM(require("express"));
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
    inputSchema: { type: "object", properties: { url: { type: "string" }, render: { type: "boolean" } }, required: ["url"] },
    outputSchema: { type: "object", properties: { title: { type: "string" }, metaDescription: { type: "string" }, headings: { type: "array", items: { type: "string" } }, links: { type: "array", items: { type: "object", properties: { text: { type: "string" }, url: { type: "string" } } } }, textSnippet: { type: "string" }, url: { type: "string" }, rendered: { type: "boolean" } } },
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
        operation: { type: "string", enum: ["status", "add", "commit", "push", "checkout", "log", "fetch", "pull", "clone"] },
        args: { type: "array", items: { type: "string" } },
        sessionId: { type: "string" }
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
    name: "github_create_repo",
    version: "1.0.0",
    tags: ["dev", "github"],
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        private: { type: "boolean" },
        description: { type: "string" },
        sessionId: { type: "string" }
      },
      required: ["name"]
    },
    outputSchema: {
      type: "object",
      properties: {
        fullName: { type: "string" },
        htmlUrl: { type: "string" },
        apiUrl: { type: "string" }
      }
    },
    permissions: ["read", "write"],
    sideEffects: ["write"],
    rateLimitPerMinute: 20,
    auditFields: ["name"],
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
    mockSupported: false,
    description: 'Perform a comprehensive deep dive into a topic. Uses recursive search, browsing, and synthesis to generate a detailed report. Best for "analyze", "research", or complex questions requiring multiple sources.'
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
    mockSupported: false,
    description: "Perform a standard web search (like Google/DuckDuckGo). Best for quick facts, current events, or checking if a library exists. Returns a list of titles and snippets. Use deep_research for complex topics."
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
var generatedTools = [];
var TARGET_TOOL_COUNT = 200;
function hasToolName(n) {
  const name = String(n || "").trim();
  if (!name) return false;
  return tools.some((t) => t.name === name) || generatedTools.some((t) => t.name === name);
}
function addGeneratedTool(t) {
  if (!t?.name) return;
  if (tools.length + generatedTools.length >= TARGET_TOOL_COUNT) return;
  if (hasToolName(t.name)) return;
  generatedTools.push(t);
}
function makeShellTool(opts) {
  const rateLimitPerMinute = Number.isFinite(Number(opts.rateLimitPerMinute)) ? Number(opts.rateLimitPerMinute) : 30;
  addGeneratedTool({
    name: opts.name,
    version: "1.0.0",
    tags: opts.tags,
    description: opts.description,
    inputSchema: opts.inputSchema,
    outputSchema: {
      type: "object",
      properties: {
        stdout: { type: "string" },
        stderr: { type: "string" },
        exitCode: { type: "number" },
        cwd: { type: "string" }
      }
    },
    permissions: opts.permissions,
    sideEffects: opts.sideEffects,
    rateLimitPerMinute,
    auditFields: Array.isArray(opts.auditFields) ? opts.auditFields : [],
    mockSupported: false,
    async execute(input) {
      const { command, cwd, timeout } = opts.buildCommand(input);
      return executeTool("shell_execute", { command, cwd, timeout });
    }
  });
}
function addPhase2AndCoreDevTools() {
  addGeneratedTool({
    name: "command_policy_check",
    version: "1.0.0",
    tags: ["dev", "safety", "policy"],
    inputSchema: {
      type: "object",
      properties: {
        tool: { type: "string" },
        input: { type: "object" },
        userText: { type: "string" }
      },
      required: ["tool"]
    },
    outputSchema: {
      type: "object",
      properties: {
        decision: { type: "string", enum: ["allow", "require_approval", "deny"] },
        risk: { type: "string" },
        reasons: { type: "array", items: { type: "string" } }
      }
    },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 120,
    auditFields: ["tool"],
    mockSupported: true,
    async execute(input) {
      const tool = String(input?.tool || "").trim();
      const userText = String(input?.userText || "");
      const inObj = input?.input ?? null;
      const reasons = [];
      let decision = "allow";
      let risk = "LOW";
      const text = `${tool}
${userText}
${JSON.stringify(inObj ?? {})}`;
      if (/(rm\s+-rf|drop\s+table|shutdown|kill\s+process)/i.test(text)) {
        decision = "require_approval";
        risk = "HIGH";
        reasons.push("matches_destructive_pattern");
      }
      if (/sudo\b/i.test(text)) {
        decision = "deny";
        risk = "CRITICAL";
        reasons.push("sudo_not_allowed");
      }
      if (tool === "shell_execute") {
        if (decision === "allow") {
          decision = "require_approval";
          risk = "MEDIUM";
          reasons.push("raw_shell_requires_approval");
        }
      }
      if (tool === "file_write" || tool === "file_edit" || tool === "scaffold_project") {
        const filename = String(inObj?.filename || "").trim();
        const baseDir = String(inObj?.baseDir || "").trim();
        const target = filename || baseDir;
        if (/\b\.env\b/i.test(target) || /id_rsa|ssh|pem|secret|token/i.test(target)) {
          decision = "require_approval";
          risk = "HIGH";
          reasons.push("touches_sensitive_path");
        }
      }
      if (tool === "git_ops") {
        const op = String(inObj?.operation || "").trim().toLowerCase();
        if (["push", "clone"].includes(op)) {
          decision = "require_approval";
          risk = "HIGH";
          reasons.push("git_remote_operation");
        }
      }
      if (!reasons.length) reasons.push("no_specific_risk_rule_matched");
      return { ok: true, output: { decision, risk, reasons }, logs: [`policy.tool=${tool} decision=${decision} risk=${risk}`] };
    }
  });
  addGeneratedTool({
    name: "approve_on_tool",
    version: "1.0.0",
    tags: ["dev", "safety", "policy"],
    inputSchema: { type: "object", properties: { tool: { type: "string" }, input: { type: "object" } }, required: ["tool"] },
    outputSchema: { type: "object", properties: { ok: { type: "boolean" }, decision: { type: "string" } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 120,
    auditFields: ["tool"],
    mockSupported: true,
    async execute(input) {
      const res = await executeTool("command_policy_check", input);
      const decision = String(res?.output?.decision || "allow");
      return { ok: true, output: { ok: decision === "allow", decision }, logs: res.logs || [] };
    }
  });
  addGeneratedTool({
    name: "secrets_store_encrypted",
    version: "1.0.0",
    tags: ["dev", "secrets", "security"],
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        key: { type: "string" },
        value: { type: "string" },
        ttlSeconds: { type: "number" }
      },
      required: ["sessionId", "key", "value"]
    },
    outputSchema: { type: "object", properties: { ok: { type: "boolean" }, expiresAt: { type: "number" } } },
    permissions: ["write"],
    sideEffects: ["write"],
    rateLimitPerMinute: 120,
    auditFields: ["key"],
    mockSupported: false,
    async execute(input) {
      const sessionId = String(input?.sessionId || "").trim();
      const key = String(input?.key || "").trim();
      const value = String(input?.value ?? "");
      const ttlSeconds = Number(input?.ttlSeconds ?? 0);
      if (!sessionId || !key) return { ok: false, error: "Missing sessionId or key", logs: [] };
      const { setSessionSecretEncrypted: setSessionSecretEncrypted2 } = await Promise.resolve().then(() => (init_secrets(), secrets_exports));
      const expiresAt = setSessionSecretEncrypted2(sessionId, key, value, ttlSeconds > 0 ? ttlSeconds : void 0);
      return { ok: true, output: { ok: true, expiresAt: expiresAt ?? null }, logs: [`secret_set=${key}`] };
    }
  });
  addGeneratedTool({
    name: "secrets_provider_connect",
    version: "1.0.0",
    tags: ["dev", "secrets"],
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
        key: { type: "string" },
        envVar: { type: "string" },
        ttlSeconds: { type: "number" }
      },
      required: ["sessionId", "key", "envVar"]
    },
    outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
    permissions: ["write"],
    sideEffects: ["write"],
    rateLimitPerMinute: 60,
    auditFields: ["key"],
    mockSupported: false,
    async execute(input) {
      const sessionId = String(input?.sessionId || "").trim();
      const key = String(input?.key || "").trim();
      const envVar = String(input?.envVar || "").trim();
      const ttlSeconds = Number(input?.ttlSeconds ?? 0);
      if (!sessionId || !key || !envVar) return { ok: false, error: "Missing sessionId/key/envVar", logs: [] };
      const v = String(process.env[envVar] || "");
      if (!v) return { ok: false, error: `Env var not set: ${envVar}`, logs: [] };
      const { setSessionSecretEncrypted: setSessionSecretEncrypted2 } = await Promise.resolve().then(() => (init_secrets(), secrets_exports));
      setSessionSecretEncrypted2(sessionId, key, v, ttlSeconds > 0 ? ttlSeconds : void 0);
      return { ok: true, output: { ok: true }, logs: [`secret_from_env=${envVar} -> ${key}`] };
    }
  });
  addGeneratedTool({
    name: "project_detect",
    version: "1.0.0",
    tags: ["dev", "analysis"],
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: [] },
    outputSchema: {
      type: "object",
      properties: {
        root: { type: "string" },
        hasGit: { type: "boolean" },
        nodeProjects: { type: "array", items: { type: "string" } },
        pythonProjects: { type: "array", items: { type: "string" } },
        goProjects: { type: "array", items: { type: "string" } }
      }
    },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 30,
    auditFields: ["path"],
    mockSupported: true,
    async execute(input) {
      const root = resolveToolPath(String(input?.path || "."));
      const hasGit = import_fs2.default.existsSync(import_path2.default.join(root, ".git"));
      const candidates = [];
      const walk = (dir, depth) => {
        if (depth > 4) return;
        let entries = [];
        try {
          entries = import_fs2.default.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          if (e.name === "node_modules" || e.name === ".git" || e.name === "dist" || e.name === "build") continue;
          const full = import_path2.default.join(dir, e.name);
          if (e.isDirectory()) walk(full, depth + 1);
          else candidates.push(full);
        }
      };
      walk(root, 0);
      const dirs = /* @__PURE__ */ new Set();
      for (const f of candidates) dirs.add(import_path2.default.dirname(f));
      const nodeProjects = Array.from(dirs).filter((d) => import_fs2.default.existsSync(import_path2.default.join(d, "package.json"))).sort();
      const pythonProjects = Array.from(dirs).filter((d) => import_fs2.default.existsSync(import_path2.default.join(d, "pyproject.toml")) || import_fs2.default.existsSync(import_path2.default.join(d, "requirements.txt"))).sort();
      const goProjects = Array.from(dirs).filter((d) => import_fs2.default.existsSync(import_path2.default.join(d, "go.mod"))).sort();
      return { ok: true, output: { root, hasGit, nodeProjects, pythonProjects, goProjects }, logs: [`project.root=${root}`] };
    }
  });
  addGeneratedTool({
    name: "quality_run",
    version: "1.0.0",
    tags: ["dev", "quality"],
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        tasks: { type: "array", items: { type: "string", enum: ["lint", "typecheck", "test", "build"] } }
      },
      required: ["tasks"]
    },
    outputSchema: { type: "object", properties: { results: { type: "array", items: { type: "object" } } } },
    permissions: ["read", "execute"],
    sideEffects: ["execute"],
    rateLimitPerMinute: 10,
    auditFields: [],
    mockSupported: false,
    async execute(input) {
      const p = resolveToolPath(String(input?.path || "."));
      const tasks = Array.isArray(input?.tasks) ? input.tasks.map((x) => String(x)) : [];
      const logs = [];
      const results = [];
      const pkgPath = import_path2.default.join(p, "package.json");
      let scripts = {};
      if (import_fs2.default.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(import_fs2.default.readFileSync(pkgPath, "utf-8"));
          scripts = pkg?.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
        } catch {
        }
      }
      const runScript = async (task) => {
        const scriptName = task === "lint" ? scripts.lint ? "lint" : "" : task === "typecheck" ? scripts.typecheck ? "typecheck" : scripts["check-types"] ? "check-types" : "" : task === "test" ? scripts.test ? "test" : "" : task === "build" ? scripts.build ? "build" : "" : "";
        if (!scriptName) {
          results.push({ task, ok: false, skipped: true, reason: "missing_script" });
          return;
        }
        const cmd = `npm --prefix "${p}" run ${scriptName}`;
        const r = await executeTool("shell_execute", { command: cmd, cwd: repoRoot(), timeout: 10 * 60 * 1e3 });
        results.push({ task, ok: r.ok, stdout: r.output?.stdout, stderr: r.output?.stderr, exitCode: r.output?.exitCode });
      };
      for (const t of tasks) await runScript(t);
      logs.push(`quality.path=${p} tasks=${tasks.join(",")}`);
      return { ok: results.every((r) => r.ok || r.skipped), output: { results }, logs };
    }
  });
  addGeneratedTool({
    name: "dependency_audit",
    version: "1.0.0",
    tags: ["dev", "security", "deps"],
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: [] },
    outputSchema: { type: "object", properties: { summary: { type: "object" }, raw: { type: "object" } } },
    permissions: ["read", "execute"],
    sideEffects: ["execute"],
    rateLimitPerMinute: 10,
    auditFields: ["path"],
    mockSupported: false,
    async execute(input) {
      const p = resolveToolPath(String(input?.path || "."));
      const cmd = `npm --prefix "${p}" audit --json`;
      const r = await executeTool("shell_execute", { command: cmd, cwd: repoRoot(), timeout: 5 * 60 * 1e3 });
      if (!r.ok) return { ok: false, error: String(r.output?.stderr || r.error || "audit_failed"), logs: r.logs || [] };
      const rawText = String(r.output?.stdout || "");
      let raw = null;
      try {
        raw = JSON.parse(rawText);
      } catch {
        raw = { parseError: true, rawText: rawText.slice(0, 5e3) };
      }
      const summary = raw?.metadata?.vulnerabilities || raw?.vulnerabilities || {};
      return { ok: true, output: { summary, raw }, logs: r.logs || [] };
    }
  });
  addGeneratedTool({
    name: "secrets_scan_repo",
    version: "1.0.0",
    tags: ["dev", "security", "secrets"],
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: [] },
    outputSchema: { type: "object", properties: { matches: { type: "array", items: { type: "string" } }, truncated: { type: "boolean" } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 10,
    auditFields: ["path"],
    mockSupported: true,
    async execute(input) {
      const searchPath = resolveToolPath(String(input?.path || "."));
      const patterns = [
        "sk-[A-Za-z0-9_-]{10,}",
        "ghp_[A-Za-z0-9_]{10,}",
        "github_pat_[A-Za-z0-9_]{10,}",
        "AKIA[0-9A-Z]{16}",
        "Bearer\\s+[A-Za-z0-9._-]{10,}"
      ];
      const all = [];
      for (const pat of patterns) {
        const r = await executeTool("grep_search", { query: pat, path: searchPath, include: "*.*", exclude: "" });
        const m = Array.isArray(r.output?.matches) ? r.output.matches : [];
        for (const line of m) all.push(String(line));
      }
      const unique = Array.from(new Set(all)).slice(0, 200);
      return { ok: true, output: { matches: unique, truncated: unique.length === 200 }, logs: [`scan.path=${searchPath} matches=${unique.length}`] };
    }
  });
  addGeneratedTool({
    name: "ci_generate_pipeline",
    version: "1.0.0",
    tags: ["dev", "ci"],
    inputSchema: { type: "object", properties: { path: { type: "string" }, kind: { type: "string", enum: ["node"] } }, required: [] },
    outputSchema: { type: "object", properties: { created: { type: "array", items: { type: "string" } } } },
    permissions: ["write"],
    sideEffects: ["write"],
    rateLimitPerMinute: 5,
    auditFields: ["path"],
    mockSupported: false,
    async execute(input) {
      const p = resolveToolPath(String(input?.path || "."));
      const wfDir = import_path2.default.join(p, ".github", "workflows");
      const wfFile = import_path2.default.join(wfDir, "ci.yml");
      try {
        import_fs2.default.mkdirSync(wfDir, { recursive: true });
      } catch {
      }
      const yaml = [
        "name: CI",
        "on:",
        "  push:",
        "  pull_request:",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - uses: actions/checkout@v4",
        "      - uses: actions/setup-node@v4",
        "        with:",
        "          node-version: 20",
        "      - run: npm ci",
        "      - run: npm run lint --if-present",
        "      - run: npm run typecheck --if-present",
        "      - run: npm test --if-present",
        "      - run: npm run build --if-present",
        ""
      ].join("\n");
      import_fs2.default.writeFileSync(wfFile, yaml);
      return { ok: true, output: { created: [wfFile] }, logs: [`ci.created=${wfFile}`] };
    }
  });
  addGeneratedTool({
    name: "ci_run_status",
    version: "1.0.0",
    tags: ["dev", "ci", "github"],
    inputSchema: { type: "object", properties: { repo: { type: "string" }, branch: { type: "string" } }, required: ["repo"] },
    outputSchema: { type: "object", properties: { note: { type: "string" } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 10,
    auditFields: ["repo"],
    mockSupported: true,
    async execute(input) {
      const repo = String(input?.repo || "").trim();
      const branch = String(input?.branch || "main").trim();
      return { ok: true, output: { note: `Connect a CI provider to query status: repo=${repo} branch=${branch}` }, logs: [`ci.status.repo=${repo}`] };
    }
  });
  makeShellTool({
    name: "docker_ops",
    tags: ["dev", "docker"],
    permissions: ["execute"],
    sideEffects: ["execute"],
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["version", "build", "run"] },
        args: { type: "array", items: { type: "string" } },
        cwd: { type: "string" },
        timeout: { type: "number" }
      },
      required: ["operation"]
    },
    auditFields: ["operation"],
    buildCommand: (input) => {
      const op = String(input?.operation || "").trim();
      const args = Array.isArray(input?.args) ? input.args.map((x) => String(x)) : [];
      const cwd = typeof input?.cwd === "string" ? input.cwd : void 0;
      const timeout = Number(input?.timeout ?? 3e4);
      const cmd = `docker ${op} ${args.join(" ")}`.trim();
      return { command: cmd, cwd, timeout };
    }
  });
  makeShellTool({
    name: "deploy_ops",
    tags: ["dev", "deploy"],
    permissions: ["execute"],
    sideEffects: ["execute"],
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["kubectl"] },
        args: { type: "array", items: { type: "string" } },
        cwd: { type: "string" },
        timeout: { type: "number" }
      },
      required: ["operation", "args"]
    },
    auditFields: ["operation"],
    buildCommand: (input) => {
      const args = Array.isArray(input?.args) ? input.args.map((x) => String(x)) : [];
      const cwd = typeof input?.cwd === "string" ? input.cwd : void 0;
      const timeout = Number(input?.timeout ?? 3e4);
      const cmd = `kubectl ${args.join(" ")}`.trim();
      return { command: cmd, cwd, timeout };
    }
  });
}
function addBulkToolPackToReach200() {
  const root = repoRoot();
  const gitSimple = [
    { name: "git_status", command: "git status -sb" },
    { name: "git_diff", command: "git diff" },
    { name: "git_diff_cached", command: "git diff --cached" },
    { name: "git_log", command: "git log -n 50 --oneline --decorate" },
    { name: "git_branch_list", command: "git branch -a" },
    { name: "git_remote_list", command: "git remote -v" },
    { name: "git_tags", command: "git tag -l" }
  ];
  for (const g of gitSimple) {
    makeShellTool({
      name: g.name,
      tags: ["dev", "git"],
      permissions: ["read", "execute"],
      sideEffects: ["execute"],
      inputSchema: { type: "object", properties: { cwd: { type: "string" }, timeout: { type: "number" } }, required: [] },
      auditFields: [],
      buildCommand: (input) => ({ command: g.command, cwd: input?.cwd ? String(input.cwd) : root, timeout: Number(input?.timeout ?? 3e4) })
    });
  }
  const npmSimple = [
    { name: "npm_install", command: "npm install" },
    { name: "npm_ci", command: "npm ci" },
    { name: "npm_lint", command: "npm run lint --if-present" },
    { name: "npm_typecheck", command: "npm run typecheck --if-present" },
    { name: "npm_test", command: "npm test --if-present" },
    { name: "npm_build", command: "npm run build --if-present" },
    { name: "npm_audit", command: "npm audit" }
  ];
  for (const n of npmSimple) {
    makeShellTool({
      name: n.name,
      tags: ["dev", "npm"],
      permissions: ["read", "execute", "write"],
      sideEffects: ["execute", "write"],
      inputSchema: { type: "object", properties: { cwd: { type: "string" }, timeout: { type: "number" } }, required: [] },
      auditFields: [],
      buildCommand: (input) => ({ command: n.command, cwd: input?.cwd ? String(input.cwd) : root, timeout: Number(input?.timeout ?? 10 * 60 * 1e3) })
    });
  }
  const fsShellOps = [
    { name: "fs_pwd", build: () => "pwd", perms: ["read", "execute"], effects: ["execute"] },
    { name: "fs_ls", build: (i) => `ls -la "${resolveToolPath(String(i?.path || "."))}"`, perms: ["read", "execute"], effects: ["execute"] },
    { name: "fs_find_large", build: (i) => `find "${resolveToolPath(String(i?.path || "."))}" -type f -size +${Number(i?.mb ?? 50)}M -maxdepth 6 -print`, perms: ["read", "execute"], effects: ["execute"] }
  ];
  for (const f of fsShellOps) {
    makeShellTool({
      name: f.name,
      tags: ["fs", "utility"],
      permissions: f.perms,
      sideEffects: f.effects,
      inputSchema: { type: "object", properties: { path: { type: "string" }, mb: { type: "number" }, cwd: { type: "string" }, timeout: { type: "number" } }, required: [] },
      auditFields: ["path"],
      buildCommand: (input) => ({ command: f.build(input), cwd: input?.cwd ? String(input.cwd) : root, timeout: Number(input?.timeout ?? 3e4) })
    });
  }
  const codeSearchByType = [
    { name: "code_search_ts", include: "*.{ts,tsx}" },
    { name: "code_search_js", include: "*.{js,mjs,cjs,jsx}" },
    { name: "code_search_py", include: "*.py" },
    { name: "code_search_go", include: "*.go" },
    { name: "code_search_java", include: "*.java" },
    { name: "code_search_rust", include: "*.rs" },
    { name: "code_search_cpp", include: "*.{c,cc,cpp,h,hpp}" },
    { name: "code_search_yaml", include: "*.{yml,yaml}" },
    { name: "code_search_json", include: "*.json" },
    { name: "code_search_md", include: "*.md" },
    { name: "code_search_sql", include: "*.sql" },
    { name: "code_search_sh", include: "*.{sh,bash,zsh}" },
    { name: "code_search_docker", include: "*Dockerfile*" },
    { name: "code_search_terraform", include: "*.{tf,tfvars}" },
    { name: "code_search_k8s", include: "*.{yaml,yml}" },
    { name: "code_search_html", include: "*.{html,htm}" },
    { name: "code_search_css", include: "*.{css,scss,sass,less}" },
    { name: "code_search_graphql", include: "*.{graphql,gql}" },
    { name: "code_search_proto", include: "*.proto" },
    { name: "code_search_swift", include: "*.swift" }
  ];
  for (const s of codeSearchByType) {
    addGeneratedTool({
      name: s.name,
      version: "1.0.0",
      tags: ["fs", "search"],
      inputSchema: { type: "object", properties: { query: { type: "string" }, path: { type: "string" }, exclude: { type: "string" } }, required: ["query"] },
      outputSchema: { type: "object", properties: { matches: { type: "array", items: { type: "string" } }, count: { type: "number" }, truncated: { type: "boolean" } } },
      permissions: ["read"],
      sideEffects: [],
      rateLimitPerMinute: 120,
      auditFields: ["query"],
      mockSupported: true,
      async execute(input) {
        const query = String(input?.query ?? "");
        const searchPath = String(input?.path ?? ".");
        const exclude = String(input?.exclude ?? "");
        return executeTool("grep_search", { query, path: searchPath, include: s.include, exclude });
      }
    });
  }
  addGeneratedTool({
    name: "code_loc_count",
    version: "1.0.0",
    tags: ["dev", "analysis", "code"],
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: [] },
    outputSchema: { type: "object", properties: { totalFiles: { type: "number" }, totalLines: { type: "number" }, byExt: { type: "object" } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 10,
    auditFields: ["path"],
    mockSupported: true,
    async execute(input) {
      const rootPath = resolveToolPath(String(input?.path || "."));
      const byExt = {};
      let totalFiles = 0;
      let totalLines = 0;
      const shouldSkipDir = (name) => name === "node_modules" || name === ".git" || name === "dist" || name === "build" || name === ".next" || name === ".turbo";
      const walk = (dir, depth) => {
        if (depth > 12) return;
        let ents = [];
        try {
          ents = import_fs2.default.readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of ents) {
          if (e.isDirectory()) {
            if (shouldSkipDir(e.name)) continue;
            walk(import_path2.default.join(dir, e.name), depth + 1);
            continue;
          }
          const full = import_path2.default.join(dir, e.name);
          const ext = import_path2.default.extname(e.name).toLowerCase() || "(none)";
          let content = "";
          try {
            content = import_fs2.default.readFileSync(full, "utf-8");
          } catch {
            continue;
          }
          const lines = content.split("\n").length;
          totalFiles += 1;
          totalLines += lines;
          byExt[ext] = byExt[ext] || { files: 0, lines: 0 };
          byExt[ext].files += 1;
          byExt[ext].lines += lines;
        }
      };
      walk(rootPath, 0);
      const out = {};
      for (const [k, v] of Object.entries(byExt)) out[k] = v;
      return { ok: true, output: { totalFiles, totalLines, byExt: out }, logs: [`loc.path=${rootPath}`] };
    }
  });
  const filler = [
    { name: "sys_node_version", command: "node -v", tags: ["system", "info"], perms: ["read", "execute"], effects: ["execute"] },
    { name: "sys_npm_version", command: "npm -v", tags: ["system", "info"], perms: ["read", "execute"], effects: ["execute"] },
    { name: "sys_git_version", command: "git --version", tags: ["system", "info"], perms: ["read", "execute"], effects: ["execute"] },
    { name: "sys_uname", command: "uname -a", tags: ["system", "info"], perms: ["read", "execute"], effects: ["execute"] },
    { name: "sys_disk", command: "df -h", tags: ["system", "info"], perms: ["read", "execute"], effects: ["execute"] },
    { name: "sys_mem", command: "vm_stat", tags: ["system", "info"], perms: ["read", "execute"], effects: ["execute"] }
  ];
  for (const x of filler) {
    makeShellTool({
      name: x.name,
      tags: x.tags,
      permissions: x.perms,
      sideEffects: x.effects,
      inputSchema: { type: "object", properties: { timeout: { type: "number" } }, required: [] },
      buildCommand: (input) => ({ command: x.command, cwd: root, timeout: Number(input?.timeout ?? 3e4) })
    });
  }
  addGeneratedTool({
    name: "fs_glob",
    version: "1.0.0",
    tags: ["fs", "search"],
    inputSchema: { type: "object", properties: { pattern: { type: "string" }, cwd: { type: "string" } }, required: ["pattern"] },
    outputSchema: { type: "object", properties: { matches: { type: "array", items: { type: "string" } } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 60,
    auditFields: ["pattern"],
    mockSupported: true,
    async execute(input) {
      const pattern = String(input?.pattern || "").trim();
      const cwd = input?.cwd ? resolveToolPath(String(input.cwd)) : repoRoot();
      if (!pattern) return { ok: false, error: "pattern_required", logs: [] };
      const { globSync } = await import("glob");
      const matches = globSync(pattern, { cwd, nodir: true, dot: true, absolute: true }).slice(0, 500);
      return { ok: true, output: { matches }, logs: [`glob.cwd=${cwd} count=${matches.length}`] };
    }
  });
  const keywordChecks = [
    { slug: "todo", query: "TODO" },
    { slug: "fixme", query: "FIXME" },
    { slug: "hack", query: "HACK" },
    { slug: "debugger", query: "debugger" },
    { slug: "console_log", query: "console.log" },
    { slug: "eval", query: "eval(" },
    { slug: "exec", query: "child_process.exec" },
    { slug: "secret", query: "SECRET" }
  ];
  for (const s of codeSearchByType) {
    const suffix = s.name.replace(/^code_search_/, "");
    for (const k of keywordChecks) {
      const toolName = `code_find_${k.slug}_${suffix}`;
      addGeneratedTool({
        name: toolName,
        version: "1.0.0",
        tags: ["fs", "search", "code"],
        inputSchema: { type: "object", properties: { path: { type: "string" }, exclude: { type: "string" } }, required: [] },
        outputSchema: { type: "object", properties: { matches: { type: "array", items: { type: "string" } }, count: { type: "number" }, truncated: { type: "boolean" } } },
        permissions: ["read"],
        sideEffects: [],
        rateLimitPerMinute: 120,
        auditFields: [],
        mockSupported: true,
        async execute(input) {
          const searchPath = String(input?.path ?? ".");
          const exclude = String(input?.exclude ?? "");
          return executeTool("grep_search", { query: k.query, path: searchPath, include: s.include, exclude });
        }
      });
    }
  }
}
addPhase2AndCoreDevTools();
addBulkToolPackToReach200();
if (tools.length < TARGET_TOOL_COUNT) {
  tools.push(...generatedTools.slice(0, Math.max(0, TARGET_TOOL_COUNT - tools.length)));
}
var enableNoopTools = process.env.ENABLE_NOOP_TOOLS === "1" || process.env.ENABLE_NOOP_TOOLS === "true";
if (enableNoopTools) {
  const remaining = Math.max(0, TARGET_TOOL_COUNT - tools.length);
  for (let i = 1; i <= remaining; i++) {
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
      const reqHeaders = { ...headers };
      const sessionId = typeof input?.sessionId === "string" ? String(input.sessionId).trim() : "";
      if (sessionId) {
        try {
          const { getSessionSecret: getSessionSecret2 } = await Promise.resolve().then(() => (init_secrets(), secrets_exports));
          if (!reqHeaders.Authorization && !reqHeaders.authorization) {
            const token = getSessionSecret2(sessionId, "HTTP_BEARER_TOKEN") || "";
            if (token) reqHeaders.Authorization = `Bearer ${token}`;
          }
        } catch {
        }
      }
      let reqBody = void 0;
      if (typeof input?.body === "string") reqBody = input.body;
      else if (input?.json && typeof input.json === "object") {
        reqBody = JSON.stringify(input.json);
        if (!reqHeaders["Content-Type"]) reqHeaders["Content-Type"] = "application/json";
      }
      const resp = await fetch(url, { method, headers: reqHeaders, body: reqBody });
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
      const renderRequested = input?.render === true;
      const parseHtml = (rawHtml, baseUrl) => {
        const html2 = String(rawHtml || "");
        const tMatch = html2.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = tMatch ? String(tMatch[1]).trim() : "";
        const mMatch = html2.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i) || html2.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i);
        const metaDescription = mMatch ? String(mMatch[1]).trim() : "";
        const headings = [];
        const hRegex = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
        let hm;
        while (hm = hRegex.exec(html2)) {
          const txt = String(hm[2]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          if (txt) headings.push(txt);
        }
        const links = [];
        const aRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let am;
        while (am = aRegex.exec(html2)) {
          const hrefRaw = String(am[1]).trim();
          const txt = String(am[2]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          if (!hrefRaw || !txt) continue;
          let abs = hrefRaw;
          try {
            abs = new URL(hrefRaw, baseUrl).toString();
          } catch {
          }
          links.push({ text: txt.slice(0, 160), url: abs });
        }
        const textSnippet = html2.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1200);
        return { title, metaDescription, headings: headings.slice(0, 12), links: links.slice(0, 12), textSnippet };
      };
      const renderWithPuppeteer = async (targetUrl) => {
        const puppeteer = await import("puppeteer");
        const browser = await puppeteer.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        });
        try {
          const page = await browser.newPage();
          await page.setRequestInterception(true);
          page.on("request", (req) => {
            const type = req.resourceType();
            if (["image", "stylesheet", "font", "media"].includes(type)) req.abort();
            else req.continue();
          });
          await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 2e4 });
          const finalUrl2 = page.url();
          const html2 = await page.content();
          return { html: html2, finalUrl: finalUrl2 };
        } finally {
          try {
            await browser.close();
          } catch {
          }
        }
      };
      let html = "";
      let finalUrl = url;
      let rendered = false;
      if (renderRequested) {
        const out = await renderWithPuppeteer(url);
        html = out.html;
        finalUrl = out.finalUrl;
        rendered = true;
        logs.push("html_extract.rendered=1");
      } else {
        const resp = await fetch(url);
        finalUrl = resp?.url ? String(resp.url) : url;
        logs.push(`fetch.status=${resp.status}`);
        html = await resp.text();
      }
      let parsed = parseHtml(html, finalUrl);
      const weak = !rendered && String(parsed.title || "").trim().length === 0 && String(parsed.textSnippet || "").trim().length < 80 && (parsed.headings?.length || 0) === 0;
      if (weak) {
        try {
          const out = await renderWithPuppeteer(url);
          html = out.html;
          finalUrl = out.finalUrl;
          rendered = true;
          logs.push("html_extract.auto_rendered=1");
          parsed = parseHtml(html, finalUrl);
        } catch (e) {
          logs.push(`html_extract.auto_render_failed=${String(e?.message || e)}`);
        }
      }
      return { ok: true, output: { ...parsed, url: finalUrl, rendered }, logs };
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
      const path5 = String(input?.path ?? "");
      const norm = path5.replace(/\[(\d+)\]/g, ".$1");
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
      const apiKey2 = process.env.OPENAI_API_KEY;
      let searchQueries = [topic];
      if (apiKey2) {
        try {
          const { default: OpenAI4 } = await import("openai");
          const client = new OpenAI4({ apiKey: apiKey2, baseURL: process.env.OPENAI_BASE_URL });
          const planCompletion = await client.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: 'You are a Senior Research Planner. Breakdown the user topic into 3-5 distinct, targeted web search queries to gather comprehensive information. Return ONLY a JSON array of strings, e.g. ["query1", "query2"].'
              },
              { role: "user", content: `Topic: ${topic}` }
            ],
            response_format: { type: "json_object" }
          });
          const planText = planCompletion.choices[0].message.content || "{}";
          const planJson = JSON.parse(planText);
          if (Array.isArray(planJson.queries)) {
            searchQueries = planJson.queries.slice(0, 5);
          } else if (Array.isArray(planJson)) {
            searchQueries = planJson.slice(0, 5);
          }
          logs2.push(`research.plan=${searchQueries.join("|")}`);
        } catch (e) {
          logs2.push(`planning_failed=${e.message}`);
        }
      }
      const allResults = [];
      const searchPromises = searchQueries.map((q) => executeTool("web_search", { query: q }));
      const searchOutcomes = await Promise.all(searchPromises);
      for (const res of searchOutcomes) {
        if (res.ok && Array.isArray(res.output?.results)) {
          allResults.push(...res.output.results);
        }
      }
      if (allResults.length === 0) {
        return { ok: false, error: "No search results found for any query", logs: logs2 };
      }
      const uniqueResults = /* @__PURE__ */ new Map();
      for (const r of allResults) {
        if (!uniqueResults.has(r.url)) uniqueResults.set(r.url, r);
      }
      const topResults = Array.from(uniqueResults.values()).slice(0, 8);
      logs2.push(`research.sources_found=${topResults.length}`);
      const contents = [];
      const chunkSize = 4;
      for (let i = 0; i < topResults.length; i += chunkSize) {
        const chunk = topResults.slice(i, i + chunkSize);
        await Promise.all(chunk.map(async (res) => {
          try {
            const ext = await executeTool("html_extract", { url: res.url });
            if (ext.ok && ext.output?.textSnippet) {
              contents.push(`Source: ${res.title} (${res.url})
Content: ${ext.output.textSnippet}
`);
            }
          } catch (e) {
          }
        }));
      }
      if (contents.length === 0) {
        return { ok: false, error: "Failed to extract content from sources", logs: logs2 };
      }
      if (!apiKey2) {
        return {
          ok: true,
          output: {
            report: `## Research Results for ${topic}

${contents.join("\n\n")}`,
            sources: topResults.map((r) => r.url)
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
              content: `You are an Elite Research Assistant. Your goal is to produce a definitive, comprehensive report on the topic.
Instructions:
1. Synthesize information from multiple sources.
2. Resolve conflicts if any.
3. Structure with clear headings, bullet points, and sections.
4. Cite sources using [1], [2] notation and provide a reference list at the end.
5. If the topic or sources are in Arabic, write the report in Arabic.
6. Be objective, detailed, and professional.`
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
            sources: topResults.map((r) => r.url)
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
      let results = [];
      const q = query;
      const norm = q.toLowerCase();
      const candidates = [];
      const pushCandidate = (code, idx) => {
        if (idx < 0) return;
        const upper = code.toUpperCase();
        if (!/^[A-Z]{3}$/.test(upper)) return;
        if (candidates.some((c) => c.code === upper)) return;
        candidates.push({ code: upper, idx });
      };
      const isoMatches = q.match(/\b[A-Z]{3}\b/gi) || [];
      for (const m of isoMatches) {
        pushCandidate(m.toUpperCase(), q.toUpperCase().indexOf(m.toUpperCase()));
      }
      const aliasRules = [
        { re: /\b(usd|u\.s\.?\s*dollars?)\b/i, code: "USD" },
        { re: /\b(try)\b/i, code: "TRY" },
        { re: /\b(jod)\b/i, code: "JOD" },
        { re: /\b(ils)\b/i, code: "ILS" },
        { re: /\b(egp)\b/i, code: "EGP" },
        { re: /\b(sar)\b/i, code: "SAR" },
        { re: /\b(aed)\b/i, code: "AED" },
        { re: /\b(eur)\b/i, code: "EUR" },
        { re: /\b(gbp)\b/i, code: "GBP" },
        { re: /\b(cad)\b/i, code: "CAD" },
        { re: /\b(jpy)\b/i, code: "JPY" },
        { re: /\b(cny)\b/i, code: "CNY" },
        { re: /(دولار|الدولار)/i, code: "USD" },
        { re: /(الليرة التركية|ليرة تركية|التركية)/i, code: "TRY" },
        { re: /(الدينار الأردني|دينار أردني|الأردني)/i, code: "JOD" },
        { re: /(الشيكل|شيكل|₪)/i, code: "ILS" },
        { re: /(اليورو)/i, code: "EUR" },
        { re: /(الجنيه الإسترليني|الجنيه الاسترليني|إسترليني)/i, code: "GBP" },
        { re: /(الريال السعودي|ريال سعودي)/i, code: "SAR" },
        { re: /(الدرهم الإماراتي|درهم إماراتي|الدرهم الاماراتي)/i, code: "AED" },
        { re: /(الجنيه المصري|جنيه مصري)/i, code: "EGP" }
      ];
      for (const r of aliasRules) {
        pushCandidate(r.code, norm.search(r.re));
      }
      candidates.sort((a, b) => a.idx - b.idx);
      const codeA = candidates[0]?.code;
      const codeB = candidates[1]?.code;
      const looksLikeFx = /(\bto\b|\/|->|=|مقابل|تحويل|سعر|كم|يساوي)/i.test(q) && !!codeA && !!codeB && codeA !== codeB;
      if (looksLikeFx) {
        const base = codeA;
        const quote = codeB;
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3500);
          const resp = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, { signal: controller.signal });
          clearTimeout(timeout);
          if (resp.ok) {
            const j = await resp.json().catch(() => null);
            const rate = j?.rates?.[quote];
            if (typeof rate === "number" && Number.isFinite(rate)) {
              const updated = typeof j?.time_last_update_utc === "string" ? j.time_last_update_utc : "";
              const desc = `**ANSWER**: 1 ${base} = ${rate} ${quote}${updated ? ` (updated: ${updated})` : ""}`;
              results.push({ title: "Currency Rate (API)", url: `https://open.er-api.com/v6/latest/${base}`, description: desc });
              logs2.push(`fx.api=1 base=${base} quote=${quote}`);
              logs2.push(`search.final_count=${results.length}`);
              return { ok: true, output: { results }, logs: logs2 };
            }
          }
        } catch (e) {
          logs2.push(`fx.api_failed=${String(e?.message || e)}`);
        }
      }
      try {
        const puppeteer = await import("puppeteer");
        const browser = await puppeteer.launch({
          headless: true,
          // Use boolean true for stability
          args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
        });
        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36");
        await page.setRequestInterception(true);
        page.on("request", (req) => {
          const type = req.resourceType();
          if (["image", "stylesheet", "font", "media"].includes(type)) req.abort();
          else req.continue();
        });
        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&hl=ar`, { waitUntil: "domcontentloaded", timeout: 15e3 });
        try {
          await page.waitForSelector("#search", { timeout: 3e3 });
        } catch {
        }
        const title = await page.title();
        logs2.push(`google.title=${title}`);
        if (title.includes("Consent") || title.includes("Before you continue") || title.includes("Google") && !title.includes(" - ")) {
          try {
            const buttons = await page.$$("button");
            for (const btn of buttons) {
              const text = await page.evaluate((el) => el.textContent, btn);
              if (text && (text.includes("Reject all") || text.includes("\u0631\u0641\u0636 \u0627\u0644\u0643\u0644") || text.includes("I agree") || text.includes("\u0623\u0648\u0627\u0641\u0642"))) {
                await btn.click();
                await page.waitForNavigation({ waitUntil: "domcontentloaded" });
                break;
              }
            }
          } catch {
          }
        }
        const googleResults = await page.evaluate(() => {
          const items = [];
          const currencyValue = document.querySelector(".DFlfde.SwHCTb");
          const currencySource = document.querySelector(".vLqKYe");
          const currencyTarget = document.querySelector(".MWvIVe");
          if (currencyValue && currencySource) {
            items.push({
              title: "Currency Rate (Direct)",
              url: "https://www.google.com",
              description: `**ANSWER**: ${currencySource.textContent} ${currencyValue.textContent} ${currencyTarget?.textContent || ""}`
            });
          }
          const snippetEl = document.querySelector(".hgKElc") || document.querySelector(".kno-rdesc span");
          if (snippetEl && snippetEl.textContent) {
            items.push({
              title: "Direct Answer",
              url: "https://www.google.com",
              description: `**ANSWER**: ${snippetEl.textContent.trim()}`
            });
          }
          const results2 = document.querySelectorAll("#search .g");
          results2.forEach((div) => {
            const titleEl = div.querySelector("h3");
            const linkEl = div.querySelector("a");
            const descEl = div.querySelector(".VwiC3b") || div.querySelector(".IsZvec") || div.querySelector(".st");
            if (titleEl && linkEl) {
              items.push({
                title: titleEl.textContent?.trim(),
                url: linkEl.href,
                description: descEl?.textContent?.trim() || ""
              });
            }
          });
          if (items.length < 3) {
            const h3s = Array.from(document.querySelectorAll("#search a h3"));
            for (const h3 of h3s) {
              const a = h3.closest("a");
              if (!a?.href) continue;
              const title2 = (h3.textContent || "").trim();
              if (!title2) continue;
              let desc = "";
              const container = a.closest("div");
              if (container) {
                const t = container.textContent || "";
                desc = t.replace(title2, "").replace(/\s+/g, " ").trim().slice(0, 220);
              }
              items.push({ title: title2, url: a.href, description: desc });
              if (items.length >= 10) break;
            }
          }
          return items;
        });
        await browser.close();
        if (googleResults.length > 0) {
          results.push(...googleResults);
          logs2.push(`google.success=${googleResults.length}`);
        } else {
          throw new Error("No Google results found");
        }
      } catch (err) {
        logs2.push(`google.failed=${err.message}. Switching to fallback...`);
        try {
          const officialUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2e3);
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
          } catch {
          }
          if (results.length < 2) {
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
                const trySearch = async (q2) => {
                  try {
                    const wurl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q2)}&format=json&srlimit=5`;
                    const r = await fetch(wurl);
                    if (!r.ok) return [];
                    const j = await r.json();
                    return (j.query?.search || []).map((it) => ({
                      title: String(it.title),
                      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(it.title.replace(/\s+/g, "_"))}`,
                      description: String(it.snippet).replace(/<[^>]+>/g, "")
                    }));
                  } catch {
                    return [];
                  }
                };
                return await trySearch(query);
              })()
            ]);
            if (scrapeRes.status === "fulfilled") results.push(...scrapeRes.value);
            if (wikiRes.status === "fulfilled") results.push(...wikiRes.value);
          }
        } catch (fallbackErr) {
          logs2.push(`fallback.failed=${fallbackErr.message}`);
        }
      }
      const unique = /* @__PURE__ */ new Map();
      for (const r of results) {
        if (r.title.includes("Direct Answer")) {
          unique.set("direct_" + Math.random(), r);
        } else {
          if (!unique.has(r.url)) unique.set(r.url, r);
        }
      }
      const final = Array.from(unique.values()).slice(0, 10);
      logs2.push(`search.final_count=${final.length}`);
      if (final.length === 0) {
        return { ok: false, error: "No results found in Google or Fallbacks", logs: logs2 };
      }
      return { ok: true, output: { results: final }, logs: logs2 };
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
      let askpassDir = "";
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
        const env = {};
        const sessionId = typeof input?.sessionId === "string" ? String(input.sessionId).trim() : "";
        const wantsAuth = ["push", "fetch", "pull", "clone"].includes(op);
        let askpassPath = "";
        if (wantsAuth && sessionId) {
          try {
            const { getSessionSecret: getSessionSecret2 } = await Promise.resolve().then(() => (init_secrets(), secrets_exports));
            const token = getSessionSecret2(sessionId, "GITHUB_TOKEN") || "";
            if (token) {
              const fs8 = await import("fs");
              const os3 = await import("os");
              const path5 = await import("path");
              askpassDir = await fs8.promises.mkdtemp(path5.join(os3.tmpdir(), "joe-askpass-"));
              askpassPath = path5.join(askpassDir, "askpass.sh");
              const script = `#!/bin/sh
case "$1" in
*Username*) echo "x-access-token";;
*) echo "$JOE_GIT_TOKEN";;
esac
`;
              await fs8.promises.writeFile(askpassPath, script, { mode: 448 });
              env.GIT_ASKPASS = askpassPath;
              env.GIT_TERMINAL_PROMPT = "0";
              env.DISPLAY = "1";
              env.JOE_GIT_TOKEN = token;
            }
          } catch {
          }
        }
        try {
          const { stdout, stderr } = await execAsync(cmd, { cwd: process.cwd(), env: { ...process.env, ...env } });
          logs.push(`git.op=${op} success`);
          return { ok: true, output: { output: stdout || stderr }, logs };
        } finally {
          if (askpassDir) {
            try {
              const fs8 = await import("fs");
              await fs8.promises.rm(askpassDir, { recursive: true, force: true });
            } catch {
            }
          }
        }
      } catch (e) {
        if (askpassDir) {
          try {
            const fs8 = await import("fs");
            await fs8.promises.rm(askpassDir, { recursive: true, force: true });
          } catch {
          }
        }
        return { ok: false, error: e.message || e.stderr, logs };
      }
    }
    if (name === "github_create_repo") {
      const repoName = String(input?.name || "").trim();
      const isPrivate = Boolean(input?.private);
      const description = typeof input?.description === "string" ? input.description : void 0;
      const sessionId = typeof input?.sessionId === "string" ? String(input.sessionId).trim() : "";
      if (!repoName) return { ok: false, error: "Missing repo name", logs };
      if (!sessionId) return { ok: false, error: "Missing sessionId", logs };
      const { getSessionSecret: getSessionSecret2 } = await Promise.resolve().then(() => (init_secrets(), secrets_exports));
      const token = (getSessionSecret2(sessionId, "GITHUB_TOKEN") || "").trim();
      if (!token) return { ok: false, error: "Missing GitHub token", logs };
      const payload = { name: repoName, private: isPrivate };
      if (description && description.trim()) payload.description = description.trim();
      try {
        const resp = await fetch("https://api.github.com/user/repos", {
          method: "POST",
          headers: {
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "JOE AI",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
        const text = await resp.text();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
        }
        if (!resp.ok) {
          const msg = typeof json?.message === "string" ? json.message : text.slice(0, 300);
          return { ok: false, error: `GitHub API ${resp.status}: ${msg}`, logs };
        }
        return {
          ok: true,
          output: {
            fullName: typeof json?.full_name === "string" ? json.full_name : "",
            htmlUrl: typeof json?.html_url === "string" ? json.html_url : "",
            apiUrl: typeof json?.url === "string" ? json.url : ""
          },
          logs
        };
      } catch (e) {
        return { ok: false, error: e?.message || String(e), logs };
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
      const logs2 = [];
      if (!import_fs2.default.existsSync(root)) return { ok: false, error: "Path not found", logs: logs2 };
      logs2.push(`analyze.root=${root}`);
      const getStructure = (dir, depth) => {
        if (depth > 3) return [];
        try {
          const items = import_fs2.default.readdirSync(dir, { withFileTypes: true });
          let res = [];
          for (const item of items) {
            if (item.name.startsWith(".") || item.name === "node_modules" || item.name === "dist" || item.name === "build" || item.name === "coverage") continue;
            if (item.isDirectory()) {
              res.push(`${item.name}/`);
              const subs = getStructure(import_path2.default.join(dir, item.name), depth + 1);
              res = res.concat(subs.map((s) => `${item.name}/${s}`));
            } else {
              res.push(item.name);
            }
          }
          return res;
        } catch {
          return [];
        }
      };
      const allFiles = getStructure(root, 0);
      const structure = allFiles.filter((f) => !f.includes("test/") && !f.includes("__tests__/")).slice(0, 60).join("\n");
      const keyFiles = ["package.json", "README.md", "tsconfig.json", "Dockerfile", "docker-compose.yml", "go.mod", "requirements.txt", "Cargo.toml", "Gemfile", "pyproject.toml"];
      const fileContents = [];
      for (const kf of keyFiles) {
        const kp = import_path2.default.join(root, kf);
        if (import_fs2.default.existsSync(kp)) {
          const content = import_fs2.default.readFileSync(kp, "utf-8");
          if (kf === "package.json") {
            try {
              const pkg = JSON.parse(content);
              const slim = { name: pkg.name, version: pkg.version, scripts: pkg.scripts, dependencies: pkg.dependencies, devDependencies: pkg.devDependencies };
              fileContents.push(`=== ${kf} ===
${JSON.stringify(slim, null, 2)}
`);
            } catch {
              fileContents.push(`=== ${kf} ===
${content.slice(0, 1e3)}
`);
            }
          } else {
            fileContents.push(`=== ${kf} ===
${content.slice(0, 1500)}
`);
          }
        }
      }
      const sourceFiles = allFiles.filter((f) => /^(src\/|app\/|lib\/)?(index|main|server|app|root)\.(ts|js|py|go|rb|java)$/.test(f)).slice(0, 2);
      for (const sf of sourceFiles) {
        const sp = import_path2.default.join(root, sf);
        if (import_fs2.default.existsSync(sp)) {
          const content = import_fs2.default.readFileSync(sp, "utf-8").slice(0, 1e3);
          fileContents.push(`=== ${sf} ===
${content}
`);
        }
      }
      const contextPath = import_path2.default.join(root, ".joe/context.json");
      if (import_fs2.default.existsSync(contextPath)) {
        fileContents.push(`=== .joe/context.json ===
${import_fs2.default.readFileSync(contextPath, "utf-8").slice(0, 1e3)}
`);
      }
      const apiKey2 = process.env.OPENAI_API_KEY;
      if (!apiKey2) {
        return { ok: true, output: { summary: `## File Structure
${structure}

## Key Files Found
${fileContents.map((f) => f.split("\n")[0]).join("\n")}` }, logs: logs2 };
      }
      try {
        const { default: OpenAI4 } = await import("openai");
        const client = new OpenAI4({ apiKey: apiKey2, baseURL: process.env.OPENAI_BASE_URL });
        const completion = await client.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: "You are a Senior Software Architect. Analyze the provided codebase context and generate a high-level architectural summary. Focus on: Tech Stack, Key Components, Entry Points, and Project Structure. Be concise." },
            { role: "user", content: `File Structure (partial):
${structure}

Key File Contents:
${fileContents.join("\n")}` }
          ]
        });
        const summary = completion.choices[0].message.content || "Analysis failed";
        return { ok: true, output: { summary }, logs: logs2 };
      } catch (e) {
        logs2.push(`analyze.llm_error=${e.message}`);
        return { ok: true, output: { summary: `## File Structure
${structure}

## Key Files Found
${fileContents.map((f) => f.split("\n")[0]).join("\n")}
(LLM Analysis Failed: ${e.message})` }, logs: logs2 };
      }
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
var folders = [];
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
  listFolders() {
    return folders.slice().sort((a, b) => a.createdAt - b.createdAt);
  },
  createFolder(name) {
    const id = nextId("fold_", folders.length + 1);
    const now = Date.now();
    const f = { _id: id, name, createdAt: now, updatedAt: now };
    folders.push(f);
    return f;
  },
  updateFolder(id, patch) {
    const f = folders.find((x) => x._id === id);
    if (!f) return null;
    if (typeof patch.name === "string") f.name = patch.name;
    f.updatedAt = Date.now();
    return f;
  },
  deleteFolder(id) {
    const idx = folders.findIndex((x) => x._id === id);
    if (idx !== -1) folders.splice(idx, 1);
    return true;
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
    const existing = sessions.find((s2) => s2.title === title && (s2.kind || "chat") === kind);
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
var BASE_SYSTEM_PROMPT = `You are Joe, an elite AI autonomous engineer. You are a "Reasoning Engine" capable of complex problem-solving, planning, and execution without human intervention.

## CORE PHILOSOPHY:
1. **Intelligence over Speed**: Do not rush. Analyze the problem deeply before acting.
2. **Precision over Guesswork**: Never guess. Use tools to verify every assumption.
3. **Comprehensive Execution**: Do not stop at the first step. Plan the full arc of the solution.

## THE "THINK-PLAN-ACT" PROTOCOL (MANDATORY):
Before *every* single tool call, you must go through this internal cycle:
1. **THINK**: What did the user *really* ask? What context do I have? What is missing?
2. **PLAN**: What is the most efficient sequence of tools to solve this? 
   - *Example*: User asks "Fix the bug". Plan: 1. Read files -> 2. Reproduce bug -> 3. Fix code -> 4. Verify fix.
3. **ACT**: Execute the next step in the plan using the correct tool.

## TOOL USAGE & STRATEGY:
- **web_search**: 
   - **Do not** search for generic terms like "error" or "help". 
   - **Do** construct "Targeted Queries" combining: [Technology Name] + [Error Message] + [Context].
   - **Iterate**: If the first search fails, refine the query and try again.
- **deep_research**: 
   - Use this for ANY request involving "analysis", "report", "learning", or "comprehensive view".
   - It is your "Heavy Lifter" for information gathering.
- **file_read / grep_search**:
   - Always map the territory before coding. Read \`package.json\`, structure, and relevant files first.
- **browser_open**:
   - Use strictly for verification, live testing, or up-to-date documentation.

## CRITICAL INSTRUCTIONS:
1. **Direct & Concise Answers**:
   - If the user asks for a specific fact (e.g., "Current USD rate", "Weather in Dubai", "Time in Tokyo"):
     1) Use **web_search** with a precise query (e.g., "USD to TRY rate today", "current weather Dubai").
     2) **Trust the search result**: If the search returns a snippet with the answer, report it IMMEDIATELY and CONCISELY.
     3) **Do not hedge**: Avoid saying "I cannot verify". If the search says "34.50", say "The rate is 34.50".
     4) **Format**: "The current price of [Currency A] against [Currency B] is [Value]."

2. **Smart Internet Answers**:
   - For broader topics:
     1) Use **web_search** with a precise query.
     2) Select the best 1\u20132 results and fetch context using **html_extract** (preferred) or **http_fetch**.
     3) **SYNTHESIZE**: Combine the information into a single, coherent, accurate answer.
   - **Deep Analysis**: If the user asks for a "report", "analysis", "comprehensive view", or "research", use **deep_research** immediately.
   - Always put the final answer in **echo**. Never respond with raw search results, long page dumps, or a list of links as the final answer.
   - Include 1\u20133 source URLs in the final answer when you used internet tools.

2. **Real-time Awareness**: 
   - You have access to the current system time and date in the context. Use it confidently to answer questions like "what time is it?" or "what is today?". Do NOT apologize for not knowing the time; you DO know it.

3. **Conversational Queries**: 
   - If the user greets you or asks personal questions (e.g. "how are you"), **reply naturally with text only**. Do NOT use any tools.
   - **Identity**: If asked "who are you", reply that you are Joe, an elite AI autonomous engineer. **NEVER** search for "who are you".

4. **Language Protocol**: 
   - **Input**: Understand any language.
   - **Output**: **STRICTLY FOLLOW THE USER'S LANGUAGE**. If the user asks in Arabic, you MUST reply in "Eloquent & Engaging Arabic" (\u0644\u063A\u0629 \u0639\u0631\u0628\u064A\u0629 \u0641\u0635\u062D\u0649 \u0633\u0644\u0633\u0629 \u0648\u062C\u0645\u064A\u0644\u0629).
   - **Translation**: Never give a "machine translation" vibe. Use natural, professional phrasing.

## ADVANCED REASONING & QUALITY CONTROL:
- **Analyze First**: Before choosing a tool, dissect the user's request. What is the *real* goal?
- **Precision Search**: When using \`web_search\`, use specific keywords. Don't just paste the user's entire sentence.
- **Verify & Filter**: If \`web_search\` returns irrelevant results, DO NOT just dump them. Try a different query.
- **Code Intelligence**: When writing code, always check \`package.json\` or directory structure first to understand the environment.
- **Self-Correction**: If you encounter an error, pause and think. Do not loop the same error.

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
var getSystemPrompt = () => {
  const now = /* @__PURE__ */ new Date();
  const date = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
  return BASE_SYSTEM_PROMPT + `

Today's Date: ${date}
Current Time: ${time}`;
};
var SYSTEM_PROMPT = BASE_SYSTEM_PROMPT;
async function planNextStep(messages2, options) {
  let client = openai;
  if (options?.apiKey) {
    client = new import_openai.default({
      apiKey: options.apiKey,
      baseURL: options.baseUrl || process.env.OPENAI_BASE_URL
    });
  }
  const shouldMock = !options?.apiKey && !process.env.OPENAI_API_KEY && (options?.mock === true || process.env.MOCK_DB === "1" || process.env.MOCK_DB === "true");
  if (shouldMock) {
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
    const extractQuoted = (s) => {
      const m = s.match(/["“”'`]\s*([^"“”'`]+?)\s*["“”'`]/);
      return m?.[1];
    };
    const writeEn = rawText.match(/write\s+(?:a\s+)?file\s+(?:named|called)\s+([^\s"'`]+)(?:\s+with\s+content\s+(.+))?/i) || rawText.match(/create\s+(?:a\s+)?file\s+(?:named|called)\s+([^\s"'`]+)(?:\s+with\s+content\s+(.+))?/i);
    const writeAr = rawText.match(/(?:اكتب|انشئ|أنشئ|سوي|سوِّ|قم\s+بإنشاء)\s+(?:ملف|فايل)\s*(?:باسم|اسم)\s+([^\s"'`]+)(?:\s+(?:بمحتوى|محتوى)\s+(.+))?/i);
    const write = writeEn || writeAr;
    if (write) {
      const filename = String(write[1] || "verify.txt").trim();
      const tail = String(write[2] || "").trim();
      const quoted = tail ? extractQuoted(tail) : void 0;
      const contentValue = String(quoted || tail || "verified");
      return { name: "file_write", input: { filename, content: contentValue } };
    }
    const readEn = rawText.match(/read\s+(?:the\s+)?file\s+([^\s"'`]+)/i);
    const readAr = rawText.match(/(?:اقرأ|اقراء|اعرض|افتح)\s+(?:ملف|فايل)\s+([^\s"'`]+)/i);
    const read = readEn || readAr;
    if (read) {
      const filename = String(read[1] || "").trim();
      if (filename) return { name: "file_read", input: { filename } };
    }
    const wantsLs = /(?:list|show)\s+files/i.test(rawText) || /(?:ls\b)/i.test(rawText) || /(?:اعرض|اظهر|أظهر)\s+(?:ال)?ملفات/i.test(rawText) || /قائمة\s+الملفات/i.test(rawText);
    if (wantsLs) return { name: "ls", input: { path: "." } };
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
      content: getSystemPrompt()
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
    return null;
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
  return input.replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "sk-[REDACTED]").replace(/\bghp_[A-Za-z0-9_]{10,}\b/g, "ghp_[REDACTED]").replace(/\bgithub_pat_[A-Za-z0-9_]{10,}\b/g, "github_pat_[REDACTED]").replace(/\bBearer\s+[A-Za-z0-9._-]{10,}\b/g, "Bearer [REDACTED]").replace(/([?&]key=)[^&\s]+/gi, "$1[REDACTED]").replace(/\bx-worker-key\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, "x-worker-key:[REDACTED]").replace(/\b(WORKER_API_KEY|BROWSER_WORKER_KEY|JWT_SECRET)\b\s*[:=]\s*[A-Za-z0-9._-]{6,}/gi, "$1=[REDACTED]");
}
function safeErrorMessage(err) {
  const raw = typeof err?.message === "string" ? err.message : String(err);
  return redactSecretsFromString(raw);
}
function isGitAuthError(raw) {
  const s = String(raw || "");
  return /could not read Username/i.test(s) || /could not read Password/i.test(s) || /Authentication failed/i.test(s) || /Support for password authentication was removed/i.test(s) || /Permission denied \(publickey\)/i.test(s) || /fatal:.*could not read/i.test(s);
}
function isGithubAuthError(raw) {
  const s = String(raw || "");
  return /Missing GitHub token/i.test(s) || /Bad credentials/i.test(s) || /Requires authentication/i.test(s) || /\b401\b/.test(s) || /\b403\b/.test(s);
}
function extractRequestedRepoName(raw) {
  const s = String(raw || "");
  const m1 = s.match(/(?:سميه|اسم(?:ه|ها)?|سَمِّه)\s+([A-Za-z0-9._-]{1,100})/i);
  if (m1 && m1[1]) return m1[1].trim();
  const m2 = s.match(/(?:named|name it|call it)\s+([A-Za-z0-9._-]{1,100})/i);
  if (m2 && m2[1]) return m2[1].trim();
  const m3 = s.match(/\brepo(?:sitory)?\b.*?\b([A-Za-z0-9._-]{1,100})\b/i);
  if (m3 && m3[1]) return m3[1].trim();
  return null;
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
function normalizeArabicQuery(input) {
  return String(input || "").toLowerCase().replace(/[\u064B-\u065F\u0670]/g, "").replace(/ـ/g, "").replace(/[أإآ]/g, "\u0627").replace(/ى/g, "\u064A").replace(/ؤ/g, "\u0648").replace(/ئ/g, "\u064A").replace(/ة/g, "\u0647").trim();
}
function isWeatherLikeQuery(text) {
  const t = normalizeArabicQuery(text);
  if (!t) return false;
  if (/(weather|temperature|forecast)/i.test(text)) return true;
  if (/(طقس|درجه|درجة|حراره|الحراره|الجو|الجوّ|الاجواء|توقعات|تنبؤات)/.test(t)) return true;
  if (/كم\s+.*(درجه|درجة|حراره|حرارة)/.test(t)) return true;
  return false;
}
function extractWeatherCity(text) {
  const raw = String(text || "").trim();
  const t = normalizeArabicQuery(raw);
  if (!t) return "Istanbul";
  if (/(istanbul|اسطنبول|اسطنبول|اسطنبول|إسطنبول)/i.test(raw) || /اسطنبول/.test(t)) return "Istanbul";
  const m1 = raw.match(/(?:في|ب|بال)\s*([^\s؟?!.,،؛:]+(?:\s+[^\s؟?!.,،؛:]+){0,2})/);
  const candidate = m1 ? String(m1[1] || "").trim() : "";
  if (candidate) return candidate;
  return "Istanbul";
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
  const systemPromptEventId = `system_prompt:${sessionId}`;
  let systemPromptCreated = false;
  let systemPromptText = null;
  const ev = (e) => broadcast({ ...e, runId });
  try {
    const currentSystemPrompt = getSystemPrompt();
    if (useMock) {
      const hist = store.listMessages(sessionId);
      const already = hist.some((m) => m.role === "system");
      if (!already) {
        store.addMessage(sessionId, "system", currentSystemPrompt, runId);
        systemPromptCreated = true;
        systemPromptText = currentSystemPrompt;
        ev({ type: "text", id: systemPromptEventId, data: currentSystemPrompt });
      }
    } else {
      const existing = await Message.findOne({ sessionId, role: "system" }).select({ _id: 1 }).lean();
      if (!existing) {
        await Message.create({ sessionId, role: "system", content: currentSystemPrompt, runId });
        systemPromptCreated = true;
        systemPromptText = currentSystemPrompt;
        ev({ type: "text", id: systemPromptEventId, data: currentSystemPrompt });
      }
    }
  } catch (e) {
    console.warn("Failed to create system prompt message:", safeErrorMessage(e));
  }
  let previousMessages = [];
  if (sessionId) {
    if (useMock) {
      const hist = store.listMessages(sessionId);
      previousMessages = hist.filter((m) => m.runId !== runId && m.role !== "system").slice(-20).map((m) => ({ role: m.role, content: m.content }));
    } else {
      const docs = await Message.find({ sessionId, runId: { $ne: runId }, role: { $ne: "system" } }).sort({ createdAt: -1 }).limit(20);
      previousMessages = docs.reverse().map((d) => ({ role: d.role, content: d.content }));
    }
  }
  const history = [
    ...previousMessages,
    { role: "user", content: initialContent }
  ];
  ev({ type: "step_started", data: { name: "plan" } });
  let initialPlan = null;
  try {
    initialPlan = await planNextStep(
      history,
      { provider, apiKey: apiKey2, baseUrl, model, mock: useMock }
    );
  } catch (err) {
    console.warn("LLM planning error:", safeErrorMessage(err));
  }
  ev({ type: "step_done", data: { name: "plan", plan: initialPlan } });
  if (useMock) {
    store.addStep(runId, "plan", "done");
  } else {
    try {
      await Run.findByIdAndUpdate(runId, { $push: { steps: { name: "plan", status: "done" } } });
    } catch {
    }
  }
  const persistedUserText = redactSecretsFromString(String(text || ""));
  if (useMock) {
    store.addMessage(sessionId, "user", persistedUserText, runId);
  } else {
    await Message.create({ sessionId, role: "user", content: persistedUserText, runId });
  }
  const risk = detectRisk(String(text || ""));
  if (risk && initialPlan) {
    if (useMock) {
      const ap = store.createApproval(runId, String(text || ""), risk, initialPlan.name, initialPlan.input);
      ev({ type: "approval_required", data: { id: ap.id, runId, risk, action: text } });
      store.updateRun(runId, { status: "blocked" });
      const { planContext: planContext2 } = await Promise.resolve().then(() => (init_context(), context_exports));
      planContext2.set(ap.id, { runId, name: initialPlan.name, input: initialPlan.input });
      return res.json({
        runId,
        sessionId,
        blocked: true,
        approvalId: ap.id,
        ...systemPromptCreated ? { systemPrompt: systemPromptText, systemPromptId: systemPromptEventId } : {}
      });
    } else {
      const ap = await Approval.create({ runId, action: String(text || ""), risk, status: "pending" });
      ev({ type: "approval_required", data: { id: ap._id.toString(), runId, risk, action: text } });
      await Run.findByIdAndUpdate(runId, { $set: { status: "blocked" } });
      const { planContext: planContext2 } = await Promise.resolve().then(() => (init_context(), context_exports));
      planContext2.set(ap._id.toString(), { runId, name: initialPlan.name, input: initialPlan.input });
      return res.json({
        runId,
        sessionId,
        blocked: true,
        approvalId: ap._id.toString(),
        ...systemPromptCreated ? { systemPrompt: systemPromptText, systemPromptId: systemPromptEventId } : {}
      });
    }
  }
  let steps = 0;
  const MAX_STEPS = 50;
  let lastResult = null;
  let forcedText = null;
  let assistantTextEmitted = false;
  let plan = null;
  let pendingPlan = null;
  while (steps < MAX_STEPS) {
    ev({ type: "step_started", data: { name: `thinking_step_${steps + 1}` } });
    if (pendingPlan) {
      plan = pendingPlan;
      pendingPlan = null;
    } else if (steps === 0 && initialPlan) {
      plan = initialPlan;
      initialPlan = null;
    } else {
      try {
        const shouldThrow = Boolean(apiKey2 || provider !== "llm" && provider);
        const isSystemConfigured = !!process.env.OPENAI_API_KEY;
        const throwOnError = !!apiKey2 || provider && provider !== "llm" || isSystemConfigured;
        plan = await planNextStep(history, { provider, apiKey: apiKey2, baseUrl, model, throwOnError, mock: useMock });
      } catch (err) {
        console.warn("LLM planning error:", safeErrorMessage(err));
        if (err?.status === 401 || err?.code === "invalid_api_key" || err?.error?.code === "invalid_api_key") {
          ev({ type: "text", data: "\u26A0\uFE0F **Authentication Failed**: The AI provider rejected the API Key. Please check your settings in the provider menu." });
          forcedText = "Authentication Failed";
          assistantTextEmitted = true;
          break;
        }
        plan = null;
      }
    }
    if (!plan) {
      if (steps === 0) {
        const userTextForOverrides2 = String(text || "");
        const wantsGithubRepo2 = /(github|جيت\s*هاب|جيتهاب|كتهاب|كيتهاب)/i.test(userTextForOverrides2) && /(repo|repository|ريبو|مستودع)/i.test(userTextForOverrides2) && /(create|new|انش(?:ئ|ي)|أنشئ|انشاء|إنشاء)/i.test(userTextForOverrides2);
        if (wantsGithubRepo2) {
          const requested = extractRequestedRepoName(userTextForOverrides2);
          if (requested) {
            plan = {
              name: "github_create_repo",
              input: {
                name: requested,
                private: /(private|خاص)/i.test(userTextForOverrides2),
                sessionId: String(sessionId)
              }
            };
          }
        }
      } else break;
      if (!plan) {
        const msg = !process.env.OPENAI_API_KEY && !apiKey2 ? "\u26A0\uFE0F **No Intelligence Found**\nPlease add your OpenAI or Anthropic API Key in the settings menu to enable Joe AI." : "\u26A0\uFE0F **Connection Error**\nFailed to connect to the AI provider. Please check your internet connection or API key settings.";
        ev({ type: "text", data: msg });
        forcedText = msg;
        assistantTextEmitted = true;
        break;
      }
    }
    const planName = String(plan?.name || "");
    const isBrowserTool = /^browser_/.test(planName);
    const userTextForOverrides = String(text || "");
    const wantsGithubRepo = /(github|جيت\s*هاب|جيتهاب|كتهاب|كيتهاب)/i.test(userTextForOverrides) && /(repo|repository|ريبو|مستودع)/i.test(userTextForOverrides) && /(create|new|انش(?:ئ|ي)|أنشئ|انشاء|إنشاء)/i.test(userTextForOverrides);
    if (wantsGithubRepo) {
      const requested = extractRequestedRepoName(userTextForOverrides);
      if (requested) {
        plan = {
          name: "github_create_repo",
          input: {
            name: requested,
            private: /(private|خاص)/i.test(userTextForOverrides),
            sessionId: String(sessionId)
          }
        };
      }
    }
    if (isBrowserTool) {
      const reqSid = typeof browserSessionId === "string" ? browserSessionId.trim() : "";
      const inputSid = String(plan?.input?.sessionId || "").trim();
      const hasSid = !!(reqSid || inputSid);
      if (!hasSid) {
        const userText = String(text || "");
        if (isWeatherLikeQuery(userText)) {
          const city = extractWeatherCity(userText);
          plan = {
            name: "http_fetch",
            input: { url: `https://wttr.in/${encodeURIComponent(city)}?format=j1`, city }
          };
        } else {
          const urlMatch = userText.match(/https?:\/\/[^\s"'<>]+/i);
          const urlFromUser = urlMatch?.[0];
          const urlFromInput = String(plan?.input?.url || "").trim();
          const actions = Array.isArray(plan?.input?.actions) ? plan.input.actions : [];
          const goto = actions.find((a) => String(a?.type || "").toLowerCase() === "goto" && typeof a?.url === "string" && a.url.trim());
          const urlFromActions = goto ? String(goto.url).trim() : "";
          const wantsYoutube = /youtube|يوتيوب/i.test(userText);
          const wantsGithub = /(github|جيتهاب|كتهاب|كيتهاب)/i.test(userText);
          const desiredUrl = (urlFromUser || urlFromInput || urlFromActions || "").trim() || (wantsYoutube ? "https://www.youtube.com" : wantsGithub ? "https://github.com" : "https://www.google.com");
          if (planName !== "browser_open") pendingPlan = plan;
          plan = { name: "browser_open", input: { url: desiredUrl } };
        }
      }
    }
    if (kind === "agent" && String(plan?.name || "") === "browser_open" && typeof browserSessionId === "string" && browserSessionId.trim()) {
      const url = String(plan?.input?.url || "https://www.google.com").trim() || "https://www.google.com";
      plan = {
        name: "browser_run",
        input: {
          sessionId: browserSessionId.trim(),
          actions: [{ type: "goto", url, waitUntil: "domcontentloaded" }]
        }
      };
    }
    if (typeof browserSessionId === "string" && browserSessionId.trim() && ["browser_run", "browser_get_state", "browser_extract"].includes(String(plan?.name || ""))) {
      const input = plan.input;
      if (!input || typeof input !== "object") plan.input = {};
      if (!plan.input.sessionId) plan.input.sessionId = browserSessionId.trim();
    }
    ev({ type: "step_done", data: { name: `thinking_step_${steps + 1}`, plan } });
    if (plan?.name === "browser_run") {
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
          const ap = store.createApproval(runId, actionText, risk2, plan?.name || "", redactToolInputForStorage(plan?.name || "", plan?.input));
          ev({ type: "approval_required", data: { id: ap.id, runId, risk: risk2, action: actionText } });
          store.updateRun(runId, { status: "blocked" });
          const { planContext: planContext2 } = await Promise.resolve().then(() => (init_context(), context_exports));
          planContext2.set(ap.id, { runId, name: plan?.name || "", input: plan?.input });
          return res.json({ runId, blocked: true, approvalId: ap.id });
        } else {
          const ap = await Approval.create({ runId, action: actionText, risk: risk2, status: "pending" });
          ev({ type: "approval_required", data: { id: ap._id.toString(), runId, risk: risk2, action: actionText } });
          await Run.findByIdAndUpdate(runId, { $set: { status: "blocked" } });
          const { planContext: planContext2 } = await Promise.resolve().then(() => (init_context(), context_exports));
          planContext2.set(ap._id.toString(), { runId, name: plan?.name || "", input: plan?.input });
          return res.json({ runId, blocked: true, approvalId: ap._id.toString() });
        }
      }
    }
    if (String(plan?.name || "") === "git_ops") {
      const input = plan.input;
      if (!input || typeof input !== "object") plan.input = {};
      if (!plan.input.sessionId) plan.input.sessionId = String(sessionId);
    }
    if (String(plan?.name || "") === "http_fetch") {
      const input = plan.input;
      if (!input || typeof input !== "object") plan.input = {};
      if (!plan.input.sessionId) plan.input.sessionId = String(sessionId);
    }
    const persistedInput = redactToolInputForStorage(plan?.name || "", plan?.input);
    ev({ type: "step_started", data: { name: `execute:${plan?.name}`, input: persistedInput } });
    const result = await executeTool(plan?.name || "", plan?.input);
    if (result?.ok && plan?.name === "browser_open") {
      const sid = String(result?.output?.sessionId || "").trim();
      if (sid) browserSessionId = sid;
    }
    history.push({
      role: "assistant",
      content: `Tool Call: ${plan?.name}
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
    ev({ type: result.ok ? "step_done" : "step_failed", data: { name: `execute:${plan?.name}`, result } });
    if (!result.ok && plan?.name === "image_generate") {
      const errorMsg = String(result.error || "");
      const logsStr = (result.logs || []).join("\n");
      if (errorMsg.includes("403") || errorMsg.includes("verification") || logsStr.includes("error=403")) {
        const msg = `\u274C **Image Generation Failed**
${errorMsg}

Please verify your OpenAI organization settings or try a different prompt.`;
        forcedText = msg;
        ev({ type: "text", data: msg });
        assistantTextEmitted = true;
        break;
      }
    }
    if (result.ok && plan?.name === "echo") {
      const text2 = result.output?.text;
      if (text2) {
        forcedText = text2;
        ev({ type: "text", data: text2 });
        assistantTextEmitted = true;
      }
    }
    if (result.ok && plan?.name === "image_generate") {
      const href = result.output?.href;
      if (href) {
        forcedText = `\u{1F3A8} Image generated successfully.`;
        ev({ type: "text", data: forcedText });
        assistantTextEmitted = true;
        break;
      }
    }
    if (result.ok && plan?.name === "file_write") {
      const href = result.output?.href;
      const fname = String(plan?.input?.filename || "").trim();
      const msgParts = [];
      msgParts.push(`### \u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0645\u0644\u0641`);
      if (fname) msgParts.push(`- \u0627\u0644\u0627\u0633\u0645: ${fname}`);
      if (href) msgParts.push(`- \u0631\u0627\u0628\u0637 \u0627\u0644\u0645\u0639\u0627\u064A\u0646\u0629: ${href}`);
      const msg = msgParts.join("\n");
      forcedText = msg;
      ev({ type: "text", data: msg });
      assistantTextEmitted = true;
      break;
    }
    if (result.ok && plan?.name === "http_fetch") {
      try {
        const urlStr = String(plan?.input?.url || "");
        const u = new URL(urlStr);
        let base = (u.searchParams.get("base") || "").toUpperCase();
        let sym = (u.searchParams.get("symbols") || u.searchParams.get("sym") || "").toUpperCase();
        if (!base) {
          const m = u.pathname.match(/\/latest\/([A-Z]{3,4})/i);
          if (m) base = m[1].toUpperCase();
        }
        if (!sym && typeof plan?.input?.sym === "string") {
          sym = String(plan?.input?.sym).toUpperCase();
        }
        if (!base && typeof plan?.input?.base === "string") {
          base = String(plan?.input?.base).toUpperCase();
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
          assistantTextEmitted = true;
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
            assistantTextEmitted = true;
          }
          if (useMock) {
            store.addExec(runId, "http_fetch", { url: fbUrl }, fbRes.output, fbRes.ok, fbRes.logs);
          } else {
            await ToolExecution.create({ runId, name: "http_fetch", input: { url: fbUrl }, output: fbRes.output, ok: fbRes.ok, logs: fbRes.logs });
          }
        }
        if (u.hostname.includes("wttr.in")) {
          const city = String(plan?.input?.city || "Istanbul");
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
            assistantTextEmitted = true;
          }
        }
      } catch {
      }
    }
    if (result.ok && plan?.name === "web_search") {
      try {
        const results = Array.isArray(result.output?.results) ? result.output.results : [];
        const top = results && results[0] ? results[0] : null;
        const title = top ? String(top.title || "").trim() : "";
        const url = top ? String(top.url || "").trim() : "";
        if (title || url) {
          ev({ type: "evidence_added", data: { kind: "search", text: `${title}${title && url ? " \u2014 " : ""}${url}` } });
        }
      } catch {
      }
    }
    if (result.ok && plan?.name === "html_extract") {
      try {
        const title = String(result.output?.title || "").trim();
        const url = String(plan?.input?.url || "").trim();
        if (title || url) {
          ev({ type: "evidence_added", data: { kind: "page", text: `${title}${title && url ? " \u2014 " : ""}${url}` } });
        }
      } catch {
      }
    }
    if (useMock) {
      store.addExec(runId, plan?.name || "unknown", persistedInput, result.output, result.ok, result.logs);
    } else {
      await ToolExecution.create({ runId, name: plan?.name || "unknown", input: persistedInput, output: result.output, ok: result.ok, logs: result.logs });
    }
    if (result.ok && String(plan?.name || "") === "http_fetch") {
      const status = Number(result?.output?.status);
      if (status === 401 || status === 403) {
        const urlStr = String(plan?.input?.url || "").trim();
        const msg = [
          `\u26A0\uFE0F \u0627\u0644\u0648\u0635\u0648\u0644 \u0644\u0647\u0630\u0627 \u0627\u0644\u0631\u0627\u0628\u0637 \u064A\u062D\u062A\u0627\u062C \u062A\u0633\u062C\u064A\u0644 \u062F\u062E\u0648\u0644 \u0623\u0648 \u062A\u0648\u0643\u0646.`,
          urlStr ? `- \u0627\u0644\u0631\u0627\u0628\u0637: ${urlStr}` : ``,
          `- \u0627\u0643\u062A\u0628 Bearer Token \u0647\u0646\u0627 \u0641\u064A \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0648\u0623\u0631\u0633\u0644\u0647 \u0643\u0631\u0633\u0627\u0644\u0629 \u0648\u0627\u062D\u062F\u0629.`,
          `- \u0644\u0646 \u064A\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u062A\u0648\u0643\u0646 \u0641\u064A \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0623\u0648 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A.`
        ].filter(Boolean).join("\n");
        ev({ type: "text", data: msg });
        ev({
          type: "secret_required",
          data: {
            sessionId,
            runId,
            provider: "generic",
            key: "HTTP_BEARER_TOKEN",
            label: "Bearer Token",
            reason: `HTTP ${status}`
          }
        });
        const { setPendingTool: setPendingTool2 } = await Promise.resolve().then(() => (init_secrets(), secrets_exports));
        setPendingTool2(String(sessionId), { runId, name: String(plan?.name || ""), input: plan?.input });
        if (useMock) {
          store.updateRun(runId, { status: "blocked" });
        } else {
          try {
            await Run.findByIdAndUpdate(runId, { $set: { status: "blocked" } });
          } catch {
          }
        }
        return res.json({
          runId,
          sessionId,
          blocked: true,
          secretRequired: true,
          secret: { provider: "generic", key: "HTTP_BEARER_TOKEN", label: "Bearer Token" },
          ...systemPromptCreated ? { systemPrompt: systemPromptText, systemPromptId: systemPromptEventId } : {}
        });
      }
    }
    if (!result.ok) {
      const errorMsg = result.error || (result.logs ? result.logs.join("\n") : "Unknown error");
      if (String(plan?.name || "") === "git_ops" && isGitAuthError(errorMsg)) {
        const msg = [
          `\u26A0\uFE0F \u0645\u0637\u0644\u0648\u0628 \u062A\u0633\u062C\u064A\u0644 \u062F\u062E\u0648\u0644 \u0642\u0628\u0644 \u062F\u0641\u0639 \u0627\u0644\u062A\u062D\u062F\u064A\u062B\u0627\u062A \u0625\u0644\u0649 GitHub.`,
          `- \u0627\u0643\u062A\u0628 \u062A\u0648\u0643\u0646 GitHub (Personal Access Token) \u0647\u0646\u0627 \u0641\u064A \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0648\u0623\u0631\u0633\u0644\u0647 \u0643\u0631\u0633\u0627\u0644\u0629 \u0648\u0627\u062D\u062F\u0629.`,
          `- \u0644\u0646 \u064A\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u062A\u0648\u0643\u0646 \u0641\u064A \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0623\u0648 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A.`
        ].join("\n");
        ev({ type: "text", data: msg });
        ev({
          type: "secret_required",
          data: {
            sessionId,
            runId,
            provider: "github",
            key: "GITHUB_TOKEN",
            label: "GitHub Token",
            reason: "git push \u064A\u062D\u062A\u0627\u062C \u0645\u0635\u0627\u062F\u0642\u0629"
          }
        });
        const { setPendingTool: setPendingTool2 } = await Promise.resolve().then(() => (init_secrets(), secrets_exports));
        setPendingTool2(String(sessionId), { runId, name: String(plan?.name || ""), input: plan?.input });
        if (useMock) {
          store.updateRun(runId, { status: "blocked" });
        } else {
          try {
            await Run.findByIdAndUpdate(runId, { $set: { status: "blocked" } });
          } catch {
          }
        }
        return res.json({
          runId,
          sessionId,
          blocked: true,
          secretRequired: true,
          secret: { provider: "github", key: "GITHUB_TOKEN", label: "GitHub Token" },
          ...systemPromptCreated ? { systemPrompt: systemPromptText, systemPromptId: systemPromptEventId } : {}
        });
      }
      if (String(plan?.name || "") === "github_create_repo" && isGithubAuthError(errorMsg)) {
        const msg = [
          `\u26A0\uFE0F \u0645\u0637\u0644\u0648\u0628 \u062A\u0648\u0643\u0646 GitHub \u0644\u0625\u0646\u0634\u0627\u0621 \u0645\u0633\u062A\u0648\u062F\u0639 \u062C\u062F\u064A\u062F \u0639\u0628\u0631 API.`,
          `- \u0627\u0643\u062A\u0628 GitHub Personal Access Token \u0647\u0646\u0627 \u0641\u064A \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0648\u0623\u0631\u0633\u0644\u0647 \u0643\u0631\u0633\u0627\u0644\u0629 \u0648\u0627\u062D\u062F\u0629.`,
          `- \u0644\u0646 \u064A\u062A\u0645 \u062D\u0641\u0638 \u0627\u0644\u062A\u0648\u0643\u0646 \u0641\u064A \u0627\u0644\u0645\u062D\u0627\u062F\u062B\u0629 \u0623\u0648 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A.`
        ].join("\n");
        ev({ type: "text", data: msg });
        ev({
          type: "secret_required",
          data: {
            sessionId,
            runId,
            provider: "github",
            key: "GITHUB_TOKEN",
            label: "GitHub Token",
            reason: "\u0625\u0646\u0634\u0627\u0621 \u0631\u064A\u0628\u0648 \u064A\u062D\u062A\u0627\u062C \u0645\u0635\u0627\u062F\u0642\u0629"
          }
        });
        const { setPendingTool: setPendingTool2 } = await Promise.resolve().then(() => (init_secrets(), secrets_exports));
        setPendingTool2(String(sessionId), { runId, name: String(plan?.name || ""), input: plan?.input });
        if (useMock) {
          store.updateRun(runId, { status: "blocked" });
        } else {
          try {
            await Run.findByIdAndUpdate(runId, { $set: { status: "blocked" } });
          } catch {
          }
        }
        return res.json({
          runId,
          sessionId,
          blocked: true,
          secretRequired: true,
          secret: { provider: "github", key: "GITHUB_TOKEN", label: "GitHub Token" },
          ...systemPromptCreated ? { systemPrompt: systemPromptText, systemPromptId: systemPromptEventId } : {}
        });
      }
      ev({ type: "text", data: `\u26A0\uFE0F **Self-Healing Activated**: Detected error in '${plan?.name}'. Analyzing fix...` });
      history.push({
        role: "assistant",
        content: `Tool '${plan?.name}' FAILED. Error: ${errorMsg}. 
You must analyze this error and attempt to fix the issue in the next step. If it's a syntax error, correct it. If it's a missing file or dependency, resolve it.`
      });
    } else {
      history.push({ role: "assistant", content: `Tool '${plan?.name}' executed. Result: ${JSON.stringify(result.output)}` });
    }
    steps++;
    if (plan?.name === "echo") {
      forcedText = String(plan?.input?.text || "");
      break;
    }
  }
  const finalContent = forcedText || (lastResult?.output ? JSON.stringify(lastResult.output) : "No output");
  if (!assistantTextEmitted) {
    ev({ type: "text", data: finalContent });
  }
  ev({ type: "run_completed", data: { runId, result: lastResult } });
  ev({ type: "run_finished", data: { runId, status: "done" } });
  if (useMock) {
    store.addMessage(sessionId, "assistant", finalContent, runId);
    store.updateRun(runId, { status: "done" });
  } else {
    await Message.create({ sessionId, role: "assistant", content: finalContent, runId });
    await Run.findByIdAndUpdate(runId, { $set: { status: "done" } });
  }
  return res.json({
    runId,
    sessionId,
    status: "done",
    ...systemPromptCreated ? { systemPrompt: systemPromptText, systemPromptId: systemPromptEventId } : {}
  });
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
init_secrets();
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
router5.post("/:id/secrets", authenticate, async (req, res) => {
  const sessionId = String(req.params.id || "").trim();
  const key = String(req.body?.key || "").trim();
  const value = typeof req.body?.value === "string" ? req.body.value : String(req.body?.value ?? "");
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });
  if (!key) return res.status(400).json({ error: "Missing key" });
  if (!value) return res.status(400).json({ error: "Missing value" });
  if (value.length > 8e3) return res.status(400).json({ error: "Value too large" });
  setSessionSecret(sessionId, key, value);
  const pending = popPendingTool(sessionId);
  if (!pending) return res.json({ ok: true });
  if (useMock) {
    store.updateRun(pending.runId, { status: "running" });
  } else {
    try {
      await Run.findByIdAndUpdate(pending.runId, { $set: { status: "running" } });
    } catch {
    }
  }
  broadcast({ type: "step_started", runId: pending.runId, data: { name: `execute:${pending.name}`, input: pending.input } });
  const result = await executeTool(pending.name, pending.input);
  broadcast({ type: result.ok ? "step_done" : "step_failed", runId: pending.runId, data: { name: `execute:${pending.name}`, result } });
  const toText = (r) => {
    const outStr = typeof r?.output?.output === "string" ? r.output.output : typeof r?.output?.text === "string" ? r.output.text : r?.output != null ? JSON.stringify(r.output) : "";
    if (r?.ok) return outStr || "\u062A\u0645 \u0627\u0644\u062A\u0646\u0641\u064A\u0630 \u0628\u0646\u062C\u0627\u062D.";
    const errStr = typeof r?.error === "string" ? r.error : Array.isArray(r?.logs) ? r.logs.join("\n") : "\u0641\u0634\u0644 \u0627\u0644\u062A\u0646\u0641\u064A\u0630.";
    return `\u0641\u0634\u0644 \u0627\u0644\u062A\u0646\u0641\u064A\u0630: ${errStr}`;
  };
  const assistantText = toText(result);
  broadcast({ type: "text", runId: pending.runId, data: assistantText });
  if (useMock) {
    store.addExec(pending.runId, pending.name, pending.input, result.output, result.ok, result.logs);
    store.addMessage(sessionId, "assistant", assistantText, pending.runId);
  } else {
    try {
      await ToolExecution.create({
        runId: pending.runId,
        name: pending.name || "unknown",
        input: pending.input,
        output: result.output,
        ok: result.ok,
        logs: result.logs
      });
    } catch {
    }
    try {
      await Message.create({ sessionId, role: "assistant", content: assistantText, runId: pending.runId });
    } catch {
    }
  }
  if (useMock) {
    store.updateRun(pending.runId, { status: result.ok ? "done" : "failed" });
  } else {
    try {
      await Run.findByIdAndUpdate(pending.runId, { $set: { status: result.ok ? "done" : "failed" } });
    } catch {
    }
  }
  broadcast({ type: "run_finished", runId: pending.runId, data: { runId: pending.runId, ok: result.ok } });
  return res.json({ ok: true, resumed: true, result });
});
router5.get("/:id/messages", authenticate, async (req, res) => {
  const { id } = req.params;
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  try {
    if (useMock) {
      const messages3 = store.listMessages(id).filter((m) => m.role !== "system");
      return res.json({ messages: messages3 });
    }
    const messages2 = await Message.find({ sessionId: id, role: { $ne: "system" } }).sort({ createdAt: 1 }).lean();
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
      recentMessages = store.listMessages(id).filter((m) => m.role !== "system").slice(-10);
    } else {
      const sumDoc = await Summary.findOne({ sessionId: id });
      summary = sumDoc?.content || "";
      recentMessages = await Message.find({ sessionId: id, role: { $ne: "system" } }).sort({ createdAt: -1 }).limit(10).lean();
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
    content: { $regex: query, $options: "i" },
    role: { $ne: "system" }
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
    const msgs = store.listMessages(id).filter((m) => m.role !== "system");
    const events = msgs.map((m) => ({
      type: m.role === "user" ? "user_input" : "text",
      data: m.content,
      ts: m.ts
    }));
    return res.json({ events });
  }
  try {
    const msgs = await Message.find({ sessionId: id, role: { $ne: "system" } }).sort({ createdAt: 1 }).lean();
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
var import_mongoose17 = __toESM(require("mongoose"));

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
  const useMock = process.env.MOCK_DB === "1" || import_mongoose17.default.connection.readyState !== 1;
  if (useMock) {
    return res.json(store.listFolders());
  }
  try {
    const folders2 = await Folder.find().sort({ createdAt: 1 });
    res.json(folders2);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch folders" });
  }
});
router6.post("/", authenticate, async (req, res) => {
  const useMock = process.env.MOCK_DB === "1" || import_mongoose17.default.connection.readyState !== 1;
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    if (useMock) {
      const folder2 = store.createFolder(String(name));
      return res.json(folder2);
    }
    const folder = await Folder.create({ name });
    res.json(folder);
  } catch (e) {
    res.status(500).json({ error: "Failed to create folder" });
  }
});
router6.patch("/:id", authenticate, async (req, res) => {
  const useMock = process.env.MOCK_DB === "1" || import_mongoose17.default.connection.readyState !== 1;
  try {
    const { name } = req.body;
    if (useMock) {
      const folder2 = store.updateFolder(String(req.params.id), { name: String(name || "") });
      return res.json(folder2);
    }
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
  const useMock = process.env.MOCK_DB === "1" || import_mongoose17.default.connection.readyState !== 1;
  try {
    if (useMock) {
      store.deleteFolder(String(req.params.id));
      return res.json({ success: true });
    }
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
var import_mongoose18 = __toESM(require("mongoose"));
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
  const useMock = process.env.MOCK_DB === "1" || import_mongoose18.default.connection.readyState !== 1;
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

// src/routes/system.ts
var import_express14 = require("express");
var import_child_process2 = require("child_process");
var import_os2 = __toESM(require("os"));
var router14 = (0, import_express14.Router)();
router14.get("/stats", authenticate, async (req, res) => {
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
router14.get("/processes", authenticate, async (req, res) => {
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
router14.delete("/processes/:pid", authenticate, async (req, res) => {
  const { pid } = req.params;
  if (pid === "1") return res.status(403).json({ error: "Cannot kill init process" });
  (0, import_child_process2.exec)(`kill -9 ${pid}`, (err) => {
    if (err) {
      return res.status(500).json({ error: `Failed to kill process ${pid}` });
    }
    res.json({ success: true, message: `Process ${pid} killed` });
  });
});
var system_default = router14;

// src/index.ts
var import_http = __toESM(require("http"));
var import_fs7 = __toESM(require("fs"));
var logger = process.env.NODE_ENV === "production" ? (0, import_pino.default)() : (0, import_pino.default)({
  transport: {
    target: "pino-pretty",
    options: { translateTime: "SYS:standard", colorize: true }
  }
});
async function main() {
  const app = (0, import_express15.default)();
  app.use((0, import_cors.default)({
    origin: true,
    // Allow all origins for now to fix connectivity issues
    credentials: true
  }));
  app.use(import_express15.default.json({ limit: "10mb" }));
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
  app.use("/system", system_default);
  app.get("/me", authenticate, async (req, res) => {
    const auth = req.auth;
    res.json({ userId: auth.sub, role: auth.role });
  });
  const ARTIFACT_DIR2 = process.env.ARTIFACT_DIR || "/tmp/joe-artifacts";
  if (!import_fs7.default.existsSync(ARTIFACT_DIR2)) {
    try {
      import_fs7.default.mkdirSync(ARTIFACT_DIR2, { recursive: true });
    } catch {
    }
  }
  app.use("/artifacts", import_express15.default.static(ARTIFACT_DIR2));
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
  });
  process.on("unhandledRejection", (reason) => {
    logger.error(reason, "Unhandled Rejection");
  });
}
main().catch((err) => {
  logger.error(err, "Fatal error");
  process.exit(1);
});
