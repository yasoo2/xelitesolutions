
import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, File, RefreshCw, FileText, Code, Image, Music, Video, Database, Package, Save, CheckCircle2, Loader2 } from 'lucide-react';
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
    onSelect,
    selectedPath
}: { 
    node: FileNode; 
    level: number; 
    onSelect: (node: FileNode) => void;
    selectedPath?: string;
}) => {
    const [expanded, setExpanded] = useState(false);
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
                        setExpanded(!expanded);
                    } else {
                        onSelect(node);
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
                        <FileTreeItem key={i} node={child} level={level + 1} onSelect={onSelect} selectedPath={selectedPath} />
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
    const [selectedFile, setSelectedFile] = useState<{ node: FileNode, content: string } | null>(null);
    const [loadingContent, setLoadingContent] = useState(false);
    const [contentError, setContentError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

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

    const handleSelect = async (node: FileNode) => {
        if (node.type !== 'file') return;
        
        setLoadingContent(true);
        setContentError(null);
        setSelectedFile({ node, content: '' }); // Reset content while loading
        
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setLoadingContent(false);
                window.dispatchEvent(new CustomEvent('auth:unauthorized'));
                setContentError('Unauthorized');
                return;
            }
            const res = await fetch(`${API}/project/content?path=${encodeURIComponent(node.path)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.status === 401) {
                localStorage.removeItem('token');
                window.dispatchEvent(new CustomEvent('auth:unauthorized'));
                setContentError('Unauthorized');
                return;
            }
            
            if (!res.ok) {
                const raw = await res.text().catch(() => '');
                setSelectedFile({ node, content: '' });
                setContentError(raw || `HTTP ${res.status}`);
                return;
            }
            const json = await res.json();
            setSelectedFile({ node, content: json.content || '' });
        } catch (e) {
            console.error(e);
            setContentError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoadingContent(false);
        }
    };

    const saveFile = async () => {
        if (!selectedFile) return;
        setIsSaving(true);
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
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ path: selectedFile.node.path, content: selectedFile.content })
            });
            if (!res.ok) {
                const raw = await res.text().catch(() => '');
                throw new Error(raw || `HTTP ${res.status}`);
            }
        } catch (e) {
            console.error(e);
            alert(e instanceof Error ? e.message : 'Failed to save file');
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <div style={{ display: 'flex', height: '100%' }}>
            <div style={{ width: 'min(250px, 44vw)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: 8, borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>Files</span>
                    <button onClick={fetchTree} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}>
                        <RefreshCw size={14} className={loading ? 'spin' : ''} />
                    </button>
                </div>
                <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
                    {treeError ? (
                        <div style={{ padding: '6px 10px', color: 'var(--text-muted)', fontSize: 12 }}>
                            {treeError === 'Unauthorized' ? 'Please login to view files.' : `Failed to load files: ${treeError}`}
                        </div>
                    ) : null}
                    {tree.map((node, i) => (
                        <FileTreeItem 
                            key={i} 
                            node={node} 
                            level={1} 
                            onSelect={handleSelect} 
                            selectedPath={selectedFile?.node.path}
                        />
                    ))}
                </div>
            </div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {selectedFile ? (
                    <>
                        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', height: 40 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{selectedFile.node.name}</div>
                            <button 
                                onClick={saveFile}
                                disabled={isSaving}
                                className="btn"
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', fontSize: 12 }}
                            >
                                {isSaving ? <Loader2 size={12} className="spin" /> : <Save size={12} />}
                                Save
                            </button>
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                             {loadingContent ? (
                                 <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.1)' }}>
                                    <Loader2 className="spin" />
                                 </div>
                             ) : null}
                             {contentError ? (
                                <div style={{ position: 'absolute', top: 10, left: 10, right: 10, padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text-muted)', fontSize: 12, zIndex: 2 }}>
                                    {contentError === 'Unauthorized' ? 'Please login.' : `Failed to load file: ${contentError}`}
                                </div>
                             ) : null}
                             <CodeEditor 
                                code={selectedFile.content} 
                                language={selectedFile.node.name.split('.').pop() || 'text'} 
                                onChange={(val) => setSelectedFile(prev => prev ? { ...prev, content: val || '' } : null)}
                                theme="vs-dark"
                             />
                        </div>
                    </>
                ) : (
                     <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column', gap: 10 }}>
                         <Folder size={48} style={{ opacity: 0.2 }} />
                         <div>Select a file to view content</div>
                     </div>
                )}
            </div>
        </div>
    );
}
