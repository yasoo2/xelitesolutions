/**
 * GitHubConnectDialog - Premium dialog for connecting GitHub account
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Github, Key, CheckCircle, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { githubService, GitHubUser } from '../services/githubService';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onConnected: (user: GitHubUser) => void;
}

const GitHubConnectDialog: React.FC<Props> = ({ isOpen, onClose, onConnected }) => {
    const { t } = useTranslation();
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState<GitHubUser | null>(null);

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
        } catch (e: any) {
            setError(e.message || 'Failed to connect');
        } finally {
            setLoading(false);
        }
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
                                {t('connectGitHub', 'ربط GitHub')}
                            </h3>
                            <p style={{ margin: '4px 0 0', fontSize: '13px', opacity: 0.6 }}>
                                {t('connectGitHubDesc', 'اربط حسابك لإنشاء مشاريع احترافية')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div style={bodyStyle}>
                    {success ? (
                        <div style={successBoxStyle}>
                            <CheckCircle size={40} style={{ color: '#22c55e' }} />
                            <div>
                                <p style={{ fontWeight: 600, fontSize: '15px', margin: '0 0 4px' }}>
                                    {t('connected', 'تم الربط بنجاح!')}
                                </p>
                                <p style={{ margin: 0, opacity: 0.7, fontSize: '13px' }}>
                                    @{success.username}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Instructions */}
                            <div style={instructionsStyle}>
                                <p style={{ margin: '0 0 8px', fontSize: '13px', opacity: 0.7 }}>
                                    {t('tokenInstructions', 'أنشئ Personal Access Token من إعدادات GitHub:')}
                                </p>
                                <a
                                    href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=Joe-AI-Agent"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={linkStyle}
                                >
                                    <ExternalLink size={14} />
                                    {t('createToken', 'إنشاء Token جديد')}
                                </a>
                            </div>

                            {/* Token Input */}
                            <div style={{ position: 'relative' }}>
                                <Key size={16} style={{
                                    position: 'absolute', left: '14px', top: '50%',
                                    transform: 'translateY(-50%)', opacity: 0.4
                                }} />
                                <input
                                    type="password"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                                    onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                                    style={inputStyle}
                                    autoFocus
                                />
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
                        {success ? t('done', 'تم') : t('cancel', 'إلغاء')}
                    </button>
                    {!success && (
                        <button
                            onClick={handleConnect}
                            disabled={!token.trim() || loading}
                            style={{
                                ...connectBtnStyle,
                                opacity: (!token.trim() || loading) ? 0.5 : 1
                            }}
                        >
                            {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                            {loading ? t('connecting', 'جاري الربط...') : t('connect', 'ربط الحساب')}
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
