
import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentStep } from '../components/AgentActivity';

const getApiUrl = () => {
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    if (window.location.hostname === 'localhost') return 'http://localhost:3000';
    return '/api'; // In production, we proxy
};

const getWsUrl = () => {
    if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
    if (window.location.hostname === 'localhost') return 'ws://localhost:3000/ws';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`; // Proxy handling
};

const API_URL = getApiUrl();
const WS_URL = getWsUrl();

export type Message = {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    type?: 'text' | 'tool_use' | 'step';
    tool?: string;
};

// NEW: File Activity tracking
export type FileActivity = {
    id: string;
    path: string;
    action: 'created' | 'modified' | 'deleted' | 'read';
    timestamp: Date;
    status: 'pending' | 'success' | 'error';
    diff?: string;
};

export const useAgent = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [status, setStatus] = useState<'idle' | 'thinking' | 'executing' | 'error'>('idle');
    const [steps, setSteps] = useState<AgentStep[]>([]);
    const [fileActivities, setFileActivities] = useState<FileActivity[]>([]); // NEW
    const wsRef = useRef<WebSocket | null>(null);
    const sessionIdRef = useRef<string | null>(null);

    // Initialize Session
    useEffect(() => {
        // In a real app, we might persist session ID or fetch from server
        // For now, we'll let the backend create one on first run or use a hardcoded one for dev
        return () => {
            wsRef.current?.close();
        };
    }, []);

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('🔌 Connected to Neural Nexus');
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.type === 'text') {
                    setMessages(prev => {
                        const lastMsg = prev[prev.length - 1];
                        if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.tool) {
                            // Append to existing message
                            return [
                                ...prev.slice(0, -1),
                                { ...lastMsg, content: lastMsg.content + msg.data }
                            ];
                        }
                        // New message
                        return [...prev, {
                            id: Date.now().toString(),
                            role: 'assistant',
                            content: msg.data,
                            type: 'text'
                        }];
                    });
                    setStatus('idle');
                } else if (msg.type === 'thought') {
                    // Show thoughts as ephemeral status (optional)
                    // For now, handled by step_started mostly, but we can set status
                    setStatus('thinking');
                } else if (msg.type === 'step_started') {
                    const toolName = msg.data?.tool || '';
                    setSteps(prev => {
                        const next = prev.map(s => ({ ...s, status: 'done' as const }));
                        return [...next, {
                            key: Date.now().toString(),
                            name: toolName,
                            status: 'running' as const
                        }];
                    });
                    setStatus('executing');

                    // NEW: Track file activities
                    if (['file_edit', 'file_read', 'create_file', 'write_file'].includes(toolName)) {
                        const filePath = msg.data?.input?.path || msg.data?.input?.file || 'unknown';
                        const action: 'created' | 'modified' | 'deleted' | 'read' =
                            toolName.includes('read') ? 'read' :
                                toolName.includes('create') ? 'created' : 'modified';
                        setFileActivities(prev => [{
                            id: Date.now().toString(),
                            path: filePath,
                            action,
                            timestamp: new Date(),
                            status: 'pending' as const
                        }, ...prev].slice(0, 50)); // Keep last 50
                    }
                } else if (msg.type === 'step_completed') {
                    // Update file activity status
                    setFileActivities(prev => prev.map((fa, i) =>
                        i === 0 && fa.status === 'pending'
                            ? { ...fa, status: msg.data?.success ? 'success' : 'error' }
                            : fa
                    ));
                } else if (msg.type === 'run_completed') {
                    setSteps(prev => prev.map(s => ({ ...s, status: 'done' as const })));
                    setFileActivities(prev => prev.map(fa =>
                        fa.status === 'pending' ? { ...fa, status: 'success' } : fa
                    ));
                    setStatus('idle');
                }
            } catch (e) {
                console.error('WS Parse Error', e);
            }
        };

        ws.onerror = (e) => {
            console.error('WS Error', e);
            setStatus('error');
        };
    }, []);

    const sendMessage = useCallback(async (text: string) => {
        // Connect if not connected
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            connect();
            // Wait a bit for connection? Ideally we wait for open event.
            // For simplicity, assuming backend handles stateless runs or we send ID.
        }

        // Optimistic update
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'user',
            content: text
        }]);
        setStatus('thinking');
        setSteps([]);

        try {
            // We need a session ID. If null, backend should generate one.
            // But we need to keep it consistent.
            // Let's create one if missing.
            if (!sessionIdRef.current) {
                // Basic random ID
                sessionIdRef.current = 'session_' + Math.random().toString(36).substr(2, 9);
            }

            const response = await fetch(`${API_URL}/runs/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    sessionId: sessionIdRef.current
                })
            });

            if (!response.ok) throw new Error('Failed to send message');

        } catch (e) {
            console.error(e);
            setStatus('error');
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                content: 'Error: Failed to reach the Neural Core.',
                type: 'text'
            }]);
        }
    }, [connect]);

    return { messages, status, sendMessage, steps, fileActivities };
};
