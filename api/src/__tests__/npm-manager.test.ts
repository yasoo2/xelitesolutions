import fs from 'fs';
import os from 'os';
import path from 'path';
import { reconcileNpmManifest } from '../modules/tools/definitions/SystemTools';

describe('npm manifest reconciliation', () => {
    let root = '';

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-npm-manifest-'));
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('removes only npm-invalid dependency keys produced from prose', () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            name: 'evidence-board',
            dependencies: {
                express: '^4.18.0',
                'node:sqlite or JSON file fallback': '^5.0.2',
            },
        }));

        const result = reconcileNpmManifest(root);

        expect(result.ok).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.removedDependencies).toEqual(['dependencies.node:sqlite or JSON file fallback']);
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        expect(manifest.dependencies).toEqual({ express: '^4.18.0' });
    });

    it('does not alter a valid manifest', () => {
        const original = {
            name: 'evidence-board',
            scripts: { start: 'node src/index.js' },
            dependencies: { express: '^4.18.0' },
        };
        fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify(original)}\n`);

        const result = reconcileNpmManifest(root);

        expect(result).toMatchObject({ ok: true, changed: false, removedDependencies: [] });
        expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(`${JSON.stringify(original)}\n`);
    });

    it('normalizes a deterministic uppercase local package name', () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            name: 'EvidenceBoard',
            scripts: { start: 'node src/index.js' },
        }));

        const result = reconcileNpmManifest(root);

        expect(result).toMatchObject({
            ok: true,
            changed: true,
            renamedPackage: { from: 'EvidenceBoard', to: 'evidenceboard' },
        });
        expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name).toBe('evidenceboard');
    });

    it('blocks scripts that recursively invoke themselves instead of running npm forever', () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            name: 'evidence-board',
            scripts: {
                start: 'node src/index.js',
                build: 'npm run build',
                test: 'npm run test',
            },
        }));

        const result = reconcileNpmManifest(root);

        expect(result.ok).toBe(false);
        expect(result.changed).toBe(false);
        expect(result.recursiveScripts).toEqual(['build', 'test']);
        expect(result.error).toBe('recursive_npm_scripts:build,test');
    });

    it('reports malformed JSON instead of rewriting it', () => {
        const malformed = '{"name":"broken",';
        fs.writeFileSync(path.join(root, 'package.json'), malformed);

        const result = reconcileNpmManifest(root);

        expect(result.ok).toBe(false);
        expect(result.changed).toBe(false);
        expect(result.error).toMatch(/^invalid_package_json:/);
        expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(malformed);
    });
});
