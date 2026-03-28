import fs from 'fs';
import path from 'path';
import { tools } from '../../modules/tools/registry';
import { handleShellCommand } from '../../modules/tools/handlers';

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
                case 'npm_install':
                    return await this.npmInstall(step.args);
                default:
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

    private async scaffoldProject(args: { name: string; structure?: Record<string, string> }) {
        const targetDir = this.rootDir;
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // 1. Initialize npm if needed
        if (!fs.existsSync(path.join(targetDir, 'package.json'))) {
            const r = await handleShellCommand('npm', ['init', '-y'], targetDir, 300000, false);
            if (!r.ok) {
                throw new Error(r.error || 'npm_init_failed');
            }
        }

        // 2. Write structure files
        const structure = args.structure || {};
        let writtenCount = 0;

        for (const [filename, content] of Object.entries(structure)) {
            const filePath = path.join(targetDir, filename);
            const fileDir = path.dirname(filePath);

            if (!fs.existsSync(fileDir)) {
                fs.mkdirSync(fileDir, { recursive: true });
            }

            fs.writeFileSync(filePath, content, 'utf-8');
            writtenCount++;
        }

        return { success: true, output: `Project scaffolded in ${targetDir}. Created ${writtenCount} files.` };
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

    private async npmInstall(args: { package: string[] | string }) {
        const raw = Array.isArray(args.package) ? args.package : [args.package];
        const packages = raw
            .map(p => String(p || '').trim())
            .filter(p => p.length > 0);
        if (!packages.length) {
            throw new Error('No packages provided for npm_install');
        }
        for (const pkg of packages) {
            if (!/^[a-zA-Z0-9@/_\.\-]+$/.test(pkg)) {
                throw new Error(`Invalid package name: ${pkg}`);
            }
        }
        const r = await handleShellCommand('npm', ['install', ...packages], this.rootDir, 600000, false);
        if (!r.ok) {
            throw new Error(r.error || 'npm_install_failed');
        }
        return { success: true, output: String(r.output || '') };
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
