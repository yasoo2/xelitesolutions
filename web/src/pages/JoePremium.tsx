/**
 * Joe Premium - New IDE Layout
 * Uses the premium 3-column layout design
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import JoeIDELayout from '../components/JoeIDELayout';
import CommandComposer from '../components/CommandComposer';
import { useSessionStore } from '../store/sessionStore';
import { useSessionActions } from '../hooks/useSessionActions';
import { SocketService } from '../services/socket';
import { api } from '../services/apiClient';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp?: Date;
}

export default function JoePremium() {
    const nav = useNavigate();

    // Session store
    const {
        sessions,
        selected,
        loadAllSessions,
        setSelected,
    } = useSessionStore();

    const { createSession } = useSessionActions();

    // State
    // State
    // [WAKIL REFACTOR] Mode is always 'agent' now. Toggle removed.
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [workspaceTab, setWorkspaceTab] = useState<'browser' | 'terminal' | 'preview'>('terminal');
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [isConnected, setIsConnected] = useState(true);
    const [browserSessionId, setBrowserSessionId] = useState<string | null>(null);

    // Check auth
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            nav('/login');
            return;
        }
        loadAllSessions();
    }, []);

    // Socket subscription for auto-switching tabs
    useEffect(() => {
        const unsub = SocketService.subscribe((msg: any) => {
            // Connection status
            if (msg.type === 'connected') setIsConnected(true);
            if (msg.type === 'disconnected') setIsConnected(false);

            // Auto switch to terminal for command execution
            if (msg.type === 'tool_start' && msg.tool === 'run_command') {
                setWorkspaceTab('terminal');
            }
            if (msg.type === 'terminal_output') {
                setWorkspaceTab('terminal');
            }

            // Auto switch to browser for browser actions
            if (msg.type === 'tool_start' && (
                msg.tool.startsWith('browser_') ||
                msg.tool === 'open_page' ||
                msg.tool === 'click_element'
            )) {
                setWorkspaceTab('browser');
            }
            if (msg.type === 'browser_screenshot' || msg.type === 'browser_update') {
                setWorkspaceTab('browser');
            }

            // Handle messages (Legacy & New Events)
            if ((msg.type === 'message' || msg.type === 'user_input' || msg.type === 'text') &&
                (msg.sessionId === selected || msg.data?.sessionId === selected)) {

                const role = msg.type === 'user_input' ? 'user' : (msg.role || 'assistant');
                const content = msg.type === 'user_input' ? (typeof msg.data === 'string' ? msg.data : msg.data?.text || msg.data) : (msg.data?.text || msg.content);
                const id = msg.id || (msg.type === 'user_input' ? `msg-${msg.ts || Date.now()}` : `msg-${Date.now()}`);

                setMessages(prev => {
                    // Avoid duplicates
                    if (prev.some(m => m.id === id)) return prev;
                    return [...prev, {
                        id,
                        role,
                        content,
                        timestamp: new Date()
                    }];
                });

                if (role === 'assistant') {
                    setIsLoading(false);
                }
            }
        });
        return () => { unsub(); };
    }, [selected]);

    // Browser session ID
    useEffect(() => {
        const sessionId = selected;
        if (sessionId) {
            setBrowserSessionId(sessionId);
        }
    }, [selected]);

    // Load messages when session changes
    useEffect(() => {
        const sessionId = selected;
        if (!sessionId) {
            setMessages([]);
            return;
        }

        const loadMessages = async () => {
            try {
                // ELITE FIX: Use apiClient for consistent auth
                const data: any = await api.get(`/sessions/${sessionId}/messages`);

                // API returns 'events', map them to Message[]
                const validMessages = (data.events || []).flatMap((e: any) => {
                    if (e.type === 'user_input') {
                        return [{
                            id: e.id || `msg-${e.ts}`,
                            role: 'user',
                            content: typeof e.data === 'string' ? e.data : (e.data?.text || JSON.stringify(e.data)),
                            timestamp: new Date(e.ts || Date.now())
                        }];
                    }
                    if (e.type === 'text') {
                        return [{
                            id: e.id || `msg-${e.ts}`,
                            role: 'assistant',
                            content: e.data?.text || '',
                            timestamp: new Date(e.ts || Date.now())
                        }];
                    }
                    return [];
                });

                setMessages(validMessages as Message[]);
            } catch (e) {
                console.error('Failed to load messages:', e);
            }
        };

        loadMessages();
    }, [selected]);

    // Workspace Management
    const [workspaceId, setWorkspaceId] = useState<string | null>(null);

    const ensuresWorkspace = useCallback(async () => {
        try {
            // 1. Try to get existing workspaces
            const workspaces: any = await api.get('/workspaces');
            if (Array.isArray(workspaces) && workspaces.length > 0) {
                setWorkspaceId(workspaces[0]._id || workspaces[0].id);
                return workspaces[0]._id || workspaces[0].id;
            }

            // 2. If none, create one
            console.log('No workspace found, creating default...');
            const newWs: any = await api.post('/workspaces', { name: 'My Workspace' });
            if (newWs && (newWs._id || newWs.id)) {
                setWorkspaceId(newWs._id || newWs.id);
                return newWs._id || newWs.id;
            }
        } catch (e) {
            console.error('Failed to ensure workspace:', e);
        }
        return null;
    }, []);

    useEffect(() => {
        ensuresWorkspace();
    }, [ensuresWorkspace]);

    const handleSend = useCallback(async () => {
        if (!inputValue.trim() || isLoading) return;

        const sessionId = selected;
        if (!sessionId) {
            // Create new session
            await createSession();
            return;
        }

        const userMessage: Message = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: inputValue,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);

        try {
            // Ensure we have a workspace ID before sending
            let currentWorkspaceId = workspaceId;
            if (!currentWorkspaceId) {
                currentWorkspaceId = await ensuresWorkspace();
            }

            // ELITE FIX: Use /run/start to trigger AI processing
            await api.post('/run/start', {
                text: inputValue,
                sessionId,
                workspaceId: currentWorkspaceId // Pass workspace context
            });
        } catch (e) {
            console.error('Failed to send message:', e);
            setIsLoading(false);
        }
        setIsLoading(false);
    }, [inputValue, isLoading, selected, createSession, workspaceId, ensuresWorkspace]);



    // Theme toggle
    const handleThemeToggle = useCallback(() => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
        document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'light' : 'dark');
    }, [theme]);

    // Get user info
    const userInfo = (() => {
        try {
            const stored = localStorage.getItem('user');
            if (stored) return JSON.parse(stored);
        } catch { }
        return { name: 'User', avatar: '' };
    })();

    return (
        <JoeIDELayout
            // Mode removed (Unified Agent System)

            // User
            userAvatar={userInfo.avatar || userInfo.picture}
            userName={userInfo.name || userInfo.email}

            // Chat
            messages={messages}
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSend={handleSend}
            isLoading={isLoading}

            // Workspace
            workspaceTab={workspaceTab}
            onWorkspaceTabChange={setWorkspaceTab}
            browserSessionId={browserSessionId || undefined}
            terminalId={selected || undefined}

            // Session
            sessionId={selected || undefined}

            // Theme
            theme={theme}
            onThemeToggle={handleThemeToggle}

            // Connection
            isConnected={isConnected}
            branch="main"

            // Children - CommandComposer for chat input
            chatChildren={
                <CommandComposer
                    sessionId={selected || undefined}
                    hideHistory={true}
                    workspaceId={workspaceId}
                />
            }
        />
    );
}
