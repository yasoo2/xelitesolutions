/**
 * THE UPDATE BUTTON MAY NOT LIE ABOUT PROGRESS.
 *
 * «انظر الفشل الى اي قد وصل.. نصف ساعه ولم يتم تحديث النظام» — with the card
 * showing «الخطوة 1 من 4» the entire time and a log holding one line, the one
 * Joe itself had written. Three defects, each of which alone was enough:
 *
 *   1. runDetached returned ok:true for a spawn that never happened, and left
 *      an unhandled 'error' event behind — an uncaught exception in Node.
 *   2. the scripts reported progress through a SECOND handle on the log file,
 *      whose failure was swallowed by a silent catch on Windows.
 *   3. the status route knew only «touched recently», so a dead updater was
 *      indistinguishable from a working one.
 *
 * The live proof is src/tests/manual/verify_update_honesty.ts (28/28, real
 * processes and a real browser). This keeps the wiring from rotting back.
 */
import fs from 'fs';
import path from 'path';
jest.mock('child_process', () => {
    const actual = jest.requireActual<typeof import('child_process')>('child_process');
    return { ...actual, spawn: jest.fn(actual.spawn) };
});

import * as childProcess from 'child_process';
import { executionEngine } from '../kernel/ExecutionEngine';

const realChildProcess = jest.requireActual<typeof import('child_process')>('child_process');
const spawnMock = childProcess.spawn as jest.MockedFunction<typeof childProcess.spawn>;

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf-8');

describe('a spawn that fails is a failure, not a silence', () => {
    const E = read('api', 'src', 'kernel', 'ExecutionEngine.ts');

    it('runDetached listens for the error event it used to leave unhandled', () => {
        // Without this listener the event is an uncaught exception: Joe dies,
        // and the page it was serving keeps showing step 1 forever.
        expect(E).toMatch(/child\.on\('error'/);
    });

    it('…and a child with no pid is reported as ok:false', () => {
        expect(E).toMatch(/if \(!child\.pid\)/);
        expect(E).toMatch(/return \{ ok: false, error \}/);
    });

    it('the reason reaches the log the user can read', () => {
        expect(E).toMatch(/const note = \(line: string\)/);
    });

    it('a child that dies silently still leaves its exit code behind', () => {
        // «العملية انتهت دون أن تبدأ» was the end of the diagnosis on his
        // machine: created, silent, gone, and no record of why.
        expect(E).toMatch(/child\.on\('exit'/);
        expect(E).toMatch(/رمز الخروج/);
    });

    it('…and on Windows it is not detached at all — a console host needs a console', () => {
        // DETACHED_PROCESS leaves the child with no console, and powershell.exe
        // cannot start its host without one: it exits immediately with status
        // 0, having run nothing. Windows does not kill children with their
        // parent, so the updater still outlives the server it is about to kill.
        expect(E).toMatch(/process\.platform !== 'win32'/);
        expect(E).toMatch(/detached: detach/);
    });
});

describe('attached command window policy is explicit at the spawn boundary', () => {
    //  A spawn-shaped stub: these cases judge the OPTIONS spawn received,
    //  so the child only has to exist.
    const fakeChild = () => ({
        pid: 4242, exitCode: null, killed: false,
        stdout: null, stderr: null, stdin: null,
        on() { return this; }, once() { return this; }, kill() { return true; }, unref() { },
    }) as any;

    beforeEach(() => {
        spawnMock.mockClear();
    });

    /**
     *  THIS CASE WAS PINNING A LINE OF SOURCE, AND THE LINE WAS WRONG.
     *
     *  It asserted the exact text `windowsHide: options.windowsHide === true`
     *  — «a detached child is not ALSO asked to hide a window» — on the
     *  belief that DETACHED_PROCESS with CREATE_NO_WINDOW is a contradiction
     *  Windows refuses, and that the observed death came from asking for both.
     *
     *  The death was real. The cause was not. Measured on the owner's machine,
     *  spawning a real server four ways and then asking the port:
     *
     *      detached + shell   + ignore                alive: false
     *      detached + shell   + ignore + windowsHide  alive: false
     *      detached + NOshell + pipe   + windowsHide  alive: TRUE
     *      background + shell + pipe   + windowsHide  alive: TRUE
     *
     *  A detached child lives perfectly well hidden. What kills it is being
     *  detached from a SHELL command, in either state. Meanwhile the console
     *  this line insisted on opened over his work, twice in one morning.
     *
     *  So the assertion is the behaviour now, not the sentence: what did
     *  spawn actually receive. A test that quotes an implementation line
     *  cannot notice that the line is mistaken — it can only defend it.
     */
    it('a detached child is spawned with no window', () => {
        const calls: Array<Record<string, unknown>> = [];
        spawnMock.mockImplementation(((...args: Parameters<typeof childProcess.spawn>) => {
            calls.push((args[2] || {}) as Record<string, unknown>);
            return fakeChild();
        }) as typeof childProcess.spawn);

        executionEngine.runDetached(process.execPath, ['-e', ''], { detached: true });
        expect(calls.at(-1)?.windowsHide).toBe(true);
    });

    //  NEGATIVE — a caller that explicitly asks for a console still gets one,
    //  or this is a hard rule rather than a default. Its own case, with its
    //  own mock: two spawns through one mocked child share state.
    it('and a caller may still ask for a console', () => {
        const seen: Array<Record<string, unknown>> = [];
        spawnMock.mockImplementation(((...args: Parameters<typeof childProcess.spawn>) => {
            seen.push((args[2] || {}) as Record<string, unknown>);
            return fakeChild();
        }) as typeof childProcess.spawn);

        executionEngine.runDetached(process.execPath, ['-e', ''], { detached: true, windowsHide: false });
        expect(seen.at(-1)?.windowsHide).toBe(false);
    });


    afterEach(() => {
        spawnMock.mockClear();
    });

    it('passes true by default and false when explicitly requested to runCommandInternal', async () => {
        const calls: Array<{ windowsHide: unknown; detached: unknown }> = [];
        spawnMock.mockImplementation(((...args: Parameters<typeof childProcess.spawn>) => {
            const options = args[2] as childProcess.SpawnOptions;
            calls.push({ windowsHide: options?.windowsHide, detached: options?.detached });
            return realChildProcess.spawn(...args);
        }) as typeof childProcess.spawn);

        const cases: Array<{ windowsHide?: boolean }> = [{}, { windowsHide: false }];
        for (const options of cases) {
            const result = await executionEngine.execute({
                id: `windows-hide-${String(options.windowsHide)}`,
                type: 'shell',
                payload: { command: `${process.execPath} -e \"\"`, options },
                priority: 'normal',
            });
            expect(result.success).toBe(true);
        }

        expect(calls.slice(-2)).toEqual([
            { windowsHide: true, detached: undefined },
            { windowsHide: false, detached: undefined },
        ]);
    });

    it('keeps runDetached on its existing true-only windowsHide policy', () => {
        const child = realChildProcess.spawn(process.execPath, ['-e', 'setTimeout(() => {}, 50)'], { stdio: 'ignore' });
        const calls: Array<{ windowsHide: unknown; detached: unknown }> = [];
        spawnMock.mockImplementation(((...args: Parameters<typeof childProcess.spawn>) => {
            const options = args[2] as childProcess.SpawnOptions;
            calls.push({ windowsHide: options?.windowsHide, detached: options?.detached });
            return child;
        }) as typeof childProcess.spawn);

        const result = executionEngine.runDetached(process.execPath, ['-e', ''], { detached: true });
        expect(result.ok).toBe(true);
        //  This asserted `windowsHide: false` — a console window for every
        //  detached child — on the belief that hiding one killed it. He was
        //  shown two black windows over his work before that belief was
        //  measured: hiding changes nothing about survival (a detached
        //  non-shell child lives hidden; a detached SHELL command dies in
        //  both states). The window was the cost of a wrong inference.
        expect(calls.at(-1)).toEqual({ windowsHide: true, detached: true });
        child.kill();
    });
});

describe('two channels, so neither can silence the other', () => {
    const S = read('api', 'src', 'api', 'routes', 'system.ts');

    it('the streamed output and the script\'s own file are DIFFERENT files', () => {
        expect(S).toMatch(/const UPDATE_OUT = /);
        expect(S).toMatch(/outFile: UPDATE_OUT/);
        expect(S).toMatch(/noteFile: UPDATE_LOG/);
        expect(S).not.toMatch(/logFile: UPDATE_LOG,/);
    });

    it('and the status route reads both', () => {
        expect(S).toMatch(/function readTail/);
        expect(S).toMatch(/readFileTail\(UPDATE_OUT, limit\)/);
        // silence must mean BOTH are silent, not just one
        expect(S).toMatch(/for \(const f of \[UPDATE_LOG, UPDATE_OUT\]\)/);
    });

    it('the script writes its own file first and falls back to stdout', () => {
        for (const script of ['update-joe.ps1', 'start-joe.ps1']) {
            const s = read(script);
            expect(`${script}: ${/\$wrote = \$true/.test(s) ? 'has-fallback' : 'single-channel'}`)
                .toBe(`${script}: has-fallback`);
            expect(s).toMatch(/if \(-not \$wrote\) \{/);
        }
    });
});

describe('the updater speaks on a channel that cannot fail silently', () => {
    for (const script of ['update-joe.ps1', 'start-joe.ps1']) {
        it(`${script}: Say writes to standard output when Joe runs it`, () => {
            const s = read(script);
            // Its OWN file is the primary channel: it depends on no handle
            // inherited across a process boundary, no host and no window.
            // Standard output — a different file — is the fallback, so the two
            // writers that failed silently on Windows can never meet again.
            expect(s).toMatch(/\[System\.IO\.File\]::Open\(\$env:JOE_UPDATE_LOG/);
            expect(s).toMatch(/if \(-not \$wrote\) \{/);
            expect(s).toMatch(/\[Console\]::Out\.WriteLine\(\$msg\)/);
        });

        it(`${script}: chcp is not called in a window that does not exist`, () => {
            expect(read(script)).toMatch(/JOE_UNATTENDED -ne '1'\) \{ \$null = chcp 65001 \}/);
        });
    }
});

describe('the status route can say «it stopped»', () => {
    const S = read('api', 'src', 'api', 'routes', 'system.ts');

    it('there is a stalled verdict, with its two distinct reasons', () => {
        expect(S).toMatch(/stalled = 'never_started'/);
        expect(S).toMatch(/stalled = 'silent'/);
        expect(S).toMatch(/stalled,/);
    });

    it('running is false the moment it stalls — no bar over a dead process', () => {
        expect(S).toMatch(/running: !!startedAt && !finished && !failed && !stalled/);
    });

    it('Joe never mistakes its own lines for the updater talking', () => {
        expect(S).toMatch(/function updaterSpoke/);
        expect(S).toMatch(/!t\.startsWith\('\[i\] '\) && !t\.startsWith\('\[!\] '\)/);
    });

    it('the interpreter is resolved before it is launched, never guessed', () => {
        expect(S).toMatch(/findBinary\('powershell\.exe'\)/);
        expect(S).toMatch(/error: 'interpreter_missing'/);
    });

    it('and a watchdog writes the diagnosis, marked as Joe\'s own', () => {
        expect(S).toMatch(/note\('\[!\]'/);
        expect(S).toMatch(/لم يكتب أي سطر/);
    });
});

describe('the card shows the stall, and the way out of it', () => {
    const U = read('web', 'src', 'components', 'UpdateJoeItem.tsx');

    it('there is a stalled phase, driven by the server\'s verdict', () => {
        expect(U).toMatch(/'stalled'/);
        expect(U).toMatch(/if \(d\?\.stalled\)/);
    });

    it('a stalled run gets the failure face, not a progress bar', () => {
        expect(U).toMatch(/const bad = s\.phase === 'failed' \|\| s\.phase === 'stalled'/);
        expect(U).toMatch(/\{!bad && \(/);
    });

    it('and it offers the command that always works, plus a retry', () => {
        expect(U).toMatch(/data-testid="update-rescue"/);
        expect(U).toMatch(/update-joe\.ps1/);
        expect(U).toMatch(/data-testid="update-retry"/);
    });
});
