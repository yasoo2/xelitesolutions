import { ExecutionResult } from '../../../kernel/ExecutionEngine';
import { suggestCorrection } from '../llm/intelligent-router';
import { ExecutionMemory } from './ExecutionMemory';

export interface RecoveryAction {
    type: 'retry' | 'alternative' | 'replan' | 'abort';
    tool?: string;
    input?: any;
    reason: string;
}

export class SelfHealingController {
    /**
     * Analyze a failure and determine the best recovery action
     */
    static async handleFailure(
        error: any,
        tool: string,
        input: any,
        goal: string
    ): Promise<RecoveryAction> {
        console.warn(`[SelfHealing] Analyzing failure for tool: ${tool}`);
        
        // 1. Record failure in memory
        ExecutionMemory.record({
            tool,
            inputHash: this.calculateHash(JSON.stringify(input)),
            success: false,
            durationMs: 0,
            error: String(error)
        });

        // 2. Request AI-based correction
        try {
            const correction = await suggestCorrection(error, tool, goal);
            
            if (correction && (correction as any).name) {
                return {
                    type: (correction as any).name === tool ? 'retry' : 'alternative',
                    tool: (correction as any).name,
                    input: (correction as any).input,
                    reason: 'AI suggested correction'
                };
            }
            
            if (correction && (correction as any).no_correction) {
                return { type: 'abort', reason: 'AI indicated no correction possible' };
            }
        } catch (e) {
            console.error('[SelfHealing] Correction suggestion failed:', e);
        }

        // 3. Heuristic fallback
        if (tool === 'grep_search' && String(error).includes('not found')) {
            return { type: 'alternative', tool: 'ls', input: { path: '.' }, reason: 'Search failed, trying directory listing' };
        }

        return { type: 'retry', reason: 'Default retry policy' };
    }

    private static calculateHash(text: string): string {
        const crypto = require('crypto');
        return crypto.createHash('md5').update(text).digest('hex');
    }
}
