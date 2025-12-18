import React, { useState, useEffect } from 'react';
import { Database, Table, RefreshCw, ChevronRight, Trash2, Edit2, Check, X, Search, ChevronLeft } from 'lucide-react';
import { API_URL as API } from '../config';

interface DatabaseViewerProps {
    sessionId?: string;
}

export default function DatabaseViewer({ sessionId }: DatabaseViewerProps) {
    const [collections, setCollections] = useState<string[]>([]);
    const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [viewMode, setViewMode] = useState<'table' | 'json'>('table');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');

    const fetchCollections = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/database`, {
                headers: { Authorization: token ? `Bearer ${token}` : '' }
            });
            const data = await res.json();
            if (res.ok) {
                setCollections(data.collections);
                setError(null);
            } else {
                setError(data.error || 'Failed to fetch collections');
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchDocuments = async (coll: string, p: number = 1) => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/database/${coll}?page=${p}&limit=10`, {
                headers: { Authorization: token ? `Bearer ${token}` : '' }
            });
            const data = await res.json();
            if (res.ok) {
                setDocuments(data.data);
                setTotalPages(data.pagination.pages);
                setPage(data.pagination.page);
            }
        } catch (e: any) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCollections();
    }, []);

    useEffect(() => {
        if (selectedCollection) {
            fetchDocuments(selectedCollection, 1);
        }
    }, [selectedCollection]);

    const handleUpdate = async (id: string) => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/database/${selectedCollection}/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: token ? `Bearer ${token}` : ''
                },
                body: editContent
            });
            if (res.ok) {
                setEditingId(null);
                fetchDocuments(selectedCollection!, page);
            }
        } catch (e) {
            console.error(e);
            alert('Update failed');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this document?')) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/database/${selectedCollection}/${id}`, {
                method: 'DELETE',
                headers: { Authorization: token ? `Bearer ${token}` : '' }
            });
            if (res.ok) {
                fetchDocuments(selectedCollection!, page);
            }
        } catch (e) {
            console.error(e);
        }
    };

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4 text-center">
                <Database size={48} className="mb-4 opacity-20" />
                <p>{error}</p>
                <button onClick={fetchCollections} className="mt-4 text-blue-400 hover:underline">Retry Connection</button>
            </div>
        );
    }

    if (!selectedCollection) {
        return (
            <div className="flex flex-col h-full bg-[var(--bg-primary)]">
                <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between">
                    <h2 className="text-sm font-semibold flex items-center gap-2">
                        <Database size={16} /> Collections
                    </h2>
                    <button onClick={fetchCollections} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                        <RefreshCw size={14} className={loading ? 'spin' : ''} />
                    </button>
                </div>
                <div className="flex-1 overflow-auto p-2">
                    {collections.map(c => (
                        <div
                            key={c}
                            onClick={() => setSelectedCollection(c)}
                            className="p-3 mb-1 rounded cursor-pointer hover:bg-[var(--bg-secondary)] flex items-center justify-between group transition-colors"
                        >
                            <span className="text-sm font-medium">{c}</span>
                            <ChevronRight size={14} className="opacity-0 group-hover:opacity-50" />
                        </div>
                    ))}
                    {collections.length === 0 && !loading && (
                        <div className="text-center text-[var(--text-muted)] mt-10 text-xs">No collections found</div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[var(--bg-primary)]">
            <div className="p-3 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-secondary)]">
                <div className="flex items-center gap-2">
                    <button onClick={() => setSelectedCollection(null)} className="hover:bg-[var(--bg-active)] p-1 rounded">
                        <ChevronLeft size={16} />
                    </button>
                    <span className="font-semibold text-sm">{selectedCollection}</span>
                    <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-active)] px-2 py-0.5 rounded-full">
                        {documents.length} docs
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => fetchDocuments(selectedCollection, page)}
                        className="p-1.5 rounded hover:bg-[var(--bg-active)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                        <RefreshCw size={14} className={loading ? 'spin' : ''} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
                {documents.map((doc) => (
                    <div key={doc._id} className="mb-4 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] overflow-hidden shadow-sm">
                        <div className="px-3 py-2 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-active)] bg-opacity-30">
                            <span className="text-xs font-mono text-blue-400">{doc._id}</span>
                            <div className="flex gap-2">
                                {editingId === doc._id ? (
                                    <>
                                        <button onClick={() => handleUpdate(doc._id)} className="text-green-500 hover:text-green-400"><Check size={14} /></button>
                                        <button onClick={() => setEditingId(null)} className="text-red-500 hover:text-red-400"><X size={14} /></button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={() => {
                                            setEditingId(doc._id);
                                            setEditContent(JSON.stringify(doc, null, 2));
                                        }} className="text-[var(--text-muted)] hover:text-blue-400"><Edit2 size={14} /></button>
                                        <button onClick={() => handleDelete(doc._id)} className="text-[var(--text-muted)] hover:text-red-400"><Trash2 size={14} /></button>
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="p-0">
                            {editingId === doc._id ? (
                                <textarea
                                    className="w-full h-48 bg-[var(--bg-primary)] text-[var(--text-primary)] p-3 font-mono text-xs focus:outline-none resize-none"
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                />
                            ) : (
                                <pre className="p-3 text-xs font-mono overflow-auto max-h-60 text-[var(--text-primary)] opacity-90">
                                    {JSON.stringify(doc, null, 2)}
                                </pre>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-2 border-t border-[var(--border-color)] flex justify-center gap-4 items-center text-xs">
                <button 
                    disabled={page <= 1} 
                    onClick={() => fetchDocuments(selectedCollection, page - 1)}
                    className="disabled:opacity-30 hover:text-blue-400"
                >
                    Prev
                </button>
                <span className="text-[var(--text-muted)]">Page {page} of {totalPages}</span>
                <button 
                    disabled={page >= totalPages} 
                    onClick={() => fetchDocuments(selectedCollection, page + 1)}
                    className="disabled:opacity-30 hover:text-blue-400"
                >
                    Next
                </button>
            </div>
        </div>
    );
}
