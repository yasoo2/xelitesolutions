/**
 * ONE TEST AT A TIME ON THE REAL SCREEN.
 *
 * The desktop tests open their own windows in the middle of the screen and
 * bring them to the front. Two such files in two jest workers at once fought
 * over the front window, and each one's actions were refused or landed on the
 * other's window (measured: 3 failures together, none apart). A lock file in
 * the temp folder makes them take turns, across workers; a lock older than
 * ten minutes is a crashed holder's and is taken over.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const LOCK = path.join(os.tmpdir(), 'joe-desktop-tests.lock');
const STALE_MS = 10 * 60_000;

export async function takeTheScreen(timeoutMs = 600_000): Promise<() => void> {
    const end = Date.now() + timeoutMs;
    for (;;) {
        try {
            const fd = fs.openSync(LOCK, 'wx');
            fs.writeSync(fd, String(process.pid));
            fs.closeSync(fd);
            let released = false;
            return () => { if (!released) { released = true; try { fs.unlinkSync(LOCK); } catch { /* gone */ } } };
        } catch {
            try { if (Date.now() - fs.statSync(LOCK).mtimeMs > STALE_MS) fs.unlinkSync(LOCK); } catch { /* raced */ }
            if (Date.now() > end) throw new Error('the screen stayed taken by another desktop test');
            await new Promise(r => setTimeout(r, 500));
        }
    }
}
