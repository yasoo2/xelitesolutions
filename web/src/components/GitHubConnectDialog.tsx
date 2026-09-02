/**
 * GitHubConnectDialog - Premium dialog for connecting GitHub account
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Github, Key, CheckCircle, AlertCircle, Loader2, ExternalLink, Eye, EyeOff, X, LogOut } from 'lucide-react';
import { githubService, GitHubUser, GitHubRepo } from '../services/githubService';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConnected: (user: GitHubUser) => void;
    onSelectRepo?: (repo: GitHubRepo) => void;
    onDisconnect?: () => Promise<void> | void;
    /** A token-expired/revoked message from live use, shown as a reconnect banner. */
    tokenError?: string | null;
}

const GitHubConnectDialog: React.FC<Props> = ({ isOpen, onClose, onConnected, onSelectRepo, onDisconnect, tokenError }) => {
    const { t } = useTranslation();
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState<GitHubUser | null>(null);
    const [repos, setRepos] = useState<GitHubRepo[]>([]);
    const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
    const [repoLoading, setRepoLoading] = useState(false);
    const [showToken, setShowToken] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);

    if (!isOpen) return null;

    const handleConnect = async () => {
        if (!token.trim()) return;
        setLoading(true);
        setError('');
        setSuccess(null);
        try {
            const user = await githubService.connect(token.trim());
            setSuccess(user);
            onConnected(user);

            // Immediately fetch repos
            setRepoLoading(true);
            try {
                const fetchedRepos = await githubService.listRepos();
                setRepos(fetchedRepos);
            } catch (e) {
                console.error('Failed to fetch repos after connection', e);
            } finally {
                setRepoLoading(false);
            }
        } catch (e: any) {
            setError(e.message || 'Failed to connect');
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = () => {
        if (selectedRepoId && onSelectRepo) {
            const repo = repos.find(r => r.id === selectedRepoId);
            if (repo) onSelectRepo(repo);
        }
        onClose();
    };

    const handleDisconnect = async () => {
        if (!onDisconnect || disconnecting) return;
        if (!window.confirm(t('confirmGitHubDisconnect', 'Disconnect GitHub and remove the saved token from Joe?'))) return;
        setDisconnecting(true);
        setError('');
        try {
            await onDisconnect();
            setSuccess(null);
            setRepos([]);
            setSelectedRepoId(null);
            onClose();
        } catch (e: any) {
            setError(e?.message || t('githubDisconnectFailed', 'Could not disconnect GitHub.'));
        } finally {
            setDisconnecting(false);
        }
    };

    return (
        <div className="dialog-overlay" onClick={onClose} style={overlayStyle}>
            <div className="dialog-box" role="dialog" aria-modal="true" aria-labelledby="github-dialog-title" onClick={(e) => e.stopPropagation()} style={dialogStyle}>
                {/* Header */}
                <div style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={iconWrapStyle}>
                            <Github size={24} />
                        </div>
                        <div>
                            <h3 id="github-dialog-title" style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                                {t('connectGitHub', 'Connect GitHub')}
                            </h3>
                            {/* Live-use token failure (revoked/expired). Never
                                silent: the reason the panel emptied is stated here. */}
                            {tokenError && !success && (
                                <p style={{ margin: '6px 0 0', fontSize: '12.5px', color: '#f14c4c', fontWeight: 600, lineHeight: 1.5 }}>
                                    ⚠️ {tokenError}
                                </p>
                            )}
                            <p style={{ margin: '4px 0 0', fontSize: '13px', opacity: 0.6 }}>
                                {success ? t('selectRepoDesc', 'Choose the repository to sync') : t('connectGitHubDesc', 'Connect your account to build professional projects')}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('close', 'Close')}
                        title={t('close', 'Close')}
                        style={closeBtnStyle}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div style={bodyStyle}>
                    {success ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={successBoxStyle}>
                                <CheckCircle size={24} style={{ color: '#22c55e' }} />
                                <div>
                                    <p style={{ fontWeight: 600, fontSize: '14px', margin: '0' }}>
                                        {t('connectedAs', 'Connected as')}: {success.name || success.username}
                                    </p>
                                </div>
                            </div>

                            {onDisconnect && (
                                <button
                                    type="button"
                                    onClick={handleDisconnect}
                                    disabled={disconnecting}
                                    title={t('disconnect', 'Disconnect')}
                                    style={{ ...disconnectBtnStyle, opacity: disconnecting ? 0.6 : 1 }}
                                >
                                    {disconnecting ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <LogOut size={15} />}
                                    {disconnecting ? t('disconnecting', 'Disconnecting...') : t('disconnect', 'Disconnect')}
                                </button>
                            )}

                            <div style={{ maxHeight: 'min(240px, 32vh)', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px' }}>
                                {repoLoading ? (
                                    <div style={{ padding: '20px', textAlign: 'center' }}>
                                        <Loader2 size={24} className="animate-spin" style={{ opacity: 0.5 }} />
                                    </div>
                                ) : repos.length === 0 ? (
                                    <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5, fontSize: '13px' }}>
                                        {t('noReposFound', 'No repositories found')}
                                    </div>
                                ) : (
                                    repos.map(repo => (
                                        <button
                                            type="button"
                                            key={repo.id}
                                            onClick={() => setSelectedRepoId(repo.id)}
                                            role="radio"
                                            aria-checked={selectedRepoId === repo.id}
                                            aria-label={`${repo.fullName} — ${repo.private ? t('repoPrivate', 'Private') : t('repoPublic', 'Public')}`}
                                            style={{
                                                width: '100%',
                                                padding: '10px 14px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                background: selectedRepoId === repo.id ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                                                borderBottom: '1px solid rgba(255,255,255,0.03)',
                                                transition: 'all 0.2s',
                                                border: 0,
                                                color: 'inherit',
                                                textAlign: 'left'
                                            }}
                                        >
                                            <div style={{
                                                width: '16px', height: '16px', borderRadius: '50%',
                                                border: `2px solid ${selectedRepoId === repo.id ? '#6366f1' : 'rgba(255,255,255,0.2)'}`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                {selectedRepoId === repo.id && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6366f1' }} />}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '13px', fontWeight: 500 }}>{repo.name}</div>
                                                <div style={{ fontSize: '11px', opacity: 0.5 }}>{repo.fullName} · {repo.private ? `🔒 ${t('repoPrivate', 'Private')}` : `🌐 ${t('repoPublic', 'Public')}`}</div>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Instructions */}
                            <div style={instructionsStyle}>
                                <p style={{ margin: '0 0 8px', fontSize: '13px', opacity: 0.7 }}>
                                    {t('tokenInstructions', 'Create a Personal Access Token in your GitHub settings:')}
                                </p>
                                <p style={{ margin: '0 0 12px', fontSize: '12px', lineHeight: 1.55, opacity: 0.62 }}>
                                    {t('githubAccessPolicy', 'Public repositories can be read by URL without a token. A token is needed for private repositories, repository lists, cloning, or any change.')}
                                </p>
                                <a
                                    href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=Joe-AI-Agent"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={linkStyle}
                                >
                                    <ExternalLink size={14} />
                                    {t('createToken', 'Create a new token')}
                                </a>
                            </div>

                            {/* Token Input */}
                            <div style={{ position: 'relative' }}>
                                <Key size={16} style={{
                                    position: 'absolute', left: '14px', top: '50%',
                                    transform: 'translateY(-50%)', opacity: 0.4
                                }} />
                                <input
                                    type={showToken ? 'text' : 'password'}
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    aria-label={t('githubTokenLabel', 'GitHub personal access token')}
                                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                                    onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                                    style={{ ...inputStyle, paddingRight: '40px' }}
                                    autoFocus
                                />
                                <button
                                    onClick={() => setShowToken(!showToken)}
                                    style={{
                                        position: 'absolute',
                                        right: '12px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'rgba(255,255,255,0.4)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: 0
                                    }}
                                    title={showToken ? 'Hide Token' : 'Show Token'}
                                >
                                    {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>

                            {/* Error */}
                            {error && (
                                <div style={errorStyle}>
                                    <AlertCircle size={14} />
                                    {error}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={footerStyle}>
                    {success ? (
                        <button
                            onClick={handleConfirm}
                            disabled={!selectedRepoId}
                            style={{
                                ...connectBtnStyle,
                                opacity: !selectedRepoId ? 0.5 : 1
                            }}
                        >
                            {t('done', 'Done')}
                        </button>
                    ) : (
                        <>
                            <button onClick={onClose} style={cancelBtnStyle}>
                                {t('cancel', 'Cancel')}
                            </button>
                            <button
                                onClick={handleConnect}
                                disabled={!token.trim() || loading}
                                style={{
                                    ...connectBtnStyle,
                                    opacity: (!token.trim() || loading) ? 0.5 : 1
                                }}
                            >
                                {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                                {loading ? t('connecting', 'Connecting...') : t('connect', 'Connect account')}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Styles ───
const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const dialogStyle: React.CSSProperties = {
    background: 'var(--bg-secondary, #1e1e2e)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px', width: '440px', maxWidth: '90vw',
    maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
    overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
    padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
};

const closeBtnStyle: React.CSSProperties = {
    width: '32px', height: '32px', padding: 0, borderRadius: '8px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'inherit', cursor: 'pointer', opacity: 0.75,
};

const iconWrapStyle: React.CSSProperties = {
    width: '44px', height: '44px', borderRadius: '12px',
    background: 'linear-gradient(135deg, #333, #555)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const bodyStyle: React.CSSProperties = {
    padding: '24px',
    overflowY: 'auto',
    minHeight: 0,
};

const instructionsStyle: React.CSSProperties = {
    marginBottom: '16px',
};

const linkStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    color: '#818cf8', fontSize: '13px', textDecoration: 'none',
};

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px 12px 40px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px', color: 'inherit',
    fontSize: '14px', fontFamily: 'monospace',
    outline: 'none', boxSizing: 'border-box',
};

const errorStyle: React.CSSProperties = {
    marginTop: '12px', padding: '10px 14px', borderRadius: '8px',
    background: 'rgba(239,68,68,0.1)', color: '#f87171',
    fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px',
};

const successBoxStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '16px',
    padding: '20px', borderRadius: '12px',
    background: 'rgba(34,197,94,0.08)',
    border: '1px solid rgba(34,197,94,0.2)',
};

const footerStyle: React.CSSProperties = {
    padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', justifyContent: 'flex-end', gap: '10px',
    flexShrink: 0,
    background: 'var(--bg-secondary, #1e1e2e)',
};

const disconnectBtnStyle: React.CSSProperties = {
    alignSelf: 'flex-start', padding: '8px 12px', borderRadius: '8px',
    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)',
    color: '#fca5a5', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
    display: 'inline-flex', alignItems: 'center', gap: '7px',
};

const cancelBtnStyle: React.CSSProperties = {
    padding: '10px 20px', borderRadius: '8px', fontSize: '13px',
    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
    color: 'inherit', cursor: 'pointer',
};

const connectBtnStyle: React.CSSProperties = {
    padding: '10px 24px', borderRadius: '8px', fontSize: '13px',
    background: 'linear-gradient(135deg, #6366f1, #818cf8)',
    border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600,
    display: 'flex', alignItems: 'center', gap: '8px',
};

export default GitHubConnectDialog;
