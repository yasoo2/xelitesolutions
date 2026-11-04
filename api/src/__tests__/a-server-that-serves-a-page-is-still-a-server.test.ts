/**
 * ⛔ A SERVER THAT SENDS A PAGE WITH A SCRIPT IN IT IS STILL A SERVER.
 *
 * The hard exam, 2026-11-04, H02: «ابني نظام إدارة مدرسة متكامل … شهادات
 * قابلة للطباعة … واختبارات آلية للخادم». The builder wrote an Express server
 * with dozens of routes (/api/login, /api/students, /api/classes …) that also
 * renders a printable certificate — an HTML template with a «طباعة» button,
 * `onclick="window.print()"`. The route reader took every file that mentions
 * `window.` or `document.` for browser code, skipped the server whole, and the
 * delivery was refused: «the request needs a server …, but no delivered part
 * registers server routes».
 *
 * A file that loads a server framework or creates an HTTP server is read as a
 * server, whatever pages it sends. A browser file — React, or one that only
 * calls an API — is still not one.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { collectServerEvidence } from '../core/quality/request-coverage';
import { missingRequestedServer } from '../modules/tools/definitions/ProjectPipelineTool';

jest.setTimeout(120_000);

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-server-page-'));
    roots.push(dir);
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}

/** The H02 shape: an Express app whose certificate route sends a page with a print button. */
const SCHOOL_SERVER = [
    `'use strict';`,
    `const express = require('express');`,
    `const app = express();`,
    `app.use(express.json());`,
    `app.post('/api/login', (req, res) => res.json({ token: 't' }));`,
    `app.get('/api/students', auth('admin'), (req, res) => res.json(d.students));`,
    `app.post('/api/students', auth('admin'), (req, res) => res.status(201).json(add(req.body)));`,
    `app.get('/api/classes', auth('admin'), (req, res) => res.json(d.classes));`,
    `app.get('/certificate/:id', auth(), (req, res) => {`,
    "  res.send(`<!doctype html><html dir=\"rtl\"><body><button class=\"print-btn\" onclick=\"window.print()\">طباعة</button>${body}</body></html>`);",
    `});`,
    `module.exports = app;`,
].join('\n');

const H02 = 'ابني نظام إدارة مدرسة متكامل: طلاب ومعلمون وصفوف، جدول حصص بلا تعارض، حضور يومي، علامات وشهادات قابلة للطباعة، بوابة لولي الأمر يرى أبناءه فقط، تقارير للإدارة، واختبارات آلية للخادم.';

describe('a server file that sends a page with a script', () => {
    it('is read as the server it is', async () => {
        const evidence = await collectServerEvidence([tree({ 'server/app.js': SCHOOL_SERVER })], []);
        expect(evidence.routes.map(r => `${r.method} ${r.path}`)).toEqual(expect.arrayContaining(['get /api/students', 'post /api/login', 'get /certificate/:id']));
    });

    it('H02: the school system is not refused for a server it delivered', async () => {
        expect(await missingRequestedServer(H02, [tree({ 'server/app.js': SCHOOL_SERVER })], [])).toBe('');
    });

    it.each([
        ['an ES module importing express', `import express from 'express';\nconst app = express();\napp.get('/api/x', (req, res) => res.json([]));\nconst page = '<script>document.title = "x"</script>';\n`],
        ['a plain node http server', `const http = require('http');\nconst router = require('express').Router();\nrouter.get('/api/x', (req, res) => res.json([]));\nhttp.createServer((req, res) => res.end('<script>window.scrollTo(0,0)</script>')).listen(3000);\n`],
    ])('%s', async (_name, source) => {
        const evidence = await collectServerEvidence([tree({ 'server.js': source })], []);
        expect(evidence.routes.length).toBeGreaterThan(0);
    });
});

describe('a browser file is still not a server', () => {
    it('a React page that calls the API registers no route', async () => {
        const page = `import React from 'react';\nimport axios from 'axios';\nexport default function Students() {\n  React.useEffect(() => { axios.get('/api/students').then(r => setRows(r.data)); window.scrollTo(0, 0); }, []);\n  return null;\n}\n`;
        const evidence = await collectServerEvidence([tree({ 'src/Students.jsx': page })], []);
        expect(evidence.routes).toEqual([]);
    });

    it('a request that needs a server, with only a browser app, is still refused', async () => {
        const page = `document.getElementById('save').onclick = () => localStorage.setItem('students', '[]');`;
        expect(await missingRequestedServer(H02, [tree({ 'app.js': page, 'index.html': '<script src="app.js"></script>' })], [])).toMatch(/no delivered part registers server routes/u);
    });
});
