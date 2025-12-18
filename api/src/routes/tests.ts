import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { callLLM } from '../llm';
import { glob } from 'glob';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const router = Router();

// List all test files
router.get('/files', authenticate, async (req, res) => {
    try {
        const projectRoot = path.resolve(__dirname, '../../..');
        const files = await glob('**/*.{test,spec}.{ts,tsx,js,jsx}', {
            cwd: projectRoot,
            ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
            absolute: true
        });

        const testFiles = files.map(f => ({
            path: path.relative(projectRoot, f),
            name: path.basename(f)
        }));

        res.json(testFiles);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Run tests
router.post('/run', authenticate, (req, res) => {
    const { testFile } = req.body; // Optional: if provided, run specific file
    const projectRoot = path.resolve(__dirname, '../../..');
    
    // We'll use the 'api' folder context for running jest usually, but let's try running from root or api depending on where the file is.
    // For simplicity, we assume we run 'npm test' in 'api' directory, pointing to the file if needed.
    // Adjusting to run npx jest from project root or api root.
    
    // Let's try running npx jest from the api directory as the base
    const cwd = path.resolve(__dirname, '../..'); 
    
    const args = ['jest', '--colors'];
    if (testFile) {
        // testFile is relative to project root, e.g. "api/src/foo.test.ts"
        // we need to make it absolute or relative to cwd
        args.push(path.resolve(projectRoot, testFile));
    }

    const child = spawn('npx', args, { cwd });

    res.setHeader('Content-Type', 'text/plain');

    child.stdout.on('data', (data) => {
        res.write(data);
    });

    child.stderr.on('data', (data) => {
        res.write(data);
    });

    child.on('close', (code) => {
        res.write(`\nTest process exited with code ${code}`);
        res.end();
    });
});

// Generate test for a file
router.post('/generate', authenticate, async (req, res) => {
    const { filePath } = req.body;
    const projectRoot = path.resolve(__dirname, '../../..');
    const fullPath = path.resolve(projectRoot, filePath);

    if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        
        const prompt = `
        You are a senior QA Engineer. Write a comprehensive unit test using Jest for the following TypeScript code.
        File: ${filePath}
        
        Code:
        ${content.substring(0, 5000)}
        
        Requirements:
        1. Use 'describe' and 'test'/'it' blocks.
        2. Mock external dependencies if necessary.
        3. Cover happy paths and edge cases.
        4. Return ONLY the code for the test file. No markdown, no explanations.
        5. Imports should be relative to the file structure.
        `;

        let testCode = await callLLM(prompt);
        testCode = testCode.replace(/```typescript/g, '').replace(/```/g, '').trim();

        // Determine new file path
        const dir = path.dirname(fullPath);
        const ext = path.extname(fullPath);
        const name = path.basename(fullPath, ext);
        const testFilePath = path.join(dir, `${name}.test${ext}`);

        // Write file
        // Note: In a real scenario, we might want to check if it exists or ask for confirmation. 
        // Here we overwrite or create.
        fs.writeFileSync(testFilePath, testCode);

        res.json({ 
            success: true, 
            testFilePath: path.relative(projectRoot, testFilePath),
            code: testCode
        });

    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
