/**
 *  A CHILD WITH NO CONSOLE TO INHERIT MAKES ITS OWN.
 *
 *  He photographed a black window standing over his work — once running a
 *  generated project's `npm start`, once a bare cmd.exe sitting in its folder
 *  — and wrote «ظهرت مره اخرى يا غبي».
 *
 *  The first count I answered him with was not a measurement. It counted
 *  cmd.exe and conhost.exe PROCESSES, and a console process is not a console
 *  WINDOW: a child that inherits its parent's console is a cmd.exe with no
 *  window of its own. Counting the visible top-level windows instead — by
 *  window class, and reading each one's title — the shapes separate cleanly:
 *
 *      shell + wait                      windows +0
 *      shell + detached                  windows +2   titled «npm run hi»
 *      shell + detached + windowsHide    windows +0
 *      shell + wait     + windowsHide    windows +0
 *
 *  So the window is not the price of a shell, and not the price of npm. It is
 *  what Windows hands a child that was cut loose from our console and still
 *  needs one. `windowsHide` declines it.
 *
 *  This engine has four spawn doors. Two asked to be hidden and two never
 *  mentioned it, so whether he saw a window depended on which door a caller
 *  happened to come through — the same question answered differently in four
 *  places. These tests hold all four to one answer, and hold the answer to
 *  being READ rather than assumed: every case has its negative, a caller that
 *  explicitly asks for a console and gets one.
 */
jest.mock('child_process', () => {
    const actual = jest.requireActual<typeof import('child_process')>('child_process');
    return { ...actual, spawn: jest.fn(actual.spawn) };
});

import * as childProcess from 'child_process';
import { executionEngine } from '../kernel/ExecutionEngine';

const spawnMock = childProcess.spawn as jest.MockedFunction<typeof childProcess.spawn>;

/** A child that is never a real process: it answers, then ends. */
function fakeChild() {
    const listeners: Record<string, Array<(...a: any[]) => void>> = {};
    const stream = { on: () => stream, setEncoding: () => stream, pipe: () => stream };
    const child: any = {
        pid: 4242,
        stdout: stream,
        stderr: stream,
        stdin: { write: () => true, end: () => undefined },
        unref: () => undefined,
        kill: () => true,
        on(event: string, fn: (...a: any[]) => void) {
            (listeners[event] ||= []).push(fn);
            if (event === 'close' || event === 'exit') setTimeout(() => fn(0, null), 0);
            return child;
        },
        once(event: string, fn: (...a: any[]) => void) { return child.on(event, fn); },
        removeAllListeners: () => child,
    };
    return child;
}

/** The windowsHide actually handed to the OS on the last spawn. */
const lastWindowsHide = (): unknown => {
    const call = spawnMock.mock.calls.at(-1);
    return call ? (call[2] as any)?.windowsHide : undefined;
};

beforeEach(() => {
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => fakeChild());
});

afterAll(() => { spawnMock.mockRestore?.(); });

describe('every door out of this engine declines the console', () => {
    it('run() — the door most tools come through', async () => {
        await executionEngine.run('echo hello', { cwd: process.cwd(), timeout: 2000 });
        expect(spawnMock).toHaveBeenCalled();
        expect(lastWindowsHide()).toBe(true);
    });

    it('runArgv() — the tokenized door', async () => {
        await executionEngine.runArgv('node', ['-v'], { cwd: process.cwd(), timeout: 2000 });
        expect(spawnMock).toHaveBeenCalled();
        expect(lastWindowsHide()).toBe(true);
    });

    it('runArgvStreaming() — the door npm install and vite build come through', () => {
        //  This one never mentioned windowsHide at all. It is also the door
        //  every long build takes, so it is the door he would have seen most.
        executionEngine.runArgvStreaming('npm', ['install', '--no-audit'], { cwd: process.cwd() } as any);
        expect(spawnMock).toHaveBeenCalled();
        expect(lastWindowsHide()).toBe(true);
    });

    it('runDetached() — the only door that truly has no console to inherit', () => {
        executionEngine.runDetached('node', ['-e', '0'], { cwd: process.cwd() } as any);
        expect(spawnMock).toHaveBeenCalled();
        expect(lastWindowsHide()).toBe(true);
    });
});

describe('…and it is read, not assumed', () => {
    //  A constant `true` would pass every test above while making the option a
    //  lie. Each negative case proves the value came from the caller.

    it('run() gives a console to a caller that asks for one', async () => {
        await executionEngine.run('echo hello', { cwd: process.cwd(), timeout: 2000, windowsHide: false });
        expect(lastWindowsHide()).toBe(false);
    });

    it('runArgv() gives a console to a caller that asks for one', async () => {
        await executionEngine.runArgv('node', ['-v'], { cwd: process.cwd(), timeout: 2000, windowsHide: false });
        expect(lastWindowsHide()).toBe(false);
    });

    it('runArgvStreaming() gives a console to a caller that asks for one', () => {
        executionEngine.runArgvStreaming('npm', ['install'], { cwd: process.cwd(), windowsHide: false } as any);
        expect(lastWindowsHide()).toBe(false);
    });

    it('runDetached() gives a console to a caller that asks for one', () => {
        executionEngine.runDetached('node', ['-e', '0'], { cwd: process.cwd(), windowsHide: false } as any);
        expect(lastWindowsHide()).toBe(false);
    });
});

describe('nobody in this repository asks for one', () => {
    it('…so the default is what every call site actually gets', () => {
        //  The moment a call site sets windowsHide:false, a black window is
        //  back on his screen and this test says which file to look in.
        const fs = jest.requireActual<typeof import('fs')>('fs');
        const path = jest.requireActual<typeof import('path')>('path');
        const root = path.resolve(__dirname, '..');
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) {
                    if (e.name === 'node_modules' || e.name === '__tests__' || e.name === 'tests') continue;
                    walk(full);
                } else if (e.name.endsWith('.ts')) {
                    const text = fs.readFileSync(full, 'utf-8');
                    if (/windowsHide:\s*false/.test(text)) offenders.push(path.relative(root, full));
                }
            }
        };
        walk(root);
        expect(offenders).toEqual([]);
    });
});
