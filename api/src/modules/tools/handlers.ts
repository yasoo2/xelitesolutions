import { ExecutionGateway } from '../../kernel/ExecutionGateway';
import path from 'path';
import fs from 'fs';

export interface HandlerResult {
    ok: boolean;
    output?: any;
    error?: string;
    logs: string[];
}

export async function handleShellCommand(
    command: string,
    args: string[],
    cwd?: string,
    timeoutMs = 60000,
    dryRun = false,
    sessionId?: string
): Promise<HandlerResult> {
    const logs: string[] = [];
    const validCwd = cwd ? path.resolve(cwd) : process.cwd();

    if (dryRun) {
        logs.push(`exec[dry]: ${command} ${args.join(' ')} (cwd=${validCwd})`);
        return { ok: true, output: `[dryRun] ${command} ${args.join(' ')}`, logs };
    }

    logs.push(`exec: ${command} ${args.join(' ')} (cwd=${validCwd})`);

    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
    const result = await ExecutionGateway.execute({
        id: sessionId || 'shell_' + Date.now(),
        type: 'shell',
        payload: {
            command: fullCommand,
            options: { 
                cwd: validCwd, 
                timeout: timeoutMs,
                shell: true 
            }
        },
        priority: 'normal'
    });

    return {
        ok: result.success && result.data?.ok !== false,
        output: result.data?.output || '',
        error: result.error || result.data?.error || '',
        logs
    };
}

export async function handleGitCommand(
    operation: string,
    args: string[] = [],
    cwd?: string
): Promise<HandlerResult> {
    // Safe-guard: prevent command injection if operation is dynamic, though typically it's an enum
    if (!/^[a-z0-9-]+$/.test(operation)) {
        return { ok: false, error: 'invalid_git_operation', logs: [] };
    }
    return handleShellCommand('git', [operation, ...args], cwd);
}

export async function handleFsCommand(
    operation: 'read' | 'write' | 'delete' | 'list' | 'exists' | 'mkdir',
    targetPath: string,
    content?: string
): Promise<HandlerResult> {
    // SECURITY: Path validation to prevent directory traversal
    const normalizedPath = path.normalize(targetPath);

    // Check for path traversal attempts
    if (normalizedPath.includes('..') || normalizedPath.startsWith('/etc') || normalizedPath.startsWith('/sys')) {
        return { ok: false, error: 'invalid_path: potential security risk', logs: [] };
    }

    // Ensure path is within allowed directories (workspace, temp, or builds)
    const cwd = process.cwd();
    const projectRoot = path.join(cwd, path.basename(cwd) === 'api' ? '..' : '.');
    const buildsDir = path.resolve(projectRoot, 'data/builds');
    const tmpDir = '/tmp';
    const p = path.resolve(normalizedPath);

    if (!p.startsWith(cwd) && !p.startsWith(tmpDir) && !p.startsWith(buildsDir)) {
        return { ok: false, error: 'path_outside_workspace', logs: [`Blocked access to ${p}`] };
    }

    const logs = [`fs.${operation} ${p}`];

    try {
        switch (operation) {
            case 'read':
                if (!fs.existsSync(p)) return { ok: false, error: 'file_not_found', logs };
                const text = fs.readFileSync(p, 'utf-8');
                return { ok: true, output: { content: text }, logs };

            case 'write':
                fs.mkdirSync(path.dirname(p), { recursive: true });
                fs.writeFileSync(p, content || '', 'utf-8');
                return { ok: true, output: { written: true }, logs };

            case 'delete':
                if (fs.existsSync(p)) {
                    fs.rmSync(p, { recursive: true, force: true });
                }
                return { ok: true, output: { deleted: true }, logs };

            case 'list':
                if (!fs.existsSync(p)) return { ok: false, error: 'path_not_found', logs };
                const items = fs.readdirSync(p);
                return { ok: true, output: { items }, logs };

            case 'exists':
                return { ok: true, output: { exists: fs.existsSync(p) }, logs };

            case 'mkdir':
                fs.mkdirSync(p, { recursive: true });
                return { ok: true, output: { created: true }, logs };

            default:
                return { ok: false, error: 'unknown_fs_operation', logs };
        }
    } catch (e: any) {
        return { ok: false, error: e.message, logs };
    }
}
