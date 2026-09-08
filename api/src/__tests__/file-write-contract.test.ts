import fs from 'fs';
import os from 'os';
import path from 'path';

import { validateFileWriteBatch } from '../shared/file-write-contract';
import { reconcileNpmManifest } from '../modules/tools/definitions/SystemTools';

describe('authored file-write structure contract', () => {
    let root = '';

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-file-write-contract-'));
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('rejects package.json as an existing directory before any manifest read or write', () => {
        const packageDir = path.join(root, 'package.json');
        fs.mkdirSync(packageDir);

        const result = validateFileWriteBatch(root, { 'package.json': '{}' });
        expect(result).toMatchObject({
            ok: false,
            reason: 'target_is_directory',
            path: 'package.json',
            projectRoot: path.resolve(root),
        });
        expect(reconcileNpmManifest(root)).toMatchObject({
            ok: false,
            error: 'invalid_package_json:package_json_is_directory',
            structuralPath: packageDir,
            projectRoot: path.resolve(root),
        });
        expect(fs.statSync(packageDir).isDirectory()).toBe(true);
    });

    it('rejects a generated file from becoming the parent of another file', () => {
        const result = validateFileWriteBatch(root, {
            'package.json': '{}',
            'package.json/index.js': 'export default 1;',
        });

        expect(result).toMatchObject({
            ok: false,
            reason: 'file_is_parent',
            path: 'package.json/index.js',
            conflictPath: 'package.json',
            projectRoot: path.resolve(root),
        });
        expect(fs.existsSync(path.join(root, 'package.json'))).toBe(false);
    });

});
