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
import { collectServerEvidence, judgeRequestCoverage, requestedRecords } from '../core/quality/request-coverage';
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

/*
 * The third review, 2026-11-11: a pattern is read whole — a character class may hold a slash, an
 * optional part is left out, an escape reads as what it escapes — a method may be written in lower
 * case, and a service worker's table of what it caches serves nothing.
 */
const PATTERNS_SERVER = `const http = require('http');
const routes = [
  ['GET', /^\\/api\\/files\\/([^/]+)$/, sendFile],
  ['get', '/api/notes', listNotes],
  ['GET', /^\\/api\\/orders(?:\\/)?$/, listOrders],
  ['DELETE', /^\\/api\\/pickups(?:\\/(\\d+))?$/, dropPickup],
  ['GET', /^\\/api\\/health\\-check$/, health],
  ['PUT', /^\\/api\\/items\\/(?<id>[^/]+)\\/?$/, putItem],
];
http.createServer((req, res) => {
  for (const [m, p, h] of routes) if (m.toUpperCase() === req.method && (p instanceof RegExp ? p.test(req.url) : p === req.url)) return h(req, res);
  res.writeHead(404); res.end();
}).listen(3000);
`;

test('a pattern with a slash in its character class, an optional part and an escape is read whole; a lower-case method is a method', async () => {
    const root = project({ 'server.js': PATTERNS_SERVER });
    try {
        const seen = (await collectServerEvidence([root], [])).routes.map((r: any) => `${r.method} ${r.path}`);
        expect(seen).toEqual(expect.arrayContaining(['get /api/files/:id', 'get /api/notes', 'get /api/orders', 'delete /api/pickups', 'get /api/health-check', 'put /api/items/:id']));
        expect(seen.filter((s: string) => /[[\]()\\]/.test(s))).toEqual([]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a service worker caching by a table of [method, path] is no server', async () => {
    const SW = `const RULES = [['GET', '/api/orders', 'network-first'], ['GET', '/api/items', 'cache-first']];
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const rule = RULES.find(([m, p]) => event.request.method === m && url.pathname === p);
  if (rule) event.respondWith(fetch(event.request));
});
`;
    const root = project({ 'public/index.html': '<!doctype html><title>Laundry</title>', 'public/sw.js': SW, 'public/app.js': "const orders = JSON.parse(localStorage.getItem('orders') || '[]');" });
    try {
        expect(await missingRequestedServer(LAUNDRY, [root], [])).toMatch(/no delivered part registers server routes/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

/*
 * The thirteenth live check, 2026-11-11 (L232, the laundry again): the table wrote its paths without
 * their first slash, as its dispatcher compares them segment by segment — read as no route at all,
 * «items (not served)» refused it four times.
 */
const SEGMENT_TABLE_SERVER = `'use strict';
const http = require('node:http');
const store = require('./store');
const ALLOWED = ['GET', 'POST', 'PATCH', 'DELETE'];
const TYPES = [['GET', 'application/json', 'json']];
const ROUTES = [
  ['GET', 'api/orders', (db) => [200, store.listOrders(db)]],
  ['POST', 'api/orders', (db, p, b) => [201, store.createOrder(db, b)]],
  ['PATCH', 'api/orders/:id', (db, p, b) => [200, store.updateOrder(db, p.id, b)]],
  ['POST', 'api/orders/:id/items', (db, p, b) => [201, store.addItem(db, p.id, b)]],
  ['GET', 'api/items', (db) => [200, store.listItems(db)]],
  ['GET', 'api/pickups', (db) => [200, store.listPickups(db)]],
];
function matchRoute(method, pathname) {
  const want = pathname.split('/').filter(Boolean);
  for (const [m, pattern, handler] of ROUTES) {
    if (m !== method) continue;
    const have = pattern.split('/');
    if (have.length !== want.length) continue;
    if (have.every((h, i) => h.startsWith(':') || h === want[i])) return handler;
  }
  return null;
}
module.exports = (db) => http.createServer((req, res) => {
  const h = matchRoute(req.method, new URL(req.url, 'http://x').pathname);
  if (!h) { res.writeHead(404); return res.end(); }
  const [status, body] = h(db, {}, {});
  res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body));
});
`;

test('a table of paths written without their first slash registers its routes, and his items are served', async () => {
    const root = project({ 'src/app.js': SEGMENT_TABLE_SERVER, 'public/index.html': '<!doctype html><title>Laundry</title>' });
    try {
        const evidence = await collectServerEvidence([root], []);
        const seen = evidence.routes.map((r: any) => `${r.method} ${r.path}`);
        expect(seen).toEqual(expect.arrayContaining(['get /api/orders', 'post /api/orders', 'patch /api/orders/:id', 'post /api/orders/:id/items', 'get /api/items', 'get /api/pickups']));
        //  An allowed-methods list and a media-type table are no routes.
        expect(seen.filter((s: string) => /\/(?:post|patch|delete|application)\b/i.test(s))).toEqual([]);
        const records = requestedRecords(LAUNDRY, { backendRequested: true });
        const report = judgeRequestCoverage({ records, evidence, backendRequested: true, testsRun: { root, ran: true, passed: true } as any });
        expect(report.missing.filter(r => r.served === false).map(r => r.key)).toEqual([]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

/*
 * The fourth review, 2026-11-11: a filter list and a list of verbs are no routes; a server that also
 * sends its service worker's source is still a server; an optional trailing slash is no parameter.
 */
test('a filter list, a list of verbs and an optional slash read no phantom route; a server holding its worker is still read', async () => {
    const SERVER = `const http = require('http');
const FILTERS = ['all', 'active', 'done'];
const VERBS = ['get', 'list', 'count'];
const SHOUT = ['ALL', 'ACTIVE', 'DONE'];
const SW = "self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));";
const routes = [
  ['GET', /^\\/api\\/todos(\\/)?$/, listTodos],
  ['GET', 'todos', listTodos],
];
http.createServer((req, res) => {
  if (req.url === '/sw.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(SW); }
  for (const [m, p, h] of routes) if (m === req.method && (p instanceof RegExp ? p.test(req.url) : '/' + p === req.url)) return h(req, res);
  res.writeHead(404); res.end();
}).listen(3000);
`;
    const root = project({ 'server.js': SERVER });
    try {
        const seen = (await collectServerEvidence([root], [])).routes.map((r: any) => `${r.method} ${r.path}`);
        expect(seen).toEqual(expect.arrayContaining(['get /api/todos', 'get /todos']));
        expect(seen.filter((s: string) => /\/(?:active|done|list|count|ACTIVE|DONE)$|todos:id/u.test(s))).toEqual([]);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
