
import { useState, useEffect, useCallback, useRef } from 'react';

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

export const useAgent = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [status, setStatus] = useState<'idle' | 'thinking' | 'executing' | 'error'>('idle');
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
                    setMessages(prev => [...prev, {
                        id: Date.now().toString(),
                        role: 'assistant',
                        content: msg.data,
                        type: 'text'
                    }]);
                    setStatus('idle');
                } else if (msg.type === 'step_started') {
                    setMessages(prev => [...prev, {
                        id: Date.now().toString(),
                        role: 'system',
                        content: `Executing: ${msg.data.tool}`,
                        type: 'step',
                        tool: msg.data.tool
                    }]);
                    setStatus('executing');
                } else if (msg.type === 'run_completed') {
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

    return { messages, status, sendMessage };
};
