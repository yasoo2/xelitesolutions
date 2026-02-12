import React from 'react';
import { FilePlus, FolderPlus, GitBranch, RefreshCw } from 'lucide-react';
import EliteFileExplorer from './EliteFileExplorer';

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
    return (
        <aside className={`joe-files-panel ${isCollapsed ? 'collapsed' : ''}`}>
            {/* Header */}
            <div className="joe-files-header">
                <span className="joe-files-title">File Explorer</span>
                <div className="joe-files-actions">
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
                </div>
            </div>

            {/* File Tree */}
            <div className="joe-files-content">
                <EliteFileExplorer
                    activeRepo={activeRepo}
                    githubUser={githubUser}
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
                    {showGitChanges && (
                        <span style={{
                            marginLeft: 'auto',
                            background: 'var(--joe-gold-primary)',
                            color: 'var(--joe-bg-primary)',
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600
                        }}>
                            3
                        </span>
                    )}
                </button>
            </div>
        </aside>
    );
}
