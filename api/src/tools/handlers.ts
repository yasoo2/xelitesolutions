
import { spawn } from 'child_process';
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
    dryRun = false
): Promise<HandlerResult> {
    const logs: string[] = [];
    const validCwd = cwd ? path.resolve(cwd) : process.cwd();

    if (dryRun) {
        logs.push(`exec[dry]: ${command} ${args.join(' ')} (cwd=${validCwd})`);
        return { ok: true, output: `[dryRun] ${command} ${args.join(' ')}`, logs };
    }

    logs.push(`exec: ${command} ${args.join(' ')} (cwd=${validCwd})`);

    return new Promise((resolve) => {
        // Expanded command whitelist for advanced software engineering capabilities
        const allowedCommands = [
            // Package managers & runtimes
            'git', 'npm', 'node', 'npx', 'yarn', 'pnpm', 'bun', 'deno',
            // TypeScript & JavaScript tooling
            'tsc', 'eslint', 'prettier', 'jest', 'vitest', 'mocha', 'tsx', 'ts-node',
            // Python
            'python', 'python3', 'pip', 'pip3', 'poetry', 'pipenv', 'uvicorn', 'flask', 'django-admin',
            // File system & text processing
            'ls', 'cat', 'grep', 'find', 'head', 'tail', 'wc', 'sort', 'uniq', 'diff', 'sed', 'awk',
            'cp', 'mv', 'mkdir', 'touch', 'tree', 'du', 'df',
            // Networking & HTTP
            'curl', 'wget',
            // Build tools
            'make', 'cmake', 'cargo', 'go', 'rustc', 'gcc', 'g++',
            // Container & deployment
            'docker', 'docker-compose',
            // Utilities
            'echo', 'env', 'which', 'whoami', 'pwd', 'date', 'tar', 'gzip', 'gunzip', 'zip', 'unzip',
            'xargs', 'basename', 'dirname', 'realpath', 'readlink', 'stat', 'file',
            // Database clients
            'psql', 'mysql', 'sqlite3', 'mongosh', 'redis-cli',
            // Process management
            'kill', 'lsof', 'ps',
        ];

        // Security: Block dangerous system commands but allow engineering tools
        const blockedCommands = ['sudo', 'su', 'passwd', 'chown', 'chroot', 'mount', 'umount',
            'fdisk', 'mkfs', 'dd', 'shutdown', 'reboot', 'halt', 'poweroff',
            'iptables', 'systemctl', 'service', 'useradd', 'userdel', 'groupadd'];

        if (blockedCommands.includes(command)) {
            console.warn(`[Security] Blocked dangerous system command: ${command}`);
            resolve({ ok: false, error: 'command_blocked_for_security', logs });
            return;
        }

        if (!allowedCommands.includes(command)) {
            console.warn(`[Security] Blocked command not in whitelist: ${command}`);
            resolve({ ok: false, error: 'command_not_allowed', logs });
            return;
        }

        const child = spawn(command, args, { cwd: validCwd, shell: false });

        let stdout = '';
        let stderr = '';
        let completed = false;

        const timer = setTimeout(() => {
            if (!completed) {
                completed = true;
                child.kill();
                resolve({ ok: false, error: 'timeout', logs });
            }
        }, timeoutMs);

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });

        child.on('error', (err: any) => {
            if (!completed) {
                completed = true;
                clearTimeout(timer);

                // Add architecture hint if it looks like a binary mismatch
                let errorMessage = err.message;
                if (err.code === 'EBADARCH' || errorMessage.includes('bad CPU type')) {
                    const { BinaryService } = require('../services/BinaryService');
                    const check = BinaryService.checkBinary(command);
                    errorMessage += `. ${BinaryService.getHint(command, check)}`;
                }

                resolve({ ok: false, error: errorMessage, logs });
            }
        });

        child.on('close', (code) => {
            if (!completed) {
                completed = true;
                clearTimeout(timer);
                if (code === 0) {
                    resolve({ ok: true, output: stdout.trim(), logs });
                } else {
                    resolve({ ok: false, error: stderr.trim() || stdout.trim() || `Exit code ${code}`, logs });
                }
            }
        });
    });
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
