/**
 * A FAILED BUILD EDITED THE SOURCE TREE OF THE PROGRAM BUILDING IT.
 *
 * Measured on a real run, from its own two lines placed side by side:
 *
 *     npm.cwd=…/data/projects/my-workspace
 *     exec: npm install react react-dom vite @vitejs/plugin-react
 *
 * and the diff landing on the REPOSITORY ROOT:
 *
 *     M package.json        + react, react-dom, vite, @vitejs/plugin-react
 *     M package-lock.json   804 lines
 *     node_modules/react, node_modules/vite, … present on disk
 *
 * ⛔ `data/projects/my-workspace` HOLDS projects; it is not itself a package.
 * Measured directly afterwards: `WORKSPACE_PACKAGE_JSON: absent`. So npm did
 * what npm documents — it walked UP until it found a `package.json`, and the
 * nearest one above that directory belongs to Joe.
 *
 * ⛔ AND IT IS THE SECOND TIME IN ONE DAY THAT A TOOL WITH NO VALID TARGET
 * REACHED FOR THE NEAREST THING INSTEAD OF STOPPING. The browser step, given
 * no address for the app it was asked to verify, searched the open web. npm,
 * given a directory that is not a package, installed into its parent. Same
 * shape, different organ, and both produced something that looked like
 * progress — which is why the fix is the same sentence in both places: with no
 * valid target, refuse and say why.
 *
 * A containment failure is the one class whose blast radius is not bounded by
 * the feature. Nothing in the acceptance ledger, the request reader, or the
 * browser router can notice it, because it happens outside everything they
 * measure. `git checkout` even restored the manifests afterwards, so the tree
 * LOOKED clean while four undeclared packages sat in the resolution path of
 * everything above them — a contaminated instrument, in a repository whose
 * whole method rests on the instrument being clean.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { NpmManagerTool } from '../modules/tools/definitions/SystemTools';

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'SystemTools.ts'),
    'utf-8',
);

/**
 *  The tree has to live INSIDE the real workspace root, and that is a finding
 *  in itself: `safePath` already refuses any path outside it, so a temp folder
 *  under /tmp is rejected before the manifest is ever consulted. Which means
 *  the real failure was not an escape — the directory npm was handed was a
 *  perfectly legitimate in-workspace path that simply is not a package. The
 *  existing containment was doing its job and answering a different question.
 */
function workspaceUnderAPackage(): { root: string; parent: string; child: string } {
    const { getWorkspaceRoot } = require('../modules/tools/definitions/SystemTools');
    let wsRoot = '';
    try { wsRoot = String(getWorkspaceRoot(undefined) || ''); } catch { wsRoot = ''; }
    if (!wsRoot) wsRoot = path.join(__dirname, '..', '..', '..', 'data', 'projects', 'my-workspace');
    //  ⛔ AND THE ROOT ITSELF MUST BE MADE, NOT ASSUMED.
    //
    //  The first version called `mkdtempSync` straight into `wsRoot`. On this
    //  machine that folder exists because Joe has been running here for weeks;
    //  in a fresh worktree it does not exist at all, and the fixture died in
    //  `beforeAll` with ENOENT — so five of six assertions never reached
    //  `NpmManagerTool` and the guard measured NOTHING while reporting failure.
    //
    //  A test that depends on runtime debris left by earlier runs is a test
    //  that passes for a reason unrelated to the code, which is the same defect
    //  this whole file is about, wearing the shape of a fixture.
    fs.mkdirSync(wsRoot, { recursive: true });
    const parent = fs.mkdtempSync(path.join(wsRoot, 'joe-npm-containment-'));
    const child = path.join(parent, 'holds-projects');
    fs.mkdirSync(child, { recursive: true });
    //  The ancestor npm would climb to — exactly the shape that was edited.
    fs.writeFileSync(path.join(parent, 'package.json'), JSON.stringify({ name: 'the-builder' }), 'utf-8');
    return { root: parent, parent, child };
}

describe('an install never climbs out of the directory it was given', () => {
    let tree: { root: string; parent: string; child: string };
    beforeAll(() => { tree = workspaceUnderAPackage(); });
    afterAll(() => { try { fs.rmSync(tree.root, { recursive: true, force: true }); } catch { /* best effort */ } });

    it('⛔ POSITIVE — an install into a non-package directory is REFUSED', async () => {
        const r: any = await new NpmManagerTool().execute(
            { command: 'install', packages: ['react', 'react-dom', 'vite'], cwd: tree.child },
            { workspaceId: undefined },
        );
        expect(r.ok).toBe(false);
        //  The refusal names the cause, so the next reader is not sent hunting.
        expect(String(r.error || '')).toContain('not_a_package');
    });

    it('⛔ NEGATIVE — and the ancestor package is left untouched', async () => {
        //  The whole point. A refusal that still let npm write upward would be
        //  a message rather than a containment.
        const before = fs.readFileSync(path.join(tree.parent, 'package.json'), 'utf-8');
        await new NpmManagerTool().execute(
            { command: 'install', packages: ['react'], cwd: tree.child },
            { workspaceId: undefined },
        );
        expect(fs.readFileSync(path.join(tree.parent, 'package.json'), 'utf-8')).toBe(before);
        expect(fs.existsSync(path.join(tree.parent, 'node_modules'))).toBe(false);
    });

    it('⛔ NEGATIVE — a directory that IS a package is not refused', async () => {
        //  The guard must not become a wall. This asserts the check is about
        //  the manifest and nothing else — no network runs here, so only the
        //  refusal path is under test, and its absence is the assertion.
        const real = path.join(tree.child, 'a-real-project');
        fs.mkdirSync(real, { recursive: true });
        fs.writeFileSync(path.join(real, 'package.json'), JSON.stringify({ name: 'his-project' }), 'utf-8');
        const r: any = await new NpmManagerTool().execute(
            { command: 'install', packages: [], cwd: real },
            { workspaceId: undefined },
        );
        expect(String(r?.error || '')).not.toContain('not_a_package');
    });

    it('NEGATIVE — a non-install command is not gated by the manifest', async () => {
        //  `npm --version` and `npm run` in an odd directory are harmless; only
        //  install writes upward. Gating everything would be a different tool.
        //  `\s+` rather than `\n\s+`: this file is stored with CRLF, so a
        //  pattern anchored on a bare newline reads one line ending on one
        //  machine and none on another. A guard that passes by platform is not
        //  a guard.
        expect(SRC).toMatch(/if \(installLike\) \{\s+const manifest = path\.join\(workDir, 'package\.json'\)/);
    });

    it('⛔ the refusal reads the manifest as a FILE, not merely as a path', () => {
        //  `authored_path_structure_conflict:target_is_directory:package.json`
        //  was logged in the same run — a `package.json` that was a directory.
        //  `existsSync` alone would call that a package and let the install
        //  proceed into exactly the shape that caused the conflict.
        expect(SRC).toContain("fs.statSync(manifest).isFile()");
    });
});
