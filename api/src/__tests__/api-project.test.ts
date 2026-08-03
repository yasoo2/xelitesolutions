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

describe('routing — explicit backend asks reach api_project', () => {
    it('«ابنِ لي API لإدارة الطلبات» → api_project', async () => {
        expect(await route('ابنِ لي API لإدارة الطلبات')).toBe('api_project');
    });
    it('«اعمل باك اند بقاعدة بيانات للمخزون» → api_project', async () => {
        expect(await route('اعمل باك اند بقاعدة بيانات للمخزون')).toBe('api_project');
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
        for (const f of ['package.json', 'server.js', 'db.js', 'seed.js', 'README.md', '.gitignore']) {
            expect(fs.existsSync(path.join(proj, f))).toBe(true);
        }
        for (const f of ['server.js', 'db.js', 'seed.js']) {
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
        expect(content).toContain("api: 'http://localhost:4100/api/dishes'");
        const menu = fs.readFileSync(path.join(linked.output.path, 'src', 'components', 'Menu.jsx'), 'utf-8');
        expect(menu).toContain('fetch(content.api)');
        expect(menu).toContain('.catch(');                       // failures keep the baked rows
        expect(menu).toContain('useState(content.menu)');        // the baked rows ARE the default
        expect(menu).toContain('live-dot');
        expect(syntaxOk('Menu.jsx', menu).ok).toBe(true);
        expect((global as any).joeProjects['api-t'].linkedApi).toBe('http://localhost:4100/api/dishes');
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
        for (const method of ['list:', 'get:', 'create:', 'update:', 'remove:', 'count:']) {
            expect((db.match(new RegExp(method.replace(':', ': '), 'g')) || []).length).toBe(2);   // once per backend
        }
        const server = fs.readFileSync(path.join(res.output.path, 'server.js'), 'utf-8');
        expect(server).toContain('/api/health');
        expect(server).toContain("error: 'name_required'");
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
        expect(content).toContain("ordersApi: 'http://localhost:4100/api/orders'");
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
