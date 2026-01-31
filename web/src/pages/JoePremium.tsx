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
import { API_URL as API } from '../config';

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
        agentSessions,
        selected,
        agentSelected,
        loadAllSessions,
        setSelected,
        setAgentSelected,
    } = useSessionStore();

    const { createSession } = useSessionActions();

    // State
    const [mode, setMode] = useState<'agent' | 'chat'>('chat');
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

            // Handle messages
            if (msg.type === 'message' && msg.sessionId === (mode === 'chat' ? selected : agentSelected)) {
                setMessages(prev => [...prev, {
                    id: msg.id || `msg-${Date.now()}`,
                    role: msg.role,
                    content: msg.content,
                    timestamp: new Date()
                }]);
                if (msg.role === 'assistant') {
                    setIsLoading(false);
                }
            }
        });
        return () => { unsub(); };
    }, [mode, selected, agentSelected]);

    // Browser session ID
    useEffect(() => {
        const sessionId = mode === 'agent' ? agentSelected : selected;
        if (sessionId) {
            setBrowserSessionId(sessionId);
        }
    }, [mode, selected, agentSelected]);

    // Load messages when session changes
    useEffect(() => {
        const sessionId = mode === 'chat' ? selected : agentSelected;
        if (!sessionId) {
            setMessages([]);
            return;
        }

        const loadMessages = async () => {
            const token = localStorage.getItem('token');
            if (!token) return;

            try {
                const res = await fetch(`${API}/sessions/${sessionId}/messages`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setMessages(data.messages?.map((m: any) => ({
                        id: m.id || m._id,
                        role: m.role,
                        content: m.content,
                        timestamp: new Date(m.createdAt || Date.now())
                    })) || []);
                }
            } catch (e) {
                console.error('Failed to load messages:', e);
            }
        };

        loadMessages();
    }, [mode, selected, agentSelected]);

    // Send message
    const handleSend = useCallback(async () => {
        if (!inputValue.trim() || isLoading) return;

        const sessionId = mode === 'chat' ? selected : agentSelected;
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

        const token = localStorage.getItem('token');
        try {
            await fetch(`${API}/sessions/${sessionId}/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ content: inputValue })
            });
        } catch (e) {
            console.error('Failed to send message:', e);
            setIsLoading(false);
        }
    }, [inputValue, isLoading, mode, selected, agentSelected, createSession]);

    // Mode change
    const handleModeChange = useCallback((newMode: 'agent' | 'chat') => {
        setMode(newMode);
        setMessages([]);
    }, []);

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
            // Mode
            mode={mode}
            onModeChange={handleModeChange}

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
            terminalId={selected || agentSelected || undefined}

            // Session
            sessionId={mode === 'chat' ? selected || undefined : agentSelected || undefined}

            // Theme
            theme={theme}
            onThemeToggle={handleThemeToggle}

            // Connection
            isConnected={isConnected}
            branch="main"

            // Children - CommandComposer for chat input
            chatChildren={
                <CommandComposer
                    sessionId={(mode === 'chat' ? selected : agentSelected) || undefined}
                />
            }
        />
    );
}
