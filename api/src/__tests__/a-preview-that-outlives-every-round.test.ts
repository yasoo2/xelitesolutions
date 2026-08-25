/**
 *  A PREVIEW THAT OUTLIVES EVERY ROUND, NOT JUST ITS OWN.
 *
 *  Measured on his machine at 09:21:
 *
 *      total node.exe:       19
 *      older than 6 hours:   12
 *      older than 24 hours:   6
 *
 *      vite dev servers still listening
 *          08-22 00:47  port 4399   — three days old
 *          08-22 00:55  port 4398
 *          08-24 13:13  port 4300
 *          08-24 20:34  port 4301
 *          08-24 22:01  port 4302
 *          08-25 06:51  port 4303
 *
 *  retireRecordedServer already exists and already runs before every
 *  launch. It could not fire, because the guard it borrowed is the
 *  ADOPTION guard — canAdoptRecordedLive, which demands the recorded
 *  server be in the SAME project directory. Right for adopting a server,
 *  wrong for retiring one: a session that builds a second project never
 *  revisits the first directory, so the first preview was never
 *  anybody's to kill.
 *
 *  A session shows ONE preview. Starting the next one ends the last one,
 *  whichever project it belonged to — and the blast radius is bounded to
 *  a live pid this session recorded inside the tree Joe generates into.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { theServerThisSessionLeftRunning, canAdoptRecordedLive } from '../modules/tools/definitions/ProjectRunTool';

describe('the session\u2019s previous preview is a candidate, whatever project it was', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-preview-'));
    const first = path.join(root, 'react-invoices');
    const second = path.join(root, 'react-employees');
    fs.mkdirSync(first, { recursive: true });
    fs.mkdirSync(second, { recursive: true });
    afterAll(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } });

    const live = { pid: process.pid, cwd: first, port: 4301 };

    it('the adoption guard refuses it — and that is correct for adoption', () => {
        //  This is the guard retirement was borrowing. It says «not the same
        //  project», which is the right answer to a different question.
        expect(canAdoptRecordedLive(live, second)).toBe(false);
    });

    it('…and retirement takes it, because the session is what owns a preview', () => {
        expect(theServerThisSessionLeftRunning(live, root)).toBe(true);
    });
});

describe('and nothing outside that tree is ever a candidate', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-preview-root-'));
    afterAll(() => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ } });

    it('a directory outside the workspace is refused', () => {
        expect(theServerThisSessionLeftRunning(
            { pid: process.pid, cwd: path.join(os.tmpdir(), 'somewhere-else') }, root)).toBe(false);
    });

    it('a pid that is not running is refused', () => {
        //  Not a number anything is listening on, and not alive.
        expect(theServerThisSessionLeftRunning({ pid: 999999999, cwd: root + path.sep + 'x' }, root)).toBe(false);
    });

    it('a record with no pid is refused', () => {
        expect(theServerThisSessionLeftRunning({ cwd: root + path.sep + 'x' }, root)).toBe(false);
        expect(theServerThisSessionLeftRunning({ pid: 0, cwd: root + path.sep + 'x' }, root)).toBe(false);
        expect(theServerThisSessionLeftRunning({ pid: -1, cwd: root + path.sep + 'x' }, root)).toBe(false);
    });

    it('a record with no directory is refused', () => {
        expect(theServerThisSessionLeftRunning({ pid: process.pid }, root)).toBe(false);
    });

    it('an empty workspace root refuses everything', () => {
        //  A missing root must never widen the radius, and the case that
        //  proves it is a directory under the PROCESS's own cwd: an empty
        //  string resolves to that, so without an explicit refusal the
        //  radius silently becomes wherever Joe happens to be running.
        //  A mutation that removed the refusal killed nothing until this
        //  case existed.
        expect(theServerThisSessionLeftRunning({ pid: process.pid, cwd: root + path.sep + 'x' }, '')).toBe(false);
        expect(theServerThisSessionLeftRunning(
            { pid: process.pid, cwd: path.join(process.cwd(), 'src', 'anything') }, '')).toBe(false);
    });

    it('what this file does NOT prove, said plainly', () => {
        //  A mutation that unwires the new guard from retireRecordedServer
        //  kills nothing here: this file tests the DECISION, not the wire.
        //  Faking a run context to cover the wire would test the fake, so
        //  the wire is proved by a live round — the log line it writes is
        //  «retired previous server pid=… port=…», and the count of stale
        //  node processes on his machine is the measurement behind it.
        expect(typeof theServerThisSessionLeftRunning).toBe('function');
    });
});
