/**
 * ⛔ A ROUTER BEHIND A WRAPPER STILL SERVES.
 *
 * The hard exam, 2026-11-04, H02: a school of eleven route modules, each
 * registering its routes as `api.get('/api/timetable', STAFF, ({ query }) => …)`
 * on an `api` that app.js builds over the Express router and hands to every
 * module through a context. `api` is a client's usual name and the handlers
 * take no request, so not one route was read: «the request needs a server, but
 * no delivered part registers server routes» — eight times, for a server whose
 * every route answered — and «reports — not served» beside it.
 *
 * An object whose methods register on a router of its own file is a router,
 * by its name, in every server file of the delivery; a file that binds the
 * name to an HTTP client of its own still calls, never serves.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectServerEvidence } from '../core/quality/request-coverage';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-wrapper-'));
    roots.push(dir);
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}

const APP = [
    `import express from 'express';`,
    `import { defineTimetable } from './modules/timetable.js';`,
    `import { defineReports } from './modules/reports.js';`,
    `export function createApp(db) {`,
    `  const app = express();`,
    `  const router = express.Router();`,
    `  const api = {`,
    `    get: (pattern, roles, handler) => router.get(pattern, (req, res) => runRoute(req, res, roles, handler)),`,
    `    post: (pattern, roles, handler) => router.post(pattern, (req, res) => runRoute(req, res, roles, handler)),`,
    `  };`,
    `  const ctx = { db, api };`,
    `  for (const define of [defineTimetable, defineReports]) Object.assign(ctx, define(ctx));`,
    `  app.use(router);`,
    `  return app;`,
    `}`,
].join('\n');

const TIMETABLE = [
    `export function defineTimetable(ctx) {`,
    `  const { api, STAFF, ADMIN, all } = ctx;`,
    `  api.get('/api/timetable', STAFF, ({ query }) => all('SELECT * FROM timetable'));`,
    `  api.post('/api/timetable', ADMIN, ({ body }) => insertLesson(body));`,
    `  return {};`,
    `}`,
].join('\n');

const REPORTS = [
    `export function defineReports(ctx) {`,
    `  const { api, ADMIN, get } = ctx;`,
    `  api.get('/api/reports/summary', ADMIN, () => ({ students: get('SELECT COUNT(*) AS n FROM students').n }));`,
    `  return {};`,
    `}`,
].join('\n');

describe('a router behind a wrapper', () => {
    it('H02: every module\'s routes are read, through the wrapper app.js builds', async () => {
        const root = tree({ 'src/app.js': APP, 'src/modules/timetable.js': TIMETABLE, 'src/modules/reports.js': REPORTS, 'package.json': '{"dependencies":{"express":"^4"}}' });
        const evidence = await collectServerEvidence([root], []);
        const served = evidence.routes.map(r => `${r.method} ${r.path}`);
        expect(served).toEqual(expect.arrayContaining(['get /api/timetable', 'post /api/timetable', 'get /api/reports/summary']));
        expect(evidence.serverFiles.map(f => path.basename(f))).toEqual(expect.arrayContaining(['timetable.js', 'reports.js']));
    });

    it('a module that binds the name to an HTTP client of its own still calls, never serves', async () => {
        const CALLER = [
            `import axios from 'axios';`,
            `const api = axios.create({ baseURL: 'http://127.0.0.1:3000' });`,
            `export function sync() { api.get('/api/students', (err, rows) => store(rows)); }`,
        ].join('\n');
        const root = tree({ 'src/app.js': APP, 'src/sync.js': CALLER, 'package.json': '{"dependencies":{"express":"^4"}}' });
        const evidence = await collectServerEvidence([root], []);
        expect(evidence.routes.some(r => r.path === '/api/students')).toBe(false);
    });

    it('a wrapper over a client is no router: `api.get(\'/x\', cb)` calls a route', async () => {
        const CLIENT_WRAPPER = [
            `const axios = require('axios');`,
            `const api = { get: (url, done) => axios.get(url).then(r => done(r.data)) };`,
            `api.get('/api/students', rows => console.log(rows));`,
        ].join('\n');
        const root = tree({ 'scripts/report.js': CLIENT_WRAPPER });
        const evidence = await collectServerEvidence([root], []);
        expect(evidence.routes).toEqual([]);
    });
});
