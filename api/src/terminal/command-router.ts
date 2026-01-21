/**
 * Command Router
 * Routes commands to local or remote execution based on context
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { sshManager } from './ssh-manager';
import { CommandExecutionContext } from '../models/ServerConfig';

const execAsync = promisify(exec);

export interface CommandResult {
    stdout: string;
    stderr: string;
    code: number;
    executedOn: 'local' | 'remote';
    serverId?: string;
}

export class CommandRouter {
    /**
     * Execute command (local or remote based on context)
     */
    async execute(context: CommandExecutionContext): Promise<CommandResult> {
        if (context.serverId) {
            return this.executeRemote(context);
        } else {
            return this.executeLocal(context);
        }
    }

    /**
     * Execute command locally
     */
    private async executeLocal(context: CommandExecutionContext): Promise<CommandResult> {
        try {
            const { stdout, stderr } = await execAsync(context.command, {
                cwd: context.workingDirectory || process.cwd(),
                timeout: context.timeout || 30000, // 30s default
                maxBuffer: 10 * 1024 * 1024, // 10MB
            });

            return {
                stdout,
                stderr,
                code: 0,
                executedOn: 'local',
            };
        } catch (error: any) {
            return {
                stdout: error.stdout || '',
                stderr: error.stderr || error.message,
                code: error.code || 1,
                executedOn: 'local',
            };
        }
    }

    /**
     * Execute command on remote server via SSH
     */
    private async executeRemote(context: CommandExecutionContext): Promise<CommandResult> {
        if (!context.serverId) {
            throw new Error('Server ID required for remote execution');
        }

        // Check if connected
        if (!sshManager.isConnected(context.serverId)) {
            throw new Error(`Not connected to server ${context.serverId}`);
        }

        const result = await sshManager.executeRemote(
            context.serverId,
            context.command,
            {
                cwd: context.workingDirectory,
                timeout: context.timeout,
            }
        );

        return {
            ...result,
            executedOn: 'remote',
            serverId: context.serverId,
        };
    }

    /**
     * Smart routing: Detect if command should run locally or remotely
     */
    async smartExecute(
        command: string,
        activeServerId?: string,
        workingDirectory?: string
    ): Promise<CommandResult> {
        // If user has explicitly selected a server, use it
        if (activeServerId) {
            return this.execute({
                command,
                serverId: activeServerId,
                workingDirectory,
            });
        }

        // Otherwise, execute locally
        return this.execute({
            command,
            workingDirectory,
        });
    }
}

// Singleton instance
export const commandRouter = new CommandRouter();
