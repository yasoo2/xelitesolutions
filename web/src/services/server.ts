/**
 * Server Management Service
 * Handles API calls for SSH server configurations
 */

import { API_URL } from '../config';

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
    lastConnected?: string;
}

export interface ConnectionStatus {
    serverId: string;
    isConnected: boolean;
    lastError?: string;
    connectedAt?: string;
}

const getHeaders = () => {
    const token = localStorage.getItem('token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
};

export const ServerService = {
    async listServers(): Promise<ServerConfig[]> {
        const res = await fetch(`${API_URL}/api/servers`, { headers: getHeaders() });
        if (!res.ok) throw new Error('Failed to fetch servers');
        return res.json();
    },

    async addServer(data: Partial<ServerConfig>): Promise<ServerConfig> {
        const res = await fetch(`${API_URL}/api/servers`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to add server');
        return res.json();
    },

    async updateServer(id: string, data: Partial<ServerConfig>): Promise<ServerConfig> {
        const res = await fetch(`${API_URL}/api/servers/${id}`, {
            method: 'PUT',
            headers: getHeaders(),
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Failed to update server');
        return res.json();
    },

    async deleteServer(id: string): Promise<void> {
        const res = await fetch(`${API_URL}/api/servers/${id}`, {
            method: 'DELETE',
            headers: getHeaders(),
        });
        if (!res.ok) throw new Error('Failed to delete server');
    },

    async connect(id: string): Promise<ConnectionStatus> {
        const res = await fetch(`${API_URL}/api/servers/${id}/connect`, {
            method: 'POST',
            headers: getHeaders(),
        });
        if (!res.ok) throw new Error('Failed to connect to server');
        return res.json();
    },

    async disconnect(id: string): Promise<void> {
        const res = await fetch(`${API_URL}/api/servers/${id}/disconnect`, {
            method: 'POST',
            headers: getHeaders(),
        });
        if (!res.ok) throw new Error('Failed to disconnect');
    },

    async testConnection(id: string): Promise<boolean> {
        const res = await fetch(`${API_URL}/api/servers/${id}/test`, {
            method: 'POST',
            headers: getHeaders(),
        });
        if (!res.ok) return false;
        const data = await res.json();
        return data.success;
    }
};
