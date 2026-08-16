import fs from 'fs';
import path from 'path';
import { workspaceService } from '../../services/WorkspaceService';
import { isWithinRoot } from '../utils';

/**
 * SecurityScannerTool - Security vulnerability scanner
 * Detects common security issues in code.
 *
 * The planner may describe a project target instead of enumerating every file.
 * In that case the scanner derives a bounded, evidence-backed source-file list
 * from the requested project path. It never invents files and never escapes the
 * trusted workspace root.
 */
export class SecurityScannerTool implements ToolDefinition {
    name = 'security_scanner';
    version = '1.1.0';
    description = 'Scan code for security vulnerabilities and best practices';
    tags = ['security', 'scanner', 'vulnerabilities'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            files: {
                type: 'array' as const,
                items: { type: 'string' as const },
                description: 'Concrete files to scan; optional when projectPath or target identifies a project'
            },
            projectPath: {
                type: 'string' as const,
                description: 'Project base path'
            },
            target: {
                type: 'string' as const,
                description: 'Project or directory target used to discover source files'
            },
            path: {
                type: 'string' as const,
                description: 'Project or directory path used to discover source files'
            }
        },
        required: []
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            vulnerabilities: {
                type: 'array' as const,
                items: { type: 'object' as const }
            },
            riskScore: { type: 'number' as const }
        }
    };

    permissions = ['read' as const];
    sideEffects = [];
    rateLimitPerMinute = 20;
    auditFields = ['projectPath', 'target'];
    mockSupported = false;

    async execute(
        input: {
            files?: unknown;
            projectPath?: string;
            target?: string;
            path?: string;
            directory?: string;
        } = {},
        context?: { workspaceId?: string },
    ) {
        const requestedFiles = Array.isArray(input?.files)
            ? input.files.map(file => String(file ?? '').trim()).filter(Boolean)
            : [];
        const logs: string[] = [];

        try {
            const activeRoot = context?.workspaceId
                ? path.resolve(workspaceService.getActiveRoot(context.workspaceId))
                : '';
            const requestedBase = String(
                input?.projectPath ?? input?.target ?? input?.path ?? input?.directory ?? '.',
            ).trim() || '.';
            const projectPath = activeRoot
                ? path.resolve(activeRoot, requestedBase)
                : path.resolve(requestedBase);

            if (activeRoot && !isWithinRoot(projectPath, activeRoot)) {
                const error = 'security_scanner projectPath must stay within the active workspace';
                logs.push(`Input error: ${error}`);
                return { ok: false, error, logs };
            }

            if (!fs.existsSync(projectPath)) {
                const error = `security_scanner target does not exist: ${requestedBase}`;
                logs.push(`Input error: ${error}`);
                return { ok: false, error, logs };
            }

            const files = requestedFiles.length > 0
                ? requestedFiles
                : this.discoverSourceFiles(projectPath);

            // A malformed or incomplete plan is an explicit contract error, not
            // an uncaught `undefined.length` and not a fabricated scan result.
            if (files.length === 0) {
                const error = 'security_scanner requires a non-empty files array or an existing project target containing source files';
                logs.push(`Input error: ${error}`);
                return { ok: false, error, logs };
            }

            logs.push(`Scanning ${files.length} files for security vulnerabilities from ${projectPath}`);

            const vulnerabilities: any[] = [];
            const missingFiles: string[] = [];
            const scannedFiles: string[] = [];

            for (const file of files.slice(0, 100)) {
                const filePath = path.isAbsolute(file)
                    ? path.resolve(file)
                    : path.resolve(projectPath, file);

                if (activeRoot && !isWithinRoot(filePath, activeRoot)) {
                    logs.push(`Rejected path outside active workspace: ${file}`);
                    missingFiles.push(file);
                    continue;
                }

                if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
                    logs.push(`File not found: ${filePath}`);
                    missingFiles.push(file);
                    continue;
                }

                const content = fs.readFileSync(filePath, 'utf-8');
                const vulns = this.scanFile(filePath, content);

                vulnerabilities.push(...vulns);
                scannedFiles.push(file);
            }

            const riskScore = this.calculateRiskScore(vulnerabilities);
            const summary = {
                critical: vulnerabilities.filter(v => v.severity === 'critical').length,
                high: vulnerabilities.filter(v => v.severity === 'high').length,
                medium: vulnerabilities.filter(v => v.severity === 'medium').length,
                low: vulnerabilities.filter(v => v.severity === 'low').length,
            };
            const missingError = missingFiles.length > 0
                ? `security_scanner could not scan ${missingFiles.length} requested file(s): ${missingFiles.join(', ')}`
                : undefined;

            logs.push(`Scan complete. Scanned ${scannedFiles.length} files and found ${vulnerabilities.length} potential issues. Risk: ${riskScore}/100`);
            if (missingError) logs.push(`Scan failed: ${missingError}`);

            return {
                ok: !missingError,
                ...(missingError ? { error: missingError } : {}),
                output: {
                    vulnerabilities,
                    riskScore,
                    filesRequested: files.length,
                    filesScanned: scannedFiles.length,
                    scannedFiles,
                    missingFiles,
                    summary,
                },
                logs,
            };
        } catch (error: any) {
            const message = String(error?.message || error);
            logs.push(`Error: ${message}`);
            return {
                ok: false,
                error: message,
                logs,
            };
        }
    }

    private discoverSourceFiles(projectPath: string): string[] {
        const maxFiles = 100;
        const maxDepth = 6;
        const sourceExtensions = new Set([
            '.cjs', '.css', '.cs', '.go', '.html', '.java', '.js', '.jsx',
            '.json', '.mjs', '.php', '.py', '.rb', '.scss', '.sql', '.svelte',
            '.ts', '.tsx', '.vue', '.xml', '.yaml', '.yml',
        ]);
        const ignoredDirectories = new Set([
            '.git', '.next', '.turbo', 'build', 'coverage', 'dist',
            'node_modules', 'target', 'vendor',
        ]);
        const discovered: string[] = [];

        const rootStat = fs.statSync(projectPath);
        if (rootStat.isFile()) return [path.basename(projectPath)];
        if (!rootStat.isDirectory()) return discovered;

        const walk = (current: string, depth: number): void => {
            if (depth > maxDepth || discovered.length >= maxFiles) return;
            let entries: fs.Dirent[];
            try {
                entries = fs.readdirSync(current, { withFileTypes: true })
                    .sort((a, b) => a.name.localeCompare(b.name));
            } catch {
                return;
            }

            for (const entry of entries) {
                if (discovered.length >= maxFiles) return;
                if (entry.isDirectory()) {
                    if (!ignoredDirectories.has(entry.name)) {
                        walk(path.join(current, entry.name), depth + 1);
                    }
                    continue;
                }
                if (!entry.isFile()) continue;
                if (!sourceExtensions.has(path.extname(entry.name).toLowerCase())) continue;
                discovered.push(path.relative(projectPath, path.join(current, entry.name)));
            }
        };

        walk(projectPath, 0);
        return discovered;
    }

    private scanFile(filePath: string, content: string): any[] {
        const vulnerabilities: any[] = [];
        const fileName = path.basename(filePath);

        // SQL Injection patterns
        if (content.match(/query.*\+.*req\.(body|params|query)/i)) {
            vulnerabilities.push({
                file: fileName,
                severity: 'critical',
                type: 'SQL Injection',
                message: 'Potential SQL injection vulnerability. Use parameterized queries.',
                cwe: 'CWE-89'
            });
        }

        // XSS patterns
        if (content.match(/innerHTML.*=.*req\.(body|params|query)/i)) {
            vulnerabilities.push({
                file: fileName,
                severity: 'high',
                type: 'XSS',
                message: 'Potential XSS vulnerability. Sanitize user input before rendering.',
                cwe: 'CWE-79'
            });
        }

        // Hardcoded secrets
        if (content.match(/(password|secret|api_key|token)\s*=\s*['"][^'"]{8,}['"]/i)) {
            vulnerabilities.push({
                file: fileName,
                severity: 'critical',
                type: 'Hardcoded Secret',
                message: 'Hardcoded credentials detected. Use environment variables.',
                cwe: 'CWE-798'
            });
        }

        // Insecure randomness
        if (content.includes('Math.random()') && content.match(/(password|token|session)/i)) {
            vulnerabilities.push({
                file: fileName,
                severity: 'medium',
                type: 'Weak Randomness',
                message: 'Math.random() is not cryptographically secure. Use crypto.randomBytes().',
                cwe: 'CWE-330'
            });
        }

        // eval() usage
        if (content.match(/eval\s*\(/)) {
            vulnerabilities.push({
                file: fileName,
                severity: 'high',
                type: 'Code Injection',
                message: 'eval() is dangerous and should be avoided.',
                cwe: 'CWE-95'
            });
        }

        // Insecure HTTP
        if (content.match(/http:\/\/[^'"]*api/i)) {
            vulnerabilities.push({
                file: fileName,
                severity: 'medium',
                type: 'Insecure Communication',
                message: 'Use HTTPS for API communications.',
                cwe: 'CWE-319'
            });
        }

        // Missing input validation
        if (content.match(/req\.(body|params|query)\.\w+/) && !content.includes('validate')) {
            vulnerabilities.push({
                file: fileName,
                severity: 'low',
                type: 'Missing Validation',
                message: 'Consider adding input validation.',
                cwe: 'CWE-20'
            });
        }

        return vulnerabilities;
    }

    private calculateRiskScore(vulnerabilities: any[]): number {
        const weights = {
            critical: 25,
            high: 15,
            medium: 8,
            low: 3
        };

        const score = vulnerabilities.reduce((sum, v) => {
            return sum + (weights[v.severity as keyof typeof weights] || 0);
        }, 0);

        return Math.min(100, score);
    }
}
