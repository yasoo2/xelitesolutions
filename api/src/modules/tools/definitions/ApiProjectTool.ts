/**
 * THE BACKEND FRONT — Joe builds real APIs, not just faces.
 *
 * Every world-class builder eventually hits the same wall: a beautiful
 * frontend with nowhere to PUT anything. This tool scaffolds a complete,
 * runnable Express API with a REAL database and ZERO native dependencies:
 *
 *   - node:sqlite when the runtime carries it (Node ≥ 22.5 — the user's
 *     machine runs Node 24, where it is stable);
 *   - a JSON file store with the IDENTICAL interface otherwise, chosen at
 *     boot by the generated db.js itself — the API works on every Node, and
 *     /api/health tells you honestly which backend you got.
 *
 * The discipline is the same as the React scaffolder: hand-written
 * parameterized templates that run by construction (no model writes code),
 * kind-aware resources (a restaurant's API serves dishes, a store's serves
 * products), bounded validation, parameterized statements, and a LIVE PROOF
 * at the end — the tool boots the real server (through the Execution
 * Authority), POSTs a real row over real HTTP, reads it back, and only
 * then reports the API as working.
 */
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { brandFrom } from '../../../core/design/page-head';
import { detectPageKind, type PageKind } from '../../../core/design/blueprints';
import { broadcast, broadcastThinkingDetail } from '../../../api/ws';
import { persistJoeProjects } from '../../../api/page-store';

const slug = (s: string) => (String(s || '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 32)) || 'api';
const js = (s: string) => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');

/** What this kind of business stores — the resource and its seed rows. */
export function apiResourceForKind(kind: PageKind, isAr: boolean): {
    resource: string; labelAr: string; seeds: Array<{ name: string; details: string; price: string }>;
} {
    if (kind === 'restaurant') {
        return {
            resource: 'dishes', labelAr: 'الأطباق',
            seeds: isAr ? [
                { name: 'طبق اليوم', details: 'وصفة الشيف الموسمية بمكونات طازجة', price: '48 ر.س' },
                { name: 'مشاوي مشكلة', details: 'تشكيلة مشاوي على الفحم مع الأرز', price: '65 ر.س' },
                { name: 'سلطة الموسم', details: 'خضار المزرعة مع صلصة الليمون', price: '24 ر.س' },
            ] : [
                { name: 'Dish of the day', details: 'The chef\'s seasonal recipe', price: '$18' },
                { name: 'Mixed grill', details: 'Charcoal grill selection with rice', price: '$24' },
            ],
        };
    }
    if (kind === 'store') {
        return {
            resource: 'products', labelAr: 'المنتجات',
            seeds: isAr ? [
                { name: 'الإصدار الكلاسيكي', details: 'الخيار الأقرب لقلوب عملائنا', price: '120 ر.س' },
                { name: 'الإصدار الفاخر', details: 'خامات أرقى ولمسة نهائية مميزة', price: '220 ر.س' },
                { name: 'طقم الهدية', details: 'تغليف أنيق جاهز للإهداء', price: '180 ر.س' },
            ] : [
                { name: 'Classic edition', details: 'The customer favourite', price: '$39' },
                { name: 'Premium edition', details: 'Finer materials, finished by hand', price: '$69' },
            ],
        };
    }
    return {
        resource: 'items', labelAr: 'العناصر',
        seeds: isAr ? [
            { name: 'عنصر تجريبي أول', details: 'أضيف مع بذر القاعدة — عدّله أو احذفه', price: '' },
            { name: 'عنصر تجريبي ثانٍ', details: 'المسارات جاهزة: أضف، عدّل، احذف', price: '' },
        ] : [
            { name: 'First sample item', details: 'Seeded with the database — edit or delete it', price: '' },
        ],
    };
}

function filePackageJson(name: string): string {
    return JSON.stringify({
        name: `api-${slug(name)}`, private: true, version: '0.1.0', type: 'module',
        scripts: { start: 'node server.js', dev: 'node --watch server.js' },
        dependencies: { express: '^4.21.2' },
    }, null, 2);
}

/**
 * db.js — the dual-backend heart. SQLite when the runtime carries it, a
 * JSON file with the identical interface otherwise. The column is `details`
 * (not `desc` — a reserved SQL word that would refuse the CREATE TABLE).
 */
function fileDbJs(resource: string): string {
    return `// The data layer: node:sqlite when this Node has it (>= 22.5), a JSON
// file with the SAME interface otherwise. Zero native dependencies either
// way — and /api/health reports which backend you actually got.
// Force the JSON path (tests, comparisons): JOE_FORCE_JSON_DB=1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let db;

if (process.env.JOE_FORCE_JSON_DB !== '1') {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const conn = new DatabaseSync(path.join(HERE, 'data.db'));
    conn.exec(\`CREATE TABLE IF NOT EXISTS ${resource} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      details TEXT DEFAULT '',
      price TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )\`);
    const rowOf = (r) => (r ? { id: r.id, name: r.name, details: r.details, price: r.price, created_at: r.created_at } : null);
    db = {
      backend: 'sqlite',
      list: () => conn.prepare('SELECT * FROM ${resource} ORDER BY id DESC LIMIT 500').all().map(rowOf),
      get: (id) => rowOf(conn.prepare('SELECT * FROM ${resource} WHERE id = ?').get(Number(id))),
      create: ({ name, details = '', price = '' }) => {
        const r = conn.prepare('INSERT INTO ${resource} (name, details, price) VALUES (?, ?, ?)')
          .run(String(name), String(details), String(price));
        return db.get(r.lastInsertRowid);
      },
      update: (id, patch) => {
        const cur = db.get(id);
        if (!cur) return null;
        conn.prepare('UPDATE ${resource} SET name = ?, details = ?, price = ? WHERE id = ?')
          .run(String(patch.name ?? cur.name), String(patch.details ?? cur.details), String(patch.price ?? cur.price), Number(id));
        return db.get(id);
      },
      remove: (id) => conn.prepare('DELETE FROM ${resource} WHERE id = ?').run(Number(id)).changes > 0,
      count: () => Number(conn.prepare('SELECT COUNT(*) AS n FROM ${resource}').get().n),
      listOrders: () => conn.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 500').all()
        .map((o) => ({ id: o.id, item: o.item, qty: o.qty, customer: o.customer, phone: o.phone, note: o.note, created_at: o.created_at })),
      createOrder: ({ item, qty = 1, customer, phone = '', note = '' }) => {
        const r = conn.prepare('INSERT INTO orders (item, qty, customer, phone, note) VALUES (?, ?, ?, ?, ?)')
          .run(String(item), Number(qty), String(customer), String(phone), String(note));
        const o = conn.prepare('SELECT * FROM orders WHERE id = ?').get(r.lastInsertRowid);
        return { id: o.id, item: o.item, qty: o.qty, customer: o.customer, phone: o.phone, note: o.note, created_at: o.created_at };
      },
      countOrders: () => Number(conn.prepare('SELECT COUNT(*) AS n FROM orders').get().n),
    };
    conn.exec(\`CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item TEXT NOT NULL,
      qty INTEGER DEFAULT 1,
      customer TEXT NOT NULL,
      phone TEXT DEFAULT '',
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )\`);
  } catch { /* an older Node — the JSON backend below serves instead */ }
}

if (!db) {
  const FILE = path.join(HERE, 'data.json');
  const load = () => {
    try {
      const s = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
      s.orders = s.orders || []; s.oseq = s.oseq || 0;
      return s;
    } catch { return { seq: 0, rows: [], oseq: 0, orders: [] }; }
  };
  const save = (s) => fs.writeFileSync(FILE, JSON.stringify(s, null, 2));
  db = {
    backend: 'json',
    list: () => load().rows.slice().reverse().slice(0, 500),
    get: (id) => load().rows.find((r) => r.id === Number(id)) || null,
    create: ({ name, details = '', price = '' }) => {
      const s = load();
      const row = { id: ++s.seq, name: String(name), details: String(details), price: String(price), created_at: new Date().toISOString() };
      s.rows.push(row);
      save(s);
      return row;
    },
    update: (id, patch) => {
      const s = load();
      const row = s.rows.find((r) => r.id === Number(id));
      if (!row) return null;
      if (patch.name !== undefined) row.name = String(patch.name);
      if (patch.details !== undefined) row.details = String(patch.details);
      if (patch.price !== undefined) row.price = String(patch.price);
      save(s);
      return row;
    },
    remove: (id) => {
      const s = load();
      const before = s.rows.length;
      s.rows = s.rows.filter((r) => r.id !== Number(id));
      save(s);
      return s.rows.length < before;
    },
    count: () => load().rows.length,
    listOrders: () => load().orders.slice().reverse().slice(0, 500),
    createOrder: ({ item, qty = 1, customer, phone = '', note = '' }) => {
      const s = load();
      const order = { id: ++s.oseq, item: String(item), qty: Number(qty), customer: String(customer), phone: String(phone), note: String(note), created_at: new Date().toISOString() };
      s.orders.push(order);
      save(s);
      return order;
    },
    countOrders: () => load().orders.length,
  };
}

export { db };
`;
}

function fileSeedJs(seeds: Array<{ name: string; details: string; price: string }>): string {
    return `// Idempotent seed: rows land ONCE, on the first boot of an empty database.
import { db } from './db.js';

export function seed() {
  if (db.count() > 0) return 0;
  const rows = [
${seeds.map(s => `    { name: '${js(s.name)}', details: '${js(s.details)}', price: '${js(s.price)}' },`).join('\n')}
  ];
  for (const r of rows) db.create(r);
  return rows.length;
}
`;
}

function fileServerJs(resource: string, brand: string): string {
    return `// ${brand} — a real Express API over a real database. Runs with:
//   npm start            (port 4100)
//   PORT=5050 npm start  (any port)
import express from 'express';
import { db } from './db.js';
import { seed } from './seed.js';

const app = express();
app.use(express.json({ limit: '100kb' }));

// The local previews live on other ports — they must be able to reach us.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, backend: db.backend, count: db.count(), orders: db.countOrders() }));

// Visitor ORDERS — the frontend's «اطلب الآن» writes real rows here.
app.get('/api/orders', (_req, res) => res.json({ ok: true, orders: db.listOrders() }));

app.post('/api/orders', (req, res) => {
  const { item, qty, customer, phone, note } = req.body || {};
  if (typeof item !== 'string' || !item.trim() || item.length > 200) {
    return res.status(400).json({ ok: false, error: 'item_required' });
  }
  if (typeof customer !== 'string' || !customer.trim() || customer.length > 100) {
    return res.status(400).json({ ok: false, error: 'customer_required' });
  }
  const q = qty === undefined ? 1 : Number(qty);
  if (!Number.isInteger(q) || q < 1 || q > 99) {
    return res.status(400).json({ ok: false, error: 'bad_qty' });
  }
  if ((phone !== undefined && (typeof phone !== 'string' || phone.length > 30))
    || (note !== undefined && (typeof note !== 'string' || note.length > 500))) {
    return res.status(400).json({ ok: false, error: 'bad_fields' });
  }
  res.status(201).json({ ok: true, order: db.createOrder({ item: item.trim(), qty: q, customer: customer.trim(), phone, note }) });
});

app.get('/api/${resource}', (_req, res) => res.json({ ok: true, ${resource}: db.list() }));

app.get('/api/${resource}/:id', (req, res) => {
  const row = db.get(req.params.id);
  if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, item: row });
});

app.post('/api/${resource}', (req, res) => {
  const { name, details, price } = req.body || {};
  // Honest validation, bounded fields — an API that swallows garbage
  // corrupts its own database first and its user's trust second.
  if (typeof name !== 'string' || !name.trim() || name.length > 200) {
    return res.status(400).json({ ok: false, error: 'name_required' });
  }
  if ((details !== undefined && (typeof details !== 'string' || details.length > 1000))
    || (price !== undefined && (typeof price !== 'string' || price.length > 40))) {
    return res.status(400).json({ ok: false, error: 'bad_fields' });
  }
  res.status(201).json({ ok: true, item: db.create({ name: name.trim(), details, price }) });
});

app.put('/api/${resource}/:id', (req, res) => {
  const { name, details, price } = req.body || {};
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 200)) {
    return res.status(400).json({ ok: false, error: 'bad_name' });
  }
  const row = db.update(req.params.id, { name, details, price });
  if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true, item: row });
});

app.delete('/api/${resource}/:id', (req, res) => {
  if (!db.remove(req.params.id)) return res.status(404).json({ ok: false, error: 'not_found' });
  res.json({ ok: true });
});

const seeded = seed();
const port = Number(process.env.PORT || 4100);
app.listen(port, () => {
  console.log(\`[api] listening on http://localhost:\${port} — backend: \${db.backend}\${seeded ? \`, seeded \${seeded} rows\` : ''}\`);
});
`;
}

function fileReadme(brand: string, resource: string, labelAr: string): string {
    return `# ${brand} — API

خادم Express حقيقي فوق قاعدة بيانات حقيقية، **بلا أي اعتماديات أصلية**:
يستخدم \`node:sqlite\` المدمجة (Node ‏22.5 فأحدث)، وعلى Node أقدم يعمل تلقائياً
بمخزن JSON بنفس الواجهة — و\`/api/health\` يخبرك بصدق أي قاعدة تعمل.

## التشغيل

\`\`\`bash
npm install
npm start          # المنفذ 4100
PORT=5050 npm start
\`\`\`

## المسارات — ${labelAr}

\`\`\`bash
curl http://localhost:4100/api/health
curl http://localhost:4100/api/${resource}
curl -X POST http://localhost:4100/api/${resource} -H "Content-Type: application/json" -d '{"name":"جديد","details":"وصف","price":"50"}'
curl -X PUT  http://localhost:4100/api/${resource}/1 -H "Content-Type: application/json" -d '{"price":"75"}'
curl -X DELETE http://localhost:4100/api/${resource}/1
\`\`\`

## الطلبات — تكتبها واجهة المتجر/المطعم المربوطة تلقائياً

\`\`\`bash
curl http://localhost:4100/api/orders
curl -X POST http://localhost:4100/api/orders -H "Content-Type: application/json" -d '{"item":"طقم الهدية","qty":2,"customer":"خالد","phone":"05xxxxxxxx"}'
\`\`\`

البيانات محفوظة على القرص (\`data.db\` أو \`data.json\`) — تنجو من إعادة التشغيل.
`;
}

export class ApiProjectTool extends BaseTool {
    name = 'api_project';
    description = 'Scaffold a complete runnable Express API with a real zero-dependency database (node:sqlite or JSON fallback), then boot it and prove a real HTTP write/read round-trip.';
    version = '1.0.0';
    tags = ['build', 'api', 'backend', 'database'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            request: { type: 'string', description: 'What the API is for, in the user\'s words' },
            skipInstall: { type: 'boolean', description: 'Scaffold only — no npm install, no live boot proof' },
        },
        required: ['request'],
    };
    permissions: ToolPermission[] = ['execute', 'write'];
    sideEffects: ToolPermission[] = ['execute', 'write'];
    rateLimitPerMinute = 6;
    auditFields = ['request'];

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        const request = String(input?.request || '').trim()
            .replace(/\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)[\s\S]*$/i, '').trim();
        if (!request) return { ok: false, error: 'no_request', logs };
        const sessionId = context?.sessionId;
        const isAr = /[؀-ۿ]/.test(request);
        try { broadcast({ type: 'build_started', sessionId, data: { tool: 'api_project', sessionId } } as any); } catch { /* UI optional */ }

        const term = (line: string) => {
            logs.push(line);
            try {
                [String(sessionId || ''), 'local', 'default', 'panel-terminal'].filter(Boolean)
                    .forEach(id => broadcast({ type: 'terminal_output', id, data: line + '\r\n' } as any));
            } catch { /* UI optional */ }
        };

        const kind = detectPageKind(request);
        const brand = brandFrom(request, isAr) || (isAr ? 'مشروعي' : 'MyApp');
        const { resource, labelAr, seeds } = apiResourceForKind(kind, isAr);
        const dirName = `api-${slug(brand)}`;
        const { workspaceService } = require('../../services/WorkspaceService');
        const root = String(input?.root || workspaceService.getExplorerRoot());
        const proj = path.join(root, dirName);
        fs.mkdirSync(proj, { recursive: true });

        if (sessionId) broadcastThinkingDetail(sessionId, isAr
            ? `🗄️ أبني واجهة خلفية حقيقية بقاعدة بيانات: ${brand}`
            : `🗄️ Building a real backend with a database: ${brand}`);

        const files: Record<string, string> = {
            'package.json': filePackageJson(brand),
            'server.js': fileServerJs(resource, brand),
            'db.js': fileDbJs(resource),
            'seed.js': fileSeedJs(seeds),
            'README.md': fileReadme(brand, resource, labelAr),
            '.gitignore': 'node_modules\ndata.db\ndata.json\n',
        };
        for (const [rel, body] of Object.entries(files)) {
            fs.writeFileSync(path.join(proj, rel), body, 'utf-8');
        }
        term(`api_project: scaffolded ${Object.keys(files).length} files in ${proj}`);

        // ── the live proof: install, boot the REAL server, write and read a
        //    REAL row over REAL HTTP. Reported only as measured.
        let installed = false, proven = false, backend = '', createdId = 0, npmMissing = false;
        if (!input?.skipInstall) {
            // Through the Single Execution Authority — a direct spawn here
            // BLOCKED STARTUP on the user's machine (ExecutionEnforcer).
            const { executionEngine } = require('../../../kernel/ExecutionEngine');
            const inst = await (async () => {
                const h = executionEngine.runArgvStreaming('npm', ['install', '--no-audit', '--no-fund'], {
                    cwd: proj, timeout: 240_000, shell: process.platform === 'win32', env: { NO_COLOR: '1' },
                    onLine: (l: string) => term(`  ${l.slice(0, 200)}`),
                });
                const r = await h.done;
                if (r.exitCode === null) return -1;
                if (r.exitCode === 124 && r.error === 'timeout') return -2;
                return r.exitCode;
            })();
            npmMissing = inst === -1;
            installed = inst === 0;
            term(`npm install → ${installed ? 'OK' : `exit ${inst}`}`);

            if (installed) {
                if (sessionId) broadcastThinkingDetail(sessionId, isAr ? '🚀 أشغّل الخادم وأثبت كتابة/قراءة حقيقية…' : '🚀 Booting the server for a real write/read proof…');
                const port = 4100 + Math.floor(Math.random() * 400);
                let child: { done: Promise<any>; kill: () => void } | null = null;
                try {
                    let upResolve: (v: boolean) => void = () => { /* set below */ };
                    const upPromise = new Promise<boolean>((resolve) => { upResolve = resolve; });
                    const upTimer = setTimeout(() => upResolve(false), 15_000);
                    child = executionEngine.runArgvStreaming(process.execPath, ['server.js'], {
                        cwd: proj, env: { PORT: String(port), NODE_NO_WARNINGS: '1' },
                        onLine: (l: string) => {
                            term(`  ${l.slice(0, 200)}`);
                            if (/listening on/.test(l)) upResolve(true);
                        },
                    });
                    child!.done.then(() => upResolve(false));
                    const up = await upPromise;
                    clearTimeout(upTimer);
                    if (up) {
                        const base = `http://127.0.0.1:${port}`;
                        const health = await fetch(`${base}/api/health`).then(r => r.json()).catch(() => null);
                        backend = String(health?.backend || '');
                        const made = await fetch(`${base}/api/${resource}`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: isAr ? 'صف الإثبات الحي' : 'Live-proof row', details: 'written over real HTTP by Joe', price: '1' }),
                        }).then(r => r.json()).catch(() => null);
                        createdId = Number(made?.item?.id || 0);
                        const listed = await fetch(`${base}/api/${resource}`).then(r => r.json()).catch(() => null);
                        proven = createdId > 0 && Array.isArray(listed?.[resource])
                            && listed[resource].some((r: any) => r.id === createdId);
                        term(`live proof → ${proven ? `OK (backend ${backend}, row #${createdId} written and read back)` : 'FAILED'}`);
                    } else {
                        term('live proof → server did not come up');
                    }
                } finally {
                    try { child?.kill(); } catch { /* already gone */ }
                }
            }
        }

        const sessionKey = String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const projects: Record<string, any> = (global as any).joeProjects || ((global as any).joeProjects = {});
        // resource + port ride along so a LATER react build in this session
        // can link itself to this API (the full-stack chain).
        projects[sessionKey] = { dir: proj, type: 'api', brand, resource, port: 4100, updatedAt: Date.now(), lastRequest: request.slice(0, 80) };
        persistJoeProjects();

        const fileList = Object.keys(files).map(f => `  • ${f}`).join('\n');
        const message = isAr
            ? `🗄️ ${proven ? 'بُنيت واجهة خلفية كاملة وثبت عملها بكتابة وقراءة حقيقيتين' : installed ? 'بُنيت واجهة خلفية كاملة وثُبتت حزمها' : 'بُنيت واجهة خلفية كاملة'} — «${brand}».

📂 المسار: ${proj}
${fileList}

${proven
                ? `✅ الإثبات الحي: الخادم اشتغل فعلاً، وكُتب صف رقم ${createdId} عبر HTTP حقيقي وقُرئ من القاعدة (${backend === 'sqlite' ? 'SQLite المدمجة' : 'مخزن JSON'}) — والبيانات محفوظة على القرص وتنجو من إعادة التشغيل.`
                : npmMissing ? '⚠️ npm غير متاح هنا — المشروع جاهز؛ ثبّته بنفسك: npm install ثم npm start.'
                    : installed ? '⚠️ الخادم لم يثبت جاهزيته في المهلة — شغّله يدوياً: npm start.'
                        : input?.skipInstall ? 'ℹ️ تخطيت التثبيت كما طُلب — شغّله: npm install ثم npm start.' : '⚠️ التثبيت لم يكتمل — جرّب npm install داخل المجلد.'}

🧭 مسارات ${labelAr}: GET/POST /api/${resource} · GET/PUT/DELETE /api/${resource}/:id · GET /api/health
   أمثلة curl جاهزة داخل README.md

🧭 خطوات تالية — أرسل أيّ سطر كما هو:
   • «شغّل المشروع» → أشغّل الخادم وأبقيه يعمل
   • «عدّل …» → تعديل جراحي متحقق على ملفات الخادم
   • لاحقاً: اربطه بواجهة React («ابنِ متجر react واربطه بالـ API»)`
            : `🗄️ ${proven ? 'A full backend, scaffolded AND proven with a real HTTP write/read' : 'A full backend scaffolded'} — "${brand}".

📂 Path: ${proj}
${fileList}
${proven ? `✅ Live proof: row #${createdId} written over real HTTP and read back (backend: ${backend}).` : ''}
Routes: GET/POST /api/${resource} · GET/PUT/DELETE /api/${resource}/:id · GET /api/health`;

        return {
            ok: true,
            output: { message, path: proj, dir: dirName, resource, installed, proven, backend, files: Object.keys(files) },
            logs,
        } as any;
    }
}
