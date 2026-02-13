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
import SettingsDialog from '../components/SettingsDialog';
import GitHubConnectDialog from '../components/GitHubConnectDialog';
import { githubService, GitHubRepo, GitHubUser, GitHubCommit } from '../services/githubService';
import { useTranslation } from 'react-i18next';

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
        agentSessions,
        agentSelected,
        loadAllSessions,
        setAgentSelected,
        deleteSession,
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
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isGitHubOpen, setIsGitHubOpen] = useState(false);
    const [ghUser, setGhUser] = useState<GitHubUser | null>(null);
    const [ghRepos, setGhRepos] = useState<GitHubRepo[]>([]);
    const [activeRepo, setActiveRepo] = useState<GitHubRepo | null>(null);
    const [ghCommits, setGhCommits] = useState<GitHubCommit[]>([]);
    const [ghConnected, setGhConnected] = useState(false);
    const [ghLoading, setGhLoading] = useState(false);

    const { i18n } = useTranslation();

    // Check auth
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            nav('/login');
            return;
        }
        loadAllSessions();

        // Check GitHub connection status
        githubService.getStatus().then((s) => {
            if (s.connected) {
                setGhConnected(true);
                setGhUser({ username: s.username!, avatarUrl: s.avatarUrl!, name: s.name! });
                githubService.listRepos().then(setGhRepos).catch(() => { });
            }
        }).catch(() => { });
    }, []);

    const handleRefreshGithub = useCallback(async () => {
        setGhLoading(true);
        try {
            const repos = await githubService.listRepos();
            setGhRepos(repos);
            if (activeRepo) {
                const commits = await githubService.getCommits(activeRepo.fullName.split('/')[0], activeRepo.name);
                setGhCommits(commits);
            }
        } catch (e) {
            console.error('Failed to refresh GitHub:', e);
        } finally {
            setGhLoading(false);
        }
    }, [activeRepo]);

    const handleSelectRepo = useCallback(async (repo: GitHubRepo) => {
        setActiveRepo(repo);
        setGhLoading(true);
        try {
            const commits = await githubService.getCommits(repo.fullName.split('/')[0], repo.name);
            setGhCommits(commits);
        } catch (e) {
            console.error('Failed to fetch commits:', e);
        } finally {
            setGhLoading(false);
        }
    }, []);

    const handleGitHubConnected = useCallback((user: GitHubUser) => {
        setGhConnected(true);
        setGhUser(user);
        githubService.listRepos().then(setGhRepos).catch(() => { });
    }, []);

    const handleDisconnectGitHub = useCallback(async () => {
        // Simple client-side disconnect for now. Server session persists.
        setGhConnected(false);
        setGhUser(null);
        setGhRepos([]);
        setActiveRepo(null);
        setGhCommits([]);
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
                (msg.sessionId === agentSelected || msg.data?.sessionId === agentSelected)) {

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

            // [Auto-Title] Handle new session titles and refreshes
            if (msg.type === 'sessions:refresh') {
                loadAllSessions();
            }
        });
        return () => { unsub(); };
    }, [agentSelected]);

    // Browser session ID
    useEffect(() => {
        const sessionId = agentSelected;
        if (sessionId) {
            setBrowserSessionId(`browser:${sessionId}`);
        }
    }, [agentSelected]);

    // Load messages when session changes
    useEffect(() => {
        const sessionId = agentSelected;
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
    }, [agentSelected]);

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

        const sessionId = agentSelected;
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
    }, [inputValue, isLoading, agentSelected, createSession, workspaceId, ensuresWorkspace]);

    const handleCreateSession = useCallback(async () => {
        await createSession();
    }, [createSession]);

    // Listen for errors from CommandComposer (since history is hidden there)
    const handleComposerMessages = useCallback((events: any[]) => {
        if (!events || events.length === 0) return;
        const last = events[events.length - 1];
        if (last.type === 'error') {
            const errorId = last.id || `err-${last.ts}`;
            const errorText = String(last.data || 'Unknown error');

            setMessages(prev => {
                // Avoid redundant error messages
                if (prev.some(m => m.id === errorId || m.content === errorText)) return prev;
                return [...prev, {
                    id: errorId,
                    role: 'assistant', // Display as assistant message but maybe style it?
                    content: `⚠️ Error: ${errorText}`,
                    timestamp: new Date(last.ts || Date.now())
                }];
            });
            setIsLoading(false);
        }
    }, []);

    // Theme synchronization
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const handleLangChange = useCallback((newLang: string) => {
        i18n.changeLanguage(newLang);
    }, [i18n]);

    // Get user info
    const userInfo = (() => {
        try {
            const stored = localStorage.getItem('user');
            if (stored) {
                const u = JSON.parse(stored);
                const fullName = u.name || u.email || 'User';
                // Extract first name for a more personal touch
                const firstName = fullName.split(' ')[0];
                return {
                    name: firstName,
                    avatar: u.picture || u.avatar || ''
                };
            }
        } catch { }
        return { name: 'User', avatar: '' };
    })();

    // Theme toggle (triggers sync effect)
    const toggleTheme = useCallback(() => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    }, []);

    // Transform sessions for SessionsBar
    const sessionsList = agentSessions.map(s => ({
        id: s.id,
        title: s.title,
        timestamp: new Date(), // We don't have this on session object yet
        isActive: s.id === agentSelected
    }));

    return (
        <JoeIDELayout
            // User
            userAvatar={userInfo.avatar}
            userName={userInfo.name}

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
            terminalId={agentSelected || undefined}

            // Session
            sessionId={agentSelected || undefined}
            sessions={sessionsList}
            onSelectSession={setAgentSelected}
            onDeleteSession={deleteSession}
            onNewSession={handleCreateSession}

            // Theme
            theme={theme}
            onThemeToggle={toggleTheme}
            onSettingsClick={() => setIsSettingsOpen(true)}

            // Connection
            isConnected={isConnected}
            branch="main"
            onGitChanges={() => setIsGitHubOpen(true)}

            // GitHub Integration
            githubUser={ghUser}
            githubRepos={ghRepos}
            activeRepo={activeRepo}
            githubCommits={ghCommits}
            onSelectRepo={handleSelectRepo}
            onRefreshGithub={handleRefreshGithub}
            onConnectGithub={() => setIsGitHubOpen(true)}
            onDisconnectGithub={handleDisconnectGitHub}
            onCreateRepo={() => setIsGitHubOpen(true)} // Open's connect/create flow
            githubLoading={ghLoading}

            // Children - CommandComposer for chat input
            chatChildren={
                <CommandComposer
                    sessionId={agentSelected || undefined}
                    sessionKind="agent"
                    hideHistory={true}
                    workspaceId={workspaceId}
                    onMessagesUpdate={handleComposerMessages}
                    githubConnected={ghConnected}
                    onGitClick={() => setIsGitHubOpen(true)}
                />
            }
        >
            <SettingsDialog
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                theme={theme}
                setTheme={setTheme}
                lang={i18n.language}
                setLang={handleLangChange}
            />
            <GitHubConnectDialog
                isOpen={isGitHubOpen}
                onClose={() => setIsGitHubOpen(false)}
                onConnected={handleGitHubConnected}
                onSelectRepo={handleSelectRepo}
            />
        </JoeIDELayout>
    );
}
