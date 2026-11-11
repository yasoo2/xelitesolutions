import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FilePlus, FolderPlus, GitBranch, RefreshCw, HardDrive, PackageOpen, PackageCheck, Loader2, Github, FolderCog } from 'lucide-react';
import EliteFileExplorer from './EliteFileExplorer';
import { API_URL } from '../config';

import { GitHubRepo, GitHubUser } from '../services/githubService';

interface FileExplorerPanelProps {
    sessionId?: string;
    onNewFile?: () => void;
    onNewFolder?: () => void;
    onGitChanges?: () => void;
    onRefresh?: () => void;
    showGitChanges?: boolean;
    isCollapsed?: boolean;
    activeRepo?: GitHubRepo | null;
    githubUser?: GitHubUser | null;
}

export default function FileExplorerPanel({
    sessionId,
    onNewFile,
    onNewFolder,
    onGitChanges,
    onRefresh,
    showGitChanges = false,
    isCollapsed = false,
    activeRepo = null,
    githubUser = null
}: FileExplorerPanelProps) {
    const { t } = useTranslation();
    const [gitChangeCount, setGitChangeCount] = useState(0);

    const authHeaders = (): Record<string, string> => {
        const token = localStorage.getItem('token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    // The current on-disk location where local builds land — fetched so the
    // user can SEE where their files are and change it. This was the panel's
    // biggest confusion ("system-fallback / Empty Directory" with no context).
    const isGithub = !!activeRepo;
    const [location, setLocation] = useState<{ path: string; name: string; isDefault?: boolean } | null>(null);
    const loadLocation = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/project/root`, { headers: authHeaders() });
            if (res.ok) setLocation(await res.json());
        } catch { /* non-fatal */ }
    }, []);
    useEffect(() => { if (!isGithub) loadLocation(); }, [isGithub, loadLocation]);
    // Refresh the shown location after the folder dialog changes it.
    useEffect(() => {
        const h = () => loadLocation();
        window.addEventListener('workspace:updated', h);
        return () => window.removeEventListener('workspace:updated', h);
    }, [loadLocation]);

    // Export the whole project as one zip / import a previously exported one.
    // Both talk to the real endpoints; failures surface as alerts, not silence.
    const [transferBusy, setTransferBusy] = useState<'export' | 'import' | null>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    const handleExport = async () => {
        setTransferBusy('export');
        try {
            const res = await fetch(`${API_URL}/project/export`, { headers: authHeaders() });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error || `HTTP ${res.status}`);
            }
            const blob = await res.blob();
            const cd = res.headers.get('Content-Disposition') || '';
            const name = (cd.match(/filename="([^"]+)"/) || [])[1] || 'joe-project.zip';
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            a.click();
            URL.revokeObjectURL(a.href);
        } catch (e: any) {
            alert(t('exportFailed', { error: String(e?.message || e) }));
        } finally { setTransferBusy(null); }
    };
    const handleImportFile = async (file: File) => {
        setTransferBusy('import');
        try {
            //  Imported into this chat, it becomes this chat's project: the
            //  next request («fix the failing test») changes it in place.
            const chat = String(sessionId || '').trim();
            const res = await fetch(`${API_URL}/project/import${chat ? `?sessionId=${encodeURIComponent(chat)}` : ''}`, {
                method: 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/zip' },
                body: await file.arrayBuffer(),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
            alert(`${t('importDone', { dir: data.dir })} (${t('filesWord', { n: data.files })})`);
            onRefresh?.();
        } catch (e: any) {
            alert(t('importFailed', { error: String(e?.message || e) }));
        } finally { setTransferBusy(null); }
    };

    // Listen for git change count from EliteFileExplorer
    useEffect(() => {
        const handler = (e: Event) => {
            setGitChangeCount((e as CustomEvent).detail || 0);
        };
        window.addEventListener('git-change-count', handler);
        return () => window.removeEventListener('git-change-count', handler);
    }, []);

    return (
        <aside className={`joe-files-panel ${isCollapsed ? 'collapsed' : ''}`}>
            {/* Header: title + a mode pill so the user always knows which source
                they are looking at (local disk vs a connected GitHub repo). */}
            <div className="joe-files-header" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span className="joe-files-title">{t('fx_title')}</span>
                    <span title={isGithub ? activeRepo?.fullName : location?.path}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
                            background: isGithub ? 'rgba(110,120,255,0.14)' : 'rgba(52,199,123,0.14)',
                            color: isGithub ? '#8b93ff' : '#34c77b',
                            whiteSpace: 'nowrap'
                        }}>
                        {isGithub ? <Github size={12} /> : <HardDrive size={12} />}
                        {isGithub ? t('fx_modeGithub') : t('fx_modeLocal')}
                    </span>
                </div>
                <div className="joe-files-actions">
                    <button className="joe-files-action-btn" onClick={onNewFile} title={t('fx_newFile')}>
                        <FilePlus size={16} />
                    </button>
                    <button className="joe-files-action-btn" onClick={onNewFolder} title={t('fx_newFolder')}>
                        <FolderPlus size={16} />
                    </button>
                    <button className="joe-files-action-btn" onClick={() => { onRefresh?.(); loadLocation(); }} title={t('fx_refresh')}>
                        <RefreshCw size={16} />
                    </button>
                    <div style={{ width: 1, height: 16, background: 'var(--border-color)', margin: '0 4px' }} />
                    <button className="joe-files-action-btn" onClick={handleExport} disabled={transferBusy !== null} title={t('fx_export')}>
                        {transferBusy === 'export' ? <Loader2 size={16} className="spin" /> : <PackageCheck size={16} />}
                    </button>
                    <button className="joe-files-action-btn" onClick={() => importInputRef.current?.click()} disabled={transferBusy !== null} title={t('fx_import')}>
                        {transferBusy === 'import' ? <Loader2 size={16} className="spin" /> : <PackageOpen size={16} />}
                    </button>
                    <input
                        ref={importInputRef}
                        type="file"
                        accept=".zip,application/zip"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f) handleImportFile(f);
                        }}
                    />
                </div>
            </div>

            {/* Location bar (local mode only): shows WHERE files live in plain
                language, and gives a real "change location" action — the freedom
                the user asked for. In GitHub mode the repo name is the location. */}
            {!isGithub && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    borderBottom: '1px solid var(--border-color)', minWidth: 0
                }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 10.5, opacity: 0.55, fontWeight: 600, marginBottom: 2 }}>
                            {t('fx_locationLabel')}
                            {location?.isDefault && ' — ' + t('fx_defaultHint')}
                        </div>
                        <div dir="ltr" style={{
                            fontSize: 11.5, fontFamily: 'monospace', opacity: 0.8,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left'
                        }} title={location?.path}>
                            {location?.path || '…'}
                        </div>
                    </div>
                    <button
                        className="joe-files-action-btn"
                        onClick={() => (window as any)._triggerConnectWorkspace?.()}
                        title={t('fx_changeLocation')}
                        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, width: 'auto', padding: '5px 10px', fontSize: 11.5, fontWeight: 600 }}
                    >
                        <FolderCog size={14} />
                        {t('fx_changeLocation')}
                    </button>
                </div>
            )}

            {/* File Tree */}
            <div className="joe-files-content" style={{ position: 'relative' }}>
                <EliteFileExplorer
                    sessionId={sessionId}
                    activeRepo={activeRepo}
                    githubUser={githubUser}
                    ref={(ref: any) => {
                        // Pass a trigger so the panel can force EliteFileExplorer to open the folder dialog
                        if (ref) {
                            (window as any)._triggerConnectWorkspace = () => ref.triggerConnectWorkspace();
                        }
                    }}
                />
            </div>

            {/* Footer Actions */}
            <div className="joe-files-footer">
                <button
                    className="joe-files-footer-btn"
                    onClick={onGitChanges}
                >
                    <GitBranch size={14} />
                    <span>{t('fxp_gitChanges')}</span>
                    {gitChangeCount > 0 && (
                        <span style={{
                            marginLeft: 'auto',
                            background: 'var(--joe-gold-primary)',
                            color: 'var(--joe-bg-primary)',
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            minWidth: 18,
                            textAlign: 'center' as const
                        }}>
                            {gitChangeCount}
                        </span>
                    )}
                </button>
            </div>
        </aside>
    );
}
