import os from 'os';
import path from 'path';
import { artifactRootDir } from '../shared/artifact-root';

describe('artifact root', () => {
    const original = process.env.ARTIFACT_DIR;

    afterEach(() => {
        if (original === undefined) delete process.env.ARTIFACT_DIR;
        else process.env.ARTIFACT_DIR = original;
    });

    it('uses the configured artifact root without changing it', () => {
        process.env.ARTIFACT_DIR = 'C:/joe-artifacts';
        expect(artifactRootDir()).toBe('C:/joe-artifacts');
    });

    it('uses the platform temp directory when no root is configured', () => {
        delete process.env.ARTIFACT_DIR;
        expect(artifactRootDir()).toBe(path.join(os.tmpdir(), 'joe-artifacts'));
    });
});
