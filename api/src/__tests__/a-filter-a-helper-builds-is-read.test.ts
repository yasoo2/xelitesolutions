/**
 * ⛔ A FILTER BUILT BY A HELPER THE ROUTE HANDS ITS QUERY TO IS A FILTER.
 *
 * The hard exam, 2026-11-05, H13: «Build a project management REST API only …
 * pagination, filtering and sorting …». Every list route of the delivered API
 * filtered, sorted and paged its rows — through one module, as a careful
 * server does:
 *
 *     router.get('/', (req, res) => {
 *       const q = withBase(parseListQuery(req.query, PROJECT_LIST), …);
 *       res.json(paginate(db, …, q, mapProject));
 *     });
 *
 *     function parseListQuery(query, spec) {
 *       for (const [name, f] of Object.entries(spec.filters || {})) {
 *         const value = query[name];
 *         …  conditions.push(`${f.column} LIKE @f_${name}`); params[`f_${name}`] = value;
 *
 * The scope check reads a query parameter only where the route handler itself
 * reads and narrows it, so this API was refused as «missing: filtering» — its
 * tests of the filters passing beside the refusal.
 *
 * A helper the handler hands its request or its query to is read as part of
 * the handler (two calls deep), its parameter standing for what it was given;
 * a field read by a variable key counts as a field the client names. The
 * value must still be used by the operation that narrows or orders, in that
 * helper — a helper that only logs the query proves nothing.
 *
 * And the same day, H01 (a clinic, React and a Node server): its lists are
 * filtered by the server, from a `filters` state the page's own selects set
 * (`const [filters, setFilters] = useState(…)`). The interface rule read only
 * a singular «Filter» name and a `.filter(` in the browser, so the clinic was
 * «missing: filtering» too. A filter state may be plural, and an interface
 * whose own controls set it may be narrowed by its server.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { hasFilterEvidence, hasServiceFilterEvidence, hasServiceSearchEvidence, hasServiceSortingEvidence, scopeReport } from '../core/quality/scope-audit';

const H13 = 'Build a project management REST API only, with Node, Express and SQLite: organizations, projects, tasks and comments; JWT authentication with refresh tokens; role-based permissions per organization; pagination, filtering and sorting; OpenAPI documentation; and a full test suite.';

/** H13's list module, as delivered (abbreviated, its logic whole). */
const FILTERING = [
    `'use strict';`,
    `function parseListQuery(query, spec) {`,
    `  let page = 1;`,
    `  if (query.page !== undefined) page = Number(query.page);`,
    `  let limit = 20;`,
    `  if (query.limit !== undefined) limit = Number(query.limit);`,
    `  const orderParts = [];`,
    `  if (query.sort !== undefined) {`,
    `    for (const raw of String(query.sort).split(',')) {`,
    `      const [field, dir = 'asc'] = raw.split(':');`,
    `      orderParts.push(\`\${spec.sortable[field]} \${dir.toUpperCase()}\`);`,
    `    }`,
    `  }`,
    `  if (orderParts.length === 0) orderParts.push(spec.defaultSort || 'id ASC');`,
    `  const conditions = [];`,
    `  const params = {};`,
    `  for (const [name, f] of Object.entries(spec.filters || {})) {`,
    `    const value = query[name];`,
    `    if (value === undefined || value === '') continue;`,
    `    if (f.type === 'enum') {`,
    `      conditions.push(\`\${f.column} = @f_\${name}\`);`,
    `      params[\`f_\${name}\`] = value;`,
    `    } else if (f.type === 'text') {`,
    `      conditions.push(\`\${f.column} LIKE @f_\${name} ESCAPE '\\\\'\`);`,
    `      params[\`f_\${name}\`] = \`%\${String(value)}%\`;`,
    `    }`,
    `  }`,
    `  if (query.q !== undefined && String(query.q).trim() !== '' && spec.searchColumns) {`,
    `    const ors = spec.searchColumns.map((c) => \`\${c} LIKE @q\`);`,
    `    conditions.push(\`(\${ors.join(' OR ')})\`);`,
    `    params.q = \`%\${String(query.q).trim()}%\`;`,
    `  }`,
    `  return { page, limit, offset: (page - 1) * limit, orderBy: orderParts.join(', '), where: conditions.length ? \`WHERE \${conditions.join(' AND ')}\` : '', params };`,
    `}`,
    `function paginate(db, src, q, mapRow) {`,
    `  const rows = db.prepare(\`SELECT \${src.select} FROM \${src.from} \${q.where} ORDER BY \${q.orderBy} LIMIT @_limit OFFSET @_offset\`).all({ ...q.params, _limit: q.limit, _offset: q.offset });`,
    `  return { data: rows.map(mapRow) };`,
    `}`,
    `module.exports = { parseListQuery, paginate };`,
].join('\n');

/** H13's routes: one handler hands the query to the helper, another hands the request to a list function that does. */
const ROUTES = [
    `const express = require('express');`,
    `const { parseListQuery, paginate } = require('../filtering');`,
    `const PROJECT_LIST = { sortable: { name: 'p.name' }, searchColumns: ['p.name'], filters: { status: { type: 'enum', column: 'p.status' } } };`,
    `const TASK_LIST = { sortable: { title: 't.title' }, searchColumns: ['t.title'], filters: { priority: { type: 'enum', column: 't.priority' } } };`,
    `function listTasks(db, req, base, params) {`,
    `  const q = parseListQuery(req.query, TASK_LIST);`,
    `  return paginate(db, { select: 't.*', from: 'tasks t' }, q, (r) => r);`,
    `}`,
    `function projectsRouter(db) {`,
    `  const router = express.Router();`,
    `  router.get('/', (req, res) => {`,
    `    const q = parseListQuery(req.query, PROJECT_LIST);`,
    `    res.json(paginate(db, { select: 'p.*', from: 'projects p' }, q, (r) => r));`,
    `  });`,
    `  router.get('/:projectId/tasks', (req, res) => {`,
    `    res.json(listTasks(db, req, 't.project_id = @project_id', { project_id: req.params.projectId }));`,
    `  });`,
    `  return router;`,
    `}`,
    `module.exports = { projectsRouter };`,
].join('\n');

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-filter-helper-'));
    roots.push(dir);
    for (const [name, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), text);
    }
    return dir;
}

describe('H13: an API whose list routes filter, sort and page through one helper module', () => {
    const source = `${ROUTES}\n${FILTERING}`;

    it('the helper the handler hands its query to is read: filtering and search are served', () => {
        expect(hasServiceFilterEvidence(source)).toBe(true);
        expect(hasServiceSearchEvidence(source)).toBe(true);
    });

    it('is not «missing: filtering» on the delivered tree', () => {
        const dir = tree({
            'package.json': JSON.stringify({ name: 'pm-api', scripts: { start: 'node src/server.js' }, dependencies: { express: '^4.21.2' } }),
            'src/server.js': `const express = require('express');\nconst { projectsRouter } = require('./routes/projects');\nconst app = express();\napp.use('/api/projects', projectsRouter(db));\napp.listen(3000);\n`,
            'src/routes/projects.js': ROUTES,
            'src/filtering.js': FILTERING,
        });
        const report = scopeReport(H13, [dir]);
        expect(report.missing.map(m => m.id)).not.toContain('filtering');
    });

    it('a helper that is handed the query and only logs it proves nothing', () => {
        const logs = [
            `function audit(query) { console.log('asked', query.status, query.sort); }`,
            `app.get('/api/projects', (req, res) => { audit(req.query); res.json(db.prepare('SELECT * FROM projects').all()); });`,
        ].join('\n');
        expect(hasServiceFilterEvidence(logs)).toBe(false);
        expect(hasServiceSortingEvidence(logs)).toBe(false);
    });

    it('a helper no handler hands the request to is not read as a handler', () => {
        expect(hasServiceFilterEvidence(FILTERING)).toBe(false);
    });
});

/**
 * The rerun of H13 the same afternoon built the API another careful way: each
 * parameter read by a helper that names it, and the value bound to a
 * condition the handler adds to its own WHERE list —
 *
 *     const status = q.parseEnum(req.query, 'status', STATUSES);
 *     if (status) { where.push('t.status = ?'); params.push(status); }
 *
 * — and was refused four times more as «missing: filtering». A value read by
 * `helper(req.query, 'name')` is that parameter; a statement that binds it
 * beside a SQL condition with a placeholder narrows by it.
 */
describe('H13, rerun: each filter read by a helper that names it, bound to a WHERE condition', () => {
    const ROUTE = [
        `const express = require('express');`,
        `const q = require('../query');`,
        `function tasksRouter(db) {`,
        `  const router = express.Router();`,
        `  router.get('/:orgId/tasks', authn, (req, res) => {`,
        `    const pagination = q.parsePagination(req.query);`,
        `    const where = ['t.org_id = ?'];`,
        `    const params = [req.org.id];`,
        `    const status = q.parseEnum(req.query, 'status', STATUSES);`,
        `    if (status) { where.push('t.status = ?'); params.push(status); }`,
        `    const dueBefore = q.parseDate(req.query, 'due_before');`,
        `    if (dueBefore) { where.push('t.due_date <= ?'); params.push(dueBefore); }`,
        `    res.json(q.listResult(db, { select: 't.*', from: 'tasks t', where, params, order: q.parseSort(req.query, TASK_SORT, '-created_at', 't.id'), pagination }));`,
        `  });`,
        `  return router;`,
        `}`,
    ].join('\n');
    const QUERY = [
        `function single(q, name) { const v = q[name]; return v === undefined ? undefined : String(v); }`,
        `function parseEnum(q, name, values) { const v = single(q, name); return values.includes(v) ? v : undefined; }`,
        `function parseDate(q, name) { return single(q, name); }`,
        `function listResult(db, { select, from, where, params, order, pagination }) {`,
        `  const whereSql = where.length ? \` WHERE \${where.join(' AND ')}\` : '';`,
        `  return db.prepare(\`SELECT \${select} FROM \${from}\${whereSql} ORDER BY \${order} LIMIT ? OFFSET ?\`).all(...params, pagination.limit, pagination.offset);`,
        `}`,
        `module.exports = { parseEnum, parseDate, listResult };`,
    ].join('\n');

    it('the parameter the helper names, bound to the condition the handler adds, is a filter', () => {
        expect(hasServiceFilterEvidence(`${ROUTE}\n${QUERY}`)).toBe(true);
    });

    it('is not «missing: filtering» on the delivered tree', () => {
        const dir = tree({
            'package.json': JSON.stringify({ name: 'pm-api', scripts: { start: 'node src/server.js' }, dependencies: { express: '^4.21.2' } }),
            'src/server.js': `const express = require('express');\nconst app = express();\napp.use('/api/orgs', require('./routes/tasks').tasksRouter(db));\napp.listen(3000);\n`,
            'src/routes/tasks.js': ROUTE,
            'src/query.js': QUERY,
        });
        expect(scopeReport(H13, [dir]).missing.map(m => m.id)).not.toContain('filtering');
    });

    it('…but a named parameter that is only logged, beside another\'s condition, is not', () => {
        const logs = [
            `router.get('/tasks', (req, res) => {`,
            `  const status = q.parseEnum(req.query, 'status', STATUSES);`,
            `  console.log('status asked', status);`,
            `  const where = ['t.org_id = ?']; const params = [req.org.id];`,
            `  res.json(q.listResult(db, { where, params }));`,
            `});`,
        ].join('\n');
        expect(hasServiceFilterEvidence(logs)).toBe(false);
    });
});

describe('H01: an interface whose own controls set a plural filter state its server narrows by', () => {
    const PAGE = [
        `import { useEffect, useState } from 'react';`,
        `export default function Invoices() {`,
        `  const [rows, setRows] = useState([]);`,
        `  const [filters, setFilters] = useState({ q: '', status: '' });`,
        `  useEffect(() => {`,
        `    const params = new URLSearchParams();`,
        `    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });`,
        `    api('GET', \`/invoices?\${params}\`).then(setRows);`,
        `  }, [filters]);`,
        `  return (<div>`,
        `    <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>`,
        `      <option value="">All</option><option value="paid">Paid</option>`,
        `    </select>`,
        `    <table><tbody>{rows.map((r) => <tr key={r.id}><td>{r.number}</td></tr>)}</tbody></table>`,
        `  </div>);`,
        `}`,
    ].join('\n');
    const SERVER = [
        `app.get('/api/invoices', (req, res) => {`,
        `  const { status } = req.query;`,
        `  const rows = status ? db.prepare('SELECT * FROM invoices WHERE payment_status = ?').all(status) : db.prepare('SELECT * FROM invoices').all();`,
        `  res.json(rows);`,
        `});`,
    ].join('\n');

    it('the interface\'s controls set the filter, and the server narrows by it: filtering', () => {
        expect(hasFilterEvidence(`${PAGE}\n${SERVER}`)).toBe(true);
    });

    it('…but a filter control whose state nothing narrows by is not filtering', () => {
        const noServer = `${PAGE}\napp.get('/api/invoices', (req, res) => res.json(db.prepare('SELECT * FROM invoices').all()));`;
        expect(hasFilterEvidence(noServer)).toBe(false);
    });
});
