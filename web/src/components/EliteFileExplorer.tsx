import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ChevronRight,
    ChevronDown,
    Folder,
    File,
    RefreshCw,
    FileText,
    Code,
    Save,
    Loader2,
    X,
    Search,
    PanelLeftClose,
    PanelLeftOpen,
    HardDrive,
    Github,
    MoreVertical,
    FolderPlus,
    FilePlus,
    Trash2,
    Edit3,
    Home,
    Settings
} from 'lucide-react';
import { API_URL as API } from '../config';
import CodeEditor from './CodeEditor';
import { motion, AnimatePresence } from 'framer-motion';

interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: FileNode[];
    hasChildren?: boolean;
    loaded?: boolean;
}

interface SearchResult {
    path: string;
    line: number;
    preview: string;
}

interface FileExplorerProps {
    sessionId?: string;
}

type OpenTab = {
    node: FileNode;
    content: string;
    isLoading: boolean;
    error: string | null;
    isDirty: boolean;
    lastSavedAt: number | null;
};

interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    node: FileNode | null;
}

const FileIcon = ({ name }: { name: string }) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['ts', 'tsx', 'js', 'jsx', 'json'].includes(ext || ''))
        return <Code size={14} className="text-[var(--accent-primary)]" />;
    if (['css', 'scss', 'less'].includes(ext || ''))
        return <FileText size={14} className="text-[#3b82f6]" />;
    if (['md', 'txt'].includes(ext || ''))
        return <FileText size={14} className="text-[var(--text-muted)]" />;
    return <File size={14} className="text-[var(--text-muted)]" />;
};

const FileTreeItem = ({
    node,
    level,
    expandedByPath,
    onToggleDir,
    onOpenFile,
    onContextMenu,
    selectedPath,
}: {
    node: FileNode;
    level: number;
    expandedByPath: Record<string, boolean>;
    onToggleDir: (node: FileNode) => void;
    onOpenFile: (node: FileNode) => void;
    onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
    selectedPath?: string;
}) => {
    const expanded = !!expandedByPath[node.path];
    const isSelected = selectedPath === node.path;

    return (
        <div style={{ paddingLeft: level * 12 }}>
            <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className={`elite-file-item ${isSelected ? 'selected' : ''}`}
                onClick={(e) => {
                    e.stopPropagation();
                    if (node.type === 'directory') {
                        onToggleDir(node);
                    } else {
                        onOpenFile(node);
                    }
                }}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onContextMenu(e, node);
                }}
            >
                {node.type === 'directory' && (
                    <span className="elite-tree-chevron">
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                )}
                {node.type === 'directory' ? (
                    <Folder size={14} className="elite-folder-icon" fill="currentColor" />
                ) : (
                    <FileIcon name={node.name} />
                )}
                <span className="elite-file-name">{node.name}</span>
            </motion.div>

            <AnimatePresence>
                {node.type === 'directory' && expanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {!node.children && !node.loaded ? (
                            <div className="elite-loading-indicator">
                                <Loader2 size={12} className="animate-spin" /> Loading...
                            </div>
                        ) : (
                            node.children?.map((child, i) => (
                                <FileTreeItem
                                    key={child.path || i}
                                    node={child}
                                    level={level + 1}
                                    expandedByPath={expandedByPath}
                                    onToggleDir={onToggleDir}
                                    onOpenFile={onOpenFile}
                                    onContextMenu={onContextMenu}
                                    selectedPath={selectedPath}
                                />
                            ))
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const ContextMenu = ({
    visible,
    x,
    y,
    node,
    onClose,
    onAction
}: {
    visible: boolean;
    x: number;
    y: number;
    node: FileNode | null;
    onClose: () => void;
    onAction: (action: string, node: FileNode) => void;
}) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        if (visible) {
            document.addEventListener('mousedown', handleClick);
            return () => document.removeEventListener('mousedown', handleClick);
        }
    }, [visible, onClose]);

    if (!visible || !node) return null;

    const actions = node.type === 'directory'
        ? [
            { icon: FolderPlus, label: 'New Folder', action: 'newFolder' },
            { icon: FilePlus, label: 'New File', action: 'newFile' },
            { icon: Edit3, label: 'Rename', action: 'rename' },
            { icon: Trash2, label: 'Delete', action: 'delete', danger: true },
        ]
        : [
            { icon: Edit3, label: 'Rename', action: 'rename' },
            { icon: Trash2, label: 'Delete', action: 'delete', danger: true },
        ];

    return (
        <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="elite-context-menu"
            style={{
                position: 'fixed',
                top: `${y}px`,
                left: `${x}px`,
                zIndex: 9999
            }}
        >
            {actions.map((item, i) => (
                <button
                    key={i}
                    className={`elite-context-menu-item ${item.danger ? 'danger' : ''}`}
                    onClick={() => {
                        onAction(item.action, node);
                        onClose();
                    }}
                >
                    <item.icon size={14} />
                    <span>{item.label}</span>
                </button>
            ))}
        </motion.div>
    );
};

export default function EliteFileExplorer({ sessionId }: FileExplorerProps) {
    const [viewMode, setViewMode] = useState<'local' | 'github'>('local');
    const [repos, setRepos] = useState<any[]>([]);
    const [activeRepo, setActiveRepo] = useState<string | null>(null);
    const [tree, setTree] = useState<FileNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [expandedByPath, setExpandedByPath] = useState<Record<string, boolean>>({});
    const [tabs, setTabs] = useState<OpenTab[]>([]);
    const [activePath, setActivePath] = useState<string | null>(null);
    const [savingPath, setSavingPath] = useState<string | null>(null);
    const [savedPath, setSavedPath] = useState<string | null>(null);
    const [treeCollapsed, setTreeCollapsed] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, node: null });

    const fetchGitHubRepos = async () => {
        const token = localStorage.getItem('GITHUB_TOKEN');
        if (!token) return;
        try {
            const res = await fetch(`${API}/tools/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify({
                    tool: 'github_repo_manager',
                    input: { action: 'list', token }
                })
            });
            const data = await res.json();
            if (data.ok) setRepos(data.output.repos);
        } catch { }
    };

    const fetchTree = async (path?: string) => {
        const token = localStorage.getItem('token');
        if (!token) return { tree: [] };

        try {
            const url = `${API}/project/tree` + (path ? `?path=${encodeURIComponent(path)}` : '');
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return { tree: [] };
            const data = await res.json();
            return { tree: data.tree };
        } catch {
            return { tree: [] };
        }
    };

    const loadRoot = async () => {
        setLoading(true);
        const { tree: roots } = await fetchTree();
        setTree(roots || []);
        setLoading(false);
    };

    useEffect(() => { loadRoot(); }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd/Ctrl + S: Save active file
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                if (activePath && tabs.find(t => t.node.path === activePath)?.isDirty) {
                    saveActiveFile();
                }
            }

            // Cmd/Ctrl + W: Close active tab
            if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
                e.preventDefault();
                if (activePath) {
                    closeTab(activePath);
                }
            }

            // Cmd/Ctrl + F: Focus search
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                document.querySelector<HTMLInputElement>('.elite-input')?.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activePath, tabs]);


    useEffect(() => {
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }
        const handler = setTimeout(async () => {
            setIsSearching(true);
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(`${API}/project/search?q=${encodeURIComponent(query)}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                setSearchResults(data.results || []);
            } catch { }
            setIsSearching(false);
        }, 600);
        return () => clearTimeout(handler);
    }, [query]);

    const toggleDir = useCallback(async (node: FileNode) => {
        const isExpanded = !!expandedByPath[node.path];
        if (isExpanded) {
            setExpandedByPath(p => ({ ...p, [node.path]: false }));
            return;
        }

        setExpandedByPath(p => ({ ...p, [node.path]: true }));

        if (!node.children || node.children.length === 0) {
            const { tree: children } = await fetchTree(node.path);
            setTree(prev => {
                const inject = (list: FileNode[]): FileNode[] => {
                    return list.map(item => {
                        if (item.path === node.path) {
                            return { ...item, children, loaded: true };
                        }
                        if (item.children) return { ...item, children: inject(item.children) };
                        return item;
                    });
                };
                return inject(prev);
            });
        }
    }, [expandedByPath]);

    const loadFileContent = useCallback(async (node: FileNode) => {
        setTabs(prev => [...prev, { node, content: '', isLoading: true, error: null, isDirty: false, lastSavedAt: null }]);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/project/content?path=${encodeURIComponent(node.path)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const json = await res.json();
            setTabs(prev => prev.map(t => t.node.path === node.path ? { ...t, content: json.content, isLoading: false } : t));
        } catch (e) {
            setTabs(prev => prev.map(t => t.node.path === node.path ? { ...t, error: 'Failed', isLoading: false } : t));
        }
    }, []);

    const openFile = useCallback(async (node: FileNode) => {
        const existing = tabs.find(t => t.node.path === node.path);
        if (existing) {
            setActivePath(node.path);
            return;
        }
        await loadFileContent(node);
        setActivePath(node.path);
    }, [tabs, loadFileContent]);

    const updateActiveContent = useCallback((val: string | undefined) => {
        setTabs(p => p.map(t => t.node.path === activePath ? { ...t, content: val || '', isDirty: true } : t));
    }, [activePath]);

    const saveActiveFile = useCallback(async () => {
        const tab = tabs.find(t => t.node.path === activePath);
        if (!tab || !tab.isDirty) return;
        setSavingPath(tab.node.path);
        try {
            const token = localStorage.getItem('token');
            await fetch(`${API}/project/content`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: tab.node.path, content: tab.content })
            });
            setTabs(p => p.map(t => t.node.path === tab.node.path ? { ...t, isDirty: false } : t));
            setSavedPath(tab.node.path);
            setTimeout(() => setSavedPath(null), 1000);
        } catch { }
        setSavingPath(null);
    }, [activePath, tabs]);

    const closeTab = (path: string) => {
        setTabs(p => p.filter(t => t.node.path !== path));
        if (activePath === path) setActivePath(null);
    };

    const handleContextMenu = (e: React.MouseEvent, node: FileNode) => {
        setContextMenu({ visible: true, x: e.clientX, y: e.clientY, node });
    };

    const handleContextAction = async (action: string, node: FileNode) => {
        const token = localStorage.getItem('token');
        if (!token) return;

        switch (action) {
            case 'rename':
                const newName = prompt('Enter new name:', node.name);
                if (!newName || newName === node.name) return;

                try {
                    const newPath = node.path.replace(/[^/]+$/, newName);
                    const res = await fetch(`${API}/project/file/rename`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ oldPath: node.path, newPath })
                    });

                    if (res.ok) {
                        await loadRoot();
                        // Update active tab if file is open
                        if (activePath === node.path) {
                            setActivePath(newPath);
                        }
                        setTabs(prev => prev.map(t =>
                            t.node.path === node.path
                                ? { ...t, node: { ...t.node, name: newName, path: newPath } }
                                : t
                        ));
                    } else {
                        alert('Failed to rename');
                    }
                } catch (err) {
                    alert('Error renaming file');
                }
                break;

            case 'delete':
                if (!confirm(`Delete ${node.name}?`)) return;

                try {
                    const res = await fetch(`${API}/project/file/delete`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ path: node.path })
                    });

                    if (res.ok) {
                        await loadRoot();
                        // Close tab if file is open
                        if (activePath === node.path) {
                            closeTab(node.path);
                        }
                    } else {
                        alert('Failed to delete');
                    }
                } catch (err) {
                    alert('Error deleting file');
                }
                break;

            case 'newFile':
                const fileName = prompt('Enter file name:');
                if (!fileName) return;

                try {
                    const newFilePath = `${node.path}/${fileName}`;
                    const res = await fetch(`${API}/project/content`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ path: newFilePath, content: '' })
                    });

                    if (res.ok) {
                        await loadRoot();
                        // Expand parent directory
                        setExpandedByPath(p => ({ ...p, [node.path]: true }));
                    } else {
                        alert('Failed to create file');
                    }
                } catch (err) {
                    alert('Error creating file');
                }
                break;

            case 'newFolder':
                const folderName = prompt('Enter folder name:');
                if (!folderName) return;

                try {
                    const newFolderPath = `${node.path}/${folderName}`;
                    const res = await fetch(`${API}/project/folder/create`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ path: newFolderPath })
                    });

                    if (res.ok) {
                        await loadRoot();
                        // Expand parent directory
                        setExpandedByPath(p => ({ ...p, [node.path]: true }));
                    } else {
                        alert('Failed to create folder');
                    }
                } catch (err) {
                    alert('Error creating folder');
                }
                break;
        }
    };

    const pathParts = activePath?.split('/').filter(Boolean) || [];

    return (
        <div className="elite-file-explorer">
            <AnimatePresence>
                {!treeCollapsed ? (
                    <motion.div
                        className="elite-explorer-sidebar"
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 280, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    >
                        <div className="elite-explorer-header">
                            <div className="elite-workspace-selector" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <select
                                    className="elite-select"
                                    value="current"
                                    onChange={(e) => {
                                        if (e.target.value === 'folder') {
                                            const path = prompt('Enter absolute path to folder:');
                                            if (path) {
                                                fetch(`${API}/project/root`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                                                    body: JSON.stringify({ path })
                                                }).then(res => {
                                                    if (res.ok) {
                                                        loadRoot();
                                                        alert('Workspace switched!');
                                                    } else {
                                                        alert('Failed to switch workspace. Path may not exist.');
                                                    }
                                                });
                                            }
                                        } else if (e.target.value === 'clone') {
                                            const repo = prompt('Enter GitHub Repository URL:');
                                            if (repo) {
                                                alert('Cloning repository... This may take a while.');
                                                fetch(`${API}/project/git/clone`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                                                    body: JSON.stringify({ repoUrl: repo })
                                                }).then(async res => {
                                                    if (res.ok) {
                                                        await loadRoot();
                                                        alert('Repository cloned and opened!');
                                                    } else {
                                                        const err = await res.json();
                                                        alert('Clone failed: ' + err.error);
                                                    }
                                                });
                                            }
                                        }
                                    }}
                                >
                                    <option value="current">📂 Current Project</option>
                                    <option value="system">💻 Local System</option>
                                    <option value="folder">🖥️ Open Folder...</option>
                                    <option value="clone">🐙 Clone Repository...</option>
                                </select>
                            </div>

                            <div className="elite-header-actions">
                                <button onClick={loadRoot} className="elite-icon-btn" title="Refresh">
                                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                                </button>
                                <button onClick={() => setTreeCollapsed(true)} className="elite-icon-btn" title="Collapse">
                                    <PanelLeftClose size={14} />
                                </button>
                            </div>
                        </div>

                        {/* Repo Selector removed as it is now integrated in the Workspace flow */}

                        <div className="elite-search-container">
                            <div className="elite-search-input">
                                <Search size={14} />
                                <input
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Search files..."
                                    className="elite-input"
                                />
                                {isSearching && <Loader2 size={12} className="animate-spin" />}
                            </div>
                        </div>

                        <div className="elite-tree-container">
                            {query ? (
                                <div className="elite-search-results">
                                    {searchResults.map((res, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            onClick={() => openFile({ name: res.path.split('/').pop()!, path: res.path, type: 'file' })}
                                            className="elite-search-result"
                                        >
                                            <div className="result-filename">{res.path.split('/').pop()}</div>
                                            <div className="result-path">{res.path}</div>
                                            <div className="result-preview">
                                                <span className="result-line">L{res.line}</span>
                                                {res.preview}
                                            </div>
                                        </motion.div>
                                    ))}
                                    {searchResults.length === 0 && !isSearching && (
                                        <div className="elite-empty-state">No results found</div>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    {tree.map((node, i) => (
                                        <FileTreeItem
                                            key={node.path || i}
                                            node={node}
                                            level={0}
                                            expandedByPath={expandedByPath}
                                            onToggleDir={toggleDir}
                                            onOpenFile={openFile}
                                            onContextMenu={handleContextMenu}
                                            selectedPath={activePath || undefined}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        className="elite-explorer-collapsed"
                        initial={{ width: 0 }}
                        animate={{ width: 40 }}
                        exit={{ width: 0 }}
                    >
                        <button onClick={() => setTreeCollapsed(false)} className="elite-expand-btn">
                            <PanelLeftOpen size={18} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="elite-editor-area">
                {pathParts.length > 0 && (
                    <div className="elite-breadcrumbs">
                        <Home size={14} />
                        {pathParts.map((part, i) => (
                            <React.Fragment key={i}>
                                <ChevronRight size={12} className="breadcrumb-separator" />
                                <span className="breadcrumb-item">{part}</span>
                            </React.Fragment>
                        ))}
                    </div>
                )}

                <div className="elite-tabs-bar">
                    <AnimatePresence>
                        {tabs.map(t => (
                            <motion.div
                                key={t.node.path}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                onClick={() => setActivePath(t.node.path)}
                                className={`elite-tab ${t.node.path === activePath ? 'active' : ''}`}
                            >
                                <FileIcon name={t.node.name} />
                                <span className="tab-name">{t.node.name}</span>
                                {t.isDirty && <div className="tab-dirty-indicator" />}
                                <button
                                    className="tab-close"
                                    onClick={(e) => { e.stopPropagation(); closeTab(t.node.path); }}
                                >
                                    <X size={12} />
                                </button>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                <div className="elite-editor-content">
                    {activePath ? (
                        <CodeEditor
                            code={tabs.find(t => t.node.path === activePath)?.content || ''}
                            language={activePath.split('.').pop() || 'text'}
                            onChange={updateActiveContent}
                            theme="vs-dark"
                        />
                    ) : (
                        <div className="elite-empty-editor">
                            <Folder size={64} strokeWidth={1} opacity={0.3} />
                            <div className="empty-text">Select a file to edit</div>
                        </div>
                    )}

                    <AnimatePresence>
                        {activePath && tabs.find(t => t.node.path === activePath)?.isDirty && (
                            <motion.div
                                className="elite-save-fab"
                                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.8, y: 20 }}
                            >
                                <button onClick={saveActiveFile} className="elite-save-btn">
                                    {savingPath ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    <span>Save Changes</span>
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <ContextMenu
                visible={contextMenu.visible}
                x={contextMenu.x}
                y={contextMenu.y}
                node={contextMenu.node}
                onClose={() => setContextMenu({ visible: false, x: 0, y: 0, node: null })}
                onAction={handleContextAction}
            />
        </div>
    );
}
