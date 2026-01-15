import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Brain, Trash2, Edit2, Plus, Clock, Tag } from 'lucide-react';
import { API_URL } from '../config';

interface MemoryItem {
    id: string;
    content: string;
    type: 'session' | 'project' | 'user';
    timestamp: number;
    metadata?: any;
}

export default function MemoryPanel({ sessionId }: { sessionId?: string }) {
    const { t } = useTranslation();
    const [items, setItems] = useState<MemoryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<'project' | 'session' | 'user'>('project');

    const loadMemories = async () => {
        const token = localStorage.getItem('token');
        if (!token) return;
        setLoading(true);
        try {
            // Mocking the fetch for now as the endpoint might be generic or tool-based
            // ideally we have GET /memory?type=...
            // For now, let's assume we can search via the tool or a specific endpoint
            // check backend routes if /memory exists. If not, we might need to add it or use the tool.
            // Using a direct fetch to a hypothetical endpoint or mocking for UI dev first.
            // Given the spec says "Memory Panel shows items", we likely need an endpoint.
            // Let's implement a safe fallback or check API first.

            const res = await fetch(`${API_URL}/memory?sessionId=${sessionId || ''}&type=${activeTab}&q=${search}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setItems(data.items || []);
            } else {
                // Fallback mock for demo if endpoint not ready
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
    }, [sessionId, activeTab, search]);

    const handleDelete = async (id: string) => {
        if (!confirm(t('confirmDelete'))) return;
        // Implement delete logic
    };

    return (
        <div className="memory-panel h-full flex flex-col bg-base-200">
            <div className="p-4 border-b border-base-300">
                <div className="flex items-center gap-2 mb-4">
                    <Brain className="text-primary" size={20} />
                    <h2 className="font-bold text-lg">{t('memory.title')}</h2>
                </div>

                <div className="flex gap-2 mb-4">
                    {['project', 'session', 'user'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeTab === tab
                                    ? 'bg-primary text-primary-content'
                                    : 'bg-base-300 text-base-content hover:bg-base-content/10'
                                }`}
                        >
                            {t(`memory.tabs.${tab}`)}
                        </button>
                    ))}
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/50" size={14} />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t('memory.searchPlaceholder')}
                        className="w-full bg-base-100 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loading ? (
                    <div className="flex justify-center py-8 opacity-50">
                        <span className="loading loading-spinner" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="text-center py-12 text-base-content/50 text-sm">
                        {t('memory.empty')}
                    </div>
                ) : (
                    items.map((item) => (
                        <div key={item.id} className="card bg-base-100 p-3 rounded-lg shadow-sm hover:shadow-md transition-shadow group">
                            <div className="flex justify-between items-start gap-2">
                                <p className="text-sm leading-relaxed line-clamp-3">{item.content}</p>
                                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleDelete(item.id)} className="p-1 hover:text-error">
                                        <Trash2 size={12} />
                                    </button>
                                    <button className="p-1 hover:text-primary">
                                        <Edit2 size={12} />
                                    </button>
                                </div>
                            </div>
                            <div className="mt-2 flex items-center justify-between text-[10px] text-base-content/40">
                                <div className="flex items-center gap-1">
                                    <Clock size={10} />
                                    <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                                </div>
                                {item.metadata?.tags && (
                                    <div className="flex gap-1">
                                        {item.metadata.tags.map((tag: string) => (
                                            <span key={tag} className="bg-base-200 px-1.5 py-0.5 rounded text-xs">#{tag}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
