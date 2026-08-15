/**
 * THE BACKEND FRONT, locked — api_project scaffolds a runnable Express API
 * over a real zero-native-dependency database (node:sqlite, or a JSON store
 * with the identical interface on older runtimes).
 *
 * These locks pin: the tool is registered and deterministically reachable,
 * the planner routes explicit backend asks to it (and does NOT steal
 * frontend or full-stack asks), the offline scaffold is complete and parses,
 * and the resources are kind-aware — a restaurant's API serves dishes, a
 * store's serves products. The live boot/write/read proof runs in
 * src/tests/manual/verify_api_project.ts against real processes.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { ApiProjectTool, apiResourceForKind } from '../modules/tools/definitions/ApiProjectTool';
import { syntaxOk } from '../modules/tools/definitions/ProjectEditTool';

const FALLTHROUGH = 'llm-fallthrough';
const route = async (goal: string): Promise<string> => {
    const p = PlanningEngine.generatePlan(
        { intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any },
    ).then(x => x.steps[0].tool).catch(() => FALLTHROUGH);
    return Promise.race([p, new Promise<string>(r => setTimeout(() => r(FALLTHROUGH), 1500))]);
};

const routeInSession = async (goal: string, sessionId: string): Promise<string> => {
    const p = PlanningEngine.generatePlan(
        { intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any },
        undefined,
        { sessionId },
    ).then(x => x.steps[0].tool).catch(() => FALLTHROUGH);
    return Promise.race([p, new Promise<string>(r => setTimeout(() => r(FALLTHROUGH), 1500))]);
};

describe('quality review routing uses the active built project', () => {
    const sessionId = 'quality-review-t';
    let projectDir: string;

    beforeAll(() => {
        projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-quality-review-'));
        fs.mkdirSync(path.join(projectDir, 'dist'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'dist', 'index.html'), '<!doctype html><html><body>built</body></html>');
        (global as any).joeProjects = {
            ...((global as any).joeProjects || {}),
            [sessionId]: { dir: projectDir, type: 'page', updatedAt: Date.now() },
        };
    });

    afterAll(() => {
        delete (global as any).joeProjects?.[sessionId];
        fs.rmSync(projectDir, { recursive: true, force: true });
    });

    it('«راجع تقرير الجودة والنتيجة النهائية» → project_repair', async () => {
        expect(await routeInSession('راجع تقرير الجودة والنتيجة النهائية', sessionId)).toBe('project_repair');
    });
});

describe('api_project is registered and reachable', () => {
    it('the registry carries it; the orchestrator runs it deterministically', () => {
        const { tools } = require('../modules/tools/registry');
        expect(tools.some((t: any) => t.name === 'api_project')).toBe(true);
        const orch = fs.readFileSync(path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
        expect(orch.match(/DETERMINISTIC_TOOLS = \[([\s\S]*?)\]/)![1]).toContain("'api_project'");
    });
});

describe('«اعرض الطلبات» — the owner reads visitor orders in the chat', () => {
    const { OrdersReadTool, readOrders } = require('../modules/tools/definitions/OrdersReadTool');
    let tmp: string;
    beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-orders-')); });
    afterAll(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
        delete (global as any).joeProjects?.['ord-t'];
    });

    it('is registered, deterministic, and routed', async () => {
        const { tools } = require('../modules/tools/registry');
        expect(tools.some((t: any) => t.name === 'orders_read')).toBe(true);
        const orch = fs.readFileSync(path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
        expect(orch.match(/DETERMINISTIC_TOOLS = \[([\s\S]*?)\]/)![1]).toContain("'orders_read'");
        expect(await route('اعرض الطلبات')).toBe('orders_read');
        expect(await route('كم طلب وصلني اليوم؟')).toBe('orders_read');
    });

    it('readOrders: the SQLite file on disk answers latest-first, server not needed', () => {
        const dir = path.join(tmp, 'api-sq'); fs.mkdirSync(dir, { recursive: true });
        const { DatabaseSync } = require('node:sqlite');
        const conn = new DatabaseSync(path.join(dir, 'data.db'));
        conn.exec("CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT, qty INTEGER, customer TEXT, phone TEXT DEFAULT '', note TEXT DEFAULT '', created_at TEXT DEFAULT '')");
        conn.prepare('INSERT INTO orders (item, qty, customer) VALUES (?, ?, ?)').run('طقم الهدية', 2, 'خالد');
        conn.prepare('INSERT INTO orders (item, qty, customer) VALUES (?, ?, ?)').run('الإصدار الفاخر', 1, 'سارة');
        conn.close();
        const rows = readOrders(dir)!;
        expect(rows.map((r: any) => r.item)).toEqual(['الإصدار الفاخر', 'طقم الهدية']);
    });

    it('readOrders: the JSON twin answers with the same shape; a bare dir answers null', () => {
        const dir = path.join(tmp, 'api-js'); fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify({ seq: 0, rows: [], oseq: 1, orders: [{ id: 1, item: 'عطر', qty: 3, customer: 'نورة', phone: '', note: '', created_at: '' }] }));
        expect(readOrders(dir)![0]).toMatchObject({ item: 'عطر', qty: 3, customer: 'نورة' });
        const bare = path.join(tmp, 'api-none'); fs.mkdirSync(bare, { recursive: true });
        expect(readOrders(bare)).toBeNull();
    });

    it('the tool resolves the API through linkedApiDir and lists in Arabic; honest without one', async () => {
        (global as any).joeProjects = { ...(global as any).joeProjects, 'ord-t': { dir: '/x/react-app', type: 'react', linkedApiDir: path.join(tmp, 'api-sq') } };
        const r: any = await new OrdersReadTool().execute({}, { sessionId: 'ord-t' });
        expect(r.output.total).toBe(2);
        expect(String(r.output.message)).toContain('طقم الهدية ×2 — خالد');
        const none: any = await new OrdersReadTool().execute({}, { sessionId: 'nobody-here' });
        expect(String(none.output.message)).toContain('لا يوجد مشروع API');
    });

    it('the orders bridge: server.js notifies Joe fire-and-forget; ownerSessionOf follows linkedApiDir', async () => {
        const res: any = await new ApiProjectTool().execute(
            { request: 'ابنِ لي API لمنتجات متجر', skipInstall: true, root: tmp }, { sessionId: 'ord-t' });
        const server = fs.readFileSync(path.join(res.output.path, 'server.js'), 'utf-8');
        expect(server).toContain('JOE_INBOX_URL');
        expect(server).toContain('notifyJoe(order)');
        expect(server).toContain('/api/public/forms/');
        const { ownerSessionOf } = require('../api/routes/formsPublic');
        (global as any).joeProjects['ord-t'] = { dir: '/w/react-shop', linkedApiDir: '/w/api-my-store' };
        expect(ownerSessionOf('api-my-store')).toBe('ord-t');
        delete (global as any).joeProjects?.['ord-t'];
    });
});

describe('routing — explicit backend asks reach the evidence-first project pipeline', () => {
    it('«ابنِ لي API لإدارة الطلبات» → project_pipeline', async () => {
        expect(await route('ابنِ لي API لإدارة الطلبات')).toBe('project_pipeline');
    });
    it('«اعمل باك اند بقاعدة بيانات للمخزون» → project_pipeline', async () => {
        expect(await route('اعمل باك اند بقاعدة بيانات للمخزون')).toBe('project_pipeline');
    });
    it('a request that ALSO names a frontend keeps its richer path', async () => {
        expect(await route('ابنِ لي متجر react مع قاعدة بيانات')).not.toBe('api_project');
    });
    it('a plain site request never lands on the backend tool', async () => {
        expect(await route('ابن لي موقع لمطعم')).not.toBe('api_project');
    });
});

describe('the offline scaffold — complete, parseable, kind-aware', () => {
    let tmp: string;
    beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-api-')); });
    afterAll(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
        delete (global as any).joeProjects?.['api-t'];
    });

    it('a restaurant API serves DISHES with seeded rows; every file parses', async () => {
        const res: any = await new ApiProjectTool().execute(
            { request: 'ابنِ لي API لإدارة أطباق مطعم الشواء', skipInstall: true, root: tmp }, { sessionId: 'api-t' });
        expect(res.ok).toBe(true);
        expect(res.output.resource).toBe('dishes');
        const proj = res.output.path;
        for (const f of ['package.json', 'server.js', 'db.js', 'auth.js', 'seed.js', 'README.md', '.gitignore']) {
            expect(fs.existsSync(path.join(proj, f))).toBe(true);
        }
        for (const f of ['server.js', 'db.js', 'auth.js', 'seed.js']) {
            const gate = syntaxOk(f, fs.readFileSync(path.join(proj, f), 'utf-8'));
            expect(`${f}:${gate.ok}`).toBe(`${f}:true`);
        }
        const pkg = JSON.parse(fs.readFileSync(path.join(proj, 'package.json'), 'utf-8'));
        expect(pkg.dependencies.express).toBeTruthy();
        expect(pkg.scripts.start).toBe('node server.js');
        expect(fs.readFileSync(path.join(proj, 'seed.js'), 'utf-8')).toContain('مشاوي مشكلة');
        expect(fs.readFileSync(path.join(proj, 'README.md'), 'utf-8')).toContain('/api/dishes');
        // The database files never reach git.
        expect(fs.readFileSync(path.join(proj, '.gitignore'), 'utf-8')).toMatch(/data\.db[\s\S]*data\.json/);
        // The scaffold registers as the session's active project (type api).
        expect((global as any).joeProjects['api-t'].type).toBe('api');
    });

    it('the kind map: store → products, generic → items — with distinct seeds', () => {
        expect(apiResourceForKind('store' as any, true).resource).toBe('products');
        expect(apiResourceForKind('restaurant' as any, true).resource).toBe('dishes');
        expect(apiResourceForKind('generic' as any, true).resource).toBe('items');
        expect(apiResourceForKind('store' as any, true).seeds.some(s => s.name === 'طقم الهدية')).toBe(true);
    });

    it('FULL-STACK LINK: a react build after an API build is born connected — and unlinked otherwise', async () => {
        const { ReactProjectTool } = require('../modules/tools/definitions/ReactProjectTool');
        // The API registered itself above for session api-t (resource dishes).
        expect((global as any).joeProjects['api-t'].resource).toBe('dishes');
        const linked: any = await new ReactProjectTool().execute(
            { request: 'ابنِ موقع react لمطعم الشواء', skipInstall: true, root: tmp }, { sessionId: 'api-t' });
        const content = fs.readFileSync(path.join(linked.output.path, 'src', 'content.js'), 'utf-8');
        // Repointed: the interface is packaged into the API server's own public/
        // and served BY it, so the base is relative. An absolute localhost URL
        // with a guessed port is what made every fetch fail on the delivered
        // system. «Born connected» is unchanged — the resource is still its own.
        expect(content).toContain("api: '/api/dishes'");
        expect(content).not.toMatch(/api: 'https?:\/\/localhost/);
        const menu = fs.readFileSync(path.join(linked.output.path, 'src', 'components', 'Menu.jsx'), 'utf-8');
        expect(menu).toContain('fetch(content.api)');
        expect(menu).toContain('.catch(');                       // failures keep the baked rows
        expect(menu).toContain('useState(content.menu)');        // the baked rows ARE the default
        expect(menu).toContain('live-dot');
        expect(syntaxOk('Menu.jsx', menu).ok).toBe(true);
        expect((global as any).joeProjects['api-t'].linkedApi).toBe('/api/dishes');
        // A session with NO API stays unlinked — the hook is inert on api: ''.
        const plain: any = await new ReactProjectTool().execute(
            { request: 'ابنِ موقع react لمتجر عطور', skipInstall: true, root: tmp }, { sessionId: 'api-plain' });
        const content2 = fs.readFileSync(path.join(plain.output.path, 'src', 'content.js'), 'utf-8');
        expect(content2).toContain("api: ''");
        const products = fs.readFileSync(path.join(plain.output.path, 'src', 'components', 'Products.jsx'), 'utf-8');
        expect(products).toContain('if (!content.api) return');
        expect(syntaxOk('Products.jsx', products).ok).toBe(true);
        delete (global as any).joeProjects?.['api-plain'];
    });

    it('db.js is the dual-backend contract: sqlite first, same-interface JSON fallback, honest health', async () => {
        const res: any = await new ApiProjectTool().execute(
            { request: 'build an api for inventory', skipInstall: true, root: tmp }, { sessionId: 'api-t' });
        const db = fs.readFileSync(path.join(res.output.path, 'db.js'), 'utf-8');
        expect(db).toContain("await import('node:sqlite')");
        expect(db).toContain('JOE_FORCE_JSON_DB');
        expect(db).toContain("backend: 'json'");
        // Once per backend for the main table — and once per backend AGAIN for
        // the parent table, because an inventory system links its items to a
        // supplier («طبيب ← مواعيده», in its own domain).
        expect(db).toContain('"resource":"suppliers"');
        for (const method of ['list:', 'get:', 'create:', 'update:', 'remove:', 'count:']) {
            expect((db.match(new RegExp(method.replace(':', ': '), 'g')) || []).length).toBe(4);
        }
        const server = fs.readFileSync(path.join(res.output.path, 'server.js'), 'utf-8');
        expect(server).toContain('/api/health');
        // Validation is now driven by the SCHEMA this server was built with, so
        // the literal «name_required» is composed at runtime from the required
        // column. What must hold is the rule, not the spelling: a required field
        // that is missing is refused with a 400 that names it.
        expect(server).toContain("if (c.required && !partial) return { error: c.key + '_required' };");
        expect(server).toContain('res.status(400).json({ ok: false, error })');
        expect(server).toContain('404');
    });

    it('ORDERS: both backends carry the orders store, the routes validate, the README teaches them', async () => {
        const res: any = await new ApiProjectTool().execute(
            { request: 'ابنِ لي API لمنتجات متجر', skipInstall: true, root: tmp }, { sessionId: 'api-t' });
        const db = fs.readFileSync(path.join(res.output.path, 'db.js'), 'utf-8');
        for (const method of ['listOrders', 'createOrder', 'countOrders']) {
            expect((db.match(new RegExp(`${method}: `, 'g')) || []).length).toBe(2);   // once per backend
        }
        expect(db).toContain('CREATE TABLE IF NOT EXISTS orders');
        const server = fs.readFileSync(path.join(res.output.path, 'server.js'), 'utf-8');
        expect(server).toContain("'/api/orders'");
        expect(server).toContain("error: 'item_required'");
        expect(server).toContain("error: 'customer_required'");
        expect(server).toContain("error: 'bad_qty'");
        const { syntaxOk } = require('../modules/tools/definitions/ProjectEditTool');
        expect(syntaxOk('server.js', server).ok).toBe(true);
        expect(syntaxOk('db.js', db).ok).toBe(true);
        expect(fs.readFileSync(path.join(res.output.path, 'README.md'), 'utf-8')).toContain('/api/orders');
    });

    it('the LINKED frontend gets ordersApi and the OrderButton; unlinked ships the plain CTA', async () => {
        const { ReactProjectTool } = require('../modules/tools/definitions/ReactProjectTool');
        // Session api-t currently holds the products API from the test above.
        const linked: any = await new ReactProjectTool().execute(
            { request: 'ابنِ متجر react للعطور', skipInstall: true, root: tmp }, { sessionId: 'api-t' });
        const content = fs.readFileSync(path.join(linked.output.path, 'src', 'content.js'), 'utf-8');
        expect(content).toContain("ordersApi: '/api/orders'");
        expect(content).toContain("orderCta: 'اطلب الآن'");
        const btnPath = path.join(linked.output.path, 'src', 'components', 'OrderButton.jsx');
        expect(fs.existsSync(btnPath)).toBe(true);
        const btn = fs.readFileSync(btnPath, 'utf-8');
        expect(btn).toContain('fetch(content.ordersApi');
        expect(btn).toContain("setState('kept')");           // the honest failure path
        expect(syntaxOk('OrderButton.jsx', btn).ok).toBe(true);
        const products = fs.readFileSync(path.join(linked.output.path, 'src', 'components', 'Products.jsx'), 'utf-8');
        expect(products).toContain('content.ordersApi');
        expect(products).toContain('<OrderButton item={p.name}');
        // Unlinked session: ordersApi empty, the plain CTA renders instead.
        const plain: any = await new ReactProjectTool().execute(
            { request: 'ابنِ متجر react للحقائب', skipInstall: true, root: tmp }, { sessionId: 'api-plain2' });
        const content2 = fs.readFileSync(path.join(plain.output.path, 'src', 'content.js'), 'utf-8');
        expect(content2).toContain("ordersApi: ''");
        delete (global as any).joeProjects?.['api-plain2'];
    });
});

/**
 * THE LOCK ON THE GENERATED API.
 *
 * Every backend scaffolded before this shipped with NO accounts: whoever could
 * reach the port could rewrite the catalogue and read every visitor order —
 * names and phone numbers included. This was the one item deliberately left to
 * the end.
 *
 * What must stay true, forever: the visitor's path is open (browse, order),
 * the owner's path is locked (catalogue writes, reading orders), the password
 * never reaches the disk in the clear, and the generated project still needs
 * no dependency beyond express — scrypt and HMAC are Node's own.
 */
describe('the generated API ships locked, not open', () => {
    const crypto = require('crypto');
    let proj = '', tmp = '', message = '';
    beforeAll(async () => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-api-auth-'));
        const res: any = await new ApiProjectTool().execute(
            { request: 'ابنِ API لمتجر', skipInstall: true, root: tmp }, { sessionId: 'api-auth' });
        proj = res.output.path;
        message = String(res.output.message || '');
    });
    afterAll(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
        delete (global as any).joeProjects?.['api-auth'];
    });
    const read = (f: string) => fs.readFileSync(path.join(proj, f), 'utf-8');

    it('what changes data is guarded; what visitors do is not', () => {
        const server = read('server.js');
        // locked
        expect(server).toMatch(/app\.post\('\/api\/products', requireAuth/);
        expect(server).toMatch(/app\.put\('\/api\/products\/:id', requireAuth/);
        expect(server).toMatch(/app\.delete\('\/api\/products\/:id', requireAuth/);
        expect(server).toMatch(/app\.get\('\/api\/orders', requireAuth/);
        // open — the business itself. The token is READ when it is there, so a
        // signed-in employee gets his own rows, and a visitor still gets the
        // whole shelf: optionalAuth never answers 401.
        expect(server).toMatch(/app\.get\('\/api\/products', optionalAuth, \(req, res\) => res\.json\(\{ ok: true, products: db\.list\(scopeOf\(req\)\) \}\)\)/);
        expect(server).toMatch(/app\.post\('\/api\/orders', \(req, res\)/);
        expect(server).toMatch(/app\.get\('\/api\/health', \(_req, res\)/);
        // and the browser may actually send the header
        expect(server).toContain("'Content-Type, Authorization'");
    });

    it('the password is shown ONCE in the chat and never written to disk', () => {
        const password = (message.match(/كلمة المرور:\s*(\S+)/) || [])[1] || '';
        const email = (message.match(/البريد:\s*(\S+)/) || [])[1] || '';
        expect(password.length).toBeGreaterThan(8);
        expect(email).toMatch(/^owner@/);
        const onDisk = fs.readdirSync(proj)
            .filter(f => fs.statSync(path.join(proj, f)).isFile())
            .map(f => read(f)).join('\n');
        expect(onDisk.includes(password)).toBe(false);

        // …and the hash that IS on disk really is that password's — the seeded
        // account must be one the owner can actually log into.
        const seed = read('seed.js');
        const salt = (seed.match(/salt: '([0-9a-f]{32})'/) || [])[1];
        const hash = (seed.match(/hash: '([0-9a-f]{128})'/) || [])[1];
        expect(crypto.scryptSync(password, salt, 64).toString('hex')).toBe(hash);
        // the seeder normalises before storing, so the literal is wrapped
        expect(seed).toContain(`normalizeEmail('${email}')`);
    });

    it('the token secret never enters git, and no new dependency was added', () => {
        expect(read('.gitignore')).toContain('.auth-secret');
        expect(read('auth.js')).toContain("fs.writeFileSync(SECRET_FILE, made, { mode: 0o600 })");
        expect(Object.keys(JSON.parse(read('package.json')).dependencies)).toEqual(['express']);
        expect(read('auth.js')).toContain("import crypto from 'node:crypto'");
    });

    it('a forged token cannot crash the guard — length is checked before timingSafeEqual', () => {
        const auth = read('auth.js');
        expect(auth).toContain('if (sig.length !== expect.length) return null;');
        expect(auth).toContain('crypto.timingSafeEqual');
        // a wrong password and an unknown email must answer identically
        expect(read('server.js')).toContain("if (!user || !verifyPassword(password, user.salt, user.hash))");
    });

    it('the README teaches the owner both halves in Arabic', () => {
        const readme = read('README.md');
        expect(readme).toContain('Authorization: Bearer');
        expect(readme).toContain('/api/auth/login');
        expect(readme).toMatch(/عامّ للزوار/);
        expect(readme).toMatch(/محميّ بحسابك/);
    });
});

/**
 * THE OWNER'S DASHBOARD — locked, because it is the half that closes the lock.
 *
 * The generated API needs a token to change the catalogue and to read the
 * orders. Without a screen, those credentials had nowhere to be typed but
 * curl. And the first browser to try the screen found a defect the tests
 * could not have: an Arabic brand minted `owner@مشروعي.local`, and an
 * <input type="email"> PUNYCODES the domain — so the address the owner typed
 * was never the address the API stored, and the only message was «wrong
 * password».
 */
describe('the generated site carries the owner\'s dashboard', () => {
    const { ReactProjectTool } = require('../modules/tools/definitions/ReactProjectTool');
    let tmp = '', linked: any, plain: any;
    beforeAll(async () => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-owner-dash-'));
        const api: any = await new ApiProjectTool().execute(
            { request: 'ابنِ API لمتجر', skipInstall: true, root: tmp }, { sessionId: 'dash' });
        linked = { api, site: await new ReactProjectTool().execute(
            { request: 'ابنِ متجر react', skipInstall: true, root: tmp }, { sessionId: 'dash' }) };
        plain = await new ReactProjectTool().execute(
            { request: 'ابنِ صفحة هبوط لمكتب', skipInstall: true, root: tmp }, { sessionId: 'dash-plain' });
    }, 120000);
    afterAll(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
        delete (global as any).joeProjects?.['dash'];
        delete (global as any).joeProjects?.['dash-plain'];
    });

    it('the owner account is an address a BROWSER will send back unchanged', () => {
        const email = (String(linked.api.output.message).match(/البريد:\s*(\S+)/) || [])[1] || '';
        expect(email).toMatch(/^[\x21-\x7e]+$/);          // pure ASCII, no unicode domain
        expect(email).toMatch(/^owner@[a-z0-9-]+\.local$/);
    });

    it('…and the API resolves both spellings anyway', () => {
        const auth = fs.readFileSync(path.join(linked.api.output.path, 'auth.js'), 'utf-8');
        expect(auth).toContain('domainToASCII');
        expect(auth).toContain('export function normalizeEmail');
        const server = fs.readFileSync(path.join(linked.api.output.path, 'server.js'), 'utf-8');
        expect(server).toContain('db.userByEmail(normalizeEmail(email))');
    });

    it('a linked site ships the dashboard, mounts it, and offers the way in', () => {
        const dir = linked.site.output.path;
        const panel = fs.readFileSync(path.join(dir, 'src', 'components', 'AdminPanel.jsx'), 'utf-8');
        expect(syntaxOk('AdminPanel.jsx', panel).ok).toBe(true);
        expect(fs.readFileSync(path.join(dir, 'src', 'App.jsx'), 'utf-8')).toContain('<AdminPanel content={content} />');
        expect(fs.readFileSync(path.join(dir, 'src', 'components', 'Footer.jsx'), 'utf-8')).toContain("href={(content.routeBase || '') === '/' ? '#/admin' : '#/admin'}");
        expect(fs.readFileSync(path.join(dir, 'src', 'content.js'), 'utf-8')).toMatch(/api: '\/api\//);
        // it reaches the real endpoints, with a token, and keeps it per brand
        expect(panel).toContain("'/auth/login'");
        expect(panel).toContain("authed('/orders')");
        expect(panel).toContain("'Bearer ' + token");
        expect(panel).toContain("'joe-admin-token:'");
        // a rejected token signs you out instead of looping
        expect(panel).toContain('res.status === 401');
    });

    it('an UNLINKED site renders none of it', () => {
        const dir = plain.output.path;
        expect(fs.readFileSync(path.join(dir, 'src', 'content.js'), 'utf-8')).toContain("api: ''");
        // the file ships (App imports it unconditionally) but returns null
        const panel = fs.readFileSync(path.join(dir, 'src', 'components', 'AdminPanel.jsx'), 'utf-8');
        expect(panel).toContain('if (!content.api || !open) return null;');
        expect(fs.readFileSync(path.join(dir, 'src', 'components', 'Footer.jsx'), 'utf-8')).toContain('content.api ?');
    });
});
