
import fs from 'fs';
import path from 'path';
import { terminals, registerTerminal, removeTerminal } from '../tools/terminal/TerminalState';
import { broadcast, registerTerminalOwner } from '../../api/ws';
import { logger } from '../../shared/utils/logger';
import { sshManager } from './ssh-manager';
import { executionEngine } from '../../kernel/ExecutionEngine';

/**
 * TerminalKernel
 * CENTRAL CONTROL LAYER for all terminal operations.
 * Phase 1.6: Control Only. Execution delegated to ExecutionEngine.
 */
export class TerminalKernel {
    /**
     * Create a new terminal session
     */
    async createTerminal(id: string, options: { serverId?: string; shell?: string; cwd?: string; cols?: number; rows?: number; userId?: string }) {
        const ts = Date.now();
        logger.info(`[kernel.session.created] sessionId=${id} ts=${ts} serverId=${options.serverId || 'local'}`);
        
        if (options.serverId) {
            await sshManager.requestShell(options.serverId, id);
            return { id, serverId: options.serverId };
        }

        if (terminals.has(id)) {
            logger.info(`[Kernel] Terminal already exists: ${id}`);
            return { id, existing: true };
        }

        logger.info(`[Kernel] Requesting execution from engine: ${id}`);

        try {
            // Delegate execution to Engine
            const session = await executionEngine.createSession({
                shell: options.shell,
                cwd: options.cwd,
                cols: options.cols,
                rows: options.rows,
                sessionId: id
            });

            const term = {
                pty: session,
                history: [] as string[],
                write: (data: string) => session.write(data),
                resize: (cols: number, rows: number) => session.resize(cols, rows),
                kill: () => session.kill(),
                fallback: session.fallback
            };

            registerTerminal(id, term);
            if (options.userId) registerTerminalOwner(id, options.userId);

            session.onData((data: string) => {
                const outTs = Date.now();
                term.history.push(data);
                if (term.history.length > 5000) term.history.shift();
                logger.info(`[kernel.output.emitted] sessionId=${id} ts=${outTs} bytes=${data.length}`);
                broadcast({ type: 'terminal_output', id, data });
            });

            session.onExit((code: number) => {
                logger.info(`[Kernel] Session exit detected: ${id} code=${code}`);
                this.killTerminal(id);
            });

            return { id, pid: session.pid, fallback: session.fallback };
        } catch (e: any) {
            logger.error(`[Kernel] Terminal creation delegation failed: ${e.message}`);
            throw e;
        }
    }

    /**
     * Send input to a terminal session
     */
    async sendInput(id: string, data: string, serverId?: string) {
        const ts = Date.now();
        logger.info(`[kernel.input.received] sessionId=${id} ts=${ts} bytes=${data.length} serverId=${serverId || 'local'}`);
        
        if (serverId) {
            if (sshManager.isConnected(serverId)) {
                await sshManager.sendInput(id, data);
            }
            return;
        }

        const term = terminals.get(id);
        if (!term) {
            logger.warn(`[Kernel] Attempted input to non-existent terminal: ${id}`);
            return;
        }
        
        logger.debug(`[Kernel] Forwarding input to engine for session: ${id}`);
        term.write(data);
    }

    /**
     * Resize a terminal session
     */
    async resizeTerminal(id: string, cols: number, rows: number, serverId?: string) {
        if (serverId) {
            sshManager.resizeShell(id, cols, rows);
            return;
        }

        const term = terminals.get(id);
        if (!term) return;
        
        logger.info(`[Kernel] Resizing terminal: ${id} to ${cols}x${rows}`);
        term.resize(cols, rows);
    }

    /**
     * Kill a terminal session
     */
    async killTerminal(id: string) {
        const term = terminals.get(id);
        if (term) {
            term.kill();
            removeTerminal(id);
            logger.info(`[Kernel] Terminal killed: ${id}`);
        }
    }

    /**
     * Read terminal history
     */
    async readHistory(id: string): Promise<string> {
        const term = terminals.get(id);
        if (!term) throw new Error('Terminal not found');
        return term.history.join('');
    }

    /**
     * List all active terminal IDs
     */
    async listTerminals(): Promise<string[]> {
        return Array.from(terminals.keys());
    }

    /**
     * Execute a one-off command (non-interactive)
     * Phase 1.6: Delegate to ExecutionEngine
     */
    async executeOneOff(command: string, options: any = {}): Promise<any> {
        const ts = Date.now();
        const sessionId = options.sessionId || 'internal';
        logger.info(`[kernel.execution.started] sessionId=${sessionId} ts=${ts} command="${command}"`);

        // We wrap the engine call to maintain the existing logging and interface for now
        // But the actual SPAWN happens inside ExecutionEngine.run()
        const result = await executionEngine.run(command, options);
        
        // Note: ExecutionEngine handles its own stdout/stderr collection
        // Kernel just receives the final result object.
        // If we want real-time logging of one-off output, we'd need a more complex stream interface
        // But for one-offs, this is the current pattern.
        
        return result;
    }
}

export const terminalKernel = new TerminalKernel();
