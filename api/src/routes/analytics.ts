import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

const router = Router();

interface FileStats {
    path: string;
    size: number;
    loc: number;
    todoCount: number;
    complexity: number; // Simplified metric
}

router.get('/quality', authenticate, async (req, res) => {
    try {
        const projectRoot = path.resolve(__dirname, '../../..');
        const files = await glob('**/*.{ts,tsx,js,jsx,css,scss}', {
            cwd: projectRoot,
            ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.d.ts', '**/coverage/**'],
            absolute: true
        });

        let totalLoc = 0;
        let totalFiles = 0;
        let totalTodos = 0;
        const fileStats: FileStats[] = [];

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8');
            const lines = content.split('\n');
            const loc = lines.filter(l => l.trim().length > 0).length;
            const size = fs.statSync(file).size;
            
            // Count TODOs
            const todos = (content.match(new RegExp('TO' + 'DO:', 'gi')) || []).length;
            
            // Simplified complexity: count indentation depth and conditional keywords
            let complexity = 0;
            const keywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'catch'];
            lines.forEach(line => {
                const trimmed = line.trim();
                keywords.forEach(kw => {
                    if (trimmed.startsWith(kw + ' ') || trimmed.startsWith(kw + '(')) {
                        complexity++;
                    }
                });
            });

            totalLoc += loc;
            totalFiles++;
            totalTodos += todos;

            fileStats.push({
                path: path.relative(projectRoot, file),
                size,
                loc,
                todoCount: todos,
                complexity
            });
        }

        // Calculate overall score (0-100)
        // Penalty for TODOs, high complexity per file, huge files
        let score = 100;
        const avgComplexity = fileStats.reduce((acc, f) => acc + f.complexity, 0) / (totalFiles || 1);
        
        if (avgComplexity > 10) score -= 10;
        if (avgComplexity > 20) score -= 20;
        if (totalTodos > 10) score -= 5;
        if (totalTodos > 50) score -= 15;

        // Ensure score is within 0-100
        score = Math.max(0, Math.min(100, score));

        res.json({
            overview: {
                totalFiles,
                totalLoc,
                totalTodos,
                score,
                avgComplexity: parseFloat(avgComplexity.toFixed(2))
            },
            files: fileStats.sort((a, b) => b.complexity - a.complexity).slice(0, 50) // Return top 50 most complex
        });

    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
