
import { executionEngine, ExecutionRequest, ExecutionResult } from './ExecutionEngine';
import { logger } from '../shared/utils/logger';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

/**
 * ExecutionGateway
 * HIGH PERFORMANCE SECURE GATEWAY for all system execution.
 * Phase 2.1: Centralized Execution Contract.
 */
export class ExecutionGateway {
    /**
     * Unified execute method.
     * Routes all system requests through ExecutionEngine.
     * Supports both (request: ExecutionRequest) and (command: string, args?: string[], options?: any).
     */
    static async execute(requestOrCommand: ExecutionRequest | string, args: string[] = [], options: any = {}): Promise<ExecutionResult> {
        // [FIREWALL] Enforce strict, centralized single-brain orchestration context authorization
        executionFirewall.validateExecution('ExecutionGateway:execute');

        const start = Date.now();
        let request: ExecutionRequest;

        if (typeof requestOrCommand === 'string') {
            // Convert old signature to new ExecutionRequest
            const fullCommand = args.length > 0 ? `${requestOrCommand} ${args.join(' ')}` : requestOrCommand;
            request = {
                id: options.sessionId || 'gate-' + Date.now(),
                type: 'shell',
                payload: {
                    command: fullCommand,
                    options
                },
                priority: options.priority || 'normal'
            };
        } else {
            request = requestOrCommand;
        }
        
        // Validation Layer
        if (!request.payload.command && request.type === 'shell') {
            return {
                success: false,
                error: 'Command is required for shell execution',
                duration: Date.now() - start
            };
        }

        try {
            // Forward directly to Engine
            const result = await executionEngine.execute(request);
            return result;
        } catch (e: any) {
            logger.error(`[GATEWAY] UNEXPECTED ERROR id=${request.id} error=${e.message}`);
            return {
                success: false,
                error: e.message,
                duration: Date.now() - start
            };
        }
    }

    /**
     * Backward compatibility wrapper for Phase 1 code.
     * DEPRECATED: Use ExecutionGateway.execute(request) instead.
     */
    static async executeLegacy(command: string, args: string[] = [], options: any = {}): Promise<any> {
        const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
        const id = options.sessionId || 'legacy-' + Date.now();
        
        const result = await this.execute({
            id,
            type: 'shell',
            payload: {
                command: fullCommand,
                options
            },
            priority: 'normal'
        });

        return {
            ok: result.success,
            output: result.data?.output || '',
            error: result.error || result.data?.error || '',
            exitCode: result.data?.exitCode ?? (result.success ? 0 : 1)
        };
    }
}
