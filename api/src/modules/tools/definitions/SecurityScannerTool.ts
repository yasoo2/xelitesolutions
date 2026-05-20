import { ToolDefinition } from '../types';
import fs from 'fs';
import path from 'path';

/**
 * SecurityScannerTool - Security vulnerability scanner
 * Detects common security issues in code
 */
export class SecurityScannerTool implements ToolDefinition {
    name = 'security_scanner';
    version = '1.0.0';
    description = 'Scan code for security vulnerabilities and best practices';
    tags = ['security', 'scanner', 'vulnerabilities'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            files: {
                type: 'array' as const,
                items: { type: 'string' as const },
                description: 'Files to scan'
            },
            projectPath: {
                type: 'string' as const,
                description: 'Project base path'
            }
        },
        required: ['files']
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
    auditFields = ['projectPath'];
    mockSupported = false;

    async execute(input: { files: string[]; projectPath?: string }) {
        const { files, projectPath = '.' } = input;
        const logs: string[] = [];

        try {
            logs.push(`Scanning ${files.length} files for security vulnerabilities`);

            const vulnerabilities: any[] = [];

            for (const file of files) {
                const filePath = path.isAbsolute(file) ? file : path.resolve(projectPath, file);

                if (!fs.existsSync(filePath)) continue;

                const content = fs.readFileSync(filePath, 'utf-8');
                const vulns = this.scanFile(filePath, content);

                vulnerabilities.push(...vulns);
            }

            const riskScore = this.calculateRiskScore(vulnerabilities);

            logs.push(`Scan complete. Found ${vulnerabilities.length} potential issues. Risk: ${riskScore}/100`);

            return {
                ok: true,
                output: {
                    vulnerabilities,
                    riskScore,
                    summary: {
                        critical: vulnerabilities.filter(v => v.severity === 'critical').length,
                        high: vulnerabilities.filter(v => v.severity === 'high').length,
                        medium: vulnerabilities.filter(v => v.severity === 'medium').length,
                        low: vulnerabilities.filter(v => v.severity === 'low').length
                    }
                },
                logs
            };

        } catch (error: any) {
            logs.push(`Error: ${error.message}`);
            return {
                ok: false,
                error: error.message,
                logs
            };
        }
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
