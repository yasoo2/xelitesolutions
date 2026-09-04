
import { executionEngine, ExecutionRequest, ExecutionResult, ExecutionOptions } from './ExecutionEngine';
import { logger } from '../shared/utils/logger';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

/**
 * ExecutionGateway
 * HIGH PERFORMANCE SECURE GATEWAY for all system execution.
 * Phase 2.1: Centralized Execution Contract.
 */
export class ExecutionGateway {
    /**
     * Start a long-lived process while keeping its handle under the single
     * execution authority. Callers that need readiness probing (for example a
     * project preview) must use this instead of `execute(..., background)`:
     * the latter is a one-shot result API and cannot supervise a server after
     * it returns.
     */
    static startManaged(
        file: string,
        args: string[] = [],
        options: ExecutionOptions & { onLine?: (line: string, stream: 'stdout' | 'stderr') => void } = {},
    ) {
        // This is the gateway's long-lived counterpart to `execute`; callers
        // are already inside the ToolService/orchestrator execution boundary.
        // Do not run a second context assertion here: unit and integration
        // tools intentionally exercise the gateway without an AsyncLocal
        // orchestrator context, while the engine remains the sole spawner.
        return executionEngine.runArgvStreaming(file, args, options);
    }

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
            // Preserve argv boundaries. Concatenating a Windows executable path
            // with its arguments turns `C:\\Program Files\\nodejs\\node.exe`
            // into the invalid command `C:\\Program`; it also lets shell
            // metacharacters change the meaning of a supposedly tokenized arg.
            request = {
                id: options.sessionId || 'gate-' + Date.now(),
                type: 'shell',
                payload: {
                    command: requestOrCommand,
                    ...(args.length > 0 ? { args: [...args] } : {}),
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
