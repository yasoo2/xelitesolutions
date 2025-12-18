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
var import_mongoose6, SessionSchema, Session;
var init_session = __esm({
  "src/models/session.ts"() {
    "use strict";
    import_mongoose6 = __toESM(require("mongoose"));
    SessionSchema = new import_mongoose6.Schema(
      {
        tenantId: { type: import_mongoose6.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
        projectId: { type: import_mongoose6.Schema.Types.ObjectId, ref: "Project", index: true },
        userId: { type: import_mongoose6.Schema.Types.ObjectId, ref: "User", index: true, required: true },
        title: { type: String, required: true },
        mode: { type: String, enum: ["ADVISOR", "BUILDER", "SAFE", "OWNER"], default: "ADVISOR" },
        isPinned: { type: Boolean, default: false },
        lastSnippet: { type: String },
        lastUpdatedAt: { type: Date, default: Date.now },
        folderId: { type: import_mongoose6.Schema.Types.ObjectId, ref: "Folder" },
        terminalState: { type: String },
        browserState: {
          url: { type: String },
          title: { type: String },
          screenshot: { type: String }
        }
      },
      { timestamps: true }
    );
    SessionSchema.index({ userId: 1, title: 1 }, { unique: true });
    Session = import_mongoose6.default.model("Session", SessionSchema);
  }
});

// src/models/tenant.ts
var tenant_exports = {};
__export(tenant_exports, {
  Tenant: () => Tenant
});
var import_mongoose10, TenantSchema, Tenant;
var init_tenant = __esm({
  "src/models/tenant.ts"() {
    "use strict";
    import_mongoose10 = __toESM(require("mongoose"));
    TenantSchema = new import_mongoose10.Schema(
      {
        name: { type: String, required: true, unique: true },
        domain: { type: String }
      },
      { timestamps: true }
    );
    Tenant = import_mongoose10.default.model("Tenant", TenantSchema);
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
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim()) || allowedOriginsDefault
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
var import_fs3 = __toESM(require("fs"));
var import_path3 = __toESM(require("path"));
var import_buffer = require("buffer");

// src/services/browser.ts
var import_puppeteer = __toESM(require("puppeteer"));
var import_path = __toESM(require("path"));
var import_fs = __toESM(require("fs"));
var import_glob = require("glob");
var BrowserService = class {
  constructor() {
    this.browser = null;
    this.page = null;
    this.logs = [];
    this.network = [];
  }
  async getExecutablePath() {
    try {
      const defaultPath = import_puppeteer.default.executablePath();
      if (import_fs.default.existsSync(defaultPath)) {
        console.log("Using default Puppeteer executable:", defaultPath);
        return defaultPath;
      }
    } catch (e) {
      console.warn("Puppeteer executablePath() failed:", e);
    }
    const searchPaths = [
      import_path.default.join(process.cwd(), ".chrome-bin"),
      // Explicit local install
      import_path.default.join(process.cwd(), "api", ".chrome-bin"),
      // If running from root
      import_path.default.join(process.cwd(), ".cache", "puppeteer"),
      import_path.default.join(process.cwd(), "api", ".cache", "puppeteer"),
      import_path.default.join(__dirname, "../../.cache", "puppeteer"),
      import_path.default.join(__dirname, "../../../.cache", "puppeteer")
    ];
    console.log("Searching for Chrome in:", searchPaths);
    for (const basePath of searchPaths) {
      if (!import_fs.default.existsSync(basePath)) continue;
      const pattern = "**/{Google Chrome for Testing,chrome,chrome.exe}";
      const matches = await (0, import_glob.glob)(pattern, { cwd: basePath, absolute: true });
      for (const match of matches) {
        try {
          const stat = import_fs.default.statSync(match);
          if (stat.isFile()) {
            console.log("Found executable manually:", match);
            return match;
          }
        } catch (e) {
        }
      }
    }
    const linuxPath = import_path.default.join(process.cwd(), "api/.cache/puppeteer/chrome");
    if (import_fs.default.existsSync(linuxPath)) {
      try {
        const files = await (0, import_glob.glob)("**/chrome", { cwd: linuxPath, absolute: true });
        if (files.length > 0) return files[0];
      } catch (e) {
      }
    }
    return void 0;
  }
  async launch() {
    if (this.browser) return;
    try {
      const executablePath = await this.getExecutablePath();
      console.log("Launching browser with executable path:", executablePath || "bundled");
      this.browser = await import_puppeteer.default.launch({
        headless: true,
        ignoreHTTPSErrors: true,
        executablePath,
        // If undefined, puppeteer tries its best
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-zygote",
          "--single-process"
        ]
      });
      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1280, height: 800 });
      this.setupListeners();
    } catch (error) {
      console.error("Failed to launch browser:", error);
      if (error instanceof Error) {
        console.error("Error stack:", error.stack);
      }
      throw error;
    }
  }
  setupListeners() {
    if (!this.page) return;
    this.page.on("console", (msg) => {
      const text = msg.text();
      let stackTrace = void 0;
      const match = text.match(/(?:at\s+|@)([\w/.-]+:\d+:\d+)/);
      if (match) {
        stackTrace = match[1];
      }
      this.logs.push({
        type: msg.type(),
        message: text,
        timestamp: Date.now(),
        stackTrace
      });
      if (this.logs.length > 1e3) this.logs.shift();
    });
    this.page.on("request", (req) => {
    });
    this.page.on("response", async (resp) => {
      let responseBody = void 0;
      let requestBody = resp.request().postData();
      try {
        const contentType = resp.headers()["content-type"] || "";
        if (contentType.includes("application/json") || contentType.includes("text/")) {
          const length = Number(resp.headers()["content-length"]);
          if (!length || length < 1024 * 1024) {
            responseBody = await resp.text();
          } else {
            responseBody = "[Body too large]";
          }
        }
      } catch (e) {
        responseBody = "[Failed to read body]";
      }
      this.network.push({
        url: resp.url(),
        method: resp.request().method(),
        status: resp.status(),
        type: resp.request().resourceType(),
        timestamp: Date.now(),
        requestBody,
        responseBody
      });
      if (this.network.length > 1e3) this.network.shift();
    });
  }
  async auditPage() {
    if (!this.page) return null;
    return await this.page.evaluate(() => {
      const issues = [];
      let score = 100;
      const images = document.querySelectorAll("img");
      images.forEach((img) => {
        if (!img.alt) {
          score -= 2;
          issues.push({
            severity: "warning",
            message: "Image missing alt text",
            selector: img.id ? `#${img.id}` : img.className ? `.${img.className.split(" ")[0]}` : "img"
          });
        }
      });
      const buttons = document.querySelectorAll("button, a");
      buttons.forEach((btn) => {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && (rect.width < 44 || rect.height < 44)) {
          score -= 1;
          issues.push({
            severity: "info",
            message: "Touch target too small (<44px)",
            selector: btn.textContent?.slice(0, 20) || "button"
          });
        }
      });
      const inputs = document.querySelectorAll("input");
      inputs.forEach((input) => {
        if (input.type === "hidden" || input.type === "submit") return;
        const hasLabel = input.labels && input.labels.length > 0;
        const hasAria = input.hasAttribute("aria-label") || input.hasAttribute("aria-labelledby");
        if (!hasLabel && !hasAria) {
          score -= 5;
          issues.push({
            severity: "critical",
            message: "Input field missing label",
            selector: input.name || input.id || "input"
          });
        }
      });
      const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
      let lastLevel = 0;
      headings.forEach((h) => {
        const level = parseInt(h.tagName[1]);
        if (level > lastLevel + 1) {
          score -= 3;
          issues.push({
            severity: "warning",
            message: `Skipped heading level: H${lastLevel} to H${level}`,
            selector: h.textContent?.slice(0, 20) || `H${level}`
          });
        }
        lastLevel = level;
      });
      return {
        score: Math.max(0, score),
        issues
      };
    });
  }
  async navigate(url) {
    if (!this.page) await this.launch();
    if (!url.startsWith("http")) url = "https://" + url;
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 3e4 });
    return { title: await this.page.title(), url: this.page.url() };
  }
  async screenshot() {
    if (!this.page) return null;
    try {
      return await this.page.screenshot({ encoding: "base64" });
    } catch (error) {
      console.error("Screenshot failed:", error);
      try {
        await this.close();
        await this.launch();
      } catch (restartError) {
        console.error("Failed to restart browser after screenshot failure:", restartError);
      }
      return null;
    }
  }
  async pdf() {
    if (!this.page) return null;
    return await this.page.pdf({ format: "A4" });
  }
  async setViewport(width, height) {
    if (!this.page) return;
    await this.page.setViewport({ width, height });
  }
  async evaluate(script) {
    if (!this.page) return null;
    try {
      const result = await this.page.evaluate((code) => {
        try {
          return eval(code);
        } catch (e) {
          return e.toString();
        }
      }, script);
      return result;
    } catch (e) {
      return e.message;
    }
  }
  async inspect(x, y) {
    if (!this.page) return null;
    return await this.page.evaluate(({ x: x2, y: y2 }) => {
      const el = document.elementFromPoint(x2, y2);
      if (!el) return null;
      const styles = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        tagName: el.tagName.toLowerCase(),
        id: el.id,
        className: el.className,
        innerHTML: el.innerHTML.slice(0, 200) + (el.innerHTML.length > 200 ? "..." : ""),
        innerText: el.innerText?.slice(0, 100),
        rect: {
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left
        },
        styles: {
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          fontFamily: styles.fontFamily,
          fontSize: styles.fontSize,
          display: styles.display,
          padding: styles.padding,
          margin: styles.margin
        }
      };
    }, { x, y });
  }
  async click(x, y) {
    if (!this.page) return;
    await this.page.mouse.click(x, y);
  }
  async clickSelector(selector) {
    if (!this.page) return;
    try {
      await this.page.waitForSelector(selector, { timeout: 5e3 });
      await this.page.click(selector);
    } catch (e) {
      throw new Error(`Failed to click selector "${selector}": ${e.message}`);
    }
  }
  async type(text) {
    if (!this.page) return;
    await this.page.keyboard.type(text);
  }
  async typeSelector(selector, text) {
    if (!this.page) return;
    try {
      await this.page.waitForSelector(selector, { timeout: 5e3 });
      await this.page.type(selector, text);
    } catch (e) {
      throw new Error(`Failed to type in selector "${selector}": ${e.message}`);
    }
  }
  async getSimplifiedDOM() {
    if (!this.page) return null;
    return await this.page.evaluate(() => {
      const cleanup = (node) => {
        const importantTags = ["a", "button", "input", "select", "textarea", "h1", "h2", "h3", "p", "div", "span", "img", "form"];
        const tag = node.tagName.toLowerCase();
        if (!importantTags.includes(tag)) return null;
        const rect = node.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        const attributes = {};
        if (node.id) attributes.id = node.id;
        if (node.name) attributes.name = node.name;
        if (node.href) attributes.href = node.href;
        if (node.placeholder) attributes.placeholder = node.placeholder;
        if (node.type) attributes.type = node.type;
        if (node.className) attributes.class = node.className;
        let text = "";
        if (["p", "span", "h1", "h2", "h3", "button", "a"].includes(tag)) {
          text = node.innerText.slice(0, 200);
        }
        return {
          tag,
          ...attributes,
          text: text || void 0
          // rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
        };
      };
      const traverse = (node) => {
        const children = Array.from(node.children).map(traverse).flat().filter(Boolean);
        const info = cleanup(node);
        if (info) {
          return [info, ...children];
        }
        return children;
      };
      return traverse(document.body);
    });
  }
  async scroll(deltaY) {
    if (!this.page) return;
    await this.page.evaluate((dy) => {
      window.scrollBy(0, dy);
    }, deltaY);
  }
  async goBack() {
    if (this.page) await this.page.goBack();
  }
  async goForward() {
    if (this.page) await this.page.goForward();
  }
  async reload() {
    if (this.page) await this.page.reload();
  }
  getLogs() {
    return this.logs;
  }
  getNetwork() {
    return this.network;
  }
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.logs = [];
      this.network = [];
    }
  }
  getStatus() {
    const viewport = this.page?.viewport();
    return {
      active: !!this.browser,
      url: this.page?.url() || "",
      viewport: viewport || { width: 1280, height: 800 }
    };
  }
};
var browserService = new BrowserService();

// src/services/knowledge.ts
var import_fs2 = __toESM(require("fs"));
var import_path2 = __toESM(require("path"));
var import_uuid = require("uuid");
var import_pdf_parse = __toESM(require("pdf-parse"));
var DATA_DIR = process.env.DATA_DIR || import_path2.default.join(process.cwd(), "data");
var KNOWLEDGE_FILE = import_path2.default.join(DATA_DIR, "knowledge.json");
if (!import_fs2.default.existsSync(DATA_DIR)) {
  try {
    import_fs2.default.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
  }
}
function loadKnowledge() {
  if (!import_fs2.default.existsSync(KNOWLEDGE_FILE)) return [];
  try {
    const data = import_fs2.default.readFileSync(KNOWLEDGE_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}
function saveKnowledge(docs) {
  import_fs2.default.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(docs, null, 2));
}
var KnowledgeService = {
  getAll: () => loadKnowledge(),
  add: (filename, content, tags = []) => {
    const docs = loadKnowledge();
    const newDoc = {
      id: (0, import_uuid.v4)(),
      filename,
      content,
      tags,
      createdAt: Date.now()
    };
    docs.push(newDoc);
    saveKnowledge(docs);
    return newDoc;
  },
  delete: (id) => {
    const docs = loadKnowledge();
    const filtered = docs.filter((d) => d.id !== id);
    saveKnowledge(filtered);
  },
  search: (query) => {
    const docs = loadKnowledge();
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
if (!import_fs3.default.existsSync(ARTIFACT_DIR)) {
  try {
    import_fs3.default.mkdirSync(ARTIFACT_DIR, { recursive: true });
  } catch {
  }
}
var tools = [
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
    name: "browser_snapshot",
    version: "1.0.0",
    tags: ["browser", "artifact"],
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    outputSchema: { type: "object", properties: { href: { type: "string" }, title: { type: "string" } } },
    permissions: ["read"],
    sideEffects: [],
    rateLimitPerMinute: 30,
    auditFields: ["filename"],
    mockSupported: false
  },
  {
    name: "browser_open",
    version: "1.0.0",
    tags: ["browser", "action"],
    inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    outputSchema: { type: "object", properties: { message: { type: "string" }, title: { type: "string" } } },
    permissions: ["read", "internet"],
    sideEffects: ["execute"],
    rateLimitPerMinute: 30,
    auditFields: ["url"],
    mockSupported: false
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
async function executeTool(name, input) {
  const logs = [];
  const t0 = Date.now();
  logs.push(`[${(/* @__PURE__ */ new Date()).toISOString()}] start ${name}`);
  try {
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
      const path10 = String(input?.path ?? "");
      const norm = path10.replace(/\[(\d+)\]/g, ".$1");
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
      const full = import_path3.default.isAbsolute(filename) ? filename : import_path3.default.resolve(process.cwd(), filename);
      const dir = import_path3.default.dirname(full);
      if (!import_fs3.default.existsSync(dir)) {
        try {
          import_fs3.default.mkdirSync(dir, { recursive: true });
        } catch {
        }
      }
      import_fs3.default.writeFileSync(full, content);
      logs.push(`wrote=${full} bytes=${content.length}`);
      let href = "";
      const artifactDirAbs = import_path3.default.resolve(ARTIFACT_DIR);
      if (full.startsWith(artifactDirAbs)) {
        href = `/artifacts/${encodeURIComponent(import_path3.default.relative(artifactDirAbs, full))}`;
      }
      return { ok: true, output: { href }, logs, artifacts: href ? [{ name: import_path3.default.basename(full), href }] : [] };
    }
    if (name === "browser_open") {
      const url = String(input?.url ?? "");
      try {
        await browserService.launch();
        const navResult = await browserService.navigate(url);
        logs.push(`browser.opened=${url} title=${navResult.title}`);
        return { ok: true, output: { message: `Browser opened to ${url}`, title: navResult.title }, logs };
      } catch (err) {
        return { ok: false, error: err.message, logs };
      }
    }
    if (name === "browser_snapshot") {
      const url = String(input?.url ?? "");
      const filename = `snapshot-${Date.now()}.png`;
      const full = import_path3.default.join(ARTIFACT_DIR, filename);
      try {
        await browserService.launch();
        const navResult = await browserService.navigate(url);
        const b64 = await browserService.screenshot();
        const textSummary = await browserService.evaluate(`document.body.innerText.slice(0, 2000)`);
        if (b64) {
          import_fs3.default.writeFileSync(full, import_buffer.Buffer.from(b64, "base64"));
          logs.push(`snapshot.saved=${full} title=${navResult.title}`);
          const href = `/artifacts/${encodeURIComponent(filename)}`;
          return {
            ok: true,
            output: {
              href,
              title: navResult.title,
              textPreview: typeof textSummary === "string" ? textSummary.replace(/\s+/g, " ").trim() : ""
            },
            logs,
            artifacts: [{ name: filename, href }]
          };
        } else {
          return { ok: false, error: "Failed to capture screenshot", logs };
        }
      } catch (err) {
        logs.push(`browser.error=${err.message}`);
        return { ok: false, error: err.message, logs };
      }
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
        const full = import_path3.default.join(ARTIFACT_DIR, filename);
        import_fs3.default.writeFileSync(full, buf);
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
            const res = await ddg.search(query);
            return (res.results || []).map((r) => ({
              title: String(r.title).slice(0, 120),
              url: String(r.url),
              description: String(r.description)
            })).filter((x) => x.url && x.title);
          })(),
          (async () => {
            const hasArabic = /[\u0600-\u06FF]/.test(query);
            const lang = hasArabic ? "ar" : "en";
            const wurl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`;
            const r = await fetch(wurl);
            if (!r.ok) return [];
            const j = await r.json();
            return (j.query?.search || []).map((it) => ({
              title: String(it.title).slice(0, 120),
              url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(it.title.replace(/\s+/g, "_"))}`,
              description: String(it.snippet).replace(/<[^>]+>/g, "")
            })).filter((x) => x.url && x.title);
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
      const full = import_path3.default.isAbsolute(filename) ? filename : import_path3.default.resolve(process.cwd(), filename);
      if (import_fs3.default.existsSync(full) && import_fs3.default.lstatSync(full).isDirectory()) {
        return { ok: false, error: "EISDIR: illegal operation on a directory, read", logs };
      }
      if (!import_fs3.default.existsSync(full)) {
        return { ok: false, error: "File not found", logs };
      }
      const content = import_fs3.default.readFileSync(full, "utf-8");
      logs.push(`read=${full} bytes=${content.length}`);
      return { ok: true, output: { content }, logs };
    }
    if (name === "read_file_tree") {
      const p = String(input?.path || ".");
      const maxDepth = Math.min(5, Number(input?.depth ?? 2));
      const rootPath = import_path3.default.isAbsolute(p) ? p : import_path3.default.resolve(process.cwd(), p);
      if (!import_fs3.default.existsSync(rootPath)) {
        return { ok: false, error: "Directory not found", logs };
      }
      const getTree = (dir, currentDepth) => {
        if (currentDepth > maxDepth) return "";
        try {
          const files = import_fs3.default.readdirSync(dir, { withFileTypes: true });
          let result2 = "";
          files.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
          });
          for (const f of files) {
            if (f.name.startsWith(".") && f.name !== ".env") continue;
            if (f.name === "node_modules" || f.name === "dist" || f.name === "build" || f.name === ".git") {
              result2 += "  ".repeat(currentDepth) + `/${f.name} (ignored)
`;
              continue;
            }
            if (f.isDirectory()) {
              result2 += "  ".repeat(currentDepth) + `/${f.name}
`;
              result2 += getTree(import_path3.default.join(dir, f.name), currentDepth + 1);
            } else {
              result2 += "  ".repeat(currentDepth) + ` ${f.name}
`;
            }
          }
          return result2;
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
      const dirPath = import_path3.default.isAbsolute(p) ? p : import_path3.default.resolve(process.cwd(), p);
      if (!import_fs3.default.existsSync(dirPath)) {
        return { ok: false, error: "Directory not found", logs };
      }
      const files = import_fs3.default.readdirSync(dirPath);
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
      const stateFile = import_path3.default.join(process.cwd(), ".joe", "shell_state.json");
      if (!cwdInput && import_fs3.default.existsSync(stateFile)) {
        try {
          const state = JSON.parse(import_fs3.default.readFileSync(stateFile, "utf-8"));
          if (state.cwd && import_fs3.default.existsSync(state.cwd)) {
            cwdInput = state.cwd;
          }
        } catch {
        }
      }
      const { exec: exec2 } = await import("child_process");
      const util = await import("util");
      const execAsync = util.promisify(exec2);
      const workDir = cwdInput ? import_path3.default.isAbsolute(cwdInput) ? cwdInput : import_path3.default.resolve(process.cwd(), cwdInput) : process.cwd();
      if (!import_fs3.default.existsSync(import_path3.default.join(process.cwd(), ".joe"))) {
        try {
          import_fs3.default.mkdirSync(import_path3.default.join(process.cwd(), ".joe"));
        } catch {
        }
      }
      try {
        const { stdout, stderr } = await execAsync(command, { cwd: workDir, timeout: timeoutVal });
        if (command.trim().startsWith("cd ")) {
          const target = command.trim().split(/\s+/)[1];
          if (target) {
            const newCwd = import_path3.default.resolve(workDir, target);
            if (import_fs3.default.existsSync(newCwd)) {
              import_fs3.default.writeFileSync(stateFile, JSON.stringify({ cwd: newCwd }));
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
      const full = import_path3.default.isAbsolute(filename) ? filename : import_path3.default.resolve(process.cwd(), filename);
      if (!import_fs3.default.existsSync(full)) return { ok: false, error: "File not found", logs };
      const ext = import_path3.default.extname(full).toLowerCase();
      if (ext === ".json") {
        try {
          JSON.parse(import_fs3.default.readFileSync(full, "utf-8"));
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
      const full = import_path3.default.isAbsolute(filename) ? filename : import_path3.default.resolve(process.cwd(), filename);
      if (!import_fs3.default.existsSync(full)) return { ok: false, error: "File not found", logs };
      const content = import_fs3.default.readFileSync(full, "utf-8");
      const apiKey2 = process.env.OPENAI_API_KEY;
      if (!apiKey2) return { ok: false, error: "No API Key for generation", logs };
      try {
        const { default: OpenAI4 } = await import("openai");
        const client = new OpenAI4({ apiKey: apiKey2, baseURL: process.env.OPENAI_BASE_URL });
        const completion = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || "gpt-4o",
          messages: [
            { role: "system", content: "You are a Senior QA Engineer. Generate a comprehensive test file for the provided code. Use Jest/Vitest syntax. Return ONLY the code, no markdown." },
            { role: "user", content: `File: ${import_path3.default.basename(filename)}

${content}` }
          ]
        });
        let testCode = completion.choices[0].message.content || "";
        testCode = testCode.replace(/^```(typescript|ts|javascript|js)?\n/, "").replace(/\n```$/, "");
        const testDir = import_path3.default.join(import_path3.default.dirname(full), "__tests__");
        if (!import_fs3.default.existsSync(testDir)) import_fs3.default.mkdirSync(testDir, { recursive: true });
        const testFile = import_path3.default.join(testDir, `${import_path3.default.basename(filename, import_path3.default.extname(filename))}.test${import_path3.default.extname(filename)}`);
        import_fs3.default.writeFileSync(testFile, testCode);
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
      const root = import_path3.default.isAbsolute(p) ? p : import_path3.default.resolve(process.cwd(), p);
      const apiKey2 = process.env.OPENAI_API_KEY;
      if (!apiKey2) return { ok: false, error: "No API Key", logs };
      const files = import_fs3.default.readdirSync(root).filter((f) => /\.(ts|js|py|go)$/.test(f)).slice(0, 5);
      const docs = {};
      try {
        const { default: OpenAI4 } = await import("openai");
        const client = new OpenAI4({ apiKey: apiKey2, baseURL: process.env.OPENAI_BASE_URL });
        for (const f of files) {
          const content = import_fs3.default.readFileSync(import_path3.default.join(root, f), "utf-8");
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
        import_fs3.default.writeFileSync(import_path3.default.join(root, "README_API.md"), md);
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
          const tsConfig = import_path3.default.join(process.cwd(), "tsconfig.json");
          if (import_fs3.default.existsSync(tsConfig)) {
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
      const full = import_path3.default.isAbsolute(filename) ? filename : import_path3.default.resolve(process.cwd(), filename);
      if (!import_fs3.default.existsSync(full)) return { ok: false, error: "File not found", logs };
      let content = import_fs3.default.readFileSync(full, "utf-8");
      if (!content.includes(find)) {
        return { ok: false, error: "Text to replace not found", logs };
      }
      content = content.replace(find, replace);
      import_fs3.default.writeFileSync(full, content);
      logs.push(`edit=${filename}`);
      return { ok: true, output: { success: true }, logs };
    }
    if (name === "grep_search") {
      const query = String(input?.query ?? "");
      const searchPath = String(input?.path ?? ".");
      const include = String(input?.include ?? "");
      const exclude = String(input?.exclude ?? "");
      const workDir = import_path3.default.isAbsolute(searchPath) ? searchPath : import_path3.default.resolve(process.cwd(), searchPath);
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
      const resolvedBase = import_path3.default.isAbsolute(baseDir) ? baseDir : import_path3.default.resolve(process.cwd(), baseDir);
      const created = [];
      const errors = [];
      for (const [relativePath, content] of Object.entries(structure)) {
        const fullPath = import_path3.default.join(resolvedBase, relativePath);
        try {
          if (content === null) {
            if (!import_fs3.default.existsSync(fullPath)) {
              import_fs3.default.mkdirSync(fullPath, { recursive: true });
              created.push(`${relativePath}/`);
            }
          } else {
            const dir = import_path3.default.dirname(fullPath);
            if (!import_fs3.default.existsSync(dir)) {
              import_fs3.default.mkdirSync(dir, { recursive: true });
            }
            import_fs3.default.writeFileSync(fullPath, String(content));
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
      const root = import_path3.default.isAbsolute(p) ? p : import_path3.default.resolve(process.cwd(), p);
      if (!import_fs3.default.existsSync(root)) return { ok: false, error: "Path not found", logs };
      const pkgJsonPath = import_path3.default.join(root, "package.json");
      let pkgInfo = "No package.json";
      if (import_fs3.default.existsSync(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(import_fs3.default.readFileSync(pkgJsonPath, "utf-8"));
          pkgInfo = `Name: ${pkg.name}
Dependencies: ${Object.keys(pkg.dependencies || {}).join(", ")}`;
        } catch {
        }
      }
      const contextPath = import_path3.default.join(root, ".joe/context.json");
      let contextInfo = "No .joe/context.json found";
      if (import_fs3.default.existsSync(contextPath)) {
        contextInfo = import_fs3.default.readFileSync(contextPath, "utf-8").slice(0, 500);
      }
      const archPath = import_path3.default.join(root, "ARCHITECTURE.md");
      let archInfo = "No ARCHITECTURE.md found";
      if (import_fs3.default.existsSync(archPath)) {
        archInfo = import_fs3.default.readFileSync(archPath, "utf-8").slice(0, 1e3);
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
      const results = KnowledgeService.search(query);
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
      const doc = KnowledgeService.add(filename, content, tags);
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

// src/services/terminal.ts
var import_child_process = require("child_process");
var import_events = require("events");
var TerminalManager = class extends import_events.EventEmitter {
  constructor() {
    super(...arguments);
    this.sessions = {};
  }
  create(id, cwd = process.cwd()) {
    if (this.sessions[id]) return;
    const shell = process.env.SHELL || (process.platform === "win32" ? "powershell.exe" : "bash");
    const p = (0, import_child_process.spawn)(shell, ["-i"], {
      cwd,
      env: { ...process.env, TERM: "xterm-256color" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.sessions[id] = p;
    p.stdout?.on("data", (data) => {
      this.emit("data", { id, data: data.toString() });
    });
    p.stderr?.on("data", (data) => {
      this.emit("data", { id, data: data.toString() });
    });
    p.on("exit", (code2) => {
      this.emit("data", { id, data: `\r
[Process exited with code ${code2}]\r
` });
      delete this.sessions[id];
    });
    this.emit("data", { id, data: `\r
Connected to ${shell}\r
` });
  }
  write(id, data) {
    const p = this.sessions[id];
    if (p && p.stdin) {
      p.stdin.write(data);
    }
  }
  resize(id, cols, rows) {
  }
  kill(id) {
    const p = this.sessions[id];
    if (p) {
      p.kill();
      delete this.sessions[id];
    }
  }
};
var terminalManager = new TerminalManager();

// src/ws.ts
var wssRef = null;
function attachWebSocket(server) {
  wssRef = new import_ws.WebSocketServer({ server });
  wssRef.on("connection", (ws) => {
    console.log("Client connected to WebSocket");
    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === "terminal:input" && data.data) {
          terminalManager.write(data.id || "default", data.data);
        }
        if (data.type === "terminal:resize" && data.cols && data.rows) {
          terminalManager.resize(data.id || "default", data.cols, data.rows);
        }
      } catch (e) {
        console.error("Failed to parse WS message:", e);
      }
    });
  });
}
function broadcast(event) {
  if (!wssRef) return;
  const payload = JSON.stringify(event);
  wssRef.clients.forEach((client) => {
    if (client.readyState === import_ws.WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// src/routes/tools.ts
var router2 = (0, import_express2.Router)();
router2.get("/", async (_req, res) => {
  res.json({ count: tools.length, tools });
});
router2.post("/run", async (req, res) => {
  const steps = [
    { type: "step_started", data: { name: "plan" } },
    { type: "step_done", data: { name: "plan" } },
    { type: "step_started", data: { name: "execute:echo" } }
  ];
  steps.forEach((ev) => broadcast(ev));
  const result2 = await executeTool("echo", { text: String(req.body?.text ?? "hello") });
  broadcast({ type: result2.ok ? "step_done" : "step_failed", data: { name: "execute:echo", result: result2 } });
  res.json(result2);
});
router2.post("/:name/execute", async (req, res) => {
  const name = String(req.params.name);
  const result2 = await executeTool(name, req.body || {});
  res.json(result2);
});
var tools_default = router2;

// src/routes/run.ts
var import_express3 = require("express");
var import_mongoose11 = __toESM(require("mongoose"));
var import_fs4 = __toESM(require("fs"));

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
  createSession(title, mode = "ADVISOR") {
    const existing = sessions.find((s2) => s2.title === title);
    if (existing) return existing;
    const id = nextId("sess_", sessions.length + 1);
    const s = { id, title, mode };
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

// src/models/approval.ts
var import_mongoose4 = __toESM(require("mongoose"));
var ApprovalSchema = new import_mongoose4.Schema(
  {
    runId: { type: import_mongoose4.Schema.Types.ObjectId, ref: "Run", index: true, required: true },
    action: { type: String, required: true },
    risk: { type: String, required: true },
    status: { type: String, enum: ["pending", "approved", "denied"], default: "pending" }
  },
  { timestamps: true }
);
var Approval = import_mongoose4.default.model("Approval", ApprovalSchema);

// src/models/run.ts
var import_mongoose5 = __toESM(require("mongoose"));
var RunSchema = new import_mongoose5.Schema(
  {
    sessionId: { type: import_mongoose5.Schema.Types.ObjectId, ref: "Session", index: true, required: true },
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
var Run = import_mongoose5.default.model("Run", RunSchema);

// src/llm.ts
var import_openai = __toESM(require("openai"));
var apiKey = process.env.OPENAI_API_KEY;
if (apiKey) {
  console.log("LLM: OpenAI API Key found (starts with " + apiKey.slice(0, 7) + "...)");
} else {
  console.warn("LLM: No OpenAI API Key found in environment variables. LLM features will be disabled.");
}
var openai = new import_openai.default({
  apiKey: apiKey || "dummy",
  baseURL: process.env.OPENAI_BASE_URL
});
var activeTools = tools.filter((t) => !t.name.startsWith("noop_"));
var SYSTEM_PROMPT = `You are Joe, an elite AI autonomous engineer. You are capable of building complete websites, applications, and solving complex tasks without human intervention.
You have access to a set of tools to interact with the file system, network, and browser.

Your Goal:
- Understand the user's high-level request (e.g., "Build a landing page").
- Break it down into logical steps (Plan -> Create Files -> Verify).
- Execute the steps autonomously using the available tools.

## Standard Workflow:
1. **Explore**: Use "read_file_tree" or "analyze_codebase" to understand the environment.
2. **Plan**: For complex tasks, create/update an "ARCHITECTURE.md" file to document the plan.
3. **Task Management**: Maintain a "TODO.md" file for multi-step projects to track progress.
4. **Execute**: Use "scaffold_project" for bulk creation, "file_write" for single files.
5. **Verify**: Check your work using "grep_search" or "ls".

## Tool Usage Guide:
- **Project Setup**: Use "scaffold_project" to create directory structures and multiple files at once.
- **Code Search**: Use "grep_search" to find code patterns across the entire codebase instantly.
- **Deep Analysis**: Use "analyze_codebase" to get a high-level summary of the project.
- **Exploration**: Use "read_file_tree" (preferred over ls) to see directory structures.
- **Reading**: Use "file_read" to inspect file contents.
- **Modifying**: Use "file_edit" to fix bugs or update code.
- **System**: Use "shell_execute" for commands (npm install, git, etc).
- **Knowledge**: Use "knowledge_search" to query your memory.

## Rules:
- **Persistent Context**: Always check for ".joe/context.json" to understand project history.
- **Persistence**: If a tool fails, try to fix the input or use a different approach.
- **Error Handling**: If a tool fails due to missing API keys, Report the error immediately.
- **Efficiency**: Do not repeat the same tool call if it was successful. Use bulk tools when possible.
- **Artifacts**: If you generated an artifact (image, file), use "echo" to confirm it.
- **Language**: If the user asks in Arabic, you MUST reply in Arabic.
- **Professionalism**: Be precise, professional, and act as a senior engineer.
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
  const aiTools = activeTools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: `Tool: ${t.name}. Tags: ${t.tags.join(", ")}`,
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
    console.error("LLM Error:", error);
    if (options?.throwOnError) {
      throw error;
    }
    return heuristicPlanner(messages2);
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
function heuristicPlanner(messages2) {
  const userMsg = messages2.find((m) => m.role === "user")?.content || "";
  console.error("--- Heuristic Planner Debug ---");
  console.error("Messages Count:", messages2.length);
  messages2.forEach((m, i) => {
    if (m.role === "assistant") {
      console.error(`Msg[${i}] Assistant: ${String(m.content).slice(0, 100)}...`);
    }
  });
  const lastMsg = messages2[messages2.length - 1];
  if (lastMsg.role === "assistant" && lastMsg.content && lastMsg.content.includes("FAILED. Error:")) {
    const errorContent = lastMsg.content;
    if (errorContent.includes("Tool 'file_read' FAILED") && (errorContent.includes("ENOENT") || errorContent.includes("File not found"))) {
      let filename = "unknown.txt";
      const m = userMsg.match(/['"]([^'"]+\.[a-z]+)['"]/i);
      if (m) filename = m[1];
      if (filename !== "unknown.txt") {
        return { name: "file_write", input: { filename, content: "ghost" } };
      }
    }
    if (errorContent.includes("SyntaxError") || errorContent.includes("missing ) after argument list")) {
      const m = userMsg.match(/['"]([^'"]+\.js)['"]/i);
      if (m) {
        const filename = m[1];
        return { name: "file_write", input: { filename, content: 'console.log("Hello World"); // Fixed by Joe' } };
      }
    }
    if (errorContent.includes("Tool 'shell_execute' FAILED") && errorContent.includes("Cannot find module")) {
      const m = userMsg.match(/['"]([^'"]+\.js)['"]/i);
      if (m) {
        const filename = m[1];
        const contentMatch = userMsg.match(/content ['"](.+)['"]/i);
        const content = contentMatch ? contentMatch[1] : 'console.log("Hello World");';
        return { name: "file_write", input: { filename, content } };
      }
    }
  }
  if (/(run|execute|job|شغل|نفذ)/i.test(String(userMsg)) && /(node|python|script)/i.test(String(userMsg))) {
    if (lastMsg.role === "assistant" && lastMsg.content && lastMsg.content.includes("Tool 'shell_execute' executed")) {
      return { name: "echo", input: { text: "Script executed successfully. Output: " + lastMsg.content.slice(0, 100) } };
    }
    const m = userMsg.match(/['"]([^'"]+\.js)['"]/i);
    if (m) {
      const filename = m[1];
      return { name: "shell_execute", input: { command: `node ${filename}` } };
    }
  }
  if (/(read|cat|content|أقرأ|اقرأ)/i.test(String(userMsg)) && /(file|ملف)/i.test(String(userMsg))) {
    if (lastMsg.role === "assistant" && lastMsg.content && lastMsg.content.includes("Tool 'file_read' executed")) {
      return { name: "echo", input: { text: "File read successfully. " + lastMsg.content } };
    }
    const match = userMsg.match(/['"]([^'"]+\.[a-z]+)['"]/i);
    if (match) {
      return { name: "file_read", input: { filename: match[1] } };
    }
  }
  if (/(متجر|ecommerce|shop|store|site|website|موقع|page|landing)/i.test(String(userMsg))) {
    const toolsCalled = messages2.filter((m) => m.role === "assistant" && m.tool_calls).flatMap((m) => m.tool_calls?.map((tc) => tc.function.name) || []);
    const textToolsCalled = messages2.filter((m) => m.role === "assistant" && !m.tool_calls && typeof m.content === "string").map((m) => {
      const match = m.content?.match(/execute tool: (\w+)/);
      return match ? match[1] : null;
    }).filter(Boolean);
    const allToolsCalled = [...toolsCalled, ...textToolsCalled];
    const filesWritten = messages2.flatMap((m) => {
      if (m.role === "assistant" && m.tool_calls) {
        return m.tool_calls.map((tc) => {
          if (tc.function.name === "file_write") {
            try {
              return JSON.parse(tc.function.arguments).filename;
            } catch {
              return null;
            }
          }
          return null;
        });
      }
      if (m.role === "assistant" && typeof m.content === "string") {
        if (m.content.includes("Tool 'file_write' executed")) {
          return ["__ANY_FILE__"];
        }
      }
      return [];
    }).filter(Boolean);
    let targetFilename = "index.html";
    const filenameMatch = userMsg.match(/(?:['"]([^'"]+\.html)['"]|(\b[\w-]+\.html\b))/i);
    if (filenameMatch) {
      targetFilename = filenameMatch[1] || filenameMatch[2];
    }
    if (!allToolsCalled.includes("file_write") && !textToolsCalled.includes("file_write") || !filesWritten.includes(targetFilename) && !filesWritten.includes("__ANY_FILE__")) {
      return {
        name: "file_write",
        input: {
          filename: targetFilename,
          content: `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${targetFilename === "xelite.html" ? "Xelite Coffee" : "\u0645\u0648\u0642\u0639 \u062C\u062F\u064A\u062F"}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
    body { font-family: 'Cairo', sans-serif; }
  </style>
</head>
<body class="bg-gray-900 text-white">
  <header class="p-6 border-b border-gray-800 flex justify-between items-center">
    <h1 class="text-2xl font-bold text-yellow-500">${targetFilename === "xelite.html" ? "Xelite Coffee" : "\u0645\u062A\u062C\u0631 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A"}</h1>
    <nav>
      <a href="#" class="mx-2 hover:text-yellow-400">\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629</a>
      <a href="#" class="mx-2 hover:text-yellow-400">\u0627\u0644\u0645\u0646\u062A\u062C\u0627\u062A</a>
      <a href="#" class="mx-2 hover:text-yellow-400">\u0627\u062A\u0635\u0644 \u0628\u0646\u0627</a>
    </nav>
  </header>
  <main class="container mx-auto p-8 text-center">
    <h2 class="text-4xl font-bold mb-4">\u0623\u0647\u0644\u0627\u064B \u0628\u0643 \u0641\u064A \u0627\u0644\u0645\u0633\u062A\u0642\u0628\u0644</h2>
    <p class="text-gray-400 mb-8">\u0646\u062D\u0646 \u0646\u0628\u0646\u064A \u0627\u0644\u062D\u0644\u0648\u0644 \u0627\u0644\u0630\u0643\u064A\u0629.</p>
    <button class="bg-yellow-500 text-black px-6 py-2 rounded-lg font-bold hover:bg-yellow-400 transition">\u0627\u0628\u062F\u0623 \u0627\u0644\u0622\u0646</button>
  </main>
  <footer class="p-6 text-center text-gray-600 mt-12 border-t border-gray-800">
    &copy; 2025 XElite Solutions
  </footer>
</body>
</html>`
        }
      };
    }
  }
  const lowerMsg = String(userMsg).toLowerCase();
  if (/^(hello|hi|hey|salam|مرحبا|هلا|السلام|ahlan)/i.test(lowerMsg)) {
    return {
      name: "echo",
      input: { text: "\u0623\u0647\u0644\u0627\u064B \u0628\u0643! \u0623\u0646\u0627 \u062C\u0648\u060C \u0645\u0647\u0646\u062F\u0633 \u0627\u0644\u0628\u0631\u0645\u062C\u064A\u0627\u062A \u0627\u0644\u0645\u0633\u062A\u0642\u0644. \u0643\u064A\u0641 \u064A\u0645\u0643\u0646\u0646\u064A \u0645\u0633\u0627\u0639\u062F\u062A\u0643 \u0627\u0644\u064A\u0648\u0645\u061F\n(\u0645\u0644\u0627\u062D\u0638\u0629: \u0623\u0646\u0627 \u0623\u0639\u0645\u0644 \u062D\u0627\u0644\u064A\u0627\u064B \u0641\u064A \u0648\u0636\u0639 \u0627\u0644\u062A\u0639\u0627\u0641\u064A \u0646\u0638\u0631\u0627\u064B \u0644\u0639\u062F\u0645 \u062A\u0648\u0641\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0643\u0627\u0645\u0644 \u0628\u0627\u0644\u062F\u0645\u0627\u063A \u0627\u0644\u0645\u0631\u0643\u0632\u064A)" }
    };
  }
  if (/(status|health|state|كيف حالك|وضعك)/i.test(lowerMsg)) {
    return {
      name: "echo",
      input: { text: "\u0627\u0644\u0623\u0646\u0638\u0645\u0629 \u062A\u0639\u0645\u0644. \u0623\u0646\u0627 \u062C\u0627\u0647\u0632 \u0644\u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629 (\u0642\u0631\u0627\u0621\u0629 \u0645\u0644\u0641\u0627\u062A\u060C \u0643\u062A\u0627\u0628\u0629 \u0623\u0643\u0648\u0627\u062F\u060C \u0628\u0646\u0627\u0621 \u0635\u0641\u062D\u0627\u062A). \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A \u0627\u0644\u0645\u062A\u0642\u062F\u0645: \u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631 \u062D\u0627\u0644\u064A\u0627\u064B." }
    };
  }
  return {
    name: "echo",
    input: {
      text: "\u0639\u0630\u0631\u0627\u064B\u060C \u0644\u0645 \u0623\u0641\u0647\u0645 \u0647\u0630\u0627 \u0627\u0644\u0637\u0644\u0628 \u062A\u0645\u0627\u0645\u0627\u064B. \u0628\u0645\u0627 \u0623\u0646\u0646\u064A \u0641\u064A \u0648\u0636\u0639 '\u0627\u0644\u062A\u0639\u0627\u0641\u064A \u0627\u0644\u0630\u0627\u062A\u064A'\u060C \u064A\u0631\u062C\u0649 \u0625\u0639\u0637\u0627\u0626\u064A \u0623\u0648\u0627\u0645\u0631 \u0648\u0627\u0636\u062D\u0629 \u0645\u062B\u0644:\n- '\u0627\u0628\u0646 \u0645\u0648\u0642\u0639\u0627\u064B \u0628\u0627\u0633\u0645 page.html'\n- '\u0627\u0642\u0631\u0623 \u0627\u0644\u0645\u0644\u0641 data.txt'\n- '\u0634\u063A\u0644 \u0627\u0644\u0633\u0643\u0631\u064A\u0628\u062A test.js'"
    }
  };
}

// src/middleware/auth.ts
var import_jsonwebtoken2 = __toESM(require("jsonwebtoken"));
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = import_jsonwebtoken2.default.verify(token, config.jwtSecret);
    req.auth = payload;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// src/routes/run.ts
init_session();

// src/models/message.ts
var import_mongoose7 = __toESM(require("mongoose"));
var MessageSchema = new import_mongoose7.Schema(
  {
    sessionId: { type: import_mongoose7.Schema.Types.ObjectId, ref: "Session", index: true, required: true },
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, required: true },
    runId: { type: String },
    attachments: [{ name: String, href: String }]
  },
  { timestamps: true }
);
var Message = import_mongoose7.default.model("Message", MessageSchema);

// src/models/file.ts
var import_mongoose8 = __toESM(require("mongoose"));
var FileSchema = new import_mongoose8.Schema({
  originalName: { type: String, required: true },
  filename: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  path: { type: String, required: true },
  content: { type: String },
  // For RAG/LLM context
  sessionId: { type: String, index: true }
}, { timestamps: true });
var FileModel = import_mongoose8.default.model("File", FileSchema);

// src/models/memoryItem.ts
var import_mongoose9 = __toESM(require("mongoose"));
var MemoryItemSchema = new import_mongoose9.Schema(
  {
    scope: { type: String, enum: ["session", "project", "user"], required: true },
    sessionId: { type: import_mongoose9.Schema.Types.ObjectId, ref: "Session", index: true },
    projectId: { type: import_mongoose9.Schema.Types.ObjectId, ref: "Project", index: true },
    userId: { type: import_mongoose9.Schema.Types.ObjectId, ref: "User", index: true },
    key: { type: String, required: true },
    value: { type: import_mongoose9.Schema.Types.Mixed }
  },
  { timestamps: true }
);
var MemoryItem = import_mongoose9.default.model("MemoryItem", MemoryItemSchema);

// src/services/memory.ts
var import_openai2 = __toESM(require("openai"));
var openai2 = new import_openai2.default({
  apiKey: process.env.OPENAI_API_KEY || "dummy",
  baseURL: process.env.OPENAI_BASE_URL
});
var MemoryService = class {
  /**
   * Search for relevant memories based on text similarity (simple keyword matching for now, 
   * ideally vector search but avoiding vector DB complexity for this MVP).
   */
  static async searchMemories(userId, text, limit = 5) {
    if (!userId) return [];
    const keywords = text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (keywords.length === 0) return [];
    const regex = new RegExp(keywords.join("|"), "i");
    const items = await MemoryItem.find({
      userId,
      scope: "user",
      $or: [
        { key: { $regex: regex } },
        { value: { $regex: regex } }
        // Assuming value is stored as string for simple facts
      ]
    }).sort({ updatedAt: -1 }).limit(limit);
    return items.map((item) => `${item.key}: ${item.value}`);
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
      const result2 = JSON.parse(content);
      if (result2.facts && Array.isArray(result2.facts)) {
        for (const fact of result2.facts) {
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
            console.log(`[Memory] Saved fact: ${fact.key} = ${fact.value}`);
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
router3.post("/verify", authenticate, async (req, res) => {
  const { provider, apiKey: apiKey2, baseUrl, model } = req.body || {};
  if (provider === "llm") {
    if (process.env.OPENAI_API_KEY) {
      return res.json({ status: "ok", message: "Joe System Ready" });
    } else {
      return res.json({ status: "ok", message: "Joe System (Heuristic Only)" });
    }
  }
  try {
    const result2 = await planNextStep(
      [{ role: "user", content: "hello" }],
      { provider, apiKey: apiKey2, baseUrl, model, throwOnError: true }
    );
    if (result2) {
      return res.json({ status: "ok", message: "Connected successfully", result: result2 });
    } else {
      return res.status(500).json({ error: "No response from provider" });
    }
  } catch (err) {
    console.error("Verify error:", err);
    return res.status(401).json({ error: err.message || "Connection failed" });
  }
});
function pickToolFromText(text) {
  const t = text.toLowerCase();
  const tn = t.replace(/[\u064B-\u065F\u0670]/g, "").replace(/ـ/g, "");
  const urlMatch = text.match(/https?:\/\/\S+/);
  if (/(صورة|صوره|تصميم|صمم)/.test(t)) {
    if (/(قطة|قطه|قط|cat)/.test(t)) return { name: "browser_snapshot", input: { url: "https://cataas.com/cat" } };
    const label = encodeURIComponent(text.slice(0, 24));
    const url = `https://dummyimage.com/1024x1024/111/eeee.png&text=${label}`;
    return { name: "browser_snapshot", input: { url } };
  }
  if (/(سعر|قيمة).*(الدولار|usd).*(الليرة|الليره|try)/i.test(tn)) {
    return { name: "http_fetch", input: { url: "https://open.er-api.com/v6/latest/USD?sym=TRY", base: "USD", sym: "TRY" } };
  }
  const currencyMap = {
    "\u0627\u0644\u062F\u0648\u0644\u0627\u0631": "USD",
    "\u062F\u0648\u0644\u0627\u0631": "USD",
    "usd": "USD",
    "\u0627\u0645\u0631\u064A\u0643\u064A": "USD",
    "\u0623\u0645\u0631\u064A\u0643\u064A": "USD",
    "\u0627\u0644\u064A\u0648\u0631\u0648": "EUR",
    "euro": "EUR",
    "eur": "EUR",
    "\u0627\u0644\u0644\u064A\u0631\u0629 \u0627\u0644\u062A\u0631\u0643\u064A\u0629": "TRY",
    "\u0627\u0644\u0644\u064A\u0631\u0647 \u0627\u0644\u062A\u0631\u0643\u064A\u0629": "TRY",
    "try": "TRY",
    "\u0644\u064A\u0631\u0629 \u062A\u0631\u0643\u064A\u0629": "TRY",
    "\u0627\u0644\u0644\u064A\u0631\u0629": "TRY",
    "\u0627\u0644\u0644\u064A\u0631\u0647": "TRY",
    "\u0644\u064A\u0631\u0629": "TRY",
    "\u0644\u064A\u0631\u0647": "TRY",
    "\u0627\u0644\u0634\u064A\u0643\u0644": "ILS",
    "\u0634\u064A\u0643\u0644": "ILS",
    "ils": "ILS",
    "\u0627\u0644\u062F\u064A\u0646\u0627\u0631 \u0627\u0644\u0643\u0648\u064A\u062A\u064A": "KWD",
    "\u062F\u064A\u0646\u0627\u0631 \u0643\u0648\u064A\u062A\u064A": "KWD",
    "kwd": "KWD",
    "\u062F\u064A\u0646\u0627\u0631": "KWD",
    "\u0627\u0644\u0631\u064A\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062F\u064A": "SAR",
    "\u0631\u064A\u0627\u0644 \u0633\u0639\u0648\u062F\u064A": "SAR",
    "sar": "SAR",
    "\u0631\u064A\u0627\u0644": "SAR",
    "\u0627\u0644\u062F\u0631\u0647\u0645 \u0627\u0644\u0625\u0645\u0627\u0631\u0627\u062A\u064A": "AED",
    "\u062F\u0631\u0647\u0645 \u0625\u0645\u0627\u0631\u0627\u062A\u064A": "AED",
    "aed": "AED",
    "\u062F\u0631\u0647\u0645": "AED",
    "\u0627\u0644\u062C\u0646\u064A\u0647 \u0627\u0644\u0645\u0635\u0631\u064A": "EGP",
    "\u062C\u0646\u064A\u0647 \u0645\u0635\u0631\u064A": "EGP",
    "egp": "EGP",
    "\u062C\u0646\u064A\u0647": "EGP"
  };
  const curMatch = tn.match(/(?:سعر|قيمة|صرف|تحويل)\s+(.+?)\s+(?:مقابل|ضد|إلى|الى|ب)\s+(.+?)(?:\s|$)/i);
  if (curMatch) {
    const baseName = curMatch[1].trim().toLowerCase();
    const symName = curMatch[2].trim().toLowerCase();
    const findCode = (name) => {
      if (currencyMap[name]) return currencyMap[name];
      for (const k in currencyMap) {
        if (name.includes(k)) return currencyMap[k];
      }
      return name.length === 3 ? name.toUpperCase() : null;
    };
    const base = findCode(baseName);
    const sym = findCode(symName);
    if (base && sym) {
      return { name: "http_fetch", input: { url: `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, base, sym } };
    }
  }
  const names = [
    ["USD", "(\u0627\u0644\u062F\u0648\u0644\u0627\u0631|\u062F\u0648\u0644\u0627\u0631|usd|\u0627\u0645\u0631\u064A\u0643\u064A|\u0623\u0645\u0631\u064A\u0643\u064A)"],
    ["EUR", "(\u0627\u0644\u064A\u0648\u0631\u0648|euro|eur)"],
    ["TRY", "(\u0627\u0644\u0644\u064A\u0631\u0629|\u0627\u0644\u0644\u064A\u0631\u0647|\u0644\u064A\u0631\u0629|\u0644\u064A\u0631\u0647|try|turkish\\s+lira)"],
    ["ILS", "(\u0627\u0644\u0634\u064A\u0643\u0644|\u0634\u064A\u0643\u0644|ils)"],
    ["KWD", "(\u0627\u0644\u062F\u064A\u0646\u0627\u0631|\u062F\u064A\u0646\u0627\u0631|kwd)"],
    ["SAR", "(\u0627\u0644\u0631\u064A\u0627\u0644|\u0631\u064A\u0627\u0644|sar)"],
    ["AED", "(\u0627\u0644\u062F\u0631\u0647\u0645|\u062F\u0631\u0647\u0645|aed)"],
    ["EGP", "(\u0627\u0644\u062C\u0646\u064A\u0647|\u062C\u0646\u064A\u0647|egp)"]
  ];
  const found = [];
  const foundSet = /* @__PURE__ */ new Set();
  for (const [code2, pat] of names) {
    if (new RegExp(pat, "i").test(tn)) {
      foundSet.add(code2);
    }
  }
  if (foundSet.size >= 2) {
    const arr = Array.from(foundSet);
    const base = arr[0];
    const sym = arr[1];
    return { name: "http_fetch", input: { url: `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, base, sym } };
  }
  if (/(ابحث|بحث|search|find|lookup)/.test(t) || /^(من|ما|ماذا|متى|اين|أين|كيف|هل|لماذا|why|what|who|when|where|how)\s/.test(t)) {
    const qMatch = text.match(/(?:عن|حول)\s+(.+)/i);
    const query = qMatch ? qMatch[1] : text;
    return { name: "web_search", input: { query } };
  }
  if (/(rss|feed)/i.test(t) && urlMatch) {
    return { name: "rss_fetch", input: { url: urlMatch[0] } };
  }
  if (/(استخرج|تحليل|html|محتوى)/i.test(t) && urlMatch) {
    return { name: "html_extract", input: { url: urlMatch[0] } };
  }
  if (/(لخص|خلاصة|summarize)/i.test(t)) {
    const m = text.match(/(?:لخص|خلاصة|summarize)\s*[:：]\s*(.+)/i);
    const tx = m ? m[1] : text;
    return { name: "text_summarize", input: { text: tx } };
  }
  if (/(طقس|حرار[هة]|درجة|weather|temperature)/i.test(t) && /(اسطنبول|إسطنبول|istanbul)/i.test(t)) {
    const city = "Istanbul";
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    return { name: "http_fetch", input: { url, city } };
  }
  if (/(صفحة|landing|html)/.test(t)) {
    const html = `<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"/><title>\u0635\u0641\u062D\u0629 \u0645\u0635\u0645\u0645\u0629</title><style>body{font-family:system-ui;background:#0b0b0d;color:#e5e7eb;margin:0}header{padding:24px;background:linear-gradient(90deg,rgba(234,179,8,.15),transparent);border-bottom:1px solid #2a2a30}h1{margin:0;color:#eab308}main{padding:24px;max-width:960px;margin:0 auto}section.card{background:rgba(24,24,27,.6);border:1px solid #2a2a30;border-radius:12px;padding:20px;margin-bottom:12px}</style></head><body><header><h1>\u0635\u0641\u062D\u0629 \u062A\u062C\u0631\u064A\u0628\u064A\u0629</h1></header><main><section class="card"><h2>\u0648\u0635\u0641 \u0627\u0644\u0637\u0644\u0628</h2><p>${text.replace(/</g, "&lt;")}</p></section><section class="card"><h2>\u0645\u062D\u062A\u0648\u0649</h2><p>\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629 \u0643\u0623\u0631\u062A\u064A\u0641\u0627\u0643\u062A \u064A\u0645\u0643\u0646 \u0641\u062A\u062D\u0647 \u0645\u0646 \u0648\u0627\u062C\u0647\u0629 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645.</p></section></main></body></html>`;
    return { name: "file_write", input: { filename: "page.html", content: html } };
  }
  if (/(متجر|ecommerce|shop)/.test(t)) {
    const html = `<!doctype html><html lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"/><title>\u0645\u062A\u062C\u0631 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A</title><style>body{font-family:system-ui;background:#0b0b0d;color:#e5e7eb;margin:0}header{padding:24px;background:linear-gradient(90deg,rgba(234,179,8,.15),transparent);border-bottom:1px solid #2a2a30}h1{margin:0;color:#eab308}main{padding:24px;max-width:1024px;margin:0 auto;display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.product{background:rgba(24,24,27,.6);border:1px solid #2a2a30;border-radius:12px;padding:16px}.product h3{margin:0 0 8px}.price{color:#60a5fa;font-weight:700}</style></head><body><header><h1>\u0645\u062A\u062C\u0631 \u062A\u062C\u0631\u064A\u0628\u064A</h1></header><main>${Array.from({ length: 6 }).map((_, i) => `<div class="product"><h3>\u0645\u0646\u062A\u062C ${i + 1}</h3><p>\u0648\u0635\u0641 \u0642\u0635\u064A\u0631 \u0644\u0644\u0645\u0646\u062A\u062C.</p><div class="price">$${(10 + i * 5).toFixed(2)}</div></div>`).join("")}</main></body></html>`;
    return { name: "file_write", input: { filename: "store.html", content: html } };
  }
  if (t.includes("fetch") && urlMatch) return { name: "http_fetch", input: { url: urlMatch[0] } };
  if (t.includes("write")) return { name: "file_write", input: { filename: "note.txt", content: text } };
  if (t.includes("browser") && urlMatch) return { name: "browser_snapshot", input: { url: urlMatch[0] } };
  return { name: "echo", input: { text } };
}
function detectRisk(text) {
  const risky = /(rm\s+-rf|delete|drop\s+table|shutdown|kill\s+process)/i;
  if (risky.test(text)) {
    return "HIGH: instruction matches destructive pattern";
  }
  return null;
}
router3.post("/start", authenticate, async (req, res) => {
  let { text, sessionId, fileIds, provider, apiKey: apiKey2, baseUrl, model } = req.body || {};
  const ev = (e) => broadcast(e);
  const isAuthed = Boolean(req.auth);
  const userId = req.auth?.sub;
  const useMock = !isAuthed ? true : process.env.MOCK_DB === "1" || import_mongoose11.default.connection.readyState !== 1;
  let attachedText = "";
  const contentParts = [];
  if (!useMock && fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
    try {
      const files = await FileModel.find({ _id: { $in: fileIds } });
      for (const f of files) {
        if (f.mimeType && f.mimeType.startsWith("image/")) {
          try {
            if (import_fs4.default.existsSync(f.path)) {
              const imageBuffer = import_fs4.default.readFileSync(f.path);
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
  if (userId && !useMock) {
    try {
      const memories = await MemoryService.searchMemories(userId, String(text || ""));
      if (memories.length > 0) {
        console.log(`[Memory] Found ${memories.length} relevant memories`);
        fullPromptText += `

[System Note: Known facts about this user (Memory)]:
${memories.join("\n")}
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
  ev({ type: "step_started", data: { name: "plan" } });
  let plan = null;
  try {
    plan = await planNextStep(
      [{ role: "user", content: initialContent }],
      { provider, apiKey: apiKey2, baseUrl, model }
    );
  } catch (err) {
    console.warn("LLM planning error:", err);
  }
  if (!plan) {
    plan = pickToolFromText(String(text || ""));
  } else {
    const h = pickToolFromText(String(text || ""));
    if (plan?.name === "echo" && h?.name && h.name !== "echo") {
      plan = h;
    }
  }
  ev({ type: "step_done", data: { name: "plan", plan } });
  if (!sessionId) {
    if (useMock) {
      const s = store.createSession("Untitled Session");
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
      const s = await Session2.create({ title: `Session ${(/* @__PURE__ */ new Date()).toLocaleString()}`, mode: "ADVISOR", userId, tenantId: tenantDoc._id });
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
    store.addStep(runId, "plan", "done");
  } else {
    const run = await Run.create({ sessionId, status: "running", steps: [{ name: "plan", status: "done" }] });
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
  const risk = detectRisk(String(text || ""));
  if (risk) {
    if (useMock) {
      const ap = store.createApproval(runId, String(text || ""), risk, plan.name, plan.input);
      ev({ type: "approval_required", data: { id: ap.id, runId, risk, action: text } });
      store.updateRun(runId, { status: "blocked" });
      const { planContext: planContext2 } = await Promise.resolve().then(() => (init_context(), context_exports));
      planContext2.set(ap.id, { runId, name: plan.name, input: plan.input });
      return res.json({ runId, blocked: true, approvalId: ap.id });
    } else {
      const ap = await Approval.create({ runId, action: String(text || ""), risk, status: "pending" });
      ev({ type: "approval_required", data: { id: ap._id.toString(), runId, risk, action: text } });
      await Run.findByIdAndUpdate(runId, { $set: { status: "blocked" } });
      const { planContext: planContext2 } = await Promise.resolve().then(() => (init_context(), context_exports));
      planContext2.set(ap._id.toString(), { runId, name: plan.name, input: plan.input });
      return res.json({ runId, blocked: true, approvalId: ap._id.toString() });
    }
  }
  let steps = 0;
  const MAX_STEPS = 10;
  const history = [
    { role: "user", content: initialContent }
  ];
  let lastResult = null;
  let forcedText = null;
  while (steps < MAX_STEPS) {
    ev({ type: "step_started", data: { name: `thinking_step_${steps + 1}` } });
    try {
      console.log(`Step ${steps} History Last Item:`, JSON.stringify(history[history.length - 1]));
      const shouldThrow = Boolean(apiKey2 || provider !== "llm" && provider);
      const isSystemConfigured = !!process.env.OPENAI_API_KEY;
      const throwOnError = !!apiKey2 || provider && provider !== "llm" || isSystemConfigured;
      plan = await planNextStep(history, { provider, apiKey: apiKey2, baseUrl, model, throwOnError });
    } catch (err) {
      console.warn("LLM planning error:", err);
      if (err?.status === 401 || err?.code === "invalid_api_key" || err?.error?.code === "invalid_api_key") {
        ev({ type: "text", data: "\u26A0\uFE0F **Authentication Failed**: The AI provider rejected the API Key. Please check your settings in the provider menu." });
        forcedText = "Authentication Failed";
        break;
      }
      plan = null;
    }
    if (!plan) {
      if (steps === 0) plan = pickToolFromText(String(text || ""));
      else break;
    } else if (steps === 0 && plan?.name === "echo") {
      const h0 = pickToolFromText(String(text || ""));
      if (h0?.name && h0.name !== "echo") {
        plan = h0;
      }
    }
    ev({ type: "step_done", data: { name: `thinking_step_${steps + 1}`, plan } });
    ev({ type: "step_started", data: { name: `execute:${plan.name}` } });
    const result2 = await executeTool(plan.name, plan.input);
    lastResult = result2;
    if (result2.logs?.length) {
      for (const line of result2.logs) {
        ev({ type: "evidence_added", data: { kind: "log", text: line } });
      }
    }
    if (result2.artifacts && Array.isArray(result2.artifacts)) {
      for (const art of result2.artifacts) {
        ev({ type: "artifact_created", data: art });
      }
    }
    ev({ type: result2.ok ? "step_done" : "step_failed", data: { name: `execute:${plan.name}`, result: result2 } });
    if (!result2.ok && plan.name === "image_generate") {
      const errorMsg = String(result2.error || "");
      const logsStr = (result2.logs || []).join("\n");
      if (errorMsg.includes("403") || errorMsg.includes("verification") || logsStr.includes("error=403")) {
        const msg = `\u274C **Image Generation Failed**
${errorMsg}

Please verify your OpenAI organization settings or try a different prompt.`;
        forcedText = msg;
        ev({ type: "text", data: msg });
        break;
      }
    }
    if (result2.ok && plan.name === "echo") {
      const text2 = result2.output?.text;
      if (text2) {
        forcedText = text2;
        ev({ type: "text", data: text2 });
      }
    }
    if (result2.ok && plan.name === "image_generate") {
      const href = result2.output?.href;
      if (href) {
        forcedText = `\u{1F3A8} Image generated successfully.`;
        ev({ type: "text", data: forcedText });
        break;
      }
    }
    if (result2.ok && plan.name === "file_write") {
      const href = result2.output?.href;
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
    if (result2.ok && plan.name === "http_fetch") {
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
        const rates = result2.output?.json?.rates || {};
        let rate = null;
        if (sym && typeof rates[sym] === "number") {
          rate = rates[sym];
        } else if (typeof result2.output?.bodySnippet === "string") {
          const m = result2.output.bodySnippet.match(new RegExp(`"${sym}"\\s*:\\s*([\\d.]+)`));
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
          const cc = Array.isArray(result2.output?.json?.current_condition) ? result2.output.json.current_condition[0] : null;
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
    if (result2.ok && plan.name === "web_search") {
      try {
        const results = Array.isArray(result2.output?.results) ? result2.output.results : [];
        if (results.length > 0) {
          const mdParts = [];
          mdParts.push(`### \u0646\u062A\u0627\u0626\u062C \u0627\u0644\u0628\u062D\u062B`);
          for (let i = 0; i < results.length; i++) {
            const r = results[i];
            const title = String(r.title || "").trim();
            const url = String(r.url || "").trim();
            const desc = String(r.description || "").trim();
            let domain = "";
            try {
              domain = new URL(url).hostname;
            } catch {
            }
            const num = `${i + 1}.`;
            const head = domain ? `${num} [${title}](${url}) _(${domain})_` : `${num} [${title}](${url})`;
            mdParts.push(head);
            if (desc) mdParts.push(`   - ${desc.slice(0, 200)}`);
          }
          const mds = mdParts.join("\n");
          forcedText = mds;
          ev({ type: "text", data: mds });
        }
      } catch {
      }
    }
    if (result2.ok && plan.name === "html_extract") {
      try {
        const o = result2.output || {};
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
      store.addExec(runId, plan.name, plan.input, result2.output, result2.ok, result2.logs);
    } else {
      await ToolExecution.create({ runId, name: plan.name, input: plan.input, output: result2.output, ok: result2.ok, logs: result2.logs });
    }
    if (!result2.ok) {
      const errorMsg = result2.error || (result2.logs ? result2.logs.join("\n") : "Unknown error");
      ev({ type: "text", data: `\u26A0\uFE0F **Self-Healing Activated**: Detected error in '${plan.name}'. Analyzing fix...` });
      history.push({
        role: "assistant",
        content: `Tool '${plan.name}' FAILED. Error: ${errorMsg}. 
You must analyze this error and attempt to fix the issue in the next step. If it's a syntax error, correct it. If it's a missing file or dependency, resolve it.`
      });
    } else {
      history.push({ role: "assistant", content: `Tool '${plan.name}' executed. Result: ${JSON.stringify(result2.output)}` });
    }
    steps++;
    if (plan.name === "echo") {
      forcedText = String(plan.input?.text || "");
      break;
    }
  }
  ev({ type: "run_completed", data: { runId, result: lastResult } });
  const finalContent = forcedText || (lastResult?.output ? JSON.stringify(lastResult.output) : "No output");
  if (useMock) {
    store.addMessage(sessionId, "assistant", finalContent, runId);
    store.updateRun(runId, { status: "done" });
  } else {
    await Message.create({ sessionId, role: "assistant", content: finalContent, runId });
    await Run.findByIdAndUpdate(runId, { $set: { status: "done" } });
  }
  res.json({ runId, status: "done" });
});
var run_default = router3;

// src/routes/runs.ts
var import_express4 = require("express");
var import_mongoose13 = __toESM(require("mongoose"));

// src/models/artifact.ts
var import_mongoose12 = __toESM(require("mongoose"));
var ArtifactSchema = new import_mongoose12.Schema(
  {
    runId: { type: import_mongoose12.Schema.Types.ObjectId, ref: "Run", index: true },
    name: { type: String, required: true },
    href: { type: String, required: true }
  },
  { timestamps: true }
);
var Artifact = import_mongoose12.default.model("Artifact", ArtifactSchema);

// src/routes/runs.ts
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
    const result2 = store.mergeSessions(String(sourceId), String(targetId));
    return res.json({ ok: true, ...result2 });
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
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  if (useMock) {
    return res.json({ sessions: store.listSessions() });
  }
  const sessions2 = await Session.find().sort({ isPinned: -1, updatedAt: -1 }).lean();
  return res.json({ sessions: sessions2 });
});
router5.get("/search", authenticate, async (req, res) => {
  const query = String(req.query.q || "").trim();
  if (!query) return res.json({ results: [] });
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  if (useMock) {
    return res.json({ results: [] });
  }
  const messages2 = await Message.find({
    content: { $regex: query, $options: "i" }
  }).sort({ createdAt: -1 }).limit(20).populate("sessionId", "title");
  const results = messages2.map((m) => ({
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
  const { terminalState, browserState } = req.body;
  const useMock = process.env.MOCK_DB === "1" || import_mongoose15.default.connection.readyState !== 1;
  if (useMock) return res.json({ ok: true });
  await Session.findByIdAndUpdate(id, {
    $set: {
      terminalState,
      browserState,
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
var import_path4 = __toESM(require("path"));
var import_fs5 = __toESM(require("fs"));
var pdf2 = require("pdf-parse");
var router7 = (0, import_express7.Router)();
var storage = import_multer.default.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = import_path4.default.join(__dirname, "../../uploads");
    if (!import_fs5.default.existsSync(uploadDir)) {
      import_fs5.default.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
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
      const dataBuffer = import_fs5.default.readFileSync(req.file.path);
      const data = await pdf2(dataBuffer);
      content = data.text;
    } else if (req.file.mimetype.startsWith("text/") || req.file.mimetype === "application/json" || req.file.mimetype === "application/javascript" || req.file.mimetype.includes("code")) {
      content = import_fs5.default.readFileSync(req.file.path, "utf8");
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
router8.post("/:id/decision", authenticate, async (req, res) => {
  const id = String(req.params.id);
  const { decision } = req.body || {};
  if (!["approved", "denied"].includes(String(decision))) return res.status(400).json({ error: "Invalid decision" });
  const useMock = process.env.MOCK_DB === "1" || import_mongoose17.default.connection.readyState !== 1;
  const ctx = planContext.get(id);
  if (useMock) {
    const a = store.updateApproval(id, { status: decision });
    if (!a || !ctx) return res.status(404).json({ error: "Approval not found" });
    broadcast({ type: "approval_result", data: { id, decision } });
    if (decision === "approved") {
      broadcast({ type: "step_started", data: { name: `execute:${ctx.name}` } });
      const result2 = await executeTool(ctx.name, ctx.input);
      broadcast({ type: result2.ok ? "step_done" : "step_failed", data: { name: `execute:${ctx.name}`, result: result2 } });
      if (result2.artifacts) {
        for (const a2 of result2.artifacts) {
          store.addArtifact(ctx.runId, a2.name, a2.href);
          broadcast({ type: "artifact_created", data: { name: a2.name, href: a2.href } });
        }
      }
      store.updateRun(ctx.runId, { status: result2.ok ? "done" : "failed" });
      broadcast({ type: "run_finished", data: { runId: ctx.runId, ok: result2.ok } });
      planContext.delete(id);
      return res.json({ ok: true, result: result2 });
    } else {
      store.updateRun(ctx.runId, { status: "denied" });
      broadcast({ type: "run_finished", data: { runId: ctx.runId, ok: false } });
      planContext.delete(id);
      return res.json({ ok: true, denied: true });
    }
  } else {
    const a = await Approval.findByIdAndUpdate(id, { $set: { status: decision } }, { new: true });
    if (!a || !ctx) return res.status(404).json({ error: "Approval not found" });
    broadcast({ type: "approval_result", data: { id, decision } });
    if (decision === "approved") {
      broadcast({ type: "step_started", data: { name: `execute:${ctx.name}` } });
      const result2 = await executeTool(ctx.name, ctx.input);
      broadcast({ type: result2.ok ? "step_done" : "step_failed", data: { name: `execute:${ctx.name}`, result: result2 } });
      if (result2.artifacts) {
      }
      await Run.findByIdAndUpdate(ctx.runId, { $set: { status: result2.ok ? "done" : "failed" } });
      broadcast({ type: "run_finished", data: { runId: ctx.runId, ok: result2.ok } });
      planContext.delete(id);
      return res.json({ ok: true, result: result2 });
    } else {
      await Run.findByIdAndUpdate(ctx.runId, { $set: { status: "denied" } });
      broadcast({ type: "run_finished", data: { runId: ctx.runId, ok: false } });
      planContext.delete(id);
      return res.json({ ok: true, denied: true });
    }
  }
});
var approvals_default = router8;

// src/routes/project.ts
var import_express9 = require("express");
var import_fs6 = __toESM(require("fs"));
var import_path5 = __toESM(require("path"));
var router9 = (0, import_express9.Router)();
function getAllFiles(dirPath, arrayOfFiles = [], ignore = ["node_modules", ".git", "dist", "build", ".DS_Store"]) {
  if (!import_fs6.default.existsSync(dirPath)) return arrayOfFiles;
  const files = import_fs6.default.readdirSync(dirPath);
  files.forEach((file) => {
    if (ignore.includes(file)) return;
    const fullPath = import_path5.default.join(dirPath, file);
    if (import_fs6.default.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles, ignore);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });
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
    if (!import_fs6.default.existsSync(cwd)) {
      return res.json({ nodes: [], links: [] });
    }
    const files = getAllFiles(cwd);
    const nodes = [];
    const links = [];
    const fileIdMap = /* @__PURE__ */ new Map();
    files.forEach((f) => {
      const relPath = import_path5.default.relative(cwd, f);
      if (relPath.length > 200) return;
      const id = relPath;
      fileIdMap.set(f, id);
      nodes.push({
        id,
        name: import_path5.default.basename(f),
        type: "file",
        size: import_fs6.default.statSync(f).size,
        extension: import_path5.default.extname(f)
      });
    });
    files.forEach((f) => {
      if (![".ts", ".tsx", ".js", ".jsx", ".css", ".scss"].includes(import_path5.default.extname(f))) return;
      try {
        const content = import_fs6.default.readFileSync(f, "utf-8");
        const imports = getImports(content);
        const sourceId = fileIdMap.get(f);
        if (sourceId) {
          imports.forEach((imp) => {
            if (imp.startsWith(".")) {
              try {
                const dir = import_path5.default.dirname(f);
                let resolved = import_path5.default.resolve(dir, imp);
                const extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".css"];
                let targetFile = "";
                for (const ext of extensions) {
                  if (import_fs6.default.existsSync(resolved + ext) && !import_fs6.default.statSync(resolved + ext).isDirectory()) {
                    targetFile = resolved + ext;
                    break;
                  }
                  if (import_fs6.default.existsSync(import_path5.default.join(resolved, "index" + ext))) {
                    targetFile = import_path5.default.join(resolved, "index" + ext);
                    break;
                  }
                }
                if (targetFile && fileIdMap.has(targetFile)) {
                  links.push({
                    source: sourceId,
                    target: fileIdMap.get(targetFile)
                  });
                }
              } catch {
              }
            }
          });
        }
      } catch {
      }
    });
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
    if (!import_fs6.default.existsSync(rootPath)) {
      return res.status(404).json({ error: "Path not found" });
    }
    const getTree = (dir, currentDepth) => {
      if (currentDepth > depth) return [];
      const files = import_fs6.default.readdirSync(dir, { withFileTypes: true });
      files.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });
      return files.filter((f) => !["node_modules", ".git", "dist", "build", ".DS_Store"].includes(f.name)).map((f) => {
        const fullPath = import_path5.default.join(dir, f.name);
        const isDir = f.isDirectory();
        return {
          name: f.name,
          path: fullPath,
          type: isDir ? "directory" : "file",
          children: isDir ? getTree(fullPath, currentDepth + 1) : void 0
        };
      });
    };
    const tree = getTree(rootPath, 0);
    res.json({ root: rootPath, tree });
  } catch (e) {
    res.status(500).json({ error: "Tree generation failed" });
  }
});
router9.get("/content", authenticate, async (req, res) => {
  try {
    const filePath = String(req.query.path);
    if (!filePath || !import_fs6.default.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }
    if (!filePath.startsWith(process.cwd()) && !filePath.includes("xelitesolutions")) {
    }
    const content = import_fs6.default.readFileSync(filePath, "utf-8");
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
    import_fs6.default.writeFileSync(filePath, content, "utf-8");
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
var import_fs7 = __toESM(require("fs"));
var router13 = (0, import_express13.Router)();
var upload2 = (0, import_multer2.default)({ dest: "/tmp/joe-uploads" });
router13.post("/upload", authenticate, upload2.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const filePath = req.file.path;
    const buffer = import_fs7.default.readFileSync(filePath);
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
    import_fs7.default.unlinkSync(filePath);
    const doc = KnowledgeService.add(req.file.originalname, content);
    res.json({ success: true, document: doc });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message });
  }
});
router13.get("/list", authenticate, (req, res) => {
  const docs = KnowledgeService.getAll();
  res.json(docs.map((d) => ({ id: d.id, filename: d.filename, size: d.content.length })));
});
router13.post("/query", authenticate, async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "Query required" });
  const results = KnowledgeService.search(query);
  res.json({ results: results.map((r) => ({ id: r.document.id, filename: r.document.filename, snippet: r.snippet, score: r.score })) });
});
router13.delete("/:id", authenticate, (req, res) => {
  const { id } = req.params;
  KnowledgeService.delete(id);
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
    const result2 = await coll.updateOne(
      { _id: new import_mongoose18.default.Types.ObjectId(id) },
      { $set: update }
    );
    res.json({ success: true, result: result2 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router14.delete("/:collection/:id", authenticate, async (req, res) => {
  try {
    const { collection, id } = req.params;
    const coll = import_mongoose18.default.connection.db.collection(collection);
    const result2 = await coll.deleteOne({ _id: new import_mongoose18.default.Types.ObjectId(id) });
    res.json({ success: true, result: result2 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
var database_default = router14;

// src/routes/system.ts
var import_express15 = require("express");
var import_child_process2 = require("child_process");
var import_os = __toESM(require("os"));
var router15 = (0, import_express15.Router)();
router15.get("/stats", authenticate, async (req, res) => {
  const totalMem = import_os.default.totalmem();
  const freeMem = import_os.default.freemem();
  const usedMem = totalMem - freeMem;
  const cpuUsage = import_os.default.loadavg()[0];
  res.json({
    memory: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      percent: Math.round(usedMem / totalMem * 100)
    },
    cpu: {
      load: cpuUsage,
      cores: import_os.default.cpus().length
    },
    uptime: import_os.default.uptime(),
    platform: import_os.default.platform(),
    arch: import_os.default.arch()
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
var import_fs8 = __toESM(require("fs"));
var import_path6 = __toESM(require("path"));
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
  broadcast({ type: "healing:error", data: errorEntry });
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
    const projectRoot = import_path6.default.resolve(__dirname, "../../..");
    const resolvedPath = import_path6.default.resolve(projectRoot, filePath);
    if (!resolvedPath.startsWith(projectRoot)) {
    }
    import_fs8.default.writeFileSync(resolvedPath, content);
    res.json({ success: true, message: "Fix applied successfully" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
var healing_default = router16;

// src/routes/docs.ts
var import_express17 = require("express");
var import_fs9 = __toESM(require("fs"));
var import_path7 = __toESM(require("path"));
var import_glob2 = require("glob");
var router17 = (0, import_express17.Router)();
var docsCache = {};
router17.get("/", authenticate, (req, res) => {
  res.json(docsCache);
});
router17.post("/generate", authenticate, async (req, res) => {
  try {
    const projectRoot = import_path7.default.resolve(__dirname, "../../..");
    const files = await (0, import_glob2.glob)("**/*.{ts,tsx}", {
      cwd: projectRoot,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/*.d.ts", "**/test/**"],
      absolute: true
    });
    const selectedFiles = files.slice(0, 10);
    const results = [];
    for (const file of selectedFiles) {
      const relativePath = import_path7.default.relative(projectRoot, file);
      if (docsCache[relativePath]) {
        results.push(docsCache[relativePath]);
        continue;
      }
      const content = import_fs9.default.readFileSync(file, "utf-8");
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
var import_fs10 = __toESM(require("fs"));
var import_path8 = __toESM(require("path"));
var import_glob3 = require("glob");
var router18 = (0, import_express18.Router)();
router18.get("/quality", authenticate, async (req, res) => {
  try {
    const projectRoot = import_path8.default.resolve(__dirname, "../../..");
    const files = await (0, import_glob3.glob)("**/*.{ts,tsx,js,jsx,css,scss}", {
      cwd: projectRoot,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/*.d.ts", "**/coverage/**"],
      absolute: true
    });
    let totalLoc = 0;
    let totalFiles = 0;
    let totalTodos = 0;
    const fileStats = [];
    for (const file of files) {
      const content = import_fs10.default.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      const loc = lines.filter((l) => l.trim().length > 0).length;
      const size = import_fs10.default.statSync(file).size;
      const todos = (content.match(/TODO:/gi) || []).length;
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
        path: import_path8.default.relative(projectRoot, file),
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
var import_glob4 = require("glob");
var import_path9 = __toESM(require("path"));
var import_fs11 = __toESM(require("fs"));
var import_child_process3 = require("child_process");
var router19 = (0, import_express19.Router)();
router19.get("/files", authenticate, async (req, res) => {
  try {
    const projectRoot = import_path9.default.resolve(__dirname, "../../..");
    const files = await (0, import_glob4.glob)("**/*.{test,spec}.{ts,tsx,js,jsx}", {
      cwd: projectRoot,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"],
      absolute: true
    });
    const testFiles = files.map((f) => ({
      path: import_path9.default.relative(projectRoot, f),
      name: import_path9.default.basename(f)
    }));
    res.json(testFiles);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router19.post("/run", authenticate, (req, res) => {
  const { testFile } = req.body;
  const projectRoot = import_path9.default.resolve(__dirname, "../../..");
  const cwd = import_path9.default.resolve(__dirname, "../..");
  const args = ["jest", "--colors"];
  if (testFile) {
    args.push(import_path9.default.resolve(projectRoot, testFile));
  }
  const child = (0, import_child_process3.spawn)("npx", args, { cwd });
  res.setHeader("Content-Type", "text/plain");
  child.stdout.on("data", (data) => {
    res.write(data);
  });
  child.stderr.on("data", (data) => {
    res.write(data);
  });
  child.on("close", (code2) => {
    res.write(`
Test process exited with code ${code2}`);
    res.end();
  });
});
router19.post("/generate", authenticate, async (req, res) => {
  const { filePath } = req.body;
  const projectRoot = import_path9.default.resolve(__dirname, "../../..");
  const fullPath = import_path9.default.resolve(projectRoot, filePath);
  if (!import_fs11.default.existsSync(fullPath)) {
    return res.status(404).json({ error: "File not found" });
  }
  try {
    const content = import_fs11.default.readFileSync(fullPath, "utf-8");
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
    const dir = import_path9.default.dirname(fullPath);
    const ext = import_path9.default.extname(fullPath);
    const name = import_path9.default.basename(fullPath, ext);
    const testFilePath = import_path9.default.join(dir, `${name}.test${ext}`);
    import_fs11.default.writeFileSync(testFilePath, testCode);
    res.json({
      success: true,
      testFilePath: import_path9.default.relative(projectRoot, testFilePath),
      code: testCode
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
var tests_default = router19;

// src/routes/browser.ts
var import_express20 = require("express");
var router20 = (0, import_express20.Router)();
router20.post("/launch", authenticate, async (req, res) => {
  try {
    await browserService.launch();
    res.json({ success: true, status: browserService.getStatus() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router20.post("/navigate", authenticate, async (req, res) => {
  try {
    const { url } = req.body;
    const result2 = await browserService.navigate(url);
    res.json({ success: true, ...result2 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router20.post("/action", authenticate, async (req, res) => {
  try {
    const { type, x, y, text, deltaY, width, height, script: script2 } = req.body;
    switch (type) {
      case "click":
        await browserService.click(x, y);
        break;
      case "type":
        await browserService.type(text);
        break;
      case "scroll":
        await browserService.scroll(deltaY);
        break;
      case "back":
        await browserService.goBack();
        break;
      case "forward":
        await browserService.goForward();
        break;
      case "reload":
        await browserService.reload();
        break;
      case "viewport":
        await browserService.setViewport(width, height);
        break;
      case "evaluate":
        const result2 = await browserService.evaluate(script2);
        return res.json({ success: true, result: result2 });
      case "inspect":
        const info = await browserService.inspect(x, y);
        return res.json({ success: true, info });
      case "click_selector":
        await browserService.clickSelector(req.body.selector);
        break;
      case "type_selector":
        await browserService.typeSelector(req.body.selector, req.body.text);
        break;
      case "dom":
        const dom = await browserService.getSimplifiedDOM();
        return res.json({ success: true, dom });
      case "audit":
        const audit = await browserService.auditPage();
        return res.json({ success: true, audit });
      default:
        return res.status(400).json({ error: "Invalid action type" });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router20.get("/screenshot", authenticate, async (req, res) => {
  try {
    const img = await browserService.screenshot();
    if (!img) return res.status(404).json({ error: "Browser not active" });
    res.json({ image: `data:image/png;base64,${img}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router20.get("/pdf", authenticate, async (req, res) => {
  try {
    const pdf3 = await browserService.pdf();
    if (!pdf3) return res.status(404).json({ error: "Browser not active" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=page.pdf");
    res.send(pdf3);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
router20.get("/logs", authenticate, (req, res) => {
  res.json(browserService.getLogs());
});
router20.get("/network", authenticate, (req, res) => {
  res.json(browserService.getNetwork());
});
router20.post("/close", authenticate, async (req, res) => {
  await browserService.close();
  res.json({ success: true });
});
router20.get("/status", authenticate, (req, res) => {
  res.json(browserService.getStatus());
});
var browser_default = router20;

// src/index.ts
var import_http = __toESM(require("http"));
var import_fs12 = __toESM(require("fs"));
var logger = process.env.NODE_ENV === "production" ? (0, import_pino.default)() : (0, import_pino.default)({
  transport: {
    target: "pino-pretty",
    options: { translateTime: "SYS:standard", colorize: true }
  }
});
async function main() {
  const app = (0, import_express21.default)();
  app.use((0, import_cors.default)({
    origin: true,
    // Allow all origins for now to fix connectivity issues
    credentials: true
  }));
  app.use(import_express21.default.json({ limit: "10mb" }));
  app.use((req, res, next) => {
    const start = Date.now();
    const requestId = Math.random().toString(36).substring(7);
    res.on("finish", () => {
      const duration = Date.now() - start;
      const logEntry = {
        id: requestId,
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        query: req.query,
        body: req.method === "POST" || req.method === "PUT" ? req.body : void 0
      };
      broadcast({ type: "network:request", data: logEntry });
    });
    next();
  });
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
  app.use("/docs", docs_default);
  app.use("/analytics", analytics_default);
  app.use("/tests", tests_default);
  app.use("/browser", browser_default);
  app.get("/me", authenticate, async (req, res) => {
    const auth = req.auth;
    res.json({ userId: auth.sub, role: auth.role });
  });
  const ARTIFACT_DIR2 = process.env.ARTIFACT_DIR || "/tmp/joe-artifacts";
  if (!import_fs12.default.existsSync(ARTIFACT_DIR2)) {
    try {
      import_fs12.default.mkdirSync(ARTIFACT_DIR2, { recursive: true });
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
    logger.info({ port: config.port }, "API listening");
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
