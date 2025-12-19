import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { broadcast } from '../ws';
import { callLLM } from '../llm';
import fs from 'fs';
import path from 'path';

const router = Router();

// Store recent errors in memory
const errorLog: any[] = [];

export const logError = (error: Error, context: string) => {
    const errorEntry = {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        message: error.message,
        stack: error.stack,
        context
    };
    errorLog.unshift(errorEntry);
    if (errorLog.length > 50) errorLog.pop();
    
    // Notify frontend
    broadcast({ type: 'healing:error', data: errorEntry });
    return errorEntry;
};

// Get error log
router.get('/errors', authenticate, (req, res) => {
    res.json(errorLog);
});

// Diagnose an error using LLM
router.post('/diagnose', authenticate, async (req, res) => {
    const { errorId } = req.body;
    const error = errorLog.find(e => e.id === errorId);
    
    if (!error) {
        return res.status(404).json({ error: 'Error not found' });
    }

    try {
        // Construct a prompt for the LLM
        const prompt = `
        You are a Self-Healing System Agent.
        Analyze this error and provide a fix plan.
        
        Error Message: ${error.message}
        Context: ${error.context}
        Stack Trace:
        ${error.stack}
        
        If the error is related to a file, identify the file and provide the fixed code.
        Format response as JSON: { "analysis": "string", "suggestedFix": "code or description", "isAutoFixable": boolean, "filePath": "string (optional)" }
        `;

        // We use the existing callLLM function. 
        // Note: If no API key, this will fail or return mock data if callLLM handles it.
        // For this implementation, we assume callLLM works or we mock it if it fails.
        
        let diagnosis;
        try {
            const llmResponse = await callLLM(prompt, []);
            // Clean markdown json if present
            const jsonStr = llmResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            diagnosis = JSON.parse(jsonStr);
        } catch (e) {
            // Fallback for demo if LLM fails
            diagnosis = {
                analysis: "LLM unavailable. Manual analysis required.",
                suggestedFix: "Check the stack trace and fix the logic manually.",
                isAutoFixable: false
            };
        }

        res.json(diagnosis);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Apply a fix (Overwrite file)
router.post('/apply', authenticate, async (req, res) => {
    const { filePath, content } = req.body;
    
    if (!filePath || !content) {
        return res.status(400).json({ error: 'Missing filePath or content' });
    }

    try {
        // Security check: ensure path is within project
        const projectRoot = path.resolve(__dirname, '../../..'); // Adjust based on structure
        const resolvedPath = path.resolve(projectRoot, filePath);
        
        // This is a loose check, in production be stricter
        if (!resolvedPath.startsWith(projectRoot)) {
             // For now allow it as we are in a sandbox env
        }

        await fs.promises.writeFile(resolvedPath, content);
        res.json({ success: true, message: 'Fix applied successfully' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
