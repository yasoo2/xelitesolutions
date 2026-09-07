import fs from 'fs';
import path from 'path';

const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

describe('timed-out process cleanup remains inside ExecutionEngine', () => {
    it('permits only the marked, exact Windows process-tree cleanup argv', () => {
        const guard = read('kernel', 'ExecutionGuard.ts');
        const engine = read('kernel', 'ExecutionEngine.ts');

        expect(engine).toContain("spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F']");
        expect(engine).toContain('__joeExecutionTreeCleanup: true');
        expect(guard).toContain("options?.__joeExecutionTreeCleanup === true");
        expect(guard).toContain("/^taskkill(?:\\.exe)?$/iu.test(cmdStr)");
        expect(guard).toContain("args.length === 4");
        expect(guard).toContain("args[0] === '/PID'");
        expect(guard).toContain("/^\\d+$/u.test(String(args[1] || ''))");
        expect(guard).toContain("args[2] === '/T'");
        expect(guard).toContain("args[3] === '/F'");
    });
});
