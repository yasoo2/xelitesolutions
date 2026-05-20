import { ToolDefinition } from '../types';
import { callLLM } from '../../../core/llm';
import fs from 'fs';
import path from 'path';

/**
 * CodeReviewerTool - AI-powered code review
 * Analyzes code for best practices, code smells, and improvement suggestions
 */
export class CodeReviewerTool implements ToolDefinition {
    name = 'code_reviewer';
    version = '1.0.0';
    description = 'AI-powered code review for quality, best practices, and improvements';
    tags = ['review', 'quality', 'ai'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            files: {
                type: 'array' as const,
                items: { type: 'string' as const },
                description: 'List of file paths to review'
            },
            projectPath: {
                type: 'string' as const,
                description: 'Base project path'
            },
            reviewType: {
                type: 'string' as const,
                enum: ['quick', 'detailed', 'comprehensive'],
                description: 'Type of review'
            }
        },
        required: ['files']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            overallScore: { type: 'number' as const },
            issues: {
                type: 'array' as const,
                items: { type: 'object' as const }
            },
            suggestions: {
                type: 'array' as const,
                items: { type: 'object' as const }
            }
        }
    };

    permissions = ['read' as const];
    sideEffects = [];
    rateLimitPerMinute = 10;
    auditFields = ['projectPath'];
    mockSupported = false;

    async execute(input: { files: string[]; projectPath?: string; reviewType?: string }) {
        const { files, projectPath = '.', reviewType = 'detailed' } = input;
        const logs: string[] = [];

        try {
            logs.push(`Reviewing ${files.length} files with ${reviewType} review`);

            const issues: any[] = [];
            const suggestions: any[] = [];
            let totalScore = 0;

            for (const file of files.slice(0, 5)) { // Limit to 5 files for performance
                const filePath = path.isAbsolute(file) ? file : path.resolve(projectPath, file);

                if (!fs.existsSync(filePath)) {
                    logs.push(`File not found: ${filePath}`);
                    continue;
                }

                const content = fs.readFileSync(filePath, 'utf-8');
                const review = await this.reviewFile(filePath, content, reviewType);

                issues.push(...review.issues);
                suggestions.push(...review.suggestions);
                totalScore += review.score;

                logs.push(`Reviewed: ${file} (Score: ${review.score}/100)`);
            }

            const overallScore = files.length > 0 ? Math.round(totalScore / Math.min(files.length, 5)) : 0;

            logs.push(`Review complete. Overall score: ${overallScore}/100`);

            return {
                ok: true,
                output: {
                    overallScore,
                    filesReviewed: Math.min(files.length, 5),
                    issues,
                    suggestions,
                    summary: {
                        critical: issues.filter(i => i.severity === 'critical').length,
                        warning: issues.filter(i => i.severity === 'warning').length,
                        info: issues.filter(i => i.severity === 'info').length
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

    private async reviewFile(filePath: string, content: string, reviewType: string): Promise<any> {
        const ext = path.extname(filePath);
        const language = this.detectLanguage(ext);

        const reviewPrompt = `You are an expert code reviewer. Review the following ${language} code and provide feedback.

FILE: ${path.basename(filePath)}
CODE:
\`\`\`${language}
${content.slice(0, 2000)}
\`\`\`

Provide your review in JSON format:
{
  "score": <0-100>,
  "issues": [
    {
      "line": <line_number>,
      "severity": "critical|warning|info",
      "category": "best-practice|code-smell|naming|complexity",
      "message": "description"
    }
  ],
  "suggestions": [
    {
      "category": "performance|readability|maintainability",
      "message": "suggestion"
    }
  ]
}

Focus on: best practices, code smells, naming conventions, complexity.
Return ONLY valid JSON.`;

        try {
            const response = await callLLM(reviewPrompt, [
                { role: 'system', content: 'You are a code review expert. Return only valid JSON.' }
            ]);

            const jsonMatch = response.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : response;
            const review = JSON.parse(jsonStr);

            return {
                score: review.score || 70,
                issues: Array.isArray(review.issues) ? review.issues : [],
                suggestions: Array.isArray(review.suggestions) ? review.suggestions : []
            };
        } catch (error) {
            // Fallback to basic review
            return this.basicReview(content);
        }
    }

    private basicReview(content: string): any {
        const issues: any[] = [];
        const lines = content.split('\n');

        // Basic checks
        if (content.includes('console.log')) {
            issues.push({
                severity: 'warning',
                category: 'best-practice',
                message: 'Remove console.log statements in production code'
            });
        }

        if (content.includes('var ')) {
            issues.push({
                severity: 'warning',
                category: 'best-practice',
                message: 'Use const/let instead of var'
            });
        }

        if (lines.length > 500) {
            issues.push({
                severity: 'info',
                category: 'complexity',
                message: 'File is very long. Consider splitting into smaller modules.'
            });
        }

        return {
            score: 75 - (issues.length * 5),
            issues,
            suggestions: [
                { category: 'maintainability', message: 'Consider adding more comments' }
            ]
        };
    }

    private detectLanguage(ext: string): string {
        const langMap: Record<string, string> = {
            '.js': 'javascript',
            '.ts': 'typescript',
            '.jsx': 'javascript',
            '.tsx': 'typescript',
            '.py': 'python',
            '.java': 'java',
            '.go': 'go',
            '.rs': 'rust'
        };
        return langMap[ext] || 'text';
    }
}
