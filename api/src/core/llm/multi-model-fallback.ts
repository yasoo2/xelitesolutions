/**
 * Multi-Model Fallback Chain - سلسلة بدائل متعددة للموديلات
 * 
 * @version 1.0.0
 */

import { routeToModel, MODELS } from './intelligent-router';

export interface ModelConfig {
    name: string;
    provider: string;
    maxTokens: number;
    priority: number;
}

export interface ModelResponse {
    content: string;
    toolCalls?: any[];
    model?: string;
}

export interface Task {
    type: string;
    complexity?: string;
    requiresTools?: boolean;
}

export class MultiModelFallback {
    private fallbackChain: ModelConfig[] = [
        { name: 'Mixtral 8x7B', provider: 'groq', maxTokens: 16000, priority: 1 },
        { name: 'Llama 3.1 70B', provider: 'groq', maxTokens: 8000, priority: 2 },
        { name: 'Gemma 2 9B', provider: 'groq', maxTokens: 8000, priority: 3 },
        { name: 'GPT-4o-mini', provider: 'openai', maxTokens: 16000, priority: 4 },
        { name: 'Claude 3 Haiku', provider: 'anthropic', maxTokens: 8000, priority: 5 }
    ];
    
    /**
     * محاولة متعددة المستويات
     */
    async executeWithFallback(
        messages: any[],
        task?: Task
    ): Promise<ModelResponse> {
        let lastError: Error | null = null;
        
        for (const model of this.fallbackChain) {
            try {
                const response = await this.callModel(model, messages, task);
                
                if (this.isResponseValid(response)) {
                    return response;
                }
                
            } catch (error: any) {
                lastError = error;
                await this.sleep(1000);
            }
        }
        
        return this.useLocalFallback(messages, task);
    }
    
    /**
     * استدعاء موديل محدد
     */
    private async callModel(
        model: ModelConfig,
        messages: any[],
        task?: Task
    ): Promise<ModelResponse> {
        try {
            const content = await routeToModel(messages, {
                type: (task?.type || 'general') as any,
                complexity: task?.complexity as any || 'medium',
                requiresTools: task?.requiresTools || false,
                estimatedTokens: 4000,
                language: 'ar'
            });
            
            return {
                content,
                model: model.name
            };
        } catch (error: any) {
            throw new Error(`${model.name} failed: ${error.message}`);
        }
    }
    
    /**
     * التحقق من صحة الإجابة
     */
    private isResponseValid(response: ModelResponse): boolean {
        if (!response || !response.content) {
            return false;
        }
        
        const content = response.content.trim();
        
        if (content.length < 10) {
            return false;
        }
        
        const invalidPatterns = [
            /^error/i,
            /^failed/i,
            /^sorry/i,
            /i don't have/i,
            /i cannot/i
        ];
        
        for (const pattern of invalidPatterns) {
            if (pattern.test(content)) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Fallback محلي - قوالب وردود جاهزة
     */
    private useLocalFallback(messages: any[], task?: Task): ModelResponse {
        if (task?.type === 'code_generation') {
            return this.useCodeTemplate(task);
        }
        
        if (task?.type === 'error_fix') {
            return this.useErrorFixTemplate(task);
        }
        
        return {
            content: 'I encountered an issue with all AI models. Please try again or check your API keys.',
            toolCalls: []
        };
    }
    
    /**
     * استخدام قالب كود جاهز
     */
    private useCodeTemplate(task: Task): ModelResponse {
        const templates: Record<string, string> = {
            'react_component': `import React from 'react';

export const Component: React.FC = () => {
    return (
        <div className="p-4">
            <h1>Component</h1>
        </div>
    );
};`,
            'express_route': `import { Router } from 'express';

const router = Router();

router.get('/', async (req, res) => {
    try {
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;`
        };
        
        return {
            content: templates['react_component'] || 'Template not found',
            toolCalls: []
        };
    }
    
    /**
     * استخدام قالب إصلاح خطأ
     */
    private useErrorFixTemplate(task: Task): ModelResponse {
        return {
            content: 'Please check the error message and try the following:\n1. Verify all dependencies are installed\n2. Check for syntax errors\n3. Ensure proper imports',
            toolCalls: []
        };
    }
    
    /**
     * انتظار
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export const multiModelFallback = new MultiModelFallback();
