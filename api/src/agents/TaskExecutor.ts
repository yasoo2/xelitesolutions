import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';

const execAsync = util.promisify(exec);

export interface TaskStep {
    name: string;
    tool: string;
    args: any;
}

export class TaskExecutor {
    private rootDir: string;

    constructor(rootDir: string) {
        this.rootDir = rootDir;
    }

    private resolveSafePath(inputPath: string): string {
        const resolved = path.resolve(this.rootDir, inputPath);
        if (!resolved.startsWith(this.rootDir)) {
            throw new Error(`Security Error: Path ${inputPath} is outside root directory ${this.rootDir}`);
        }
        return resolved;
    }

    async executeStep(step: TaskStep): Promise<{ success: boolean; output: string }> {
        console.log(`[TaskExecutor] Executing ${step.name} (${step.tool})...`);

        try {
            switch (step.tool) {
                case 'scaffold_project':
                    return await this.scaffoldProject(step.args);
                case 'file_write':
                    return await this.writeFile(step.args);
                case 'shell_execute':
                    return await this.shellExecute(step.args);
                case 'npm_install':
                    return await this.npmInstall(step.args);
                default:
                    throw new Error(`Unknown tool: ${step.tool}`);
            }
        } catch (e: any) {
            console.error(`[TaskExecutor] Failed ${step.name}: ${e.message}`);
            return { success: false, output: e.message };
        }
    }

    private async scaffoldProject(args: { name: string; type?: string }) {
        const targetDir = this.rootDir; // Scaffold always targets root in this context
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // Init package.json if missing
        if (!fs.existsSync(path.join(targetDir, 'package.json'))) {
            await execAsync('npm init -y', { cwd: targetDir });
        }

        return { success: true, output: `Project scaffolded in ${targetDir}` };
    }

    private async writeFile(args: { path: string; content: string }) {
        const filePath = this.resolveSafePath(args.path);
        const dir = path.dirname(filePath);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, args.content, 'utf-8');
        return { success: true, output: `File written: ${filePath}` };
    }

    private async shellExecute(args: { command: string; cwd?: string }) {
        const cwd = args.cwd ? this.resolveSafePath(args.cwd) : this.rootDir;

        // Security check (Basic)
        if (args.command.includes('rm -rf /') || args.command.includes(':(){:|:&};:')) {
            throw new Error("Unsafe command blocked");
        }

        const { stdout, stderr } = await execAsync(args.command, { cwd });
        return { success: true, output: stdout || stderr };
    }

    private async npmInstall(args: { package: string[] | string }) {
        const packages = Array.isArray(args.package) ? args.package.join(' ') : args.package;
        const cmd = `npm install ${packages}`;

        const { stdout } = await execAsync(cmd, { cwd: this.rootDir });
        return { success: true, output: stdout };
    }
}
