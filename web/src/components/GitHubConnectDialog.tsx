/**
 * GitHubConnectDialog - Premium dialog for connecting GitHub account
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Github, Key, CheckCircle, AlertCircle, Loader2, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { githubService, GitHubUser, GitHubRepo } from '../services/githubService';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConnected: (user: GitHubUser) => void;
    onSelectRepo?: (repo: GitHubRepo) => void;
    /** A token-expired/revoked message from live use, shown as a reconnect banner. */
    tokenError?: string | null;
}

const GitHubConnectDialog: React.FC<Props> = ({ isOpen, onClose, onConnected, onSelectRepo, tokenError }) => {
    const { t } = useTranslation();
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState<GitHubUser | null>(null);
    const [repos, setRepos] = useState<GitHubRepo[]>([]);
    const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
    const [repoLoading, setRepoLoading] = useState(false);
    const [showToken, setShowToken] = useState(false);

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

    return (
        <div className="dialog-overlay" onClick={onClose} style={overlayStyle}>
            <div className="dialog-box" onClick={(e) => e.stopPropagation()} style={dialogStyle}>
                {/* Header */}
                <div style={headerStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={iconWrapStyle}>
                            <Github size={24} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
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

                            <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px' }}>
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
                                        <div
                                            key={repo.id}
                                            onClick={() => setSelectedRepoId(repo.id)}
                                            style={{
                                                padding: '10px 14px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                background: selectedRepoId === repo.id ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                                                borderBottom: '1px solid rgba(255,255,255,0.03)',
                                                transition: 'all 0.2s'
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
                                                <div style={{ fontSize: '11px', opacity: 0.5 }}>{repo.private ? `🔒 ${t('repoPrivate', 'Private')}` : `🌐 ${t('repoPublic', 'Public')}`}</div>
                                            </div>
                                        </div>
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
                    <button onClick={onClose} style={cancelBtnStyle}>
                        {success ? t('cancel', 'Cancel') : t('cancel', 'Cancel')}
                    </button>
                    {success ? (
                        <button
                            onClick={handleConfirm}
                            disabled={!selectedRepoId}
                            style={{
                                ...connectBtnStyle,
                                opacity: !selectedRepoId ? 0.5 : 1
                            }}
                        >
                            {t('confirmAndOpen', 'Confirm and open')}
                        </button>
                    ) : (
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
    boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
    overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
    padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
};

const iconWrapStyle: React.CSSProperties = {
    width: '44px', height: '44px', borderRadius: '12px',
    background: 'linear-gradient(135deg, #333, #555)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const bodyStyle: React.CSSProperties = {
    padding: '24px',
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
