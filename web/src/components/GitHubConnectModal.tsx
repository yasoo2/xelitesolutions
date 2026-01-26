import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Github, Loader2, Link, CheckCircle2, AlertCircle, X, Lock } from 'lucide-react';
import { API_URL } from '../config';

interface GitHubConnectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConnected?: (repoName: string) => void;
}

export const GitHubConnectModal: React.FC<GitHubConnectModalProps> = ({ isOpen, onClose, onConnected }) => {
    const [url, setUrl] = useState('');
    const [token, setToken] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [step, setStep] = useState<'idle' | 'cloning' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const handleConnect = async () => {
        if (!url) return;
        setStep('cloning');
        setErrorMsg('');

        try {
            const authToken = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/project/git/clone`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ repoUrl: url, token: token || undefined })
            });

            const data = await res.json();

            if (res.ok) {
                setStep('success');
                setTimeout(() => {
                    onClose();
                    onConnected?.(data.path.split('/').pop());
                    setStep('idle');
                    setUrl('');
                    setToken('');
                    setIsPrivate(false);
                }, 1500);
            } else {
                setStep('error');
                setErrorMsg(data.error || 'Failed to clone repository');
            }
        } catch (e: any) {
            setStep('error');
            setErrorMsg(e.message || 'Connection failed');
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)'
        }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                style={{
                    background: 'var(--surface-color, #1e1e1e)',
                    border: '1px solid var(--border-color, #333)',
                    borderRadius: '16px',
                    width: '440px',
                    maxWidth: '90vw',
                    padding: '24px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    position: 'relative',
                    overflow: 'hidden'
                }}
            >
                {/* Header */}
                <div style={{ marginBottom: '24px', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '10px',
                            background: '#24292e', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            color: 'white'
                        }}>
                            <Github size={24} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Connect Repository</h2>
                            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', opacity: 0.8 }}>
                                Import any public or private GitHub repo
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            position: 'absolute', top: 0, right: 0,
                            background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* URL Input */}
                    <div style={{ position: 'relative' }}>
                        <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>Repository URL</label>
                        <div style={{ position: 'relative' }}>
                            <Link
                                size={16}
                                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}
                            />
                            <input
                                autoFocus
                                value={url}
                                onChange={e => setUrl(e.target.value)}
                                placeholder="https://github.com/username/repo.git"
                                style={{
                                    width: '100%',
                                    padding: '10px 12px 10px 36px',
                                    background: 'var(--bg-secondary, #111)',
                                    border: '1px solid var(--border-color, #333)',
                                    borderRadius: '8px',
                                    color: 'var(--text-primary)',
                                    outline: 'none',
                                    fontSize: '14px'
                                }}
                            />
                        </div>
                    </div>

                    {/* Private Repo Toggle & Token */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isPrivate ? 12 : 0 }}>
                            <input
                                type="checkbox"
                                id="private_toggle"
                                checked={isPrivate}
                                onChange={e => setIsPrivate(e.target.checked)}
                                style={{ accentColor: 'var(--accent-primary)' }}
                            />
                            <label htmlFor="private_toggle" style={{ fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                                This is a Private Repository (requires Token)
                            </label>
                        </div>

                        <AnimatePresence>
                            {isPrivate && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    style={{ overflow: 'hidden' }}
                                >
                                    <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                                        Personal Access Token (Classic or Fine-grained)
                                    </label>
                                    <div style={{ position: 'relative', marginBottom: 4 }}>
                                        <Lock
                                            size={16}
                                            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }}
                                        />
                                        <input
                                            type="password"
                                            value={token}
                                            onChange={e => setToken(e.target.value)}
                                            placeholder="ghp_xxxxxxxxxxxx"
                                            style={{
                                                width: '100%',
                                                padding: '10px 12px 10px 36px',
                                                background: 'var(--bg-secondary, #111)',
                                                border: '1px solid var(--border-color, #333)',
                                                borderRadius: '8px',
                                                color: 'var(--text-primary)',
                                                outline: 'none',
                                                fontSize: '14px'
                                            }}
                                        />
                                    </div>
                                    <a
                                        href="https://github.com/settings/tokens"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ fontSize: 11, color: 'var(--accent-primary)', textDecoration: 'none', marginLeft: 4 }}
                                    >
                                        Generate a token on GitHub &rarr;
                                    </a>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <AnimatePresence mode="wait">
                        {step === 'error' && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                style={{
                                    color: '#ff4444', fontSize: '13px',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    background: 'rgba(255, 68, 68, 0.1)', padding: '8px', borderRadius: '6px'
                                }}
                            >
                                <AlertCircle size={14} />
                                {errorMsg}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <button
                        onClick={handleConnect}
                        disabled={step === 'cloning' || !url || (isPrivate && !token)}
                        style={{
                            background: step === 'success' ? '#10B981' : 'var(--accent-primary, #3b82f6)',
                            color: 'white',
                            border: 'none',
                            padding: '12px',
                            borderRadius: '8px',
                            fontWeight: 600,
                            cursor: step === 'cloning' ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            transition: 'background 0.2s',
                            opacity: (!url && step !== 'cloning') ? 0.7 : 1,
                            marginTop: 8
                        }}
                    >
                        {step === 'cloning' ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Cloning...
                            </>
                        ) : step === 'success' ? (
                            <>
                                <CheckCircle2 size={18} />
                                Connected!
                            </>
                        ) : (
                            'Connect Repository'
                        )}
                    </button>
                </div>
            </motion.div>
        </div>,
        document.body
    );
};
