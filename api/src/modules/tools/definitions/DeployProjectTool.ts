import { ToolDefinition } from '../types';
import { ExecutionGateway } from '../../../kernel/ExecutionGateway';
import * as fs from 'fs';
import * as path from 'path';
import { resolveToolPath } from '../utils';

/**
 * DeployProjectTool — Project deployment and port exposure.
 */
export class DeployProjectTool implements ToolDefinition {
    name = 'deploy_project';
    description =
        'Deploy a project or expose a local service for public access. ' +
        'Actions: "expose_port" to create a temporary public URL for a local port, ' +
        '"build_static" to build a static site for deployment, ' +
        '"start_server" to start a dev server and return its local URL, ' +
        '"package" to create a distributable zip of the project.';
    version = '1.0.0';
    tags = ['deploy', 'hosting', 'port', 'server', 'production'];
    permissions: any = ['execute', 'write', 'internet'];
    sideEffects: any = ['execute', 'write'];
    rateLimitPerMinute = 10;
    auditFields = ['action', 'projectPath'];
    mockSupported = false;
    outputSchema = {
        type: 'object',
        properties: {
            url: { type: 'string' },
            status: { type: 'string' },
        },
    };
    inputSchema = {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: ['expose_port', 'build_static', 'start_server', 'package'],
                description: 'Deployment action to perform.',
            },
            projectPath: {
                type: 'string',
                description: 'Root directory of the project.',
            },
            port: {
                type: 'number',
                description: 'Port number (for expose_port or start_server).',
            },
            buildCommand: {
                type: 'string',
                description: 'Custom build command (for build_static). Default: "npm run build".',
            },
            startCommand: {
                type: 'string',
                description: 'Custom start command (for start_server). Default: "npm run dev".',
            },
            outputDir: {
                type: 'string',
                description: 'Build output directory (for package). Default: "dist" or "build".',
            },
        },
        required: ['action', 'projectPath'],
    };

    async execute(input: any, context?: any) {
        const action = String(input.action || '');
        const rawProjectPath = String(input.projectPath || '').trim();
        const logs: string[] = [];

        if (!rawProjectPath) {
            return { ok: false, error: 'Project path is required and must be workspace-relative.', logs };
        }

        // Planner arguments are workspace-relative evidence, not paths relative
        // to the API process. Phase 8 commonly says `NEXUS`; resolving it here
        // keeps deploy_project consistent with file/test tools and preserves the
        // containment check for absolute or traversal paths as well.
        let projectPath: string;
        try {
            const workspaceId = context?.workspaceId || input?.workspaceId || input?.__workspaceId;
            projectPath = resolveToolPath(rawProjectPath, { workspaceId });
        } catch (error: any) {
            const reason = String(error?.message || error);
            return { ok: false, error: `Project path outside workspace: ${rawProjectPath}`, logs: [`Path rejected: ${reason}`] };
        }

        if (!fs.existsSync(projectPath)) {
            return { ok: false, error: `Project path not found: ${rawProjectPath}`, logs: [] };
        }

        try {
            switch (action) {
                case 'build_static': {
                    const buildCmd = input.buildCommand || 'npm run build';
                    logs.push(`Building project with: ${buildCmd}`);

                    const result = await ExecutionGateway.execute({
                        id: `build_${Date.now()}`,
                        type: 'shell',
                        payload: {
                            command: buildCmd,
                            options: { cwd: projectPath, timeout: 120000 }
                        },
                        priority: 'normal'
                    });
                    
                    if (!result.success) throw new Error(result.error || 'Build failed');

                    // Find output directory
                    const possibleDirs = ['dist', 'build', 'out', '.next', 'public'];
                    let outputDir = '';
                    for (const dir of possibleDirs) {
                        if (fs.existsSync(path.join(projectPath, dir))) {
                            outputDir = dir;
                            break;
                        }
                    }

                    logs.push(`Build complete. Output: ${outputDir || 'unknown'}`);

                    return {
                        ok: true,
                        output: {
                            status: 'built',
                            outputDir: outputDir ? path.join(projectPath, outputDir) : projectPath,
                            buildOutput: (result.data?.output || '').substring(0, 500),
                        },
                        logs,
                    };
                }

                case 'start_server': {
                    const startCmd = input.startCommand || 'npm run dev';
                    const port = input.port || 3000;
                    logs.push(`Starting server: ${startCmd} on port ${port}`);

                    const pidFile = path.join(projectPath, '.joe_server.pid');
                    const result = await ExecutionGateway.execute({
                        id: `start_${Date.now()}`,
                        type: 'shell',
                        payload: {
                            command: startCmd,
                            options: { 
                                cwd: projectPath,
                                detached: true,
                                shell: true,
                                stdio: 'ignore'
                            }
                        },
                        priority: 'normal'
                    });

                    const pid = result.data?.pid || 'unknown';
                    if (result.data?.pid) fs.writeFileSync(pidFile, String(result.data.pid));
                    
                    logs.push(`Server started (PID: ${pid})`);

                    return {
                        ok: true,
                        output: {
                            status: 'running',
                            url: `http://localhost:${port}`,
                            pid,
                            logFile: '/tmp/joe_server.log',
                        },
                        logs,
                    };
                }

                case 'expose_port': {
                    const port = input.port || 3000;
                    logs.push(`Exposing port ${port} via localtunnel...`);

                    const checkRes = await ExecutionGateway.execute({
                        id: 'check_lt',
                        type: 'shell',
                        payload: { command: 'which lt' },
                        priority: 'low'
                    });
                    if (!checkRes.success) {
                        logs.push('Installing localtunnel...');
                        await ExecutionGateway.execute({
                            id: 'install_lt',
                            type: 'shell',
                            payload: { 
                                command: 'npm install -g localtunnel',
                                options: { timeout: 30000 }
                            },
                            priority: 'normal'
                        });
                    }

                    const ltRes = await ExecutionGateway.execute({
                        id: `lt_${Date.now()}`,
                        type: 'shell',
                        payload: { 
                            command: `lt --port ${port}`,
                            options: {
                                detached: true,
                                shell: true,
                                stdio: 'pipe'
                            }
                        },
                        priority: 'normal'
                    });

                    await new Promise(r => setTimeout(r, 3000));
                    
                    return {
                        ok: true,
                        output: { status: 'exposed', url: 'localtunnel_started', port, pid: ltRes.data?.pid },
                        logs,
                    };
                }

                case 'package': {
                    const outputDir = input.outputDir || '';
                    const sourcePath = outputDir ? path.join(projectPath, outputDir) : projectPath;
                    const zipName = `${path.basename(projectPath)}_package.zip`;
                    const zipPath = path.join(projectPath, zipName);

                    const result = await ExecutionGateway.execute({
                        id: `zip_${Date.now()}`,
                        type: 'shell',
                        payload: { 
                            command: `zip -r ${zipPath} . -x node_modules/* .git/* *.log`,
                            options: {
                                cwd: sourcePath,
                                timeout: 60000
                            }
                        },
                        priority: 'normal'
                    });

                    if (!result.success) throw new Error(result.error || 'Zip failed');

                    const stat = fs.statSync(zipPath);
                    const sizeMB = (stat.size / 1024 / 1024).toFixed(2);
                    logs.push(`Package created: ${zipPath} (${sizeMB} MB)`);

                    return {
                        ok: true,
                        output: { status: 'packaged', archivePath: zipPath, size: `${sizeMB} MB` },
                        logs,
                    };
                }

                default:
                    return { ok: false, error: `Unknown action: ${action}`, logs: [] };
            }
        } catch (error: any) {
            return {
                ok: false,
                error: `Deployment failed: ${error.message}`,
                logs: [`Error: ${error.message}`],
            };
        }
    }
}
