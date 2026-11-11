/**
 * A FILE ANOTHER PROGRAM HOLDS IS STILL WRITTEN.
 *
 * Measured on 2026-11-02, in Joe's interface, on Claude Haiku: the agent
 * engine rewrote an existing index.html and its write tool answered
 * «index.html could not be written: EPERM» twice. The model checked the
 * file was not read-only, then copied the content in with the shell, which
 * worked. On Windows a program holding the file without delete sharing (a
 * preview server, a scanner) blocks replacing it by rename, not writing
 * into it. The write tool now does what the shell did: after the retries,
 * the same bytes go in place.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeAtomic } from '../modules/tools/definitions/EngineFileTools';

const root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-held-file-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const realPlatform = process.platform;
const asPlatform = (p: string) => Object.defineProperty(process, 'platform', { value: p });
afterEach(() => { asPlatform(realPlatform); jest.restoreAllMocks(); });

const refuseRename = (code: string) => jest.spyOn(fs.promises, 'rename').mockRejectedValue(Object.assign(new Error(`${code}: operation not permitted, rename`), { code }));

describe('a held file on Windows', () => {
    it('is written in place when every rename is refused, and no temporary file is left', async () => {
        asPlatform('win32');
        const file = path.join(root, 'index.html');
        fs.writeFileSync(file, '<p>counter</p>\n');
        refuseRename('EPERM');
        await writeAtomic(file, '<p>to-do</p>\n');
        expect(fs.readFileSync(file, 'utf8')).toBe('<p>to-do</p>\n');
        expect(fs.readdirSync(root).filter(n => n.endsWith('.joe-tmp'))).toEqual([]);
    }, 20_000);

    it('a new file that cannot be placed is an error, not a silent write somewhere else', async () => {
        asPlatform('win32');
        refuseRename('EBUSY');
        await expect(writeAtomic(path.join(root, 'new.html'), 'x')).rejects.toMatchObject({ code: 'EBUSY' });
        expect(fs.existsSync(path.join(root, 'new.html'))).toBe(false);
    }, 20_000);
});

describe('elsewhere nothing changes', () => {
    it('another error, or another system, is reported as it is', async () => {
        const file = path.join(root, 'kept.html');
        fs.writeFileSync(file, 'old');
        asPlatform('win32');
        refuseRename('ENOSPC');
        await expect(writeAtomic(file, 'new')).rejects.toMatchObject({ code: 'ENOSPC' });
        asPlatform('linux');
        refuseRename('EPERM');
        await expect(writeAtomic(file, 'new')).rejects.toMatchObject({ code: 'EPERM' });
        expect(fs.readFileSync(file, 'utf8')).toBe('old');
    });

    it('a rename that works replaces the file, as before', async () => {
        const file = path.join(root, 'plain.html');
        fs.writeFileSync(file, 'old');
        await writeAtomic(file, 'new');
        expect(fs.readFileSync(file, 'utf8')).toBe('new');
    });
});
