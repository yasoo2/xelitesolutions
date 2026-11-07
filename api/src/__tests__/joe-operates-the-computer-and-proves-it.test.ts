/**
 *  JOE OPERATES THE COMPUTER — AND DELIVERS ONLY WHAT HE DID AND SAW.
 *
 *  The engine's third kind of work (core/engine/operate.ts): «افتح المفكرة
 *  واكتب فيها…», «open notepad on my computer and type…». The route reader
 *  sends such a request to the engine as operate and never takes a request to
 *  BUILD a program for one. The operate verifier delivers only when something
 *  was done on the device and looked at afterwards. Last, the real loop, a
 *  scripted model and the real device tools through Joe's gateway work a test
 *  window of their own: list the windows, read the window's controls, set the
 *  text box, press the button, read again, finish — and the window shows it.
 */
import fs from 'fs';
import { takeTheScreen } from './fixtures/desktop-lock';
import os from 'os';
import path from 'path';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { isOperateRequest, onlyLooks, operateOutput, operateVerifier } from '../core/engine/operate';
import { deviceRecordFor, forgetDeviceRecord } from '../core/engine/tools/devices';
import { encodedCommand, parseUi, parseWindows, psQuote, runDesktop, type PowerShellRunner } from '../core/devices/windows-desktop';
import { fileToolsFixture, type FileToolsFixture } from './fixtures/engine-file-tools';
import type { ChatMessage, EngineModel, ModelStep, ToolContext } from '../core/engine/types';

jest.setTimeout(300_000);
const WINDOWS = process.platform === 'win32';

describe('which requests are operate', () => {
    test.each([
        'افتح المفكرة واكتب فيها قائمة المشتريات',
        'افتح برنامج الآلة الحاسبة على جهازي واحسب 25 ضرب 4',
        'اضغط زر الحفظ في البرنامج المفتوح على الشاشة',
        'open notepad on my computer and type hello',
        'Open Excel and sum column B',
        'what is on my screen right now?',
    ])('«%s» is operate', text => expect(isOperateRequest(text)).toBe(true));

    test.each([
        'ابني تطبيق مفكرة بسيط',
        'build a calculator app',
        'اكتب برنامج Python يحسب الضرائب',
        'Create a website for my bakery',
        'what is the capital of France?',
    ])('«%s» is not', text => expect(isOperateRequest(text)).toBe(false));

    test('a question about the screen only needs a look', () => {
        expect(onlyLooks('what is on my screen right now?')).toBe(true);
        expect(onlyLooks('ماذا يظهر على شاشتي الآن؟')).toBe(true);
        expect(onlyLooks('open notepad on my computer and type hello')).toBe(false);
    });
});

describe('the operate verifier', () => {
    const ctx = (runId: string, request: string) => ({ runId, request } as unknown as ToolContext);
    afterEach(() => { for (const id of ['v1', 'v2', 'v3', 'v4']) forgetDeviceRecord(id); });

    test('nothing done is not done', async () => {
        const r = await operateVerifier()(ctx('v1', 'open notepad on my computer and type hello'), { summary: 'done' });
        expect(r.passed).toBe(false);
        expect(r.checks.find(c => c.id === 'acted')?.status).toBe('failed');
    });

    test('done but not looked at afterwards is not done', async () => {
        const rec = deviceRecordFor('v2');
        rec.looks.push({ at: 1, kind: 'windows' });
        rec.actions.push({ tool: 'device_type', ok: true, at: 2, what: 'type «hello»' });
        const r = await operateVerifier()(ctx('v2', 'open notepad on my computer and type hello'), { summary: 'done' });
        expect(r.passed).toBe(false);
        expect(r.checks.find(c => c.id === 'looked_after')?.status).toBe('failed');
    });

    test('done and seen is delivered; a last action that failed and was never redone is not', async () => {
        const ok = deviceRecordFor('v3');
        ok.actions.push({ tool: 'device_type', ok: true, at: 2, what: 'type «hello»' });
        ok.looks.push({ at: 3, kind: 'read' });
        expect((await operateVerifier()(ctx('v3', 'open notepad on my computer and type hello'), { summary: 'done' })).passed).toBe(true);
        const bad = deviceRecordFor('v4');
        bad.actions.push({ tool: 'device_type', ok: true, at: 2, what: 'type «a»' });
        bad.actions.push({ tool: 'device_click', ok: false, at: 3, what: 'click 10,10' });
        bad.looks.push({ at: 4, kind: 'look' });
        expect((await operateVerifier()(ctx('v4', 'open notepad on my computer and click save'), { summary: 'done' })).passed).toBe(false);
    });

    test('the owner is told in his language what was done', () => {
        const out = operateOutput({ status: 'delivered', summary: 'كتبتُ القائمة في المفكرة.', verification: { passed: true, checks: [{ id: 'acted', status: 'passed', detail: 'x' }], unproven: [], at: 1 }, filesChanged: [], served: [], steps: 5, model: 'm', durationMs: 42_000 } as any, 'ar');
        expect(out.ok).toBe(true);
        expect(out.output.summary).toContain('نفّذتُه على جهازك');
        expect(out.output.pipelineFinal).toBe(true);
    });
});

(WINDOWS ? describe : describe.skip)('the real loop works a window of its own through Joe\'s gateway', () => {
    let fx: FileToolsFixture;
    let form: ChildProcess | null = null;
    const TITLE = `Joe operate test ${process.pid}`;
    const run: PowerShellRunner = async (script, timeoutMs) => {
        const r = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand(script)], { encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
        return { exitCode: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
    };

    let release: () => void = () => undefined;
    beforeAll(async () => {
        release = await takeTheScreen();
        fx = fileToolsFixture('operate');
        const formScript = [
            'Add-Type -AssemblyName System.Windows.Forms',
            '$f = New-Object System.Windows.Forms.Form',
            `$f.Text = ${psQuote(TITLE)}`,
            '$f.Width = 520; $f.Height = 240; $f.StartPosition = "CenterScreen"; $f.TopMost = $true',
            '$b = New-Object System.Windows.Forms.TextBox; $b.Left = 20; $b.Top = 20; $b.Width = 300',
            '$k = New-Object System.Windows.Forms.Button; $k.Text = "Save"; $k.Left = 340; $k.Top = 18; $k.Width = 120',
            '$l = New-Object System.Windows.Forms.Label; $l.Left = 20; $l.Top = 80; $l.Width = 440; $l.Text = "nothing saved"',
            '$k.Add_Click({ $l.Text = "saved: " + $b.Text })',
            '$f.Controls.AddRange(@($b, $k, $l))',
            '$t = New-Object System.Windows.Forms.Timer; $t.Interval = 480000; $t.Add_Tick({ $f.Close() }); $t.Start()',
            '[void]$f.ShowDialog()',
        ].join('\n');
        form = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand(formScript)], { stdio: 'ignore' });
        //  A loaded machine can take minutes to draw a PowerShell window: wait by the clock, and say so if it never came.
        const until = Date.now() + 240_000;
        let shown = false;
        while (!shown && Date.now() < until) {
            shown = parseWindows((await runDesktop(run, { op: 'windows' })).out).some(w => w.title === TITLE);
            if (!shown) await new Promise(r => setTimeout(r, 500));
        }
        if (!shown) throw new Error(`the test window «${TITLE}» never appeared`);
    }, 600_000);
    afterAll(() => {
        //  The tool's own desktop host ends with the test, as it ends with a Joe that stops.
        require('../modules/tools/definitions/EngineDeviceTools').closeDesktopHost();
        release(); try { form?.kill(); } catch { /* gone */ } fx.cleanup(); });

    test('list → read → set → press → read → finish: delivered, and the window shows it', async () => {
        const text = (m: ChatMessage[]) => JSON.stringify(m);
        let handle = 0;
        let box = 0, save = 0;
        const turns: Array<(seen: string) => { name: string; args: unknown }> = [
            () => ({ name: 'plan_update', args: { steps: [{ text: 'find the window', status: 'in_progress' }, { text: 'type and save', status: 'pending' }] } }),
            () => ({ name: 'device_windows', args: {} }),
            seen => {
                const m = seen.match(new RegExp(`\\[(\\d+)\\] powershell «${TITLE}»`, 'u'));
                handle = m ? Number(m[1]) : 0;
                if (!handle) console.log(`OPERATE: no «${TITLE}» in what device_windows returned: ${seen.slice(0, 1500)}`);
                return { name: 'device_read', args: { window: handle } };
            },
            seen => {
                box = Number((seen.match(/\[(\d+)\] Edit «/u) || [])[1] || 0);
                save = Number((seen.match(/\[(\d+)\] Button «Save»/u) || [])[1] || 0);
                return { name: 'device_press', args: { window: handle, control: box, action: 'set', value: 'قائمة المشتريات: خبز، حليب' } };
            },
            () => ({ name: 'device_press', args: { window: handle, control: save, action: 'press' } }),
            () => ({ name: 'device_read', args: { window: handle } }),
            () => ({ name: 'task_finish', args: { summary: 'كتبتُ القائمة وضغطتُ حفظ، والنافذة تقول saved.' } }),
        ];
        let i = 0;
        const model: EngineModel = {
            label: 'scripted:operate', vision: false, contextTokens: () => 64_000,
            async step(messages: ChatMessage[]): Promise<ModelStep> {
                const t = turns[Math.min(i, turns.length - 1)](text(messages.slice(-2)));
                i++;
                return { text: '', toolCalls: [{ id: `c${i}`, name: t.name, arguments: JSON.stringify(t.args) }], durationMs: 1 };
            },
        };
        const { runEngine } = require('../core/engine/loop');
        const { planUpdateTool } = require('../core/engine/plan');
        const { finishTool } = require('../core/engine/finish');
        const { deviceTools } = require('../core/engine/tools/devices');
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-operate-'));
        const runId = String(fx.context.runId);
        const result = await executionFirewall.runInContext('operate-loop', () => runEngine({
            runId, request: 'افتح النافذة المفتوحة على جهازي واكتب فيها قائمة المشتريات ثم احفظ', language: 'ar', projectDir: dir, operate: true,
            deadlineAt: Date.now() + 240_000, signal: new AbortController().signal, emit: () => undefined, joe: { toolContext: { ...fx.context, projectRoot: dir } },
        }, {
            model, tools: [planUpdateTool, ...deviceTools, finishTool(operateVerifier())],
            processes: { async start() { throw new Error('none'); }, logs: () => undefined, stop: async () => true, list: () => [], stopAll: async () => undefined },
            browser: () => { throw new Error('no browser'); },
            machine: { platform: 'win32', shell: 'Windows PowerShell 5.1' },
        }), { userId: String(fx.context.userId), sessionId: String(fx.context.sessionId), runId });
        expect(handle).toBeGreaterThan(0);
        expect(box && save).toBeTruthy();
        expect(result.status).toBe('delivered');
        const ui = parseUi((await runDesktop(run, { op: 'ui', handle, limit: 100 })).out);
        expect(ui.controls.some(c => c.name === 'saved: قائمة المشتريات: خبز، حليب')).toBe(true);
        forgetDeviceRecord(runId);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
