/**
 * Server Configuration Model
 * Defines the structure for SSH server connections
 */

export interface ServerConfig {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    authMethod: 'key' | 'password';
    keyPath?: string;
    password?: string;
    tags?: string[];
    isActive?: boolean;
    lastConnected?: Date;
    createdAt: Date;
    userId: string;
}

export interface ServerConnectionStatus {
    serverId: string;
    isConnected: boolean;
    lastError?: string;
    connectedAt?: Date;
}

export interface CommandExecutionContext {
    serverId?: string; // undefined for local
    command: string;
    workingDirectory?: string;
    timeout?: number;
}
