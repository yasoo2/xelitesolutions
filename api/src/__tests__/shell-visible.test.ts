/**
 * When Joe runs a command autonomously, the user must SEE it in the Terminal
 * tab — the standing "use the terminal" promise is empty if the work is
 * invisible. shell_execute must broadcast the command and its output to the
 * agent terminal view ('joe-agent'), never to the interactive local_terminal.
 */
import fs from 'fs';
import path from 'path';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { IntentParser } from '../core/intelligence/IntentParser';
import { isBoundedTerminalDiagnosticRequest, isReadOnlyRequest } from '../core/orchestrator/buildIntent';
import { parseExplicitDirectoryInspectionRequest, parseExplicitReadFilesRequest, parseExpectedReadMarkers } from '../core/orchestrator/file-intent';
import { composeAnswer } from '../core/orchestrator/answerComposer';

describe('explicit terminal diagnostics execute instead of merely opening a terminal', () => {
    test('a read-only local diagnostic is classified before the slow model path', async () => {
        const goal = 'Run a read-only local diagnostic in the current workspace: report the Node.js version and the current workspace path. Do not modify files, install packages, or start a server.';
        expect(isReadOnlyRequest(goal)).toBe(true);
        expect(isBoundedTerminalDiagnosticRequest(goal)).toBe(true);
        const intent = await IntentParser.parse(goal, {} as any);
        expect(intent.requiredTools).toEqual(['shell_execute']);
        expect(intent.rawIntent).toEqual(expect.objectContaining({ terminalDiagnostic: true, deterministic: true }));
        const plan = await PlanningEngine.generatePlan({ intent: intent as any });
        expect(plan.steps.map(step => step.input.command)).toEqual(['node --version', 'pwd']);
        expect(plan.metadata).toMatchObject({ terminalExecution: true });
    });

    test('Arabic acceptance request routes directly to shell_execute', async () => {
        const plan = await PlanningEngine.generatePlan({
            intent: {
                goal: 'نفّذ فحصاً محلياً باستخدام أداتك الطرفية. لا تكتفِ بإجابة؛ اعرض الأمر والمخرجات في شاشة Terminal.',
                complexity: 'low',
                riskLevel: 'low',
                rawIntent: {},
            } as any,
        });
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0].tool).toBe('shell_execute');
        expect(plan.steps[0].input.command).toContain('Joe terminal execution verified');
    });

    test('the exact visible acceptance wording routes directly to shell_execute', async () => {
        const plan = await PlanningEngine.generatePlan({
            intent: {
                goal: 'نفّذ فحصاً محلياً باستخدام shell_execute فقط: اعرض pwd، ثم نفّذ node --version، ثم echo TERMINAL_VISIBILITY_TEST. لا تبنِ تطبيقاً ولا تعدّل ملفات ولا تستخدم المتصفح أو Git. يجب عرض الأوامر ومخرجاتها الحقيقية في شاشة Terminal المرئية.',
                complexity: 'low',
                riskLevel: 'low',
                rawIntent: {},
            } as any,
        });
        expect(plan.steps).toHaveLength(3);
        expect(plan.steps.map(step => step.tool)).toEqual(['shell_execute', 'shell_execute', 'shell_execute']);
        expect(plan.steps.map(step => step.input.command)).toEqual([
            'pwd',
            'node --version',
            'echo TERMINAL_VISIBILITY_TEST',
        ]);
        expect(plan.steps[1].dependsOn).toEqual(['terminal_diagnostic_0']);
        expect(plan.steps[2].dependsOn).toEqual(['terminal_diagnostic_1']);
    });

    test('an explicit existing-project build stays a visible shell execution', async () => {
        const plan = await PlanningEngine.generatePlan({
            intent: {
                goal: 'نفّذ فحص بناء محلياً فقط لمشروع React الموجود في react-مدار-الحجوزات: استخدم shell_execute لتشغيل npm run build داخل هذا المجلد. لا تعدّل أي ملف، ولا تثبّت حزمًا، ولا تستخدم المتصفح أو Git أو أي نشر. اعرض أمر البناء ومخرجاته الحقيقية ونهاية نجاحه أو خطئه في شاشة Terminal المرئية.',
                complexity: 'medium',
                riskLevel: 'low',
                rawIntent: {},
            } as any,
        });
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0].tool).toBe('shell_execute');
        expect(plan.steps[0].input).toMatchObject({
            command: 'npm run build',
            cwd: 'react-مدار-الحجوزات',
        });
        expect(plan.metadata).toMatchObject({ terminalExecution: true, buildVerification: true });
    });

    test('a build request retains the dedicated build pipeline', async () => {
        const plan = await PlanningEngine.generatePlan({
            intent: {
                goal: 'ابنِ لوحة React محلية لإدارة المهام ولا تنشرها.',
                complexity: 'medium',
                riskLevel: 'low',
                rawIntent: {},
            } as any,
        });
        expect(plan.steps[0].tool).toBe('project_pipeline');
    });
});

describe('explicit read-only file lists use the active workspace directly', () => {
    test('does not confuse Node.js with a requested file path', () => {
        expect(parseExplicitReadFilesRequest('Run a read-only local diagnostic: report the Node.js version. Do not modify files.')).toBeNull();
    });

    test('reads multiple named relative files without project selection', async () => {
        const goal = 'Read joe-prompt-02.txt and joe-prompt-03/README.txt in the current workspace. Report the exact line count and exact content of each file. Do not modify anything.';
        expect(parseExplicitReadFilesRequest(goal)).toEqual(['joe-prompt-02.txt', 'joe-prompt-03/README.txt']);
        const plan: any = await PlanningEngine.generatePlan({ intent: { goal, complexity: 'low', riskLevel: 'low', rawIntent: {} } as any });
        expect(plan.metadata.matchedBy).toBe('explicit-read-file-contract');
        expect(plan.steps.map((step: any) => step.tool)).toEqual(['read_file', 'read_file']);
        expect(plan.steps.map((step: any) => step.input.path)).toEqual(['joe-prompt-02.txt', 'joe-prompt-03/README.txt']);
    });

    test('reports line counts and does not invent an unspecified marker', () => {
        const answer = composeAnswer([
            { id: 'a', task: 'قراءة الملف المحدد: joe-prompt-02.txt', tool: 'read_file', status: 'completed', result: { content: 'one\ntwo', totalLines: 2 } },
            { id: 'b', task: 'قراءة الملف المحدد: joe-prompt-03/README.txt', tool: 'read_file', status: 'completed', result: { content: 'nested', totalLines: 1 } },
        ], 'en');
        expect(answer).toContain('joe-prompt-02.txt');
        expect(answer).toContain('2 lines');
        expect(answer).toContain('joe-prompt-03/README.txt');
        expect(answer).toContain('No marker value was specified');
    });

    test('checks explicitly supplied markers against the read content', async () => {
        const goal = 'Read joe-prompt-02.txt and joe-prompt-03/README.txt. Verify that joe-prompt-02.txt contains the marker "deterministic artifact check" and joe-prompt-03/README.txt contains the marker "Nested artifact check". Do not modify anything.';
        expect(parseExpectedReadMarkers(goal)).toEqual({
            'joe-prompt-02.txt': 'deterministic artifact check',
            'joe-prompt-03/README.txt': 'Nested artifact check',
        });
        const plan: any = await PlanningEngine.generatePlan({ intent: { goal, complexity: 'low', riskLevel: 'low', rawIntent: {} } as any });
        expect(plan.steps.map((step: any) => step.input.expectedMarker)).toEqual([
            'deterministic artifact check',
            'Nested artifact check',
        ]);
        const answer = composeAnswer(plan.steps.map((step: any) => ({
            ...step,
            result: { content: step.input.expectedMarker, totalLines: 1 },
            status: 'completed',
        })), 'en');
        expect(answer).toContain('joe-prompt-02.txt');
        expect(answer).toContain('joe-prompt-03/README.txt');
        expect(answer.match(/PASS/g)?.length).toBe(2);
    });
});

describe('explicit directory inspection keeps nested evidence in scope', () => {
    test('opens the named directory instead of treating its README as a root file', async () => {
        const goal = 'Inspect the directory joe-prompt-03 in the current workspace. List its entries and confirm that README.txt exists inside it. Do not modify anything.';
        expect(parseExplicitDirectoryInspectionRequest(goal)).toEqual({ path: 'joe-prompt-03', expectedEntry: 'README.txt' });
        expect(parseExplicitReadFilesRequest(goal)).toBeNull();
        const plan: any = await PlanningEngine.generatePlan({ intent: { goal, complexity: 'low', riskLevel: 'low', rawIntent: {} } as any });
        expect(plan.metadata.matchedBy).toBe('explicit-directory-inspection');
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0]).toMatchObject({ tool: 'inspect_directory', input: { path: 'joe-prompt-03', expectedEntry: 'README.txt' } });
    });

    test('reports the actual directory entries and confirmation in the chat', () => {
        const answer = composeAnswer([{
            id: 'directory', tool: 'inspect_directory', status: 'completed', input: { path: 'joe-prompt-03', expectedEntry: 'README.txt' },
            result: { output: { tree: [{ name: 'README.txt', type: 'file', size: 12 }] } },
        }], 'en');
        expect(answer).toContain('joe-prompt-03');
        expect(answer).toContain('README.txt');
        expect(answer).toContain('Confirmed');
        expect(answer).toContain('No files were written or modified');
    });
});

describe('shell_execute — visible in the terminal', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'SystemTools.ts'), 'utf-8').replace(/\r\n/g, '\n');

    test('it broadcasts terminal_output to the owning session and visible panel stream', () => {
        expect(src).toContain('const terminalSessionId = typeof context?.sessionId');
        expect(src).toContain('broadcastTerminalLine(terminalSessionId, chunk)');
        // The tool delegates addressing to the owner-scoped helper, rather than
        // guessing a generic terminal id which the session filter may drop.
        expect(src).not.toContain("const AGENT_TERM = 'joe-agent'");
    });

    test('the command is echoed BEFORE it runs and the result AFTER', () => {
        // echoCommand() precedes handleShellCommand; echoResult() follows it.
        const echoCmdAt = src.indexOf('echoCommand();\n            const r = await handleShellCommand');
        const echoResAt = src.indexOf('echoResult(String(r.output');
        expect(echoCmdAt).toBeGreaterThan(0);
        expect(echoResAt).toBeGreaterThan(echoCmdAt);
    });

    test('output is CRLF-normalized so a child process does not stair-step', () => {
        expect(src).toMatch(/replace\(\/\\r\?\\n\/g, '\\r\\n'\)/);
    });

    test('secrets stay redacted in the echoed command', () => {
        expect(src).toContain('echoCommand = () => paintToTerminal(`\\r\\n\\x1b[36m$ ${redactCmd(command)}');
    });
});

describe('the terminal panel renders and preserves the agent stream', () => {
    const ui = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'terminal', 'EnterpriseTerminalPanel.tsx'), 'utf-8').replace(/\r\n/g, '\n');
    const socket = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'web', 'src', 'services', 'socket.ts'), 'utf-8').replace(/\r\n/g, '\n');

    test('incoming joe-agent output is accepted alongside the interactive session', () => {
        expect(ui).toMatch(/msg\.id === 'joe-agent'/);
    });

    test('terminal output is retained while its tab is unmounted and restored on return', () => {
        expect(socket).toContain("msgType === 'terminal_output'");
        expect(socket).toContain('terminalHistory:');
        expect(socket).toMatch(/getTerminalHistory\(sessionId\?: string\)/);
        expect(ui).toContain('const history = SocketService.getTerminalHistory(ownerSessionId)');
        expect(ui).toContain('--- Restored Joe execution output ---');
    });

    test('clearing the visible terminal clears its replay buffer as well', () => {
        expect(ui).toContain('SocketService.clearTerminalHistory(ownerSessionId)');
    });
});
