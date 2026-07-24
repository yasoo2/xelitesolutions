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

        // Always run the INSTANT deterministic pass first (free, offline).
        const basic = this.basicReview(content, language);

        // 'quick' review returns the deterministic result immediately — no waiting
        // on a slow local model. Deeper reviews add an LLM pass on top.
        if (reviewType === 'quick') return basic;

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

            // Merge the LLM findings with the deterministic ones so the critical
            // static checks (secrets, merge markers, eval) are never dropped.
            const llmIssues = Array.isArray(review.issues) ? review.issues : [];
            const llmSuggestions = Array.isArray(review.suggestions) ? review.suggestions : [];
            const mergedIssues = [...basic.issues, ...llmIssues];
            const mergedSuggestions = [...basic.suggestions, ...llmSuggestions];
            // Take the stricter (lower) of the two scores.
            const score = Math.min(typeof review.score === 'number' ? review.score : 70, basic.score);
            return { score, issues: mergedIssues, suggestions: mergedSuggestions };
        } catch (error) {
            // LLM unavailable/invalid — the deterministic review still stands.
            return basic;
        }
    }

    /**
     * Deterministic static review — no LLM required. Runs instantly and works
     * fully offline/keyless, so a code review is always useful even when the
     * local model is slow or every provider is momentarily down.
     */
    private basicReview(content: string, language = 'text'): any {
        const issues: any[] = [];
        const suggestions: any[] = [];
        const lines = content.split('\n');
        const lineOf = (idx: number) => idx + 1;

        // --- CRITICAL: leaked secrets ---
        const secretPatterns: Array<[RegExp, string]> = [
            [/\b(?:ghp|gho|ghs|ghr)_[A-Za-z0-9]{20,}/, 'Hard-coded GitHub token'],
            [/\bsk-[A-Za-z0-9]{20,}/, 'Hard-coded OpenAI-style API key'],
            [/\bAIza[A-Za-z0-9_\-]{30,}/, 'Hard-coded Google API key'],
            [/\bAKIA[A-Z0-9]{16}\b/, 'Hard-coded AWS access key'],
            [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'Embedded private key'],
        ];
        lines.forEach((line, i) => {
            for (const [re, msg] of secretPatterns) {
                if (re.test(line)) issues.push({ line: lineOf(i), severity: 'critical', category: 'security', message: `${msg} — move it to an environment variable and revoke it.` });
            }
        });

        // --- CRITICAL: unresolved merge conflict markers ---
        lines.forEach((line, i) => {
            if (/^(<{7}|={7}|>{7})(\s|$)/.test(line)) issues.push({ line: lineOf(i), severity: 'critical', category: 'code-smell', message: 'Unresolved merge-conflict marker.' });
        });

        // --- WARNING: dangerous eval / dynamic execution ---
        lines.forEach((line, i) => {
            if (/\beval\s*\(/.test(line) || /new Function\s*\(/.test(line)) issues.push({ line: lineOf(i), severity: 'warning', category: 'security', message: 'Avoid eval()/new Function() — injection risk.' });
        });

        // --- WARNING: empty catch blocks (swallowed errors) ---
        if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(content) || /except\s*:\s*\n\s*pass/.test(content)) {
            issues.push({ severity: 'warning', category: 'best-practice', message: 'Empty catch/except swallows errors silently — at least log them.' });
        }

        // --- WARNING: leftover TODO/FIXME ---
        lines.forEach((line, i) => {
            if (/\b(TODO|FIXME|XXX|HACK)\b/.test(line)) issues.push({ line: lineOf(i), severity: 'info', category: 'code-smell', message: 'Leftover TODO/FIXME marker.' });
        });

        // --- JS/TS specific ---
        if (/javascript|typescript/.test(language)) {
            lines.forEach((line, i) => {
                if (/\bconsole\.log\b/.test(line)) issues.push({ line: lineOf(i), severity: 'info', category: 'best-practice', message: 'Leftover console.log — remove for production.' });
                if (/\bvar\s+\w/.test(line)) issues.push({ line: lineOf(i), severity: 'warning', category: 'best-practice', message: 'Use const/let instead of var.' });
                if (/==(?!=)/.test(line) && !/===/.test(line)) issues.push({ line: lineOf(i), severity: 'info', category: 'best-practice', message: 'Prefer strict equality (===) over ==.' });
            });
        }

        // --- Python specific ---
        if (language === 'python') {
            lines.forEach((line, i) => {
                if (/except\s*:/.test(line) && !/except\s+\w/.test(line)) issues.push({ line: lineOf(i), severity: 'warning', category: 'best-practice', message: 'Bare except — catch specific exceptions.' });
                if (/\bprint\s*\(/.test(line)) issues.push({ line: lineOf(i), severity: 'info', category: 'best-practice', message: 'Leftover print() — use logging for production.' });
            });
        }

        // --- Balance check (quick heuristic for obvious breakage) ---
        const opens = (content.match(/[{([]/g) || []).length;
        const closes = (content.match(/[})\]]/g) || []).length;
        if (Math.abs(opens - closes) > 0) {
            issues.push({ severity: 'warning', category: 'complexity', message: `Unbalanced brackets (${opens} open vs ${closes} close) — possible syntax error.` });
        }

        // --- Size / structure ---
        if (lines.length > 500) issues.push({ severity: 'info', category: 'complexity', message: 'File is very long (>500 lines). Consider splitting into modules.' });
        const longLines = lines.filter(l => l.length > 200).length;
        if (longLines > 0) suggestions.push({ category: 'readability', message: `${longLines} very long line(s) (>200 chars) — consider wrapping.` });

        // Score: critical hurts most, then warnings, then info.
        const critical = issues.filter(i => i.severity === 'critical').length;
        const warning = issues.filter(i => i.severity === 'warning').length;
        const info = issues.filter(i => i.severity === 'info').length;
        const score = Math.max(0, 100 - critical * 30 - warning * 10 - info * 3);

        if (suggestions.length === 0) suggestions.push({ category: 'maintainability', message: 'Consider adding tests and doc comments for key functions.' });

        return { score, issues, suggestions };
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
