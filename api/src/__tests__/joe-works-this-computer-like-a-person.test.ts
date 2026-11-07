/**
 *  JOE WORKS THIS COMPUTER THE WAY A PERSON DOES — AND SEES WHAT HE DID.
 *
 *  The owner wants Joe to act on his own machine: open an application, type
 *  into it, press its buttons, read the screen. Real processes on Windows: the
 *  test opens its own small window (a text box, a button, a label) so it never
 *  touches the owner's applications, and Joe's desktop driver finds it among
 *  the open windows, reads its controls through UI Automation, types Arabic
 *  into the box through SendInput, sets a value and presses the button by the
 *  control's number, and takes a screenshot of every monitor.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import {
    describeUi, desktopScript, encodedCommand, keyCodes, parseUi, parseWindows, psQuote, runDesktop,
    type PowerShellRunner,
} from '../core/devices/windows-desktop';

jest.setTimeout(180_000);
const WINDOWS = process.platform === 'win32';

const run: PowerShellRunner = async (script, timeoutMs) => {
    const r = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand(script)],
        { encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
    return { exitCode: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
};

describe('the pieces', () => {
    test('key names become virtual keys in press order', () => {
        expect(keyCodes('ctrl+s')).toEqual([0x11, 0x53]);
        expect(keyCodes('Alt+F4')).toEqual([0x12, 0x73]);
        expect(keyCodes('enter')).toEqual([0x0d]);
        expect(keyCodes('ctrl+shift+t')).toEqual([0x11, 0x10, 0x54]);
        expect(keyCodes('hyper+x')).toBeNull();
    });

    test('a quote inside text is a doubled quote, nothing else changes', () => {
        expect(psQuote("it's «جو»")).toBe("'it''s «جو»'");
    });

    test('the window list and the UI reading are read line by line', () => {
        const w = parseWindows('123\t44\tnotepad\t10,20,800,600\t1\t0\tملاحظات - Notepad\n');
        expect(w).toEqual([{ handle: 123, pid: 44, process: 'notepad', x: 10, y: 20, width: 800, height: 600, foreground: true, minimized: false, title: 'ملاحظات - Notepad' }]);
        const ui = parseUi('WINDOW\tJoe test\n1\tButton\tاحفظ\tsave\t100,200,80,30\tInvoke\t1\t\n2\tEdit\t\tbox\t10,10,200,24\tValue|Text\t1\tمرحبا\n');
        expect(ui.window).toBe('Joe test');
        expect(ui.controls[0]).toMatchObject({ index: 1, kind: 'Button', name: 'احفظ', patterns: ['Invoke'] });
        expect(describeUi(ui)).toContain('[1] Button «احفظ» (Invoke) at 140,215');
        expect(describeUi(ui)).toContain('[2] Edit «» = «مرحبا» (Value) at 110,22');
    });

    test('every action is one script that loads the helper first', () => {
        const s = desktopScript({ op: 'type', text: "a'b" }, 'C:/tmp/x.dll', 'C:/tmp/x.cs');
        expect(s).toContain("$dll = 'C:/tmp/x.dll'");
        expect(s).toContain("[JoeDesktop]::TypeIn([long]0, 'a''b')");
    });
});

(WINDOWS ? describe : describe.skip)('on this computer, with real windows', () => {
    let dir = '';
    let form: ChildProcess | null = null;
    const TITLE = `Joe desktop test ${process.pid}`;

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-desktop-'));
        //  Our own window: a text box, a button that copies the box into a label.
        const formScript = [
            'Add-Type -AssemblyName System.Windows.Forms',
            '$f = New-Object System.Windows.Forms.Form',
            `$f.Text = ${psQuote(TITLE)}`,
            '$f.Width = 520; $f.Height = 240; $f.StartPosition = "CenterScreen"; $f.TopMost = $true',
            '$b = New-Object System.Windows.Forms.TextBox; $b.Name = "joeBox"; $b.Left = 20; $b.Top = 20; $b.Width = 300',
            '$k = New-Object System.Windows.Forms.Button; $k.Text = "Copy"; $k.Left = 340; $k.Top = 18; $k.Width = 120',
            '$l = New-Object System.Windows.Forms.Label; $l.Name = "joeLabel"; $l.Left = 20; $l.Top = 80; $l.Width = 440; $l.Text = "empty"',
            '$k.Add_Click({ $l.Text = "copied: " + $b.Text })',
            '$f.Controls.AddRange(@($b, $k, $l))',
            '$t = New-Object System.Windows.Forms.Timer; $t.Interval = 90000; $t.Add_Tick({ $f.Close() }); $t.Start()',
            '[void]$f.ShowDialog()',
        ].join('\n');
        form = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand(formScript)], { stdio: 'ignore' });
        for (let i = 0; i < 60; i++) {
            const w = await runDesktop(run, { op: 'windows' });
            if (parseWindows(w.out).some(x => x.title === TITLE)) break;
            await new Promise(r => setTimeout(r, 500));
        }
    });
    afterAll(() => {
        try { form?.kill(); } catch { /* gone */ }
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const ours = async () => parseWindows((await runDesktop(run, { op: 'windows' })).out).find(w => w.title === TITLE);
    const read = async (handle: number) => parseUi((await runDesktop(run, { op: 'ui', handle, limit: 100 })).out);

    test('a screenshot of every monitor is a real PNG', async () => {
        const file = path.join(dir, 'screen.png');
        const r = await runDesktop(run, { op: 'screenshot', file });
        expect(r.ok).toBe(true);
        const [, , w, h] = r.out.split('\t')[1].split(',').map(Number);
        expect(w).toBeGreaterThan(300);
        expect(h).toBeGreaterThan(200);
        expect(fs.readFileSync(file).subarray(1, 4).toString()).toBe('PNG');
    });

    test('Joe finds the window, reads its controls where they really are, sets a value and presses the button by number', async () => {
        const win = await ours();
        expect(win).toBeDefined();
        const ui = await read(win!.handle);
        expect(ui.window).toBe(TITLE);
        const box = ui.controls.find(c => c.kind === 'Edit');
        const button = ui.controls.find(c => c.kind === 'Button' && c.name === 'Copy');
        expect(box && button).toBeTruthy();
        //  The calibration: every control Joe reads lies inside the window on the real screen.
        for (const c of [box!, button!]) {
            expect(c.x).toBeGreaterThanOrEqual(win!.x);
            expect(c.y).toBeGreaterThanOrEqual(win!.y);
            expect(c.x + c.width).toBeLessThanOrEqual(win!.x + win!.width);
            expect(c.y + c.height).toBeLessThanOrEqual(win!.y + win!.height);
        }
        expect((await runDesktop(run, { op: 'act', handle: win!.handle, index: box!.index, action: 'set_value', value: 'مرحبا من جو', limit: 100 })).ok).toBe(true);
        expect((await runDesktop(run, { op: 'act', handle: win!.handle, index: button!.index, action: 'invoke', value: '', limit: 100 })).ok).toBe(true);
        const after = await read(win!.handle);
        expect(after.controls.some(c => c.name === 'copied: مرحبا من جو')).toBe(true);
    });

    test('THE GUARD: a click off the window and keys for a window not in front are refused, and nothing is sent', async () => {
        const win = await ours();
        await runDesktop(run, { op: 'focus', handle: win!.handle });
        const off = await runDesktop(run, { op: 'click', x: Math.max(0, win!.x - 40), y: Math.max(0, win!.y - 40), window: win!.handle });
        expect(off.ok).toBe(false);
        expect(off.error).toMatch(/not on the window asked for/u);
        //  The desktop itself is open and never in front while our window is.
        const desktop = parseWindows((await runDesktop(run, { op: 'windows' })).out).find(w => w.process === 'explorer' && /Program Manager/u.test(w.title));
        if (desktop) {
            const keys = await runDesktop(run, { op: 'type', text: 'لا يجب أن يُكتب', window: desktop.handle });
            expect(keys.ok).toBe(false);
            expect(keys.error).toMatch(/the window in front is/u);
        }
    });

    test('Joe brings it to the front, clicks into the box and types Arabic with the keyboard — only into his window', async () => {
        const win = await ours();
        expect((await runDesktop(run, { op: 'focus', handle: win!.handle })).ok).toBe(true);
        const box = (await read(win!.handle)).controls.find(c => c.kind === 'Edit')!;
        //  An old single-line text box ignores ctrl+a: it is emptied through its value first.
        expect((await runDesktop(run, { op: 'act', handle: win!.handle, index: box.index, action: 'set_value', value: '', limit: 100 })).ok).toBe(true);
        const click = await runDesktop(run, { op: 'click', x: box.x + 10, y: box.y + Math.round(box.height / 2), window: win!.handle });
        expect(click.ok).toBe(true);
        expect((await runDesktop(run, { op: 'key', codes: keyCodes('end')!, window: win!.handle })).ok).toBe(true);
        expect((await runDesktop(run, { op: 'type', text: 'جو يكتب بنفسه 123', window: win!.handle })).ok).toBe(true);
        const after = await read(win!.handle);
        expect(after.controls.find(c => c.kind === 'Edit')?.value).toBe('جو يكتب بنفسه 123');
    });
});
