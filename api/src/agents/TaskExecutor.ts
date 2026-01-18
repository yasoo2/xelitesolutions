import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';
import { tools } from '../tools/registry';
import { ToolDefinition } from '../tools/types';

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
                    // Dynamic Registry Lookup (Universal Tool Execution)
                    const toolDef = tools.find(t => t.name === step.tool);
                    if (toolDef) {
                        return await this.runTool(toolDef, step.args);
                    }
                    throw new Error(`Unknown tool: ${step.tool} (Not found in Registry)`);
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
        const cmd = args.command.trim();

        // 1. Block dangerous system commands
        const blockedPatterns = [
            /\bsudo\b/i,           // No root escalation
            /\bsu\b/i,             // No user switching
            /\bchmod\b/i,          // No permission changes
            /\bchown\b/i,          // No ownership changes
            /\brm\s+-[rRf]*\s*[\/\*]+$/i, // No "rm -rf /" or "rm -rf *" at root
            /:(){:\|:&};:/,       // Fork bombs
            />\s*\/dev\/sda/,     // Device writing
            /\bdd\b/,             // Low-level disk writing
            /\bwget\b|\bcurl\b/   // Prevent uncontrolled downloading (use http_fetch tool instead)
        ];

        for (const pattern of blockedPatterns) {
            if (pattern.test(cmd)) {
                throw new Error(`Security Violocation: Command blocked by safety policy. Pattern: ${pattern}`);
            }
        }

        // 2. Validate command structure (prevent obscure shell expansions)
        // This is a trade-off. We trust 'npm', 'git', 'node', 'tsc', 'ls', 'echo', 'cat', 'mkdir', 'touch'.
        // We allow complex commands but monitor them.

        console.log(`[TaskExecutor] Running in ${cwd}: ${cmd}`);

        const { stdout, stderr } = await execAsync(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 }); // 10MB buffer
        return { success: true, output: stdout || stderr };
    }

    private async npmInstall(args: { package: string[] | string }) {
        const packages = Array.isArray(args.package) ? args.package.join(' ') : args.package;
        const cmd = `npm install ${packages}`;

        const { stdout } = await execAsync(cmd, { cwd: this.rootDir });
        return { success: true, output: stdout };
    }

    private async runTool(tool: any, args: any) {
        // Most tools expect 'cwd' or 'projectPath' which might be missing in args if the agent assumes implicit context
        const enhancedArgs = { ...args };
        if (!enhancedArgs.path && !enhancedArgs.projectPath) {
            enhancedArgs.path = this.rootDir;
            enhancedArgs.projectPath = this.rootDir;
        }

        try {
            const result = await tool.execute(enhancedArgs);
            if (!result.ok) {
                return { success: false, output: `Tool Failed: ${result.error}` };
            }
            return { success: true, output: JSON.stringify(result.output, null, 2) };
        } catch (e: any) {
            return { success: false, output: `Tool Exception: ${e.message}` };
        }
    }
}
