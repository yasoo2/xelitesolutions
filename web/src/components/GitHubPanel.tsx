/**
 * GitHubPanel - Premium sidebar panel for GitHub management
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
    Github,
    Plus,
    RefreshCw,
    LogOut,
    GitCommit,
    ChevronRight,
    Circle,
    FolderGit2,
    ExternalLink,
    ChevronLeft
} from 'lucide-react';
import { GitHubRepo, GitHubCommit, GitHubUser } from '../services/githubService';

interface GitHubPanelProps {
    user: GitHubUser | null;
    repos: GitHubRepo[];
    activeRepo: GitHubRepo | null;
    commits: GitHubCommit[];
    onSelectRepo: (repo: GitHubRepo) => void;
    onRefresh: () => void;
    onConnect: () => void;
    onDisconnect: () => void;
    onCreateRepo: () => void;
    onBackToFileExplorer: () => void;
    isLoading?: boolean;
}

export default function GitHubPanel({
    user,
    repos,
    activeRepo,
    commits,
    onSelectRepo,
    onRefresh,
    onConnect,
    onDisconnect,
    onCreateRepo,
    onBackToFileExplorer,
    isLoading = false
}: GitHubPanelProps) {
    const { t } = useTranslation();

    return (
        <aside className="joe-files-panel">
            {/* Header */}
            <div className="joe-files-header">
                <button
                    className="joe-files-action-btn"
                    onClick={onBackToFileExplorer}
                    title="Back to Files"
                >
                    <ChevronLeft size={16} />
                </button>
                <span className="joe-files-title">GitHub</span>
                <div className="joe-files-actions">
                    <button
                        className="joe-files-action-btn"
                        onClick={onCreateRepo}
                        title="Create Repository"
                    >
                        <Plus size={16} />
                    </button>
                    <button
                        className={`joe-files-action-btn ${isLoading ? 'animate-spin' : ''}`}
                        onClick={onRefresh}
                        title="Refresh"
                    >
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            <div className="joe-files-content" style={{ display: 'flex', flexDirection: 'column' }}>
                {/* User Status */}
                <div style={userStatusStyle}>
                    {user ? (
                        <>
                            <img src={user.avatarUrl} alt={user.username} style={avatarStyle} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {user.name || user.username}
                                </div>
                                <div style={{ fontSize: '11px', opacity: 0.6 }}>@{user.username}</div>
                            </div>
                            <button onClick={onDisconnect} style={logoutBtnStyle} title="Disconnect">
                                <LogOut size={14} />
                            </button>
                        </>
                    ) : (
                        <button onClick={onConnect} style={connectBtnStyle}>
                            <Github size={16} />
                            <span>{t('connectGitHub', 'Connect GitHub')}</span>
                        </button>
                    )}
                </div>

                {/* Repositories */}
                <div style={sectionHeaderStyle}>
                    <FolderGit2 size={14} />
                    <span>Repositories</span>
                    <span style={countBadgeStyle}>{repos.length}</span>
                </div>

                <div style={scrollAreaStyle}>
                    {repos.length === 0 ? (
                        <div style={emptyStateStyle}>No repositories found</div>
                    ) : (
                        repos.map(repo => (
                            <div
                                key={repo.id}
                                className={`elite-file-item ${activeRepo?.id === repo.id ? 'selected' : ''}`}
                                onClick={() => onSelectRepo(repo)}
                                style={{ padding: '6px 12px' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                                    <Circle size={8} fill={repo.private ? '#f59e0b' : '#10b981'} color="transparent" />
                                    <span className="elite-file-name" style={{ flex: 1 }}>{repo.name}</span>
                                    <a
                                        href={repo.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        style={{ opacity: 0.4 }}
                                    >
                                        <ExternalLink size={12} />
                                    </a>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Commits */}
                {activeRepo && (
                    <>
                        <div style={sectionHeaderStyle}>
                            <GitCommit size={14} />
                            <span>Commits: {activeRepo.name}</span>
                        </div>
                        <div style={{ ...scrollAreaStyle, flex: 1.5 }}>
                            {commits.length === 0 ? (
                                <div style={emptyStateStyle}>No recent commits</div>
                            ) : (
                                commits.map(commit => (
                                    <div key={commit.sha} style={commitItemStyle}>
                                        <div style={commitMsgStyle}>{commit.message}</div>
                                        <div style={commitMetaStyle}>
                                            <span style={commitShaStyle}>{commit.sha}</span>
                                            <span>•</span>
                                            <span>{commit.author}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>
        </aside>
    );
}

// ─── Styles ───
const userStatusStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)',
    marginBottom: '4px'
};

const avatarStyle: React.CSSProperties = {
    width: '32px', height: '32px', borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.1)'
};

const logoutBtnStyle: React.CSSProperties = {
    background: 'transparent', border: 'none', color: '#ef4444',
    cursor: 'pointer', opacity: 0.7, padding: '4px'
};

const connectBtnStyle: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    padding: '8px', borderRadius: '8px', background: 'var(--joe-gold-primary)',
    color: 'var(--joe-bg-primary)', border: 'none', fontWeight: 600, fontSize: '13px',
    cursor: 'pointer'
};

const sectionHeaderStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '12px 14px 8px', fontSize: '11px', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--joe-gold-primary)',
    opacity: 0.8
};

const countBadgeStyle: React.CSSProperties = {
    marginLeft: 'auto', background: 'rgba(255,255,255,0.05)',
    padding: '2px 6px', borderRadius: '4px', fontSize: '10px'
};

const scrollAreaStyle: React.CSSProperties = {
    flex: 1, overflowY: 'auto', padding: '4px 0'
};

const emptyStateStyle: React.CSSProperties = {
    padding: '20px', textAlign: 'center', fontSize: '12px', opacity: 0.4
};

const commitItemStyle: React.CSSProperties = {
    padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)'
};

const commitMsgStyle: React.CSSProperties = {
    fontSize: '12px', fontWeight: 500, marginBottom: '4px',
    display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
    overflow: 'hidden'
};

const commitMetaStyle: React.CSSProperties = {
    fontSize: '10px', opacity: 0.5, display: 'flex', gap: '6px'
};

const commitShaStyle: React.CSSProperties = {
    fontFamily: 'monospace', color: 'var(--joe-gold-primary)'
};
