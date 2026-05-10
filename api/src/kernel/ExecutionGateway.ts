
import { terminalKernel } from '../modules/terminal/terminal-kernel';
import { logger } from '../shared/utils/logger';

export interface ExecutionOptions {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    shell?: boolean | string;
    detached?: boolean;
    stdio?: 'ignore' | 'pipe' | 'inherit';
}

export interface ExecutionResult {
    ok: boolean;
    output?: string;
    error?: string;
    exitCode?: number;
}

/**
 * ExecutionGateway
 * SINGLE ENTRY POINT for all system execution.
 * Phase 1.5: Enforcing absolute execution ownership.
 */
export class ExecutionGateway {
    /**
     * Execute a one-off shell command.
     * Forwards execution to TerminalKernel to maintain single ownership.
     */
    static async execute(command: string, args: string[] = [], options: ExecutionOptions = {}): Promise<ExecutionResult> {
        const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
        const ts = Date.now();
        const sessionId = (options as any).sessionId || 'internal';
        
        logger.info(`[GW EXEC] START sessionId=${sessionId} ts=${ts} command="${fullCommand}"`);

        try {
            if (!command) throw new Error('Command is required');

            const result = await terminalKernel.executeOneOff(fullCommand, options);
            
            logger.info(`[GW EXEC] END sessionId=${sessionId} ts=${ts} ok=${result.ok} exitCode=${result.exitCode}`);
            return result;
        } catch (e: any) {
            logger.error(`[GW EXEC] ERROR sessionId=${sessionId} ts=${ts} error=${e.message}`);
            return { ok: false, error: e.message, exitCode: 1 };
        }
    }
}
