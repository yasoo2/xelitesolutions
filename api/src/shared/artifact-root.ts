import os from 'os';
import path from 'path';

export function artifactRootDir(): string {
    const configured = String(process.env.ARTIFACT_DIR || '').trim();
    return configured || path.join(os.tmpdir(), 'joe-artifacts');
}
