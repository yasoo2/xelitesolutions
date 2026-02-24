import { ToolDefinition } from '../types';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * DeployProjectTool — Project deployment and port exposure.
 *
 * Capabilities:
 * - Expose a local port for temporary public access (via localtunnel or similar)
 * - Deploy static sites to a public URL
 * - Start dev servers and capture their URLs
 * - Package a project for distribution (zip)
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

    async execute(input: any) {
        const action = String(input.action || '');
        const projectPath = String(input.projectPath || process.cwd());
        const logs: string[] = [];

        if (!fs.existsSync(projectPath)) {
            return { ok: false, error: `Project path not found: ${projectPath}`, logs: [] };
        }

        try {
            switch (action) {
                case 'build_static': {
                    const buildCmd = input.buildCommand || 'npm run build';
                    logs.push(`Building project with: ${buildCmd}`);

                    const output = execSync(buildCmd, {
                        cwd: projectPath,
                        encoding: 'utf-8',
                        timeout: 120000,
                        stdio: ['pipe', 'pipe', 'pipe'],
                    });

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
                            buildOutput: output.substring(0, 500),
                        },
                        logs,
                    };
                }

                case 'start_server': {
                    const startCmd = input.startCommand || 'npm run dev';
                    const port = input.port || 3000;
                    logs.push(`Starting server: ${startCmd} on port ${port}`);

                    // Start in background using nohup
                    const pidFile = path.join(projectPath, '.joe_server.pid');
                    execSync(
                        `nohup ${startCmd} > /tmp/joe_server.log 2>&1 & echo $! > "${pidFile}"`,
                        { cwd: projectPath, encoding: 'utf-8', timeout: 10000 }
                    );

                    const pid = fs.existsSync(pidFile) ? fs.readFileSync(pidFile, 'utf-8').trim() : 'unknown';
                    logs.push(`Server started (PID: ${pid})`);

                    // Wait a moment for the server to initialize
                    execSync('sleep 2');

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

                    // Check if localtunnel is available, install if not
                    try {
                        execSync('which lt', { encoding: 'utf-8' });
                    } catch {
                        logs.push('Installing localtunnel...');
                        execSync('npm install -g localtunnel', { encoding: 'utf-8', timeout: 30000 });
                    }

                    // Start localtunnel in background
                    const ltLog = '/tmp/joe_lt.log';
                    execSync(
                        `nohup lt --port ${port} > ${ltLog} 2>&1 &`,
                        { encoding: 'utf-8', timeout: 5000 }
                    );

                    // Wait and read the URL
                    execSync('sleep 3');
                    let url = 'pending...';
                    if (fs.existsSync(ltLog)) {
                        const log = fs.readFileSync(ltLog, 'utf-8');
                        const match = log.match(/your url is: (https?:\/\/[^\s]+)/i);
                        if (match) url = match[1];
                    }

                    logs.push(`Public URL: ${url}`);

                    return {
                        ok: true,
                        output: { status: 'exposed', url, port },
                        logs,
                    };
                }

                case 'package': {
                    const outputDir = input.outputDir || '';
                    const sourcePath = outputDir ? path.join(projectPath, outputDir) : projectPath;
                    const zipName = `${path.basename(projectPath)}_package.zip`;
                    const zipPath = path.join(projectPath, zipName);

                    // Create zip excluding node_modules and .git
                    execSync(
                        `cd "${sourcePath}" && zip -r "${zipPath}" . -x "node_modules/*" ".git/*" "*.log"`,
                        { encoding: 'utf-8', timeout: 60000 }
                    );

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
