import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, File, RefreshCw, FileText, Code, Image, Music, Video, Database, Package, Save, Loader2, X, Search, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { API_URL as API } from '../config';
import CodeEditor from './CodeEditor';

interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: FileNode[];
    hasChildren?: boolean; // New flag for lazy loading
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

const FileIcon = ({ name }: { name: string }) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['ts', 'tsx', 'js', 'jsx', 'json'].includes(ext || '')) return <Code size={14} className="text-[var(--accent-primary)]" />;
    if (['css', 'scss', 'less'].includes(ext || '')) return <FileText size={14} className="text-[var(--accent-secondary)]" />;
    if (['md', 'txt'].includes(ext || '')) return <FileText size={14} className="text-[var(--text-muted)]" />;
    return <File size={14} className="text-[var(--text-muted)]" />;
};

const FileTreeItem = ({
    node,
    level,
    expandedByPath,
    onToggleDir,
    onOpenFile,
    selectedPath,
}: {
    node: FileNode;
    level: number;
    expandedByPath: Record<string, boolean>;
    onToggleDir: (node: FileNode) => void;
    onOpenFile: (node: FileNode) => void;
    selectedPath?: string;
}) => {
    const expanded = !!expandedByPath[node.path];
    const isSelected = selectedPath === node.path;

    return (
        <div style={{ paddingLeft: level * 12 }}>
            <div
                className={`file-item ${isSelected ? 'selected' : ''}`}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)',
                    background: isSelected ? 'var(--bg-active)' : 'transparent',
                    borderRadius: 4,
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    if (node.type === 'directory') {
                        onToggleDir(node);
                    } else {
                        onOpenFile(node);
                    }
                }}
            >
                {node.type === 'directory' && (
                    <span style={{ color: 'var(--text-muted)' }}>
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                )}
                {node.type === 'directory' ? (
                    <Folder size={14} className="text-[var(--accent-secondary)]" fill="currentColor" />
                ) : (
                    <FileIcon name={node.name} />
                )}
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {node.name}
                </span>
            </div>

            {node.type === 'directory' && expanded && (
                <div>
                    {!node.children && !node.loaded ? (
                        <div style={{ marginLeft: 20, fontSize: 11, color: 'var(--text-muted)' }}>Loading...</div>
                    ) : (
                        node.children?.map((child, i) => (
                            <FileTreeItem
                                key={child.path || i}
                                node={child}
                                level={level + 1}
                                expandedByPath={expandedByPath}
                                onToggleDir={onToggleDir}
                                onOpenFile={onOpenFile}
                                selectedPath={selectedPath}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default function FileExplorer({ sessionId }: FileExplorerProps) {
    const [tree, setTree] = useState<FileNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedByPath, setExpandedByPath] = useState<Record<string, boolean>>({});
    const [treeCollapsed, setTreeCollapsed] = useState(false);
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const [tabs, setTabs] = useState<OpenTab[]>([]);
    const [activePath, setActivePath] = useState<string | null>(null);
    const [savingPath, setSavingPath] = useState<string | null>(null);
    const [savedPath, setSavedPath] = useState<string | null>(null);
    const saveFlashTimerRef = useRef<number | null>(null);

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

    // Perform Search
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
            // Lazy load
            // Helper to update specific node in tree
            const updateNode = (nodes: FileNode[]): FileNode[] => {
                return nodes.map(n => {
                    if (n.path === node.path) {
                        return { ...n, loading: true };
                    }
                    if (n.children) return { ...n, children: updateNode(n.children) };
                    return n;
                });
            };
            // Set loading state (not implemented in view yet, but logical)

            const { tree: children } = await fetchTree(node.path);

            // Insert children
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
        // ... (Existing load logic, mostly same)
        setTabs(prev => [...prev, { node, content: '', isLoading: true, error: null, isDirty: false, lastSavedAt: null }]);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/project/content?path=${encodeURIComponent(node.path)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const json = await res.json();
            setTabs(prev => prev.map(t => t.node.path === node.path ? { ...t, content: json.content, isLoading: false } : t));
        } catch (e) {
            setTabs(prev => prev.map(t => t.node.path === node.path ? { ...t, error: 'Failed' } : t));
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
            // Save logic same as before
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

    return (
        <div style={{ display: 'flex', height: '100%', minHeight: 0, overflow: 'hidden' }}>
            {!treeCollapsed ? (
                <div style={{ width: 260, borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {/* Header */}
                    <div className="flex font-bold text-sm p-2 items-center justify-between border-b border-white/5">
                        <div className="flex items-center gap-2"><Folder size={14} /> Workspace</div>
                        <div className="flex gap-1">
                            <button onClick={() => setTreeCollapsed(true)} className="p-1 hover:bg-white/10 rounded"><PanelLeftClose size={14} /></button>
                            <button onClick={loadRoot} className="p-1 hover:bg-white/10 rounded"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
                        </div>
                    </div>

                    {/* Smart Search */}
                    <div className="p-2 border-b border-white/5 bg-white/5">
                        <div className="flex items-center gap-2 bg-black/20 rounded px-2 py-1 border border-white/5 focus-within:border-blue-500/50">
                            <Search size={14} className="text-white/40" />
                            <input
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Smart Search (grep)..."
                                className="bg-transparent border-none outline-none text-xs w-full text-white/90 placeholder:text-white/20"
                            />
                            {isSearching && <Loader2 size={12} className="animate-spin text-blue-400" />}
                        </div>
                    </div>

                    {/* Tree or Search Results */}
                    <div className="flex-1 overflow-auto">
                        {query ? (
                            <div className="flex flex-col">
                                {searchResults.map((res, i) => (
                                    <div key={i}
                                        onClick={() => {
                                            // Open file and jump to line?
                                            openFile({ name: res.path.split('/').pop()!, path: res.path, type: 'file' });
                                        }}
                                        className="p-2 hover:bg-white/5 cursor-pointer border-b border-white/5"
                                    >
                                        <div className="text-xs font-medium text-blue-300 truncate">{res.path.split('/').pop()}</div>
                                        <div className="text-[10px] text-white/40 truncate">{res.path}</div>
                                        <div className="text-[10px] text-white/60 font-mono mt-1 pl-2 border-l-2 border-white/10 truncate">
                                            {res.line}: {res.preview}
                                        </div>
                                    </div>
                                ))}
                                {searchResults.length === 0 && !isSearching && <div className="p-4 text-center text-xs text-white/30">No results found</div>}
                            </div>
                        ) : (
                            <div>
                                {tree.map((node, i) => (
                                    <FileTreeItem
                                        key={node.path || i}
                                        node={node}
                                        level={1}
                                        expandedByPath={expandedByPath}
                                        onToggleDir={toggleDir}
                                        onOpenFile={openFile}
                                        selectedPath={activePath || undefined}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="w-10 border-r border-white/10 flex flex-col items-center pt-2 gap-2">
                    <button onClick={() => setTreeCollapsed(false)}><PanelLeftOpen size={18} className="text-white/40 hover:text-white" /></button>
                </div>
            )}

            {/* Editor Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#0f1117]">
                <div className="h-10 border-b border-white/5 flex items-center px-2 gap-2 overflow-x-auto">
                    {tabs.map(t => (
                        <div key={t.node.path}
                            onClick={() => setActivePath(t.node.path)}
                            className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs cursor-pointer border ${t.node.path === activePath ? 'bg-blue-500/10 border-blue-500/30 text-blue-200' : 'bg-white/5 border-white/5 text-white/50 hover:bg-white/10'}`}
                        >
                            <FileIcon name={t.node.name} />
                            <span className="max-w-[120px] truncate">{t.node.name}</span>
                            {t.isDirty && <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />}
                            <X size={12} className="hover:text-white" onClick={(e) => { e.stopPropagation(); closeTab(t.node.path); }} />
                        </div>
                    ))}
                </div>

                <div className="flex-1 relative">
                    {activePath ? (
                        <CodeEditor
                            code={tabs.find(t => t.node.path === activePath)?.content || ''}
                            language={activePath.split('.').pop() || 'text'}
                            onChange={updateActiveContent}
                            theme="vs-dark"
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-white/20 flex-col gap-4">
                            <Folder size={64} strokeWidth={1} />
                            <div className="text-sm">Select a file to edit</div>
                        </div>
                    )}

                    {/* Save Button Overlay */}
                    {activePath && tabs.find(t => t.node.path === activePath)?.isDirty && (
                        <div className="absolute bottom-4 right-4 z-10">
                            <button onClick={saveActiveFile} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded shadow-lg flex items-center gap-2 text-sm font-medium transition-colors">
                                {savingPath ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Save Changes
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
