/**
 * SSH Connection Manager
 * Handles SSH connections to remote servers with connection pooling
 */

import { NodeSSH, Config as SSHConfig } from 'node-ssh';
import { ServerConfig, ServerConnectionStatus } from '../../shared/models/ServerConfig';
import * as fs from 'fs/promises';

import { broadcast } from '../../api/ws';

export class SSHManager {
    private connections: Map<string, NodeSSH> = new Map();
    private shellStreams: Map<string, any> = new Map();
    private connectionStatus: Map<string, ServerConnectionStatus> = new Map();
    private readonly maxConnections = 10;

    /**
     * Connect to a server using SSH
     */
    async connect(serverConfig: ServerConfig): Promise<void> {
        // Check connection limit
        if (this.connections.size >= this.maxConnections) {
            throw new Error(`Maximum connections (${this.maxConnections}) reached`);
        }

        // Check if already connected
        if (this.connections.has(serverConfig.id)) {
            console.log(`[SSH] Already connected to ${serverConfig.name}`);
            return;
        }

        const ssh = new NodeSSH();

        try {
            const sshConfig: SSHConfig = {
                host: serverConfig.host,
                port: serverConfig.port,
                username: serverConfig.username,
            };

            // Add authentication
            if (serverConfig.authMethod === 'key' && serverConfig.keyPath) {
                const privateKey = await fs.readFile(serverConfig.keyPath, 'utf8');
                sshConfig.privateKey = privateKey;
            } else if (serverConfig.authMethod === 'password' && serverConfig.password) {
                sshConfig.password = serverConfig.password;
            } else {
                throw new Error('Invalid authentication configuration');
            }

            await ssh.connect(sshConfig);

            this.connections.set(serverConfig.id, ssh);
            this.connectionStatus.set(serverConfig.id, {
                serverId: serverConfig.id,
                isConnected: true,
                connectedAt: new Date(),
            });

            console.log(`[SSH] ✓ Connected to ${serverConfig.name} (${serverConfig.host})`);
        } catch (error: any) {
            this.connectionStatus.set(serverConfig.id, {
                serverId: serverConfig.id,
                isConnected: false,
                lastError: error.message,
            });

            console.error(`[SSH] ✗ Failed to connect to ${serverConfig.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Request an interactive shell for the server
     */
    async requestShell(serverId: string, terminalId: string, options?: { cols: number, rows: number, sessionId?: string }): Promise<void> {
        const ssh = this.connections.get(serverId);
        if (!ssh) throw new Error(`Not connected to server ${serverId}`);

        // If already has a shell for this terminal, skip
        if (this.shellStreams.has(terminalId)) return;

        try {
            const stream = await ssh.requestShell({
                term: 'xterm-color',
                cols: options?.cols || 80,
                rows: options?.rows || 24,
            });

            this.shellStreams.set(terminalId, stream);

            stream.on('data', (data: any) => {
                broadcast({ type: 'terminal_output', id: terminalId, sessionId: String(options?.sessionId || terminalId), data: data.toString() });
            });

            stream.on('close', () => {
                this.shellStreams.delete(terminalId);
                broadcast({ type: 'terminal_output', id: terminalId, sessionId: String(options?.sessionId || terminalId), data: '\r\n[Remote Connection Closed]\r\n' });
            });

        } catch (error: any) {
            console.error(`[SSH] Failed to request shell:`, error.message);
            throw error;
        }
    }

    /**
     * Send input to interactive shell
     */
    sendInput(terminalId: string, data: string): void {
        const stream = this.shellStreams.get(terminalId);
        if (stream) {
            stream.write(data);
        }
    }

    /**
     * Resize interactive shell
     */
    resizeShell(terminalId: string, cols: number, rows: number): void {
        const stream = this.shellStreams.get(terminalId);
        if (stream && stream.setWindow) {
            stream.setWindow(rows, cols, 0, 0);
        }
    }

    /**
     * Execute command on remote server
     */
    async executeRemote(
        serverId: string,
        command: string,
        options?: { cwd?: string; timeout?: number }
    ): Promise<{ stdout: string; stderr: string; code: number }> {
        const ssh = this.connections.get(serverId);

        if (!ssh) {
            throw new Error(`Not connected to server ${serverId}`);
        }

        try {
            const result = await ssh.execCommand(command, {
                cwd: options?.cwd,
                onStdout: (chunk) => process.stdout.write(chunk.toString()),
                onStderr: (chunk) => process.stderr.write(chunk.toString()),
            });

            return {
                stdout: result.stdout,
                stderr: result.stderr,
                code: result.code || 0,
            };
        } catch (error: any) {
            console.error(`[SSH] Command execution failed:`, error.message);
            throw error;
        }
    }

    /**
     * Disconnect from server
     */
    async disconnect(serverId: string): Promise<void> {
        const ssh = this.connections.get(serverId);

        // Close any associated shell streams
        for (const [tid, stream] of this.shellStreams.entries()) {
            if (tid.includes(serverId)) { // Assuming terminalId might contain serverId for identification
                stream.end();
                this.shellStreams.delete(tid);
            }
        }

        if (ssh) {
            ssh.dispose();
            this.connections.delete(serverId);
            this.connectionStatus.set(serverId, {
                serverId,
                isConnected: false,
            });

            console.log(`[SSH] Disconnected from ${serverId}`);
        }
    }

    /**
     * Disconnect all connections
     */
    async disconnectAll(): Promise<void> {
        const serverIds = Array.from(this.connections.keys());
        await Promise.all(serverIds.map(id => this.disconnect(id)));
        console.log('[SSH] All connections closed');
    }

    /**
     * Get connection status
     */
    getStatus(serverId: string): ServerConnectionStatus | undefined {
        return this.connectionStatus.get(serverId);
    }

    /**
     * Check if connected to server
     */
    isConnected(serverId: string): boolean {
        return this.connections.has(serverId);
    }

    /**
     * Get all active connections
     */
    getActiveConnections(): string[] {
        return Array.from(this.connections.keys());
    }

    /**
     * Test server connection without keeping it open
     */
    async testConnection(serverConfig: ServerConfig): Promise<boolean> {
        const ssh = new NodeSSH();

        try {
            const sshConfig: SSHConfig = {
                host: serverConfig.host,
                port: serverConfig.port,
                username: serverConfig.username,
            };

            if (serverConfig.authMethod === 'key' && serverConfig.keyPath) {
                const privateKey = await fs.readFile(serverConfig.keyPath, 'utf8');
                sshConfig.privateKey = privateKey;
            } else if (serverConfig.authMethod === 'password' && serverConfig.password) {
                sshConfig.password = serverConfig.password;
            }

            await ssh.connect(sshConfig);
            ssh.dispose();

            return true;
        } catch (error) {
            return false;
        }
    }
}

// Singleton instance
export const sshManager = new SSHManager();
