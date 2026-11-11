/**
 * ⛔ A ROUTE TABLE WRITTEN OUT, ENTRY BY ENTRY, IS A SERVER.
 *
 * The eleventh live check, 2026-11-11 (L232, a laundry service «with a Node server that stores
 * orders, items, pickups in a real database»): the server was node:http with its routes in a
 * table — ['GET', /^\/api\/orders$/, handler] … — and a dispatcher matching req.method and the
 * path. «The request needs a server, but no delivered part registers server routes» refused it,
 * and the builder rewrote a working server in Express to be read.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectServerEvidence } from '../core/quality/request-coverage';
import { missingRequestedServer } from '../modules/tools/definitions/ProjectPipelineTool';

const LAUNDRY = 'Build a web app for a laundry service with a Node server that stores orders, items, pickups in a real database and a clean interface to manage them, with server tests.';

const TABLE_SERVER = `import http from 'node:http';
import * as store from './store.js';
const json = (body, status = 200) => ({ status, body });
// Route table: [method, pattern, handler].
function buildRoutes(db) {
  const id = (params) => Number(params[0]);
  return [
    ['GET', /^\\/api\\/orders$/, ({ query }) => json(store.listOrders(db, query))],
    ['POST', /^\\/api\\/orders$/, ({ body }) => json(store.createOrder(db, body), 201)],
    ['PATCH', /^\\/api\\/orders\\/(\\d+)$/, ({ params, body }) => json(store.updateOrder(db, id(params), body))],
    ['POST', /^\\/api\\/orders\\/(\\d+)\\/items$/, ({ params, body }) => json(store.addItem(db, id(params), body), 201)],
    ['GET', '/api/pickups', () => json(store.listPickups(db))],
  ];
}
export function createApp(db) {
  const routes = buildRoutes(db);
  return (req, res) => {
    const url = new URL(req.url, 'http://local');
    for (const [method, re, handler] of routes) {
      const m = req.method === method && re instanceof RegExp ? re.exec(url.pathname) : null;
      if (!m) continue;
      const out = handler({ params: m.slice(1), query: url.searchParams, body: {} });
      res.writeHead(out.status, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(out.body));
    }
    res.writeHead(404); res.end();
  };
}
`;

const OBJECT_SERVER = `const http = require('http');
const routes = [
  { method: 'GET', path: '/api/rooms', handler: listRooms },
  { method: 'POST', path: '/api/rooms', handler: addRoom },
];
http.createServer((req, res) => {
  const r = routes.find(x => x.method === req.method && x.path === req.url);
  if (r) return r.handler(req, res);
  res.writeHead(404); res.end();
}).listen(3000);
`;

function project(files: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-route-table-'));
    for (const [rel, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), text);
    }
    return root;
}

test('a node:http server routing by a table of [method, pattern, handler] registers its routes', async () => {
    const root = project({ 'src/app.js': TABLE_SERVER, 'public/index.html': '<!doctype html><title>Laundry</title>' });
    try {
        const evidence = await collectServerEvidence([root], []);
        const seen = evidence.routes.map((r: any) => `${r.method} ${r.path}`);
        expect(seen).toEqual(expect.arrayContaining(['get /api/orders', 'post /api/orders', 'patch /api/orders/:id', 'post /api/orders/:id/items', 'get /api/pickups']));
        expect(await missingRequestedServer(LAUNDRY, [root], [])).toBe('');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a table of { method, path } objects registers its routes too', async () => {
    const root = project({ 'server.js': OBJECT_SERVER });
    try {
        const seen = (await collectServerEvidence([root], [])).routes.map((r: any) => `${r.method} ${r.path}`);
        expect(seen).toEqual(expect.arrayContaining(['get /api/rooms', 'post /api/rooms']));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a browser-only build still has no server', async () => {
    const root = project({ 'public/index.html': '<!doctype html><title>Laundry</title>', 'public/app.js': "const orders = JSON.parse(localStorage.getItem('orders') || '[]');" });
    try {
        expect(await missingRequestedServer(LAUNDRY, [root], [])).toMatch(/no delivered part registers server routes/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
