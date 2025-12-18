import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { callLLM } from '../llm';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

const router = Router();

// Simple in-memory cache for documentation
let docsCache: Record<string, any> = {};

// Get list of documented files
router.get('/', authenticate, (req, res) => {
    res.json(docsCache);
});

// Generate documentation for the project
router.post('/generate', authenticate, async (req, res) => {
    try {
        const projectRoot = path.resolve(__dirname, '../../..');
        // Scan for ts/tsx files in api/src and web/src, excluding node_modules and dist
        const files = await glob('**/*.{ts,tsx}', {
            cwd: projectRoot,
            ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.d.ts', '**/test/**'],
            absolute: true
        });

        // Limit to first 20 important files to avoid hitting rate limits or taking too long for this demo
        // In a real app, this would be a background job queue
        const selectedFiles = files.slice(0, 10); 
        
        const results: any[] = [];

        for (const file of selectedFiles) {
            const relativePath = path.relative(projectRoot, file);
            
            // Skip if already cached
            if (docsCache[relativePath]) {
                results.push(docsCache[relativePath]);
                continue;
            }

            const content = fs.readFileSync(file, 'utf-8');
            
            // Only document files with actual code
            if (content.length < 50) continue;

            const prompt = `
            Analyze the following TypeScript code and generate documentation.
            File: ${relativePath}
            
            Code:
            ${content.substring(0, 3000)} // Truncate to avoid context limits
            
            Provide a JSON response with:
            - summary: Brief description of what this file does.
            - exports: Array of exported functions/classes with description, params, and returns.
            - complexity: "Low" | "Medium" | "High" based on your assessment.
            
            Format as valid JSON only.
            `;

            try {
                const llmResponse = await callLLM(prompt);
                const jsonStr = llmResponse.replace(/```json/g, '').replace(/```/g, '').trim();
                const doc = JSON.parse(jsonStr);
                
                const entry = {
                    filePath: relativePath,
                    ...doc,
                    lastUpdated: new Date().toISOString()
                };
                
                docsCache[relativePath] = entry;
                results.push(entry);
            } catch (e) {
                console.error(`Failed to document ${relativePath}:`, e);
            }
        }

        res.json(results);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
