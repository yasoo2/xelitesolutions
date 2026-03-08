import React, { useCallback, useEffect, useRef, useState, Suspense, lazy } from 'react';
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
    Settings,
    Star,
    Pin,
    Image,
    Database,
    Terminal,
    Globe,
    Lock,
    Package,
    FileJson,
    Braces,
    Hash,
    Palette,
    Replace,
    CaseSensitive,
    Regex,
    Columns,
    GitCompareArrows,
    Map,
    TerminalSquare,
    type LucideIcon
} from 'lucide-react';
import { API_URL as API } from '../config';
import CodeEditor from './CodeEditor';
const DiffViewer = lazy(() => import('./DiffViewer'));
import { motion, AnimatePresence } from 'framer-motion';
import { githubService, GitHubRepo, GitHubUser } from '../services/githubService';

// ═══════════════════════════════════════════════════════
// Professional File Icon Map (VS Code-style)
// ═══════════════════════════════════════════════════════
const FILE_ICON_MAP: Record<string, { icon: LucideIcon; color: string }> = {
    // TypeScript / JavaScript
    ts: { icon: Code, color: '#3178c6' },
    tsx: { icon: Code, color: '#3178c6' },
    js: { icon: Braces, color: '#f7df1e' },
    jsx: { icon: Braces, color: '#61dafb' },
    mjs: { icon: Braces, color: '#f7df1e' },
    cjs: { icon: Braces, color: '#f7df1e' },
    // Styles
    css: { icon: Palette, color: '#1572b6' },
    scss: { icon: Palette, color: '#cc6699' },
    less: { icon: Palette, color: '#1d365d' },
    // Markup
    html: { icon: Globe, color: '#e44d26' },
    htm: { icon: Globe, color: '#e44d26' },
    xml: { icon: FileText, color: '#e37933' },
    svg: { icon: Image, color: '#ffb13b' },
    // Data
    json: { icon: FileJson, color: '#cbcb41' },
    yaml: { icon: FileText, color: '#cb171e' },
    yml: { icon: FileText, color: '#cb171e' },
    toml: { icon: FileText, color: '#9c4121' },
    csv: { icon: FileText, color: '#237346' },
    // Config
    env: { icon: Lock, color: '#ecd53f' },
    gitignore: { icon: Hash, color: '#f05032' },
    dockerignore: { icon: Hash, color: '#2496ed' },
    // DevOps
    dockerfile: { icon: Package, color: '#2496ed' },
    // Database
    sql: { icon: Database, color: '#336791' },
    prisma: { icon: Database, color: '#2d3748' },
    // Documentation
    md: { icon: FileText, color: '#519aba' },
    mdx: { icon: FileText, color: '#519aba' },
    txt: { icon: FileText, color: '#89898a' },
    // Images
    png: { icon: Image, color: '#a074c4' },
    jpg: { icon: Image, color: '#a074c4' },
    jpeg: { icon: Image, color: '#a074c4' },
    gif: { icon: Image, color: '#a074c4' },
    webp: { icon: Image, color: '#a074c4' },
    ico: { icon: Image, color: '#a074c4' },
    // Terminal/Scripts
    sh: { icon: Terminal, color: '#89e051' },
    bash: { icon: Terminal, color: '#89e051' },
    zsh: { icon: Terminal, color: '#89e051' },
    bat: { icon: Terminal, color: '#c1f12e' },
    // Python
    py: { icon: Code, color: '#3572a5' },
    // Go
    go: { icon: Code, color: '#00add8' },
    // Rust
    rs: { icon: Code, color: '#dea584' },
    // Lock files
    lock: { icon: Lock, color: '#89898a' },
};

// Special full-name matches
const FILE_NAME_MAP: Record<string, { icon: LucideIcon; color: string }> = {
    'package.json': { icon: Package, color: '#cb3837' },
    'tsconfig.json': { icon: Settings, color: '#3178c6' },
    'vite.config.ts': { icon: Settings, color: '#646cff' },
    'vite.config.js': { icon: Settings, color: '#646cff' },
    '.gitignore': { icon: Hash, color: '#f05032' },
    '.env': { icon: Lock, color: '#ecd53f' },
    '.env.local': { icon: Lock, color: '#ecd53f' },
    'Dockerfile': { icon: Package, color: '#2496ed' },
    'docker-compose.yml': { icon: Package, color: '#2496ed' },
    'README.md': { icon: FileText, color: '#519aba' },
};

interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: FileNode[];
    hasChildren?: boolean;
    loaded?: boolean;
    gitStatus?: string;
}

interface SearchResult {
    path: string;
    line: number;
    preview: string;
}

interface FileExplorerProps {
    sessionId?: string;
    activeRepo?: GitHubRepo | null;
    githubUser?: GitHubUser | null;
}

export interface EliteFileExplorerRef {
    triggerConnectWorkspace: () => void;
}

type OpenTab = {
    node: FileNode;
    content: string;
    isLoading: boolean;
    error: string | null;
    isDirty: boolean;
    lastSavedAt: number | null;
    isPinned?: boolean;
};

interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    node: FileNode | null;
}

const FileIcon = ({ name }: { name: string }) => {
    // Check full filename first (e.g. package.json, Dockerfile)
    const lowerName = name.toLowerCase();
    const nameMatch = FILE_NAME_MAP[name] || FILE_NAME_MAP[lowerName];
    if (nameMatch) {
        const IconComp = nameMatch.icon;
        return <IconComp size={14} style={{ color: nameMatch.color, flexShrink: 0 }} />;
    }
    // Then check extension
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const extMatch = FILE_ICON_MAP[ext];
    if (extMatch) {
        const IconComp = extMatch.icon;
        return <IconComp size={14} style={{ color: extMatch.color, flexShrink: 0 }} />;
    }
    return <File size={14} style={{ color: '#89898a', flexShrink: 0 }} />;
};

// Folder icon with special colors for common directories
const FolderIcon = ({ name, expanded }: { name: string; expanded: boolean }) => {
    const folderColors: Record<string, string> = {
        src: '#42a5f5', components: '#66bb6a', pages: '#ab47bc', styles: '#ec407a',
        utils: '#ffa726', hooks: '#29b6f6', services: '#26a69a', api: '#ef5350',
        public: '#8d6e63', assets: '#78909c', tests: '#9ccc65', __tests__: '#9ccc65',
        node_modules: '#90a4ae', '.git': '#f05032', dist: '#78909c', build: '#78909c',
        config: '#ffa000', types: '#3178c6', lib: '#7e57c2', store: '#ff7043',
    };
    const color = folderColors[name.toLowerCase()] || (expanded ? '#fdd835' : '#90a4ae');
    return <Folder size={14} style={{ color, flexShrink: 0 }} fill={expanded ? color : 'none'} />;
};

const FileTreeItem = ({
    node,
    level,
    expandedByPath,
    onToggleDir,
    onOpenFile,
    onContextMenu,
    selectedPath,
    gitStatusMap,
    onMoveFile,
}: {
    node: FileNode;
    level: number;
    expandedByPath: Record<string, boolean>;
    onToggleDir: (node: FileNode) => void;
    onOpenFile: (node: FileNode) => void;
    onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
    selectedPath?: string;
    gitStatusMap?: Record<string, string>;
    onMoveFile?: (sourcePath: string, targetDir: string) => void;
}) => {
    const expanded = !!expandedByPath[node.path];
    const isSelected = selectedPath === node.path;

    // Git status coloring (VS Code style)
    const fileStatus = gitStatusMap?.[node.path] || '';
    // For directories, check if any child has a git status
    const dirHasChanges = node.type === 'directory' && gitStatusMap &&
        Object.keys(gitStatusMap).some(k => k.startsWith(node.path + '/'));

    const getGitColor = (): string | undefined => {
        if (!fileStatus && !dirHasChanges) return undefined;
        const s = fileStatus || '';
        if (s.includes('D')) return '#f14c4c'; // Deleted - red
        if (s.includes('M') || s.includes('MM') || s.includes('UU')) return '#e2b340'; // Modified - orange/amber
        if (s === '??' || s.includes('A') || s === '!!') return '#73c991'; // Added/untracked - green
        if (s.includes('R')) return '#4ec9b0'; // Renamed - cyan
        if (dirHasChanges) return '#e2b340'; // Directory with changes - subtle amber
        return undefined;
    };
    const gitColor = getGitColor();
    const [isDragOver, setIsDragOver] = useState(false);

    return (
        <div
            style={{ paddingLeft: level * 12 }}
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', node.path);
                e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
                if (node.type === 'directory') {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setIsDragOver(true);
                }
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (node.type === 'directory') {
                    const sourcePath = e.dataTransfer.getData('text/plain');
                    if (sourcePath && sourcePath !== node.path && onMoveFile) {
                        onMoveFile(sourcePath, node.path);
                    }
                }
            }}
        >
            <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className={`elite-file-item ${isSelected ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''}`}
                style={isDragOver ? { background: 'rgba(100, 108, 255, 0.15)', borderRadius: 4 } : undefined}
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
                    <FolderIcon name={node.name} expanded={expanded} />
                ) : (
                    <FileIcon name={node.name} />
                )}
                <span className="elite-file-name" style={gitColor ? { color: gitColor } : undefined}>{node.name}</span>
                {fileStatus && (
                    <span style={{
                        marginLeft: 'auto',
                        fontSize: '9px',
                        fontWeight: 600,
                        opacity: 0.8,
                        padding: '0 4px',
                        borderRadius: '3px',
                        background: gitColor ? `${gitColor}15` : undefined,
                        color: gitColor,
                        letterSpacing: '0.3px'
                    }}>
                        {fileStatus.trim()}
                    </span>
                )}
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
                                    gitStatusMap={gitStatusMap}
                                    onMoveFile={onMoveFile}
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
            { icon: Pin, label: 'Pin / Unpin', action: 'pin' },
            { icon: Columns, label: 'Open in Split View', action: 'splitView' },
            { icon: GitCompareArrows, label: 'Show Diff', action: 'showDiff' },
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

const ModalInput = ({
    isOpen,
    onClose,
    onSubmit,
    title,
    placeholder,
    loading
}: {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (val: string) => void;
    title: string;
    placeholder: string;
    loading?: boolean;
}) => {
    const [val, setVal] = useState('');
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
        }}>
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="elite-modal"
                style={{
                    background: 'var(--surface-color)', padding: 24, borderRadius: 12,
                    width: 400, border: '1px solid var(--border-color)',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
                }}
            >
                <h3 style={{ marginTop: 0, marginBottom: 16 }}>{title}</h3>
                <input
                    autoFocus
                    className="elite-input"
                    value={val}
                    onChange={e => setVal(e.target.value)}
                    placeholder={placeholder}
                    style={{ width: '100%', marginBottom: 16 }}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !loading) onSubmit(val);
                        if (e.key === 'Escape') onClose();
                    }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} className="elite-btn-secondary" disabled={loading}>Cancel</button>
                    <button onClick={() => onSubmit(val)} className="elite-btn-primary" disabled={loading || !val}>
                        {loading ? <Loader2 size={16} className="animate-spin" /> : 'Confirm'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const EliteFileExplorer = React.forwardRef<EliteFileExplorerRef, FileExplorerProps>(({ sessionId, activeRepo, githubUser }, ref) => {
    const [viewMode, setViewMode] = useState<'local' | 'github'>('local');
    const [repos, setRepos] = useState<any[]>([]);
    // const [activeRepo, setActiveRepo] = useState<string | null>(null); // Removed, now from props
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
    const [activeWorkspace, setActiveWorkspace] = useState<{ path: string; name: string } | null>(null);
    const [gitStatusMap, setGitStatusMap] = useState<Record<string, string>>({});
    const [gitChangeCount, setGitChangeCount] = useState(0);

    // Broadcast git change count to external components (e.g. FileExplorerPanel)
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('git-change-count', { detail: gitChangeCount }));
    }, [gitChangeCount]);
    const [pinnedFiles, setPinnedFiles] = useState<FileNode[]>(() => {
        try {
            const saved = localStorage.getItem('joe_pinned_files');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Find & Replace state
    const [showFindReplace, setShowFindReplace] = useState(false);
    const [findText, setFindText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [findRegex, setFindRegex] = useState(false);
    const [findCaseSensitive, setFindCaseSensitive] = useState(false);
    const [findMatchCount, setFindMatchCount] = useState<number | null>(null);
    const [findReplacing, setFindReplacing] = useState(false);

    // Phase 3: Split View, Diff, Minimap, Terminal
    const [splitPath, setSplitPath] = useState<string | null>(null);
    const [splitContent, setSplitContent] = useState<string>('');
    const [diffState, setDiffState] = useState<{ visible: boolean; filePath: string; original: string; modified: string } | null>(null);
    const [showMinimap, setShowMinimap] = useState(true);
    const [showTerminal, setShowTerminal] = useState(false);

    // Modal States
    const [modalConfig, setModalConfig] = useState<{
        open: boolean;
        type: 'folder' | 'clone' | null;
        loading: boolean;
    }>({ open: false, type: null, loading: false });

    // Expose imperative handle for external buttons (e.g. from FileExplorerPanel)
    React.useImperativeHandle(ref, () => ({
        triggerConnectWorkspace: () => {
            setModalConfig({ open: true, type: 'folder', loading: false });
        }
    }));

    // Sync viewMode with activeRepo
    useEffect(() => {
        if (activeRepo) {
            setViewMode('github');
            loadRoot();
        } else {
            setViewMode('local');
            loadRoot();
        }
    }, [activeRepo]);

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

        if (viewMode === 'github' && activeRepo) {
            try {
                const [owner, repoName] = activeRepo.fullName.split('/');
                const contents = await githubService.getContents(owner, repoName, path || '');
                const tree: FileNode[] = contents.map(item => ({
                    name: item.name,
                    path: item.path,
                    type: item.type === 'dir' ? 'directory' : 'file',
                    hasChildren: item.type === 'dir'
                }));
                return { tree };
            } catch (e) {
                console.error('Failed to fetch GitHub tree', e);
                return { tree: [] };
            }
        }

        try {
            const url = `${API}/project/tree` + (path ? `?path=${encodeURIComponent(path)}` : '');
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) return { tree: [] };
            const data = await res.json();
            if (!path) {
                // We fetched the root, let's also fetch workspace info
                const rootRes = await fetch(`${API}/project/root`, { headers: { Authorization: `Bearer ${token}` } });
                const rootData = await rootRes.json();
                setActiveWorkspace({ path: rootData.path, name: rootData.name });
            }
            return { tree: data.tree };
        } catch {
            return { tree: [] };
        }
    };

    const loadRoot = async () => {
        setLoading(true);
        setExpandedByPath({});
        const { tree: roots } = await fetchTree();
        setTree(roots || []);
        setLoading(false);
        fetchGitStatus();
    };

    const fetchGitStatus = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const res = await fetch(`${API}/git/status`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            if (!data.initialized || !data.files) return;
            const statusObj: Record<string, string> = {};
            for (const f of data.files) {
                statusObj[f.file] = f.status;
            }
            setGitStatusMap(statusObj);
            setGitChangeCount(data.files.length);
        } catch {
            // Git not available, ignore
        }
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

            // Cmd/Ctrl + H: Toggle Find & Replace
            if ((e.metaKey || e.ctrlKey) && e.key === 'h') {
                e.preventDefault();
                setShowFindReplace(p => !p);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activePath, tabs]);

    // Auto-save: save dirty files after 2s of inactivity  
    useEffect(() => {
        const dirtyTab = tabs.find(t => t.isDirty && t.node.path === activePath);
        if (!dirtyTab) return;
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(() => {
            saveActiveFile();
        }, 2000);
        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        };
    }, [tabs, activePath]);

    // Periodic git status refresh (every 10 seconds)
    useEffect(() => {
        const interval = setInterval(() => {
            fetchGitStatus();
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    // Pin/Unpin toggle
    const togglePin = useCallback((node: FileNode) => {
        setPinnedFiles(prev => {
            const exists = prev.some(p => p.path === node.path);
            const next = exists ? prev.filter(p => p.path !== node.path) : [...prev, node];
            localStorage.setItem('joe_pinned_files', JSON.stringify(next));
            return next;
        });
    }, []);

    // Find & Replace functions
    const handleFindCount = useCallback(async () => {
        if (!findText || !activePath) { setFindMatchCount(null); return; }
        const token = localStorage.getItem('token');
        if (!token) return;
        try {
            const res = await fetch(`${API}/git/search-replace`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ file: activePath, search: findText, isRegex: findRegex, caseSensitive: findCaseSensitive })
            });
            const data = await res.json();
            setFindMatchCount(data.matches ?? 0);
        } catch { setFindMatchCount(0); }
    }, [findText, activePath, findRegex, findCaseSensitive]);

    const handleReplaceAll = useCallback(async () => {
        if (!findText || !activePath) return;
        const token = localStorage.getItem('token');
        if (!token) return;
        setFindReplacing(true);
        try {
            const res = await fetch(`${API}/git/search-replace`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ file: activePath, search: findText, replace: replaceText, isRegex: findRegex, caseSensitive: findCaseSensitive })
            });
            const data = await res.json();
            if (data.ok) {
                // Update the open tab content
                setTabs(p => p.map(t => t.node.path === activePath ? { ...t, content: data.content, isDirty: false } : t));
                setFindMatchCount(0);
                fetchGitStatus();
            }
        } catch { }
        setFindReplacing(false);
    }, [findText, replaceText, activePath, findRegex, findCaseSensitive]);

    // Auto-count matches when find text changes
    useEffect(() => {
        if (!showFindReplace || !findText) { setFindMatchCount(null); return; }
        const t = setTimeout(handleFindCount, 300);
        return () => clearTimeout(t);
    }, [findText, findRegex, findCaseSensitive, activePath, showFindReplace]);


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

    const loadFileContent = useCallback(async (node: FileNode): Promise<string> => {
        setTabs(prev => [...prev, { node, content: '', isLoading: true, error: null, isDirty: false, lastSavedAt: null }]);

        try {
            const token = localStorage.getItem('token');
            const isLocalPath = node.path.startsWith('/');

            // Use GitHub API only for actual GitHub repo paths (not local filesystem paths)
            if (viewMode === 'github' && activeRepo && !isLocalPath) {
                const [owner, repoName] = activeRepo.fullName.split('/');
                const results = await githubService.getContents(owner, repoName, node.path);
                const fileData = Array.isArray(results) ? results[0] : results;
                const content = (fileData as any)?.content || '';
                setTabs(prev => prev.map(t => t.node.path === node.path ? { ...t, content, isLoading: false } : t));
                return content;
            }

            // Use local project API for local filesystem files
            const res = await fetch(`${API}/project/content?path=${encodeURIComponent(node.path)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const json = await res.json();
            const content = json.content || '';
            setTabs(prev => prev.map(t => t.node.path === node.path ? { ...t, content, isLoading: false } : t));
            return content;
        } catch (e) {
            setTabs(prev => prev.map(t => t.node.path === node.path ? { ...t, error: 'Failed', isLoading: false } : t));
            return '';
        }
    }, [viewMode, activeRepo]);

    const openFile = useCallback(async (node: FileNode) => {
        let content = '';
        const existing = tabs.find(t => t.node.path === node.path);
        if (existing) {
            setActivePath(node.path);
            content = existing.content;
        } else {
            content = await loadFileContent(node);
            setActivePath(node.path);
        }
        // Switch workspace panel to 'preview' tab
        window.dispatchEvent(new CustomEvent('joe:workspace-tab-switch', { detail: { tab: 'preview' } }));
        // Send file content to PreviewPanel for display
        window.dispatchEvent(new CustomEvent('preview:code_diff', {
            detail: { path: node.path, content }
        }));
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
            setTabs(p => p.map(t => t.node.path === tab.node.path ? { ...t, isDirty: false, lastSavedAt: Date.now() } : t));
            setSavedPath(tab.node.path);
            setTimeout(() => setSavedPath(null), 1000);
            // Refresh git status after save
            fetchGitStatus();
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

            case 'pin':
                togglePin(node);
                break;

            case 'splitView':
                // Open file in split view
                try {
                    const res = await fetch(`${API}/project/content?path=${encodeURIComponent(node.path)}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        setSplitPath(node.path);
                        setSplitContent(data.content || '');
                    }
                } catch { }
                break;

            case 'showDiff':
                // Show git diff for the file
                try {
                    const diffRes = await fetch(`${API}/git/diff?file=${encodeURIComponent(node.path)}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const diffData = await diffRes.json();
                    // Fetch current content
                    const contentRes = await fetch(`${API}/project/content?path=${encodeURIComponent(node.path)}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const contentData = await contentRes.json();
                    const currentContent = contentData.content || '';
                    // Reconstruct original from diff (approximate: show current vs last committed)
                    // For a proper approach, use git show HEAD:file
                    const origRes = await fetch(`${API}/git/search-replace`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ file: node.path, search: '', caseSensitive: false })
                    });
                    setDiffState({
                        visible: true,
                        filePath: node.path,
                        original: diffData.diff ? `// Git Diff for ${node.name}\n${diffData.diff}` : currentContent,
                        modified: currentContent
                    });
                } catch { }
                break;
        }
    };

    // Drag & Drop: move file/folder to a new directory
    const handleMoveFile = useCallback(async (sourcePath: string, targetDir: string) => {
        const token = localStorage.getItem('token');
        if (!token) return;
        const fileName = sourcePath.split('/').pop();
        const newPath = `${targetDir}/${fileName}`;
        if (newPath === sourcePath) return;
        try {
            const res = await fetch(`${API}/project/file/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ oldPath: sourcePath, newPath })
            });
            if (res.ok) {
                await loadRoot();
                setTabs(prev => prev.map(t =>
                    t.node.path === sourcePath
                        ? { ...t, node: { ...t.node, path: newPath } }
                        : t
                ));
                if (activePath === sourcePath) setActivePath(newPath);
            } else {
                alert('Failed to move file');
            }
        } catch {
            alert('Error moving file');
        }
    }, [activePath]);

    const handleModalSubmit = async (val: string) => {
        if (!val) return;
        const type = modalConfig.type;
        setModalConfig(p => ({ ...p, loading: true }));

        try {
            if (type === 'folder') {
                const res = await fetch(`${API}/project/root`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                    body: JSON.stringify({ path: val })
                });
                if (res.ok) {
                    await loadRoot();
                    setModalConfig({ open: false, type: null, loading: false });
                } else {
                    alert('Path not found');
                    setModalConfig(p => ({ ...p, loading: false }));
                }
            } else if (type === 'clone') {
                const res = await fetch(`${API}/project/git/clone`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
                    body: JSON.stringify({ repoUrl: val })
                });
                if (res.ok) {
                    await loadRoot();
                    setModalConfig({ open: false, type: null, loading: false });
                } else {
                    const error = await res.json();
                    alert(error.error || 'Clone failed');
                    setModalConfig(p => ({ ...p, loading: false }));
                }
            }
        } catch {
            alert('Operation failed');
            setModalConfig(p => ({ ...p, loading: false }));
        }
    };

    const pathParts = activePath?.split('/').filter(Boolean) || [];

    return (
        <div className="elite-file-explorer">
            <ModalInput
                isOpen={modalConfig.open}
                onClose={() => setModalConfig({ open: false, type: null, loading: false })}
                onSubmit={handleModalSubmit}
                title={modalConfig.type === 'folder' ? 'Open Absolute Path' : 'Clone Repository'}
                placeholder={modalConfig.type === 'folder' ? '/app/src/...' : 'https://github.com/user/repo'}
                loading={modalConfig.loading}
            />

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
                                    value={viewMode}
                                    onChange={async (e) => {
                                        const v = e.target.value;
                                        if (v === 'local' || v === 'github') {
                                            setViewMode(v as any);
                                            loadRoot();
                                            return;
                                        }
                                        if (v === 'folder') {
                                            setModalConfig({ open: true, type: 'folder', loading: false });
                                        } else if (v === 'clone') {
                                            setModalConfig({ open: true, type: 'clone', loading: false });
                                        } else if (v === 'system') {
                                            setLoading(true);
                                            try {
                                                await fetch(`${API}/project/reset`, {
                                                    method: 'POST',
                                                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                                                });
                                                await loadRoot();
                                            } catch {
                                                alert('Failed to reset');
                                            }
                                            setLoading(false);
                                        }
                                    }}
                                >
                                    <option value="local">📂 {activeWorkspace?.name || 'Local Project'}</option>
                                    {activeRepo && <option value="github">🐙 {activeRepo.name}</option>}
                                    <option value="system">🖥️ Local System</option>
                                    <option value="folder">📁 Open Folder...</option>
                                </select>
                                {viewMode === 'github' && activeRepo ? (
                                    <div style={{ fontSize: '10px', opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={activeRepo.fullName}>
                                        Connected: {activeRepo.fullName}
                                    </div>
                                ) : activeWorkspace && (
                                    <div style={{ fontSize: '10px', opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={activeWorkspace.path}>
                                        {activeWorkspace.path}
                                    </div>
                                )}
                            </div>

                            <div className="elite-header-actions">
                                <button
                                    onClick={() => setShowMinimap(p => !p)}
                                    className="elite-icon-btn"
                                    title={showMinimap ? 'Hide Minimap' : 'Show Minimap'}
                                    style={{ color: showMinimap ? 'var(--accent-primary)' : undefined }}
                                >
                                    <Map size={14} />
                                </button>
                                <button
                                    onClick={() => setShowTerminal(p => !p)}
                                    className="elite-icon-btn"
                                    title={showTerminal ? 'Hide Terminal' : 'Show Terminal'}
                                    style={{ color: showTerminal ? 'var(--accent-primary)' : undefined }}
                                >
                                    <TerminalSquare size={14} />
                                </button>
                                <button
                                    onClick={() => setShowFindReplace(p => !p)}
                                    className="elite-icon-btn"
                                    title="Find & Replace (Ctrl+H)"
                                    style={{ color: showFindReplace ? 'var(--accent-primary)' : undefined }}
                                >
                                    <Replace size={14} />
                                </button>
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

                        {/* Find & Replace Panel */}
                        <AnimatePresence>
                            {showFindReplace && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    style={{
                                        borderBottom: '1px solid var(--border-color)',
                                        padding: '8px 10px',
                                        background: 'rgba(255,255,255,0.02)',
                                        overflow: 'hidden'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                                        <Search size={12} style={{ opacity: 0.5 }} />
                                        <input
                                            autoFocus
                                            value={findText}
                                            onChange={e => setFindText(e.target.value)}
                                            placeholder="Find..."
                                            className="elite-input"
                                            style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
                                            onKeyDown={e => { if (e.key === 'Escape') setShowFindReplace(false); }}
                                        />
                                        <button
                                            onClick={() => setFindRegex(p => !p)}
                                            className="elite-icon-btn"
                                            title="Regex"
                                            style={{ opacity: findRegex ? 1 : 0.4, color: findRegex ? 'var(--accent-primary)' : undefined }}
                                        >
                                            <Regex size={12} />
                                        </button>
                                        <button
                                            onClick={() => setFindCaseSensitive(p => !p)}
                                            className="elite-icon-btn"
                                            title="Case Sensitive"
                                            style={{ opacity: findCaseSensitive ? 1 : 0.4, color: findCaseSensitive ? 'var(--accent-primary)' : undefined }}
                                        >
                                            <CaseSensitive size={12} />
                                        </button>
                                        {findMatchCount !== null && (
                                            <span style={{ fontSize: 10, opacity: 0.6, whiteSpace: 'nowrap' }}>
                                                {findMatchCount} match{findMatchCount !== 1 ? 'es' : ''}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Replace size={12} style={{ opacity: 0.5 }} />
                                        <input
                                            value={replaceText}
                                            onChange={e => setReplaceText(e.target.value)}
                                            placeholder="Replace..."
                                            className="elite-input"
                                            style={{ flex: 1, fontSize: 11, padding: '3px 6px' }}
                                            onKeyDown={e => { if (e.key === 'Enter') handleReplaceAll(); }}
                                        />
                                        <button
                                            onClick={handleReplaceAll}
                                            className="elite-icon-btn"
                                            title="Replace All"
                                            disabled={findReplacing || !findText || !activePath}
                                            style={{ fontSize: 10, padding: '2px 6px', opacity: findReplacing ? 0.5 : 1 }}
                                        >
                                            {findReplacing ? <Loader2 size={12} className="animate-spin" /> : 'All'}
                                        </button>
                                        <button
                                            onClick={() => setShowFindReplace(false)}
                                            className="elite-icon-btn"
                                            title="Close"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                    {!activePath && (
                                        <div style={{ fontSize: 10, opacity: 0.4, marginTop: 4 }}>
                                            Open a file to use Find & Replace
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Breadcrumb Path Bar */}
                        {activePath && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 2,
                                padding: '4px 10px', fontSize: 10, opacity: 0.6,
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                overflow: 'hidden', flexWrap: 'nowrap'
                            }}>
                                <Home size={10} style={{ flexShrink: 0, opacity: 0.5 }} />
                                {pathParts.map((part, i) => (
                                    <React.Fragment key={i}>
                                        <ChevronRight size={8} style={{ flexShrink: 0, opacity: 0.3 }} />
                                        <span
                                            style={{
                                                cursor: i < pathParts.length - 1 ? 'pointer' : 'default',
                                                opacity: i === pathParts.length - 1 ? 1 : 0.7,
                                                fontWeight: i === pathParts.length - 1 ? 600 : 400,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                maxWidth: 80
                                            }}
                                            title={part}
                                            onClick={() => {
                                                if (i < pathParts.length - 1) {
                                                    const dirPath = pathParts.slice(0, i + 1).join('/');
                                                    setExpandedByPath(p => ({ ...p, [dirPath]: true }));
                                                }
                                            }}
                                        >
                                            {part}
                                        </span>
                                    </React.Fragment>
                                ))}
                            </div>
                        )}

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
                                            <div className="result-preview">{res.preview}</div>
                                        </motion.div>
                                    ))}
                                    {searchResults.length === 0 && !isSearching && (
                                        <div className="elite-no-results">No matches found</div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {/* Pinned Files Section */}
                                    {pinnedFiles.length > 0 && (
                                        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 4, marginBottom: 4 }}>
                                            <div style={{
                                                padding: '4px 12px', fontSize: '10px', textTransform: 'uppercase',
                                                letterSpacing: '0.5px', opacity: 0.5, display: 'flex', alignItems: 'center', gap: 4
                                            }}>
                                                <Star size={10} fill="currentColor" /> Pinned
                                            </div>
                                            {pinnedFiles.map((pf, i) => (
                                                <motion.div
                                                    key={`pin-${pf.path}`}
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    className={`elite-file-item ${activePath === pf.path ? 'selected' : ''}`}
                                                    style={{ paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                                                    onClick={() => openFile(pf)}
                                                >
                                                    <Star size={10} style={{ color: '#fdd835', flexShrink: 0 }} fill="#fdd835" />
                                                    <FileIcon name={pf.name} />
                                                    <span className="elite-file-name" style={{ fontSize: 12 }}>{pf.name}</span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); togglePin(pf); }}
                                                        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 2, opacity: 0.4 }}
                                                        title="Unpin"
                                                    >
                                                        <X size={10} style={{ color: 'var(--text-muted)' }} />
                                                    </button>
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}
                                    {/* Main File Tree */}
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
                                            gitStatusMap={gitStatusMap}
                                            onMoveFile={handleMoveFile}
                                        />
                                    ))}
                                    {tree.length === 0 && !loading && (
                                        <div className="elite-empty-state">
                                            {viewMode === 'github' ? 'Empty Repository' : 'Empty Directory'}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        className="elite-explorer-collapsed-bar"
                        initial={{ width: 0, opacity: 0 }}
                        animate={{ width: 48, opacity: 1 }}
                        exit={{ width: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <button onClick={() => setTreeCollapsed(false)} className="elite-icon-btn" title="Expand">
                            <PanelLeftOpen size={16} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            <ContextMenu
                {...contextMenu}
                onClose={() => setContextMenu(p => ({ ...p, visible: false }))}
                onAction={handleContextAction}
            />
        </div>
    );
});

export default EliteFileExplorer;
