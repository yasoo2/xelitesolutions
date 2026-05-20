import { ToolDefinition } from '../types';
import fs from 'fs';
import path from 'path';

/**
 * PerformanceAnalyzerTool - Performance analysis and optimization suggestions
 * Analyzes code for performance bottlenecks and complexity
 */
export class PerformanceAnalyzerTool implements ToolDefinition {
    name = 'performance_analyzer';
    version = '1.0.0';
    description = 'Analyze code performance and suggest optimizations';
    tags = ['performance', 'optimization', 'analysis'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            files: {
                type: 'array' as const,
                items: { type: 'string' as const },
                description: 'Files to analyze'
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
            performanceScore: { type: 'number' as const },
            bottlenecks: {
                type: 'array' as const,
                items: { type: 'object' as const }
            },
            optimizations: {
                type: 'array' as const,
                items: { type: 'object' as const }
            }
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
            logs.push(`Analyzing ${files.length} files for performance`);

            const bottlenecks: any[] = [];
            const optimizations: any[] = [];
            let totalComplexity = 0;

            for (const file of files) {
                const filePath = path.isAbsolute(file) ? file : path.resolve(projectPath, file);

                if (!fs.existsSync(filePath)) continue;

                const content = fs.readFileSync(filePath, 'utf-8');
                const analysis = this.analyzeFile(filePath, content);

                bottlenecks.push(...analysis.bottlenecks);
                optimizations.push(...analysis.optimizations);
                totalComplexity += analysis.complexity;
            }

            const avgComplexity = files.length > 0 ? totalComplexity / files.length : 0;
            const performanceScore = Math.max(0, 100 - avgComplexity - (bottlenecks.length * 5));

            logs.push(`Analysis complete. Performance score: ${Math.round(performanceScore)}/100`);

            return {
                ok: true,
                output: {
                    performanceScore: Math.round(performanceScore),
                    avgComplexity: Math.round(avgComplexity),
                    bottlenecks,
                    optimizations,
                    summary: {
                        highComplexity: bottlenecks.filter(b => b.severity === 'high').length,
                        mediumComplexity: bottlenecks.filter(b => b.severity === 'medium').length
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

    private analyzeFile(filePath: string, content: string): any {
        const fileName = path.basename(filePath);
        const bottlenecks: any[] = [];
        const optimizations: any[] = [];

        // Calculate cyclomatic complexity (simplified)
        const complexity = this.calculateComplexity(content);

        if (complexity > 20) {
            bottlenecks.push({
                file: fileName,
                severity: 'high',
                type: 'High Complexity',
                message: `Cyclomatic complexity: ${complexity}. Consider refactoring.`,
                complexity
            });
        } else if (complexity > 10) {
            bottlenecks.push({
                file: fileName,
                severity: 'medium',
                type: 'Medium Complexity',
                message: `Cyclomatic complexity: ${complexity}. May need refactoring.`,
                complexity
            });
        }

        // Nested loops
        const nestedLoops = (content.match(/for.*{[\s\S]*?for.*{/g) || []).length;
        if (nestedLoops > 0) {
            bottlenecks.push({
                file: fileName,
                severity: 'medium',
                type: 'Nested Loops',
                message: `Found ${nestedLoops} nested loop(s). Consider optimization.`
            });
            optimizations.push({
                category: 'algorithm',
                message: 'Consider using more efficient data structures or algorithms'
            });
        }

        // Synchronous file operations
        if (content.match(/fs\.(readFileSync|writeFileSync)/)) {
            bottlenecks.push({
                file: fileName,
                severity: 'medium',
                type: 'Blocking I/O',
                message: 'Synchronous file operations block the event loop.'
            });
            optimizations.push({
                category: 'async',
                message: 'Use async file operations (fs.promises or fs.readFile with callbacks)'
            });
        }

        // Large array operations
        if (content.match(/\.map\(.*\.filter\(.*\.reduce\(/)) {
            optimizations.push({
                category: 'data-processing',
                message: 'Multiple array operations can be combined for better performance'
            });
        }

        // Missing memoization
        if (content.match(/function.*\(.*\).*{[\s\S]{100,}}/g)) {
            optimizations.push({
                category: 'caching',
                message: 'Consider memoization for expensive function calls'
            });
        }

        return {
            complexity,
            bottlenecks,
            optimizations
        };
    }

    private calculateComplexity(content: string): number {
        // Simplified cyclomatic complexity calculation
        let complexity = 1; // Base complexity

        // Count decision points
        complexity += (content.match(/\bif\b/g) || []).length;
        complexity += (content.match(/\belse\b/g) || []).length;
        complexity += (content.match(/\bfor\b/g) || []).length;
        complexity += (content.match(/\bwhile\b/g) || []).length;
        complexity += (content.match(/\bcase\b/g) || []).length;
        complexity += (content.match(/\bcatch\b/g) || []).length;
        complexity += (content.match(/&&|\|\|/g) || []).length;
        complexity += (content.match(/\?/g) || []).length;

        return complexity;
    }
}
