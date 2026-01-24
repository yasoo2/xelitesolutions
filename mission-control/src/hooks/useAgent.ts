
import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentStep } from '../components/AgentActivity';
import type { ThoughtStep } from '../components/ReasoningPanel';
import type { PipelineStage } from '../components/BuildPipeline';
import type { FileDiff } from '../components/DiffViewer';
import type { Screenshot } from '../components/ScreenshotGallery';

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

// Default pipeline stages
const defaultPipeline: PipelineStage[] = [
    { id: 'plan', name: 'Planning', nameAr: 'التخطيط', icon: null, status: 'pending' },
    { id: 'code', name: 'Coding', nameAr: 'البرمجة', icon: null, status: 'pending' },
    { id: 'test', name: 'Testing', nameAr: 'الفحص', icon: null, status: 'pending' },
    { id: 'deploy', name: 'Deploy', nameAr: 'النشر', icon: null, status: 'pending' },
];

export const useAgent = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [status, setStatus] = useState<'idle' | 'thinking' | 'executing' | 'error'>('idle');
    const [steps, setSteps] = useState<AgentStep[]>([]);
    const [fileActivities, setFileActivities] = useState<FileActivity[]>([]);

    // NEW: JoeStudio state
    const [thoughts, setThoughts] = useState<ThoughtStep[]>([]);
    const [pipeline, setPipeline] = useState<PipelineStage[]>(defaultPipeline);
    const [diffs, setDiffs] = useState<FileDiff[]>([]);
    const [previewUrl, setPreviewUrl] = useState<string>('');
    const [screenshots, setScreenshots] = useState<Screenshot[]>([]);

    const wsRef = useRef<WebSocket | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    // NEW: Buffer for incoming text tokens to reduce re-renders (INP Fix)
    const messageBufferRef = useRef<string[]>([]);

    // Flush Buffer Interval
    useEffect(() => {
        const interval = setInterval(() => {
            if (messageBufferRef.current.length > 0) {
                const combinedText = messageBufferRef.current.join('');
                messageBufferRef.current = []; // Clear buffer

                setMessages(prev => {
                    const lastMsg = prev[prev.length - 1];
                    if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.tool) {
                        return [
                            ...prev.slice(0, -1),
                            { ...lastMsg, content: lastMsg.content + combinedText }
                        ];
                    }
                    return [...prev, {
                        id: Date.now().toString(),
                        role: 'assistant',
                        content: combinedText,
                        type: 'text'
                    }];
                });
            }
        }, 100); // Update UI every 100ms max

        return () => clearInterval(interval);
    }, []);

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
                    // BUFFERING STRATEGY:
                    // Instead of updating state immediately, we push to a buffer
                    // A separate interval will flush this buffer up to 10 times a second
                    // This dramatically reduces re-renders during high-speed streaming
                    messageBufferRef.current.push(msg.data);

                    // If this is the *first* chunk of a new message stream, we might want to ensure
                    // the assistant message entry exists. 
                    // However, our flush logic handles creation/appending.
                    setStatus('idle');
                } else if (msg.type === 'thought') {
                    // NEW: Track thoughts for JoeStudio
                    setThoughts(prev => [...prev, {
                        id: Date.now().toString(),
                        type: 'analysis',
                        content: msg.data?.content || msg.data,
                        timestamp: new Date()
                    }]);
                    setStatus('thinking');

                    // Update pipeline - set planning as running
                    setPipeline(prev => prev.map((s, i) =>
                        i === 0 ? { ...s, status: 'running' as const } : s
                    ));
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

                        // Add thought for action
                        setThoughts(prev => [...prev, {
                            id: Date.now().toString(),
                            type: 'action',
                            content: `${action === 'created' ? 'إنشاء' : action === 'modified' ? 'تعديل' : 'قراءة'} ملف: ${filePath.split('/').pop()}`,
                            timestamp: new Date(),
                            toolUsed: toolName
                        }]);

                        // Update pipeline - set coding as running
                        setPipeline(prev => prev.map((s, i) =>
                            i === 0 ? { ...s, status: 'success' as const } :
                                i === 1 ? { ...s, status: 'running' as const } : s
                        ));
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

                    // Complete pipeline
                    setPipeline(prev => prev.map(s => ({ ...s, status: 'success' as const })));

                    // Add result thought
                    setThoughts(prev => [...prev, {
                        id: Date.now().toString(),
                        type: 'result',
                        content: 'تم إكمال المهمة بنجاح!',
                        timestamp: new Date()
                    }]);

                    // Set preview URL if available
                    if (msg.data?.previewUrl) {
                        setPreviewUrl(msg.data.previewUrl);
                    }
                } else if (msg.type === 'diff') {
                    // NEW: Track diffs for DiffViewer
                    setDiffs(prev => [{
                        path: msg.data?.path || 'unknown',
                        additions: msg.data?.additions || 0,
                        deletions: msg.data?.deletions || 0,
                        lines: msg.data?.lines || []
                    }, ...prev]);
                } else if (msg.type === 'screenshot') {
                    // NEW: Track screenshots for ScreenshotGallery
                    setScreenshots(prev => [{
                        id: msg.data?.id || Date.now().toString(),
                        url: msg.data?.url || '',
                        pageName: msg.data?.pageName || 'Unknown',
                        timestamp: new Date(msg.data?.timestamp || Date.now()),
                        status: msg.data?.status || 'success',
                        width: msg.data?.width || 1280,
                        height: msg.data?.height || 720
                    }, ...prev]);
                } else if (msg.type === 'preview_ready') {
                    // NEW: Set preview URL for LivePreview
                    setPreviewUrl(msg.data?.url || '');
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

        // Reset JoeStudio state for new run
        setThoughts([]);
        setPipeline(defaultPipeline);
        setDiffs([]);
        setPreviewUrl('');

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

    return {
        messages,
        status,
        sendMessage,
        steps,
        fileActivities,
        // JoeStudio exports
        thoughts,
        pipeline,
        diffs,
        previewUrl,
        screenshots
    };
};
