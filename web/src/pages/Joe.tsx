/**
 * Joe IDE - Unified Interface
 * Comprehensive AI development environment
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import JoeIDELayout from '../components/JoeIDELayout';
import { ErrorBoundary } from '../components/ErrorBoundary';
import CommandComposer from '../components/CommandComposer';
import { useSessionStore } from '../store/sessionStore';
import { useSessionActions } from '../hooks/useSessionActions';
import { SocketService } from '../services/socket';
import { api } from '../services/apiClient';
import SettingsDialog from '../components/SettingsDialog';
import GitHubConnectDialog from '../components/GitHubConnectDialog';
import ProjectOnboardingModal from '../components/ProjectOnboardingModal';
import DepartmentStatusCard from '../components/DepartmentStatusCard';
import { githubService, GitHubRepo, GitHubUser, GitHubCommit } from '../services/githubService';
import { useTranslation } from 'react-i18next';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp?: Date;
}

export default function Joe() {
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
        loadFolders,
        deleteSession,
        deleteAllSessions
    } = useSessionStore();

    // Determine active session
    const activeSessionId = agentSelected || selected || undefined;
    const activeSessionKind = agentSelected ? 'agent' : (selected ? 'chat' : 'agent');

    const { createSession } = useSessionActions();

    // State
    // State
    // [WAKIL REFACTOR] Mode is always 'agent' now. Toggle removed.
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [workspaceTab, setWorkspaceTab] = useState<'browser' | 'terminal' | 'preview' | 'logs' | 'problems'>('terminal');
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
    const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
    const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
    const [workspace, setWorkspace] = useState<any>(null);
    const [userRole, setUserRole] = useState<string | undefined>(undefined);
    // Live "engineering company" department pipeline (BA -> Architect -> Dev -> QA -> Delivered)
    const [departmentStatus, setDepartmentStatus] = useState<any>(null);

    const { t, i18n } = useTranslation();

    useEffect(() => {
        const token = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');

        let role: string | undefined = undefined;
        let email: string | undefined = undefined;

        if (token) {
            try {
                const decoded: any = jwtDecode(token);
                role = decoded.role;
                email = decoded.email;
            } catch { }
        }

        if (!email && storedUser) {
            try {
                const u = JSON.parse(storedUser);
                email = u.email;
            } catch { }
        }

        // Hard override for the owners
        const ownerEmails = ['info.auraaluxury@gmail.com', 'younes.sowady2011@gmail.com'];
        if (email && ownerEmails.includes(email.toLowerCase().trim())) {
            role = 'SUPER_ADMIN';
            localStorage.setItem('admin', 'true');
        }

        setUserRole(role);
    }, [t, nav]);

    const handleLogout = useCallback(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('admin');
        nav('/login');
    }, [nav]);

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

            const triggerUncollapse = () => {
                window.dispatchEvent(new CustomEvent('joe:workspace-uncollapse'));
            };

            // [FIX] The backend emits 'tool_started' / 'step_started' (NOT 'tool_start'),
            // and the tool NAME lives in msg.data.tool or msg.data.name ('execute:<tool>'),
            // not msg.tool. Extract it robustly so the panels auto-open correctly.
            const isToolStart = msg.type === 'tool_start' || msg.type === 'tool_started' || msg.type === 'step_started';
            const toolName: string = msg.tool
                || msg.data?.tool
                || (typeof msg.data?.name === 'string' ? msg.data.name.replace(/^execute:/, '') : '')
                || (typeof msg.data?.tool?.name === 'string' ? msg.data.tool.name : '');

            // Auto switch to terminal for command execution
            if ((isToolStart && ['run_command', 'shell_execute', 'terminal_manager', 'npm_manager', 'npm_install', 'npm_build'].includes(toolName))) {
                setWorkspaceTab('terminal');
                triggerUncollapse();
            }
            if (msg.type === 'terminal_output') {
                setWorkspaceTab('terminal');
                triggerUncollapse();
            }

            // Auto switch to browser for browser actions
            if (isToolStart && (toolName.startsWith('browser_') || toolName === 'open_page' || toolName === 'click_element')) {
                setWorkspaceTab('browser');
                triggerUncollapse();
            }
            if (msg.type === 'browser_screenshot' || msg.type === 'browser_update' || msg.type === 'browser_started' || msg.type === 'browser_opened') {
                setWorkspaceTab('browser');
                triggerUncollapse();
            }

            // Auto switch to preview for build / page tools
            if (isToolStart && ['dev_server', 'dev_server_start', 'website_full_pipeline', 'scaffold_project', 'scaffold_full_stack', 'web_page_builder'].includes(toolName)) {
                setWorkspaceTab('preview');
                triggerUncollapse();
            }

            // [AUTO-PREVIEW] Handle preview_ready event specifically
            if (msg.type === 'preview_ready') {
                const url = msg.data?.url || msg.data?.previewUrl;
                if (url && typeof url === 'string') {
                    // Only auto-switch to preview for local/internal proxy URLs
                    const isInternal = url.includes('localhost') ||
                        url.includes('127.0.0.1') ||
                        url.includes('xelitesolutions.com/preview/') ||
                        url.includes('http://api:');

                    if (isInternal) {
                        setPreviewUrl(url);
                        setWorkspaceTab('preview');
                        triggerUncollapse();
                    }
                }
            }

            // [AUTO-PREVIEW] Capture URL from tool results
            if (msg.type === 'step_done' && msg.data?.result?.ok) {
                const toolName = msg.tool;
                const output = msg.data.result.output;
                const url = output?.url || output?.previewUrl || output?.localhost || output?.userPreviewUrl;

                if (url && typeof url === 'string') {
                    // Only update preview if it's a known "builder" tool or an internal URL
                    const safeTools = [
                        'dev_server_start',
                        'website_full_pipeline',
                        'scaffold_full_stack',
                        'deploy_project',
                        'scaffold_project'
                    ];

                    const isSafeTool = safeTools.includes(toolName || '');
                    const isInternal = url.includes('localhost') ||
                        url.includes('127.0.0.1') ||
                        url.includes('xelitesolutions.com/preview/') ||
                        url.includes('http://api:');

                    if (isSafeTool || isInternal) {
                        setPreviewUrl(url);
                        // Also switch to preview tab if we got a fresh URL
                        setWorkspaceTab('preview');
                        triggerUncollapse();
                    }
                }
            }

            // [DEPARTMENTS] Live pipeline card (BA -> Architect -> Dev -> QA -> Delivered)
            if (msg.type === 'department_status' &&
                (msg.sessionId === activeSessionId || msg.data?.sessionId === activeSessionId)) {
                setDepartmentStatus(msg.data);
            }

            // Handle message finishing
            if (msg.type === 'run_finished' || msg.type === 'step_failed') {
                setIsLoading(false);
                // Clear the department card shortly after the run ends.
                setTimeout(() => setDepartmentStatus(null), 4000);
            }

            // Handle workspace root updates from the agent
            if (msg.type === 'workspace_updated') {
                // Also trigger an uncollapse to ensure the file explorer is visible
                triggerUncollapse();
            }

            // Handle messages (Legacy & New Events)
            if ((msg.type === 'message' || msg.type === 'user_input' || msg.type === 'text') &&
                (msg.sessionId === activeSessionId || msg.data?.sessionId === activeSessionId)) {

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
    }, [activeSessionId]);

    // [AUTO-SWITCH] Listen for workspace tab switch from CommandComposer SSE events
    useEffect(() => {
        const handler = (e: Event) => {
            const tab = (e as CustomEvent)?.detail?.tab;
            if (tab === 'browser' || tab === 'terminal' || tab === 'preview') {
                setWorkspaceTab(tab);
                window.dispatchEvent(new CustomEvent('joe:workspace-uncollapse'));
            }
        };
        window.addEventListener('joe:workspace-tab-switch', handler);
        return () => window.removeEventListener('joe:workspace-tab-switch', handler);
    }, []);

    // Browser session ID
    useEffect(() => {
        const sessionId = activeSessionId;
        if (sessionId) {
            setBrowserSessionId(`browser:${sessionId}`);
        }
    }, [activeSessionId]);

    // Load messages when session changes
    useEffect(() => {
        const sessionId = activeSessionId;
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

                // Do NOT wipe the on-screen conversation when the server has no
                // persisted history for this session (offline/JSON mode, or a brand
                // new session). Otherwise the message the user just sent — and Joe's
                // streamed reply — disappear, leaving only Joe's answer.
                if (validMessages.length > 0) {
                    setMessages(validMessages as Message[]);
                }
            } catch {
                // Silently handle message load failures
            }
        };

        loadMessages();
    }, [activeSessionId]);

    // Workspace Management
    const [workspaceId, setWorkspaceId] = useState<string | null>(null);

    const ensuresWorkspace = useCallback(async () => {
        try {
            // 1. Try to get existing workspaces
            const workspaces: any = await api.get('/workspaces');
            if (Array.isArray(workspaces) && workspaces.length > 0) {
                const ws = workspaces[0];
                const wsId = ws._id || ws.id;
                setWorkspaceId(wsId);
                setWorkspace(ws);

                // Auto-open onboarding if PROJECT NOT INITIALIZED
                if (!ws.projectInitialized) {
                    setIsOnboardingOpen(true);
                }

                return wsId;
            }

            // 2. If none, create one
            const newWs: any = await api.post('/workspaces', { name: 'My Workspace' });
            if (newWs && (newWs._id || newWs.id)) {
                const wsId = newWs._id || newWs.id;
                setWorkspaceId(wsId);
                setWorkspace(newWs);
                setIsOnboardingOpen(true);
                return wsId;
            }
        } catch {
            // Silently handle workspace errors
        }
        return null;
    }, []);

    const handleSelectLocal = useCallback(async () => {
        if (!workspaceId) return;
        try {
            await api.put(`/workspaces/${workspaceId}`, {
                kind: 'local',
                projectInitialized: true
            });
            setIsOnboardingOpen(false);

            // Reload workspace
            const updated: any = await api.get(`/workspaces/${workspaceId}`);
            setWorkspace(updated);

            // Immediate AI Welcome Message for Local
            setMessages(prev => [...prev, {
                id: `sys-${Date.now()}`,
                role: 'assistant',
                content: '✨ **مشروع محلي جديد جاهز!**\n\nلقد قمت بإعداد بيئة العمل المحلية بنجاح. يمكنك الآن البدء في بناء تطبيقك، إنشاء ملفات، أو طلب مساعدتي في أي مهمة برمجية.'
            }]);
        } catch {
            // Silently handle local project init errors
        }
    }, [workspaceId]);

    const handleSelectGitHub = useCallback(() => {
        // We keep the modal open but swap it for the GitHub dialog 
        // OR close and open GitHub. Let's close and open to avoid overlay stack.
        setIsOnboardingOpen(false);
        setTimeout(() => setIsGitHubOpen(true), 300); // Smooth transition
    }, []);


    // Also update projectInitialized when GitHub is connected and repo is selected
    useEffect(() => {
        if (ghConnected && activeRepo && workspaceId && workspace && !workspace.projectInitialized) {
            api.put(`/workspaces/${workspaceId}`, {
                projectInitialized: true,
                kind: 'github'
            }).then(() => {
                // Refresh workspace
                api.get(`/workspaces/${workspaceId}`).then(setWorkspace);

                setMessages(prev => [...prev, {
                    id: `sys-${Date.now()}`,
                    role: 'assistant',
                    content: `🔗 **تم ربط مستودع GitHub بنجاح!**\n\nلقد قمت بربط المشروع بـ **${activeRepo.fullName}**. سأقوم الآن بمزامنة الملفات ومساعدتك في التطوير الاحترافي.`
                }]);
            });
        }
    }, [ghConnected, activeRepo, workspaceId, workspace]);


    useEffect(() => {
        ensuresWorkspace();
    }, [ensuresWorkspace]);

    // Check auth and GitHub Persistence
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            nav('/login');
            return;
        }

        // [ELITE FIX] Eager connection initialization
        SocketService.connect();

        loadAllSessions();

        const initGithub = async () => {
            // Wait for workspaceId if needed
            let wsId = workspaceId;
            if (!wsId) {
                wsId = await ensuresWorkspace();
            }

            try {
                const s = await githubService.getStatus(wsId || undefined);
                if (s.connected) {
                    setGhConnected(true);
                    setGhUser({ username: s.username!, avatarUrl: s.avatarUrl!, name: s.name! });
                    const repos = await githubService.listRepos();
                    setGhRepos(repos);

                    if (s.activeRepo) {
                        const found = repos.find(r => r.fullName === s.activeRepo);
                        if (found) {
                            setActiveRepo(found);
                            setGhLoading(true);
                            githubService.getCommits(found.fullName.split('/')[0], found.name)
                                .then(setGhCommits)
                                .catch(() => { })
                                .finally(() => setGhLoading(false));
                        }
                    }
                }
            } catch {
                // GitHub init not available
            }
        };

        if (workspaceId) {
            initGithub();
        }
    }, [workspaceId, ensuresWorkspace]);

    const handleRefreshGithub = useCallback(async () => {
        setGhLoading(true);
        try {
            const repos = await githubService.listRepos();
            setGhRepos(repos);
            if (activeRepo) {
                const commits = await githubService.getCommits(activeRepo.fullName.split('/')[0], activeRepo.name);
                setGhCommits(commits);
            }
        } catch {
            // GitHub refresh failed silently
        } finally {
            setGhLoading(false);
        }
    }, [activeRepo]);

    const handleSelectRepo = useCallback(async (repo: GitHubRepo) => {
        setActiveRepo(repo);
        setGhLoading(true);

        // Persist selection
        if (workspaceId) {
            githubService.setActiveRepo(workspaceId, repo.fullName).catch(() => {});
        }

        try {
            const commits = await githubService.getCommits(repo.fullName.split('/')[0], repo.name);
            setGhCommits(commits);
        } catch {
            // Commits fetch failed silently
        } finally {
            setGhLoading(false);
        }
    }, [workspaceId]);

    const handleSend = useCallback(async () => {
        if (!inputValue.trim() || isLoading) return;

        let targetSessionId = activeSessionId;
        let kind: 'chat' | 'agent' = activeSessionKind;

        if (!targetSessionId) {
            try {
                const data: any = await api.post('/sessions', { kind: 'agent' });
                targetSessionId = data?.id || data?._id;
                kind = 'agent';
                if (targetSessionId) {
                    setAgentSelected(targetSessionId);
                    await loadAllSessions();
                }
            } catch {
                return;
            }
        }

        if (!targetSessionId) return;

        const messageText = inputValue;
        const userMessage: Message = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: messageText,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);

        try {
            let currentWorkspaceId = workspaceId;
            if (!currentWorkspaceId) {
                currentWorkspaceId = await ensuresWorkspace();
            }

            if (kind === 'agent') {
                await api.post('/run/start', {
                    text: messageText,
                    sessionId: targetSessionId,
                    workspaceId: currentWorkspaceId
                });
            } else {
                await SocketService.sendMessage(targetSessionId, messageText);
            }
        } catch {
            setInputValue(messageText);
        } finally {
            setIsLoading(false);
        }
    }, [inputValue, isLoading, activeSessionId, activeSessionKind, workspaceId, ensuresWorkspace, loadAllSessions, setAgentSelected]);

    const handleCreateSession = useCallback(async () => {
        await createSession({ kind: 'agent' });
    }, [createSession]);

    // Listen for errors from CommandComposer (since history is hidden there)
    const handleComposerMessages = useCallback((events: any[]) => {
        if (!events || events.length === 0) return;
        const last = events[events.length - 1];
        if (last.type === 'error') {
            const errorId = last.id || `err-${last.ts}`;
            let errorText = 'Unknown error';
            if (typeof last.data === 'string') {
                errorText = last.data;
            } else if (last.data) {
                errorText = last.data.result?.error || last.data.result?.message || last.data.error || last.data.message || 'Unknown error';
                if (typeof errorText === 'object') errorText = JSON.stringify(errorText);
            }

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
                    avatar: u.picture || u.avatar || '',
                    email: u.email || ''
                };
            }
        } catch { }
        return { name: 'User', avatar: '', email: '' };
    })();

    // Theme toggle (triggers sync effect)
    const toggleTheme = useCallback(() => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    }, []);

    // Transform sessions for SessionsBar (Unified)
    const sessionsList = [...agentSessions, ...sessions].map(s => ({
        id: s.id,
        title: s.title,
        timestamp: new Date(),
        isActive: s.id === activeSessionId
    }));

    return (
        <ErrorBoundary fallbackTitle="تعذر تحميل Joe IDE بالكامل">
            <JoeIDELayout
                // ... props ...
                userAvatar={userInfo.avatar}
                userName={userInfo.name}
                userEmail={userInfo.email}
                userRole={userRole}
                // ...rest of props...
                messages={messages}
                inputValue={inputValue}
                onInputChange={setInputValue}
                onSend={handleSend}
                isLoading={isLoading}
                workspaceTab={workspaceTab}
                onWorkspaceTabChange={setWorkspaceTab}
                onDeploymentsClick={() => nav('/super-admin/deployments')}
                onSystemClick={() => nav('/super-admin/system')}
                browserSessionId={browserSessionId || undefined}
                terminalId={activeSessionId}
                workspaceId={workspaceId || undefined}
                previewUrl={previewUrl}
                sessionId={activeSessionId}
                sessionKind={activeSessionKind}
                sessions={sessionsList}
                onSelectSession={(id) => {
                    const isAgent = agentSessions.some(s => s.id === id);
                    if (isAgent) {
                        setAgentSelected(id);
                        setSelected(null);
                    } else {
                        setSelected(id);
                        setAgentSelected(null);
                    }
                }}
                onDeleteSession={deleteSession}
                onDeleteAllSessions={deleteAllSessions}
                onNewSession={handleCreateSession}
                theme={theme}
                onThemeToggle={toggleTheme}
                onSettingsClick={() => setIsSettingsOpen(true)}
                onNewProject={() => setIsOnboardingOpen(true)}
                isConnected={isConnected}
                branch="main"
                onGitChanges={() => {
                    if (!ghConnected) setIsGitHubOpen(true);
                }}
                githubUser={ghUser}
                githubRepos={ghRepos}
                activeRepo={activeRepo}
                githubCommits={ghCommits}
                onSelectRepo={handleSelectRepo}
                onRefreshGithub={handleRefreshGithub}
                onConnectGithub={() => setIsGitHubOpen(true)}
                onDisconnectGithub={handleDisconnectGitHub}
                onCreateRepo={() => setIsGitHubOpen(true)}
                githubLoading={ghLoading}
                chatChildren={
                    <>
                        <DepartmentStatusCard
                            status={departmentStatus}
                            isArabic={String(i18n.language || '').startsWith('ar')}
                        />
                        <CommandComposer
                            sessionId={activeSessionId}
                            sessionKind={activeSessionKind}
                            hideHistory={true}
                            workspaceId={workspaceId}
                            onMessagesUpdate={handleComposerMessages}
                            githubConnected={ghConnected}
                            onGitClick={() => setIsGitHubOpen(true)}
                        />
                    </>
                }
            >
                <SettingsDialog
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    theme={theme}
                    setTheme={setTheme}
                    lang={i18n.language}
                    setLang={handleLangChange}
                    onLogout={handleLogout}
                />
                <GitHubConnectDialog
                    isOpen={isGitHubOpen}
                    onClose={() => setIsGitHubOpen(false)}
                    onConnected={handleGitHubConnected}
                    onSelectRepo={handleSelectRepo}
                />
                <ProjectOnboardingModal
                    isOpen={isOnboardingOpen}
                    onClose={() => setIsOnboardingOpen(false)}
                    onSelectLocal={handleSelectLocal}
                    onSelectGitHub={handleSelectGitHub}
                />
            </JoeIDELayout>
        </ErrorBoundary>
    );
}
