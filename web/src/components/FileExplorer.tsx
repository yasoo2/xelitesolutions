
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, File, RefreshCw, FileText, Code, Image, Music, Video, Database, Package, Save, Loader2, X, Search, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { API_URL as API } from '../config';
import CodeEditor from './CodeEditor';

interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: FileNode[];
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
    if (['png', 'jpg', 'jpeg', 'svg', 'gif'].includes(ext || '')) return <Image size={14} className="text-[var(--accent-primary)]" />;
    if (['mp3', 'wav'].includes(ext || '')) return <Music size={14} className="text-[var(--accent-secondary)]" />;
    if (['mp4', 'mov'].includes(ext || '')) return <Video size={14} className="text-[var(--accent-primary)]" />;
    if (['db', 'sql'].includes(ext || '')) return <Database size={14} className="text-[var(--accent-secondary)]" />;
    if (['zip', 'tar', 'gz'].includes(ext || '')) return <Package size={14} className="text-[var(--accent-secondary)]" />;
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
    onToggleDir: (path: string) => void;
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
                        onToggleDir(node.path);
                    } else {
                        onOpenFile(node);
                    }
                }}
                onMouseEnter={(e) => !isSelected && (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')}
                onMouseLeave={(e) => !isSelected && (e.currentTarget.style.backgroundColor = 'transparent')}
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
            
            {node.type === 'directory' && expanded && node.children && (
                <div>
                    {node.children.map((child, i) => (
                        <FileTreeItem
                            key={child.path || i}
                            node={child}
                            level={level + 1}
                            expandedByPath={expandedByPath}
                            onToggleDir={onToggleDir}
                            onOpenFile={onOpenFile}
                            selectedPath={selectedPath}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default function FileExplorer({ sessionId }: FileExplorerProps) {
    const [tree, setTree] = useState<FileNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [treeError, setTreeError] = useState<string | null>(null);
    const [expandedByPath, setExpandedByPath] = useState<Record<string, boolean>>({});
    const [treeCollapsed, setTreeCollapsed] = useState(false);
    const [query, setQuery] = useState('');
    const [tabs, setTabs] = useState<OpenTab[]>([]);
    const [activePath, setActivePath] = useState<string | null>(null);
    const [savingPath, setSavingPath] = useState<string | null>(null);
    const saveFlashTimerRef = useRef<number | null>(null);
    const [savedPath, setSavedPath] = useState<string | null>(null);

    const fetchTree = async () => {
        setLoading(true);
        setTreeError(null);
        const token = localStorage.getItem('token');
        if (!token) {
            setTree([]);
            setTreeError('Unauthorized');
            setLoading(false);
            return;
        }
        try {
            const res = await fetch(`${API}/project/tree`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.status === 401) {
                localStorage.removeItem('token');
                window.dispatchEvent(new CustomEvent('auth:unauthorized'));
                setTree([]);
                setTreeError('Unauthorized');
                return;
            }
            if (!res.ok) {
                const raw = await res.text().catch(() => '');
                setTree([]);
                setTreeError(raw || `HTTP ${res.status}`);
                return;
            }
            const data = await res.json();
            if (data.tree) {
                setTree(data.tree);
            } else {
                setTree([]);
                setTreeError('Invalid response');
            }
        } catch (e) {
            console.error(e);
            setTree([]);
            setTreeError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTree();
    }, []);

    useEffect(() => {
        return () => {
            if (saveFlashTimerRef.current != null) window.clearTimeout(saveFlashTimerRef.current);
        };
    }, []);

    const toggleDir = useCallback((dirPath: string) => {
        setExpandedByPath((prev) => ({ ...prev, [dirPath]: !prev[dirPath] }));
    }, []);

    const filterTree = useCallback((nodes: FileNode[], q: string): FileNode[] => {
        const s = String(q || '').trim().toLowerCase();
        if (!s) return nodes;

        const visit = (n: FileNode): FileNode | null => {
            const selfMatch = n.name.toLowerCase().includes(s) || n.path.toLowerCase().includes(s);
            if (n.type === 'file') return selfMatch ? n : null;
            const children = (n.children || []).map(visit).filter(Boolean) as FileNode[];
            if (selfMatch || children.length) return { ...n, children };
            return null;
        };

        return nodes.map(visit).filter(Boolean) as FileNode[];
    }, []);

    const filteredTree = useMemo(() => filterTree(tree, query), [filterTree, tree, query]);

    const loadFileContent = useCallback(async (node: FileNode) => {
        setTabs((prev) =>
            prev.map((t) =>
                t.node.path === node.path ? { ...t, isLoading: true, error: null } : t
            )
        );

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                window.dispatchEvent(new CustomEvent('auth:unauthorized'));
                setTabs((prev) =>
                    prev.map((t) =>
                        t.node.path === node.path ? { ...t, isLoading: false, error: 'Unauthorized' } : t
                    )
                );
                return;
            }

            const res = await fetch(`${API}/project/content?path=${encodeURIComponent(node.path)}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.status === 401) {
                localStorage.removeItem('token');
                window.dispatchEvent(new CustomEvent('auth:unauthorized'));
                setTabs((prev) =>
                    prev.map((t) =>
                        t.node.path === node.path ? { ...t, isLoading: false, error: 'Unauthorized' } : t
                    )
                );
                return;
            }
            if (!res.ok) {
                const raw = await res.text().catch(() => '');
                setTabs((prev) =>
                    prev.map((t) =>
                        t.node.path === node.path ? { ...t, isLoading: false, error: raw || `HTTP ${res.status}` } : t
                    )
                );
                return;
            }
            const json = await res.json();
            setTabs((prev) =>
                prev.map((t) =>
                    t.node.path === node.path
                        ? { ...t, isLoading: false, error: null, content: String(json.content || ''), isDirty: false, lastSavedAt: Date.now() }
                        : t
                )
            );
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            setTabs((prev) =>
                prev.map((t) =>
                    t.node.path === node.path ? { ...t, isLoading: false, error: msg } : t
                )
            );
        }
    }, []);

    const openFile = useCallback(async (node: FileNode) => {
        if (node.type !== 'file') return;
        setActivePath(node.path);
        setTabs((prev) => {
            const existing = prev.find((t) => t.node.path === node.path);
            if (existing) return prev;
            return [
                ...prev,
                { node, content: '', isLoading: true, error: null, isDirty: false, lastSavedAt: null },
            ];
        });
        await loadFileContent(node);
    }, [loadFileContent]);

    const activeTab = useMemo(() => tabs.find((t) => t.node.path === activePath) || null, [tabs, activePath]);

    const updateActiveContent = useCallback((val: string | undefined) => {
        setTabs((prev) =>
            prev.map((t) =>
                t.node.path === activePath
                    ? { ...t, content: val || '', isDirty: true }
                    : t
            )
        );
    }, [activePath]);

    const saveActiveFile = useCallback(async () => {
        const tab = tabs.find((t) => t.node.path === activePath);
        if (!tab) return;
        if (!tab.isDirty) return;

        setSavingPath(tab.node.path);
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                window.dispatchEvent(new CustomEvent('auth:unauthorized'));
                return;
            }
            const res = await fetch(`${API}/project/content`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ path: tab.node.path, content: tab.content }),
            });
            if (!res.ok) {
                const raw = await res.text().catch(() => '');
                throw new Error(raw || `HTTP ${res.status}`);
            }
            setTabs((prev) =>
                prev.map((t) =>
                    t.node.path === tab.node.path ? { ...t, isDirty: false, lastSavedAt: Date.now(), error: null } : t
                )
            );
            setSavedPath(tab.node.path);
            if (saveFlashTimerRef.current != null) window.clearTimeout(saveFlashTimerRef.current);
            saveFlashTimerRef.current = window.setTimeout(() => setSavedPath(null), 900);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Failed to save file';
            setTabs((prev) =>
                prev.map((t) =>
                    t.node.path === tab.node.path ? { ...t, error: msg } : t
                )
            );
        } finally {
            setSavingPath(null);
        }
    }, [activePath, tabs]);

    const closeTab = useCallback((pathToClose: string) => {
        const tab = tabs.find((t) => t.node.path === pathToClose);
        if (tab?.isDirty) {
            const ok = confirm(`لديك تعديلات غير محفوظة في ${tab.node.name}. هل تريد الإغلاق؟`);
            if (!ok) return;
        }

        setTabs((prev) => prev.filter((t) => t.node.path !== pathToClose));
        setActivePath((prevActive) => {
            if (prevActive !== pathToClose) return prevActive;
            const remaining = tabs.filter((t) => t.node.path !== pathToClose);
            return remaining.length ? remaining[remaining.length - 1].node.path : null;
        });
    }, [tabs]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key.toLowerCase() !== 's') return;
            e.preventDefault();
            saveActiveFile();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [saveActiveFile]);
    
    return (
        <div style={{ display: 'flex', height: '100%', minHeight: 0, overflow: 'hidden' }}>
            {!treeCollapsed ? (
                <div style={{ width: 260, borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <div style={{ padding: 10, borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Folder size={14} /> مساحة العمل
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button onClick={() => setTreeCollapsed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }} aria-label="Collapse">
                                <PanelLeftClose size={16} />
                            </button>
                            <button onClick={fetchTree} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }} aria-label="Refresh">
                                <RefreshCw size={16} className={loading ? 'spin' : ''} />
                            </button>
                        </div>
                    </div>

                    <div style={{ padding: 10, borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border-color)', borderRadius: 12, padding: '6px 10px', background: 'rgba(255,255,255,0.02)' }}>
                            <Search size={14} style={{ color: 'var(--text-muted)' }} />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="ابحث عن ملف..."
                                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: 12 }}
                            />
                            {query ? (
                                <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }} aria-label="Clear search">
                                    <X size={14} />
                                </button>
                            ) : null}
                        </div>
                    </div>

                    <div style={{ flex: 1, overflow: 'auto', padding: '8px 0', minHeight: 0 }}>
                        {treeError ? (
                            <div style={{ padding: '6px 10px', color: 'var(--text-muted)', fontSize: 12 }}>
                                {treeError === 'Unauthorized' ? 'الرجاء تسجيل الدخول لعرض الملفات.' : `تعذر تحميل الملفات: ${treeError}`}
                            </div>
                        ) : null}

                        {filteredTree.map((node, i) => (
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
                </div>
            ) : (
                <div style={{ width: 44, borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10, gap: 8 }}>
                    <button onClick={() => setTreeCollapsed(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--text-muted)' }} aria-label="Expand">
                        <PanelLeftOpen size={18} />
                    </button>
                    <button onClick={fetchTree} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--text-muted)' }} aria-label="Refresh">
                        <RefreshCw size={18} className={loading ? 'spin' : ''} />
                    </button>
                </div>
            )}

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: 0 }}>
                <div style={{ height: 42, borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 10px', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'auto' }}>
                        {tabs.length === 0 ? (
                            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>افتح ملفاً للبدء.</div>
                        ) : (
                            tabs.map((t) => {
                                const active = t.node.path === activePath;
                                return (
                                    <button
                                        key={t.node.path}
                                        onClick={() => setActivePath(t.node.path)}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            padding: '6px 10px',
                                            borderRadius: 999,
                                            border: '1px solid rgba(255,255,255,0.10)',
                                            background: active ? 'rgba(var(--accent-primary-rgb), 0.14)' : 'rgba(0,0,0,0.10)',
                                            color: 'var(--text-primary)',
                                            cursor: 'pointer',
                                            fontSize: 12,
                                            maxWidth: 260,
                                        }}
                                    >
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                                            <FileIcon name={t.node.name} />
                                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {t.node.name}
                                            </span>
                                            {t.isDirty ? <span style={{ width: 6, height: 6, borderRadius: 999, background: 'rgba(245, 158, 11, 0.95)' }} /> : null}
                                        </span>
                                        <span
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                closeTab(t.node.path);
                                            }}
                                            style={{ display: 'inline-flex', padding: 2, borderRadius: 999, color: 'var(--text-muted)' }}
                                            role="button"
                                            aria-label="Close"
                                        >
                                            <X size={14} />
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
                        <button
                            onClick={saveActiveFile}
                            disabled={!activeTab || !activeTab.isDirty || savingPath === activeTab.node.path}
                            className="btn"
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', fontSize: 12, opacity: !activeTab || !activeTab.isDirty ? 0.55 : 1 }}
                        >
                            {activeTab && savingPath === activeTab.node.path ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                            حفظ
                        </button>
                        {activeTab && savedPath === activeTab.node.path ? (
                            <div style={{ fontSize: 12, color: 'rgba(34, 197, 94, 0.95)' }}>تم الحفظ</div>
                        ) : null}
                    </div>
                </div>

                <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}>
                    {activeTab ? (
                        <>
                            {activeTab.isLoading ? (
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.10)', zIndex: 2 }}>
                                    <Loader2 className="spin" />
                                </div>
                            ) : null}
                            {activeTab.error ? (
                                <div style={{ position: 'absolute', top: 10, left: 10, right: 10, padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: 12, background: 'rgba(0,0,0,0.28)', color: 'var(--text-primary)', fontSize: 12, zIndex: 3 }}>
                                    {activeTab.error === 'Unauthorized' ? 'الرجاء تسجيل الدخول.' : activeTab.error}
                                </div>
                            ) : null}
                            <CodeEditor
                                code={activeTab.content}
                                language={activeTab.node.name.split('.').pop() || 'text'}
                                onChange={updateActiveContent}
                                theme="vs-dark"
                            />
                        </>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column', gap: 10, height: '100%' }}>
                            <Folder size={48} style={{ opacity: 0.2 }} />
                            <div style={{ fontSize: 13 }}>اختر ملفاً من الشجرة لفتحه.</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
