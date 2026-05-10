export interface ExecutionPattern {
    tool: string;
    inputHash: string;
    success: boolean;
    durationMs: number;
    error?: string;
    timestamp: number;
}

export class ExecutionMemory {
    private static patterns: ExecutionPattern[] = [];
    private static MAX_PATTERNS = 1000;

    /**
     * Record an execution result
     */
    static record(pattern: Omit<ExecutionPattern, 'timestamp'>): void {
        const record = { ...pattern, timestamp: Date.now() };
        this.patterns.push(record);
        
        // Keep memory lean
        if (this.patterns.length > this.MAX_PATTERNS) {
            this.patterns.shift();
        }
        
        console.log(`[ExecutionMemory] Recorded ${pattern.success ? 'SUCCESS' : 'FAILURE'} for ${pattern.tool}`);
    }

    /**
     * Retrieve patterns for a specific tool
     */
    static getPatternsForTool(tool: string): ExecutionPattern[] {
        return this.patterns.filter(p => p.tool === tool);
    }

    /**
     * Calculate success rate for a tool
     */
    static getSuccessRate(tool: string): number {
        const relevant = this.getPatternsForTool(tool);
        if (relevant.length === 0) return 1.0; // Default to optimistic
        const successful = relevant.filter(p => p.success).length;
        return successful / relevant.length;
    }

    /**
     * Find similar failed patterns
     */
    static findSimilarFailure(tool: string, inputHash: string): ExecutionPattern | undefined {
        return this.patterns.find(p => p.tool === tool && p.inputHash === inputHash && !p.success);
    }
}
