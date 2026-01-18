'use client';

import { BookOpen, Trash2, RefreshCw, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getKnowledge, deleteKnowledge } from '@/lib/api';

interface KnowledgeItem {
    id: string;
    filename: string;
    size: number;
}

export default function KnowledgePage() {
    const [items, setItems] = useState<KnowledgeItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState<string | null>(null);

    const fetchKnowledge = async () => {
        setLoading(true);
        try {
            const data = await getKnowledge();
            setItems(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchKnowledge();
    }, []);

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this memory?')) return;
        setDeleting(id);
        try {
            await deleteKnowledge(id);
            setItems(items.filter(item => item.id !== id));
        } catch (err) {
            alert('Failed to delete item');
        } finally {
            setDeleting(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <BookOpen className="text-purple-400" />
                        Knowledge Base
                    </h2>
                    <p className="text-gray-400 text-sm mt-1">
                        Manage learned fixes and stored documentation.
                    </p>
                </div>
                <button
                    onClick={fetchKnowledge}
                    className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 transition-colors"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-gray-800/50 border-b border-gray-800">
                                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Document Name</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Size</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {items.length === 0 && !loading ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                                        No knowledge documents found. The system is tabula rasa.
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-800/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                                                    <FileText className="w-4 h-4" />
                                                </div>
                                                <div className="font-medium text-gray-200">{item.filename}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-400 font-mono">
                                            {item.size} bytes
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                disabled={deleting === item.id}
                                                className="text-gray-500 hover:text-red-400 transition-colors disabled:opacity-50"
                                                title="Delete Memory"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
