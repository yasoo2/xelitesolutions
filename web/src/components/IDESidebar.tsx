/**
 * IDESidebar - VS Code-style sidebar with Repos, Graph, Changes
 * Collapsible sections with theme-aware design
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FolderGit2,
    GitBranch,
    GitCommit,
    FileEdit,
    ChevronDown,
    ChevronRight,
    Plus,
    RefreshCw,
    Check,
    X,
    Circle,
    Trash2,
    ExternalLink
} from 'lucide-react';

type SidebarSection = 'repos' | 'graph' | 'changes';

interface Repository {
    id: string;
    name: string;
    path: string;
    isActive: boolean;
    branch?: string;
}

interface Commit {
    hash: string;
    message: string;
    author: string;
    date: string;
    isCurrent?: boolean;
}

interface FileChange {
    path: string;
    status: 'modified' | 'added' | 'deleted' | 'renamed';
    staged: boolean;
}

interface IDESidebarProps {
    repositories: Repository[];
    commits: Commit[];
    changes: FileChange[];
    onSelectRepo: (id: string) => void;
    onRefresh: () => void;
    onStageFile: (path: string) => void;
    onUnstageFile: (path: string) => void;
    onDiscardChanges: (path: string) => void;
    onCommit: (message: string) => void;
    onConnectRepo: () => void;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
    width?: number;
}

export default function IDESidebar({
    repositories = [],
    commits = [],
    changes = [],
    onSelectRepo,
    onRefresh,
    onStageFile,
    onUnstageFile,
    onDiscardChanges,
    onCommit,
    onConnectRepo,
    isCollapsed = false,
    onToggleCollapse,
    width = 280
}: IDESidebarProps) {
    const [expandedSections, setExpandedSections] = useState<Set<SidebarSection>>(
        new Set(['repos', 'changes'])
    );
    const [commitMessage, setCommitMessage] = useState('');

    const toggleSection = useCallback((section: SidebarSection) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(section)) {
                next.delete(section);
            } else {
                next.add(section);
            }
            return next;
        });
    }, []);

    const stagedChanges = changes.filter(c => c.staged);
    const unstagedChanges = changes.filter(c => !c.staged);

    if (isCollapsed) {
        return (
            <div
                style={{
                    width: 48,
                    background: 'var(--bg-secondary)',
                    borderLeft: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    paddingTop: 12,
                    gap: 8,
                }}
            >
                <IconButton
                    icon={FolderGit2}
                    tooltip="المستودعات"
                    onClick={() => {
                        onToggleCollapse?.();
                        setExpandedSections(new Set(['repos']));
                    }}
                    active={expandedSections.has('repos')}
                />
                <IconButton
                    icon={GitCommit}
                    tooltip="السجل"
                    onClick={() => {
                        onToggleCollapse?.();
                        setExpandedSections(new Set(['graph']));
                    }}
                    active={expandedSections.has('graph')}
                />
                <IconButton
                    icon={FileEdit}
                    tooltip="التغييرات"
                    badge={changes.length}
                    onClick={() => {
                        onToggleCollapse?.();
                        setExpandedSections(new Set(['changes']));
                    }}
                    active={expandedSections.has('changes')}
                />
            </div>
        );
    }

    return (
        <div
            style={{
                width,
                background: 'var(--bg-secondary)',
                borderLeft: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Source Control
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                    <IconButton icon={RefreshCw} tooltip="تحديث" onClick={onRefresh} small />
                    <IconButton icon={Plus} tooltip="ربط مستودع" onClick={onConnectRepo} small />
                </div>
            </div>

            {/* Sections */}
            <div style={{ flex: 1, overflow: 'auto' }}>
                {/* Repositories Section */}
                <SectionHeader
                    title="المستودعات"
                    titleEn="Repositories"
                    icon={FolderGit2}
                    isExpanded={expandedSections.has('repos')}
                    onClick={() => toggleSection('repos')}
                    count={repositories.length}
                />
                <AnimatePresence>
                    {expandedSections.has('repos') && (
                        <SectionContent>
                            {repositories.length === 0 ? (
                                <EmptyState
                                    message="لا توجد مستودعات"
                                    action="ربط مستودع"
                                    onAction={onConnectRepo}
                                />
                            ) : (
                                repositories.map(repo => (
                                    <RepoItem
                                        key={repo.id}
                                        repo={repo}
                                        onClick={() => onSelectRepo(repo.id)}
                                    />
                                ))
                            )}
                        </SectionContent>
                    )}
                </AnimatePresence>

                {/* Git Graph Section */}
                <SectionHeader
                    title="السجل"
                    titleEn="Graph"
                    icon={GitCommit}
                    isExpanded={expandedSections.has('graph')}
                    onClick={() => toggleSection('graph')}
                    count={commits.length}
                />
                <AnimatePresence>
                    {expandedSections.has('graph') && (
                        <SectionContent>
                            {commits.length === 0 ? (
                                <EmptyState message="لا توجد commits" />
                            ) : (
                                commits.slice(0, 20).map(commit => (
                                    <CommitItem key={commit.hash} commit={commit} />
                                ))
                            )}
                        </SectionContent>
                    )}
                </AnimatePresence>

                {/* Changes Section */}
                <SectionHeader
                    title="التغييرات"
                    titleEn="Changes"
                    icon={FileEdit}
                    isExpanded={expandedSections.has('changes')}
                    onClick={() => toggleSection('changes')}
                    count={changes.length}
                />
                <AnimatePresence>
                    {expandedSections.has('changes') && (
                        <SectionContent>
                            {changes.length === 0 ? (
                                <EmptyState message="لا توجد تغييرات" />
                            ) : (
                                <>
                                    {/* Staged Changes */}
                                    {stagedChanges.length > 0 && (
                                        <div style={{ marginBottom: 12 }}>
                                            <div style={{
                                                fontSize: 11,
                                                color: 'var(--text-muted)',
                                                padding: '4px 12px',
                                                textTransform: 'uppercase',
                                                letterSpacing: 0.5
                                            }}>
                                                Staged ({stagedChanges.length})
                                            </div>
                                            {stagedChanges.map(file => (
                                                <FileItem
                                                    key={file.path}
                                                    file={file}
                                                    onUnstage={() => onUnstageFile(file.path)}
                                                />
                                            ))}
                                        </div>
                                    )}

                                    {/* Unstaged Changes */}
                                    {unstagedChanges.length > 0 && (
                                        <div>
                                            <div style={{
                                                fontSize: 11,
                                                color: 'var(--text-muted)',
                                                padding: '4px 12px',
                                                textTransform: 'uppercase',
                                                letterSpacing: 0.5
                                            }}>
                                                Changes ({unstagedChanges.length})
                                            </div>
                                            {unstagedChanges.map(file => (
                                                <FileItem
                                                    key={file.path}
                                                    file={file}
                                                    onStage={() => onStageFile(file.path)}
                                                    onDiscard={() => onDiscardChanges(file.path)}
                                                />
                                            ))}
                                        </div>
                                    )}

                                    {/* Commit Input */}
                                    {stagedChanges.length > 0 && (
                                        <div style={{ padding: 12, borderTop: '1px solid var(--border-color)', marginTop: 8 }}>
                                            <input
                                                type="text"
                                                value={commitMessage}
                                                onChange={e => setCommitMessage(e.target.value)}
                                                placeholder="رسالة Commit..."
                                                style={{
                                                    width: '100%',
                                                    padding: '8px 12px',
                                                    background: 'var(--bg-card)',
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: 6,
                                                    color: 'var(--text-primary)',
                                                    fontSize: 12,
                                                    outline: 'none',
                                                    marginBottom: 8,
                                                }}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && commitMessage.trim()) {
                                                        onCommit(commitMessage);
                                                        setCommitMessage('');
                                                    }
                                                }}
                                            />
                                            <button
                                                onClick={() => {
                                                    if (commitMessage.trim()) {
                                                        onCommit(commitMessage);
                                                        setCommitMessage('');
                                                    }
                                                }}
                                                disabled={!commitMessage.trim()}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px 12px',
                                                    background: commitMessage.trim() ? 'var(--accent-primary)' : 'var(--bg-hover)',
                                                    color: commitMessage.trim() ? '#000' : 'var(--text-muted)',
                                                    border: 'none',
                                                    borderRadius: 6,
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                    cursor: commitMessage.trim() ? 'pointer' : 'not-allowed',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: 6,
                                                }}
                                            >
                                                <Check size={14} />
                                                Commit
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </SectionContent>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

// Helper Components
function IconButton({
    icon: Icon,
    tooltip,
    onClick,
    small = false,
    badge,
    active = false
}: {
    icon: React.ElementType;
    tooltip: string;
    onClick?: () => void;
    small?: boolean;
    badge?: number;
    active?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            title={tooltip}
            style={{
                width: small ? 24 : 36,
                height: small ? 24 : 36,
                borderRadius: 6,
                border: 'none',
                background: active ? 'var(--bg-hover)' : 'transparent',
                color: active ? 'var(--accent-primary)' : 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                transition: 'all 0.15s',
            }}
        >
            <Icon size={small ? 14 : 18} />
            {badge !== undefined && badge > 0 && (
                <span
                    style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        background: 'var(--accent-primary)',
                        color: '#000',
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '1px 4px',
                        borderRadius: 99,
                        minWidth: 14,
                        textAlign: 'center',
                    }}
                >
                    {badge}
                </span>
            )}
        </button>
    );
}

function SectionHeader({
    title,
    titleEn,
    icon: Icon,
    isExpanded,
    onClick,
    count
}: {
    title: string;
    titleEn: string;
    icon: React.ElementType;
    isExpanded: boolean;
    onClick: () => void;
    count?: number;
}) {
    return (
        <button
            onClick={onClick}
            style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'right',
            }}
        >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Icon size={14} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ flex: 1 }}>{title}</span>
            {count !== undefined && (
                <span style={{
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    background: 'var(--bg-hover)',
                    padding: '2px 6px',
                    borderRadius: 4
                }}>
                    {count}
                </span>
            )}
        </button>
    );
}

function SectionContent({ children }: { children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ overflow: 'hidden' }}
        >
            <div style={{ padding: '8px 0' }}>
                {children}
            </div>
        </motion.div>
    );
}

function EmptyState({
    message,
    action,
    onAction
}: {
    message: string;
    action?: string;
    onAction?: () => void;
}) {
    return (
        <div style={{
            padding: 16,
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 12
        }}>
            <div>{message}</div>
            {action && onAction && (
                <button
                    onClick={onAction}
                    style={{
                        marginTop: 8,
                        padding: '6px 12px',
                        background: 'var(--accent-primary)',
                        color: '#000',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    {action}
                </button>
            )}
        </div>
    );
}

function RepoItem({ repo, onClick }: { repo: Repository; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                background: repo.isActive ? 'rgba(var(--accent-primary-rgb), 0.1)' : 'transparent',
                border: 'none',
                borderRight: repo.isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                color: 'var(--text-primary)',
                fontSize: 12,
                cursor: 'pointer',
                textAlign: 'right',
            }}
        >
            <FolderGit2 size={14} style={{ color: repo.isActive ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {repo.name}
            </span>
            {repo.branch && (
                <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    color: 'var(--text-muted)',
                    fontSize: 10
                }}>
                    <GitBranch size={10} />
                    {repo.branch}
                </span>
            )}
        </button>
    );
}

function CommitItem({ commit }: { commit: Commit }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '8px 12px',
                borderRight: commit.isCurrent ? '2px solid var(--accent-primary)' : '2px solid transparent',
            }}
        >
            <Circle
                size={8}
                fill={commit.isCurrent ? 'var(--accent-primary)' : 'var(--text-muted)'}
                style={{ marginTop: 4, flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}>
                    {commit.message}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    {commit.hash.slice(0, 7)} • {commit.author}
                </div>
            </div>
        </div>
    );
}

function FileItem({
    file,
    onStage,
    onUnstage,
    onDiscard
}: {
    file: FileChange;
    onStage?: () => void;
    onUnstage?: () => void;
    onDiscard?: () => void;
}) {
    const statusColors: Record<string, string> = {
        modified: '#eab308',
        added: '#22c55e',
        deleted: '#ef4444',
        renamed: '#3b82f6',
    };

    const statusLabels: Record<string, string> = {
        modified: 'M',
        added: 'A',
        deleted: 'D',
        renamed: 'R',
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                fontSize: 12,
            }}
        >
            <span style={{
                color: statusColors[file.status],
                fontSize: 10,
                fontWeight: 700,
                width: 14,
                textAlign: 'center'
            }}>
                {statusLabels[file.status]}
            </span>
            <span style={{
                flex: 1,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
            }}>
                {file.path.split('/').pop()}
            </span>
            <div style={{ display: 'flex', gap: 2 }}>
                {file.staged && onUnstage && (
                    <IconButton icon={X} tooltip="Unstage" onClick={onUnstage} small />
                )}
                {!file.staged && onStage && (
                    <IconButton icon={Plus} tooltip="Stage" onClick={onStage} small />
                )}
                {!file.staged && onDiscard && (
                    <IconButton icon={Trash2} tooltip="Discard" onClick={onDiscard} small />
                )}
            </div>
        </div>
    );
}
