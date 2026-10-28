import fs from 'fs';
import os from 'os';
import path from 'path';
import { findImportedPackageForScriptBinary, importedPackageForScriptBinary } from '../modules/tools/script-binary-provider';

/**
 * Review r21 (855fd3f8): the search for «which package does this script's
 * program come from» walked depth-first, stopped after 400 source files or
 * depth 4, and read synchronously. A project whose components/ folder holds
 * 400 files never reached the root vite.config.js — the one file importing
 * vite — and the answer was «nothing imports it», silently. Real temp
 * projects below; both drivers of the one search are held to the same answer.
 */
const roots: string[] = [];
function project(files: Record<string, string>, manifest: object = { scripts: { build: 'vite build' }, dependencies: { vue: '^3.4.0' } }): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-importer-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
    for (const [name, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
        fs.writeFileSync(path.join(root, name), text);
    }
    return root;
}
const components = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) =>
    [`components/Card${String(i).padStart(4, '0')}.vue`, `<template><div>${i}</div></template><script>import { ref } from 'vue';</script>`]));

afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

describe('the only importing file is never cut off', () => {
    it('a root vite.config.js after 450 component files is still the evidence', async () => {
        const root = project({ ...components(450), 'vite.config.js': "import { defineConfig } from 'vite';\nexport default defineConfig({});" });
        const expected = { packageName: 'vite', dev: true, importedBy: ['vite.config.js'] };
        await expect(findImportedPackageForScriptBinary(root, 'vite')).resolves.toEqual(expected);
        expect(importedPackageForScriptBinary(root, 'vite')).toEqual(expected);
    }, 60_000);

    it('an importer six folders deep is found, and a runtime import makes it a dependency', async () => {
        const root = project({ 'src/pages/blog/[slug]/parts/deep/Post.ts': "import { getCollection } from 'astro:content';\nimport type { AstroGlobal } from 'astro';" },
            { scripts: { build: 'astro build' }, dependencies: {} });
        const expected = { packageName: 'astro', dev: false, importedBy: ['src/pages/blog/[slug]/parts/deep/Post.ts'] };
        await expect(findImportedPackageForScriptBinary(root, 'astro')).resolves.toEqual(expected);
        expect(importedPackageForScriptBinary(root, 'astro')).toEqual(expected);
    });

    it('what is skipped is skipped by kind, not by position: machine state and build output are not evidence', async () => {
        const root = project({ 'node_modules/x/index.js': "require('vite')", 'dist/assets/index.js': "import 'vite'", '.cache/v.js': "import 'vite'" });
        await expect(findImportedPackageForScriptBinary(root, 'vite')).resolves.toBeNull();
    });

    it('the event loop keeps turning while a large project is read', async () => {
        const root = project({ ...components(1200), 'vite.config.ts': "import vue from '@vitejs/plugin-vue';\nimport { defineConfig } from 'vite';" });
        let turns = 0;
        let reading = true;
        const spin = () => { if (!reading) return; turns++; setImmediate(spin); };
        setImmediate(spin);
        const found = await findImportedPackageForScriptBinary(root, 'vite');
        reading = false;
        expect(found?.importedBy).toEqual(['vite.config.ts']);
        expect(turns).toBeGreaterThan(10);
    }, 60_000);
});
