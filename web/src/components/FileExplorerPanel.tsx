import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FilePlus, FolderPlus, GitBranch, RefreshCw, HardDrive, PackageOpen, PackageCheck, Loader2 } from 'lucide-react';
import EliteFileExplorer from './EliteFileExplorer';
import { API_URL } from '../config';

import { GitHubRepo, GitHubUser } from '../services/githubService';

interface FileExplorerPanelProps {
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

    // Export the whole project as one zip / import a previously exported one.
    // Both talk to the real endpoints; failures surface as alerts, not silence.
    const [transferBusy, setTransferBusy] = useState<'export' | 'import' | null>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    const authHeaders = (): Record<string, string> => {
        const token = localStorage.getItem('token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    };
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
            alert(t('exportFailed', 'تعذّر التصدير: ') + (e?.message || e));
        } finally { setTransferBusy(null); }
    };
    const handleImportFile = async (file: File) => {
        setTransferBusy('import');
        try {
            const res = await fetch(`${API_URL}/project/import`, {
                method: 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/zip' },
                body: await file.arrayBuffer(),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) throw new Error(data?.error || `HTTP ${res.status}`);
            alert(t('importDone', 'تم الاستيراد إلى مجلد جديد: ') + data.dir + ` (${data.files} ${t('filesWord', 'ملفاً')})`);
            onRefresh?.();
        } catch (e: any) {
            alert(t('importFailed', 'تعذّر الاستيراد: ') + (e?.message || e));
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
            {/* Header */}
            <div className="joe-files-header">
                <span className="joe-files-title">File Explorer</span>
                <div className="joe-files-actions">
                    <button
                        className="joe-files-action-btn"
                        onClick={() => {
                            if ((window as any)._triggerConnectWorkspace) {
                                (window as any)._triggerConnectWorkspace();
                            }
                        }}
                        title={t('connectLocalFolder')}
                        style={{ color: 'var(--accent-primary)' }}
                    >
                        <HardDrive size={16} />
                    </button>
                    <div style={{ width: 1, height: 16, background: 'var(--border-color)', margin: '0 4px' }} />
                    <button
                        className="joe-files-action-btn"
                        onClick={onNewFile}
                        title="New File"
                    >
                        <FilePlus size={16} />
                    </button>
                    <button
                        className="joe-files-action-btn"
                        onClick={onNewFolder}
                        title="New Folder"
                    >
                        <FolderPlus size={16} />
                    </button>
                    <button
                        className="joe-files-action-btn"
                        onClick={onRefresh}
                        title="Refresh"
                    >
                        <RefreshCw size={16} />
                    </button>
                    <div style={{ width: 1, height: 16, background: 'var(--border-color)', margin: '0 4px' }} />
                    <button
                        className="joe-files-action-btn"
                        onClick={handleExport}
                        disabled={transferBusy !== null}
                        title={t('exportProject', 'تصدير المشروع كملف واحد (zip)')}
                    >
                        {transferBusy === 'export' ? <Loader2 size={16} className="spin" /> : <PackageCheck size={16} />}
                    </button>
                    <button
                        className="joe-files-action-btn"
                        onClick={() => importInputRef.current?.click()}
                        disabled={transferBusy !== null}
                        title={t('importProject', 'استيراد مشروع من ملف zip')}
                    >
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

            {/* File Tree */}
            <div className="joe-files-content" style={{ position: 'relative' }}>
                <EliteFileExplorer
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
                    <span>Git Changes</span>
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
