
import { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Brain, Trash2, Edit2, Clock, Share2, Grid, Box } from 'lucide-react';
import { API_URL } from '../config';

// Lazy load the 3D graph to improve initial performance
const ForceGraph3D = lazy(() => import('react-force-graph-3d'));

export default function MemoryPanel({ sessionId }: { sessionId?: string }) {
    const { t } = useTranslation();
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');
    const graphRef = useRef<any>(null);

    const loadMemories = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/memory`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setItems(data.memories || []);
            } else {
                setItems([]);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMemories();
    }, [sessionId]);

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this memory?')) return;
        const token = localStorage.getItem('token');
        try {
            await fetch(`${API_URL}/memory/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            loadMemories();
        } catch { }
    };

    // Prepare Graph Data
    const graphData = useMemo(() => {
        const nodes: any[] = [];
        const links: any[] = [];

        // Central Nodes
        nodes.push({ id: 'ROOT', name: 'Brain', val: 20, color: '#ef4444' });
        nodes.push({ id: 'SESSION', name: 'Current Session', val: 10, color: '#3b82f6' });
        nodes.push({ id: 'PROJECT', name: 'Project', val: 10, color: '#10b981' });

        links.push({ source: 'ROOT', target: 'SESSION' });
        links.push({ source: 'ROOT', target: 'PROJECT' });

        items.forEach(item => {
            const id = item._id;
            const scope = item.scope || 'user';
            const label = item.key || 'Memory';
            const val = 5;

            nodes.push({ id, name: label, val, color: scope === 'session' ? '#60a5fa' : scope === 'project' ? '#34d399' : '#a78bfa', data: item });

            // Link to Scope Hub
            if (scope === 'session') links.push({ source: 'SESSION', target: id });
            else if (scope === 'project') links.push({ source: 'PROJECT', target: id });
            else links.push({ source: 'ROOT', target: id });
        });

        return { nodes, links };
    }, [items]);

    return (
        <div className="memory-panel h-full flex flex-col bg-[#0f1117] text-white/90">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Brain className="text-red-500" size={20} />
                    <h2 className="font-bold text-lg">{t('memory.title', 'Active Memory')}</h2>
                </div>
                <div className="flex bg-white/5 rounded-lg p-1">
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
                        title="List View"
                    >
                        <Grid size={16} />
                    </button>
                    <button
                        onClick={() => setViewMode('graph')}
                        className={`p-1.5 rounded transition-colors ${viewMode === 'graph' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
                        title="3D Graph View"
                    >
                        <Box size={16} />
                    </button>
                </div>
            </div>

            {viewMode === 'list' && (
                <div className="p-4 border-b border-white/5">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t('memory.searchPlaceholder', 'Search memory...')}
                            className="w-full bg-black/20 text-white border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm focus:border-red-500/50 outline-none"
                        />
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-hidden relative">
                {viewMode === 'list' ? (
                    <div className="h-full overflow-y-auto p-4 space-y-3">
                        {loading && <div className="text-center py-8 opacity-50">Loading memories...</div>}
                        {!loading && items.length === 0 && (
                            <div className="text-center py-12 text-white/30 text-sm">
                                {t('memory.empty', 'No memories stored yet.')}
                            </div>
                        )}
                        {items
                            .filter(i => !search || JSON.stringify(i).toLowerCase().includes(search.toLowerCase()))
                            .map((item) => (
                                <div key={item._id} className="bg-white/5 p-3 rounded-lg border border-white/5 hover:border-white/10 transition-all group">
                                    <div className="flex justify-between items-start gap-2">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`w-2 h-2 rounded-full ${item.scope === 'session' ? 'bg-blue-500' : item.scope === 'project' ? 'bg-green-500' : 'bg-purple-500'}`} />
                                                <span className="font-bold text-sm text-white/90">{item.key}</span>
                                            </div>
                                            <p className="text-xs text-white/60 line-clamp-3 font-mono bg-black/20 p-1.5 rounded">
                                                {typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value)}
                                            </p>
                                        </div>
                                        <button onClick={() => handleDelete(item._id)} className="p-1 text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    <div className="mt-2 flex items-center gap-2 text-[10px] text-white/30">
                                        <Clock size={10} />
                                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                                        <span className="bg-white/10 px-1.5 py-0.5 rounded text-white/50 uppercase">{item.scope}</span>
                                    </div>
                                </div>
                            ))}
                    </div>
                ) : (
                    <div className="h-full w-full bg-black">
                        <Suspense fallback={<div className="flex items-center justify-center h-full text-white/30">Loading 3D Engine...</div>}>
                            <ForceGraph3D
                                ref={graphRef}
                                graphData={graphData}
                                nodeLabel="name"
                                nodeColor="color"
                                nodeVal="val"
                                linkColor={() => '#ffffff20'}
                                linkWidth={1}
                                backgroundColor="#000000"
                                showNavInfo={false}
                                onNodeClick={(node: any) => {
                                    // Focus on node
                                    if (graphRef.current) {
                                        const distance = 40;
                                        const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
                                        graphRef.current.cameraPosition(
                                            { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
                                            node,
                                            3000
                                        );
                                    }
                                }}
                            />
                        </Suspense>
                        <div className="absolute bottom-4 right-4 bg-black/80 p-2 rounded text-[10px] text-white/40 pointer-events-none">
                            Left Click: Rotate • Right Click: Pan • Scroll: Zoom • Click Node: Focus
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
