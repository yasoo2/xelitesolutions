/**
 * A package.json lists only what npm install can fetch.
 *
 * Eval evidence (run500 P001-landing-ar, run-1793187186633): phase 1 wrote
 * dental-clinic-site/package.json with "node:sqlite": "^1.0.0" in
 * dependencies. node:sqlite ships with Node; as a dependency key it makes
 * `npm install` itself fail, so the project could never run, yet the write was
 * accepted because the only check on a .json artifact was JSON.parse.
 *
 * The class: any manifest key npm cannot fetch (a node: built-in, a name npm
 * rejects). The validator refuses it, and ai_write_file gives the model one
 * format retry that names the rejected key; nothing is written until it passes.
 */

import fs from 'fs';
import path from 'path';

const callLLM = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...a: any[]) => callLLM(...a) }));

import { prepareArtifactContent, uninstallableManifestDependencies } from '../modules/tools/artifact-validation';
import { AIGeneratorTool } from '../modules/tools/definitions/AIGeneratorTool';
import { workspaceService } from '../modules/services/WorkspaceService';

// The manifest the model wrote in the eval run, keys as written.
const evalManifest = {
    name: 'dental-clinic-site',
    version: '1.0.0',
    main: 'index.js',
    scripts: { start: 'node index.js' },
    dependencies: {
        express: '^4.18.2',
        'node:sqlite': '^1.0.0',
        '@ffmpeg-installer/linux-x64': '^4.1.5',
    },
    devDependencies: { nodemon: '^3.0.2' },
};

describe('a package.json lists only what npm install can fetch', () => {
    it('refuses a Node built-in declared as a dependency and says how to use it', () => {
        const result = prepareArtifactContent('dental-clinic-site/package.json', JSON.stringify(evalManifest, null, 2));
        expect(result.error).toMatch(/^manifest_dependency_uninstallable: /);
        expect(result.error).toContain("dependencies.node:sqlite is a Node built-in: import it as 'node:sqlite'");
        expect(result.error).not.toContain('express');
    });

    it('accepts real npm names: scoped, dotted, legacy upper case', () => {
        const ok = {
            dependencies: { express: '^4', '@ffmpeg-installer/linux-x64': '^4', 'lodash.debounce': '^4', JSONStream: '^1' },
            devDependencies: { '@types/node': '^20', 'ts-node': '^10' },
        };
        expect(uninstallableManifestDependencies(ok)).toEqual([]);
        expect(prepareArtifactContent('app/package.json', JSON.stringify(ok)).error).toBeUndefined();
    });

    it('refuses names npm rejects in every dependency section', () => {
        const bad = {
            devDependencies: { 'my lib': '1.0.0' },
            peerDependencies: { '.hidden': '1.0.0' },
            optionalDependencies: { '@scope': '1.0.0' },
        };
        expect(uninstallableManifestDependencies(bad)).toEqual([
            'devDependencies.my lib is not a valid npm package name',
            'peerDependencies..hidden is not a valid npm package name',
            'optionalDependencies.@scope is not a valid npm package name',
        ]);
    });

    it('judges only package.json, not other JSON data that happens to use these keys', () => {
        expect(prepareArtifactContent('data/dependencies.json', JSON.stringify(evalManifest)).error).toBeUndefined();
    });
});

describe('ai_write_file retries an uninstallable manifest once, naming the key', () => {
    const DIR = '__manifest_install_test__';
    const landsAt = (rel: string) => path.resolve(workspaceService.getActiveRoot(), rel);
    afterAll(() => { try { fs.rmSync(landsAt(DIR), { recursive: true, force: true }); } catch { } });
    beforeEach(() => callLLM.mockReset());

    it('writes the corrected manifest, never the rejected one', async () => {
        const fixed = { ...evalManifest, dependencies: { express: '^4.18.2' } };
        callLLM
            .mockResolvedValueOnce(JSON.stringify(evalManifest, null, 2))
            .mockResolvedValueOnce(JSON.stringify(fixed, null, 2));
        const rel = path.join(DIR, 'site', 'package.json');
        const res: any = await new AIGeneratorTool().execute({ path: rel, description: 'manifest for the site' }, {});
        expect(res.ok).toBe(true);
        expect(callLLM).toHaveBeenCalledTimes(2);
        expect(callLLM.mock.calls[1][0]).toMatch(/FORMAT RETRY REQUIRED/);
        expect(callLLM.mock.calls[1][0]).toContain('dependencies.node:sqlite is a Node built-in');
        expect(JSON.parse(fs.readFileSync(landsAt(rel), 'utf8')).dependencies).toEqual({ express: '^4.18.2' });
    });

    it('writes nothing when the retry still lists a built-in', async () => {
        callLLM.mockResolvedValue(JSON.stringify(evalManifest));
        const rel = path.join(DIR, 'still-bad', 'package.json');
        const res: any = await new AIGeneratorTool().execute({ path: rel, description: 'manifest' }, {});
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/manifest_dependency_uninstallable/);
        expect(fs.existsSync(landsAt(rel))).toBe(false);
    });
});
