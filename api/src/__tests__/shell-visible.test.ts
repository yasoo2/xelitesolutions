/**
 * When Joe runs a command autonomously, the user must SEE it in the Terminal
 * tab — the standing "use the terminal" promise is empty if the work is
 * invisible. shell_execute must broadcast the command and its output to the
 * agent terminal view ('joe-agent'), never to the interactive local_terminal.
 */
import fs from 'fs';
import path from 'path';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

describe('explicit terminal diagnostics execute instead of merely opening a terminal', () => {
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
