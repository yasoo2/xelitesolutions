import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

interface Workspace {
    _id: string;
    name: string;
    slug: string;
    plan: 'free' | 'pro' | 'enterprise';
}

import { useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';

export const WorkspaceSelector: React.FC = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [activeWs, setActiveWs] = useState<Workspace | null>(null);
    const [isOpen, setIsOpen] = useState(false);

    // Fetch Workspaces on Load
    useEffect(() => {
        const fetchWorkspaces = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) return;

                // We need to implement this route!
                const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/workspaces`, {
                    headers: { Authorization: `Bearer ${token}` }
                });

                setWorkspaces(res.data);

                // Auto-select from LocalStorage or Default
                const savedId = localStorage.getItem('active_workspace_id');
                const found = res.data.find((w: any) => w._id === savedId) || res.data[0];

                if (found) {
                    selectWorkspace(found);
                }
            } catch (e) {
                console.error('Failed to fetch workspaces', e);
            }
        };
        fetchWorkspaces();
    }, []);

    const selectWorkspace = (ws: Workspace) => {
        setActiveWs(ws);
        localStorage.setItem('active_workspace_id', ws._id);
        // Dispatch event for other components to reload data if needed
        window.dispatchEvent(new CustomEvent('workspace:changed', { detail: ws }));
        setIsOpen(false);
    };

    // DEBUG: Force visibility
    console.log('WorkspaceSelector: Rendering. ActiveWs:', activeWs);

    // REMOVED 'if (!activeWs) return null' in previous step.

    return (
        <div className="relative z-[9999] mx-2 border border-red-500" style={{ pointerEvents: 'auto' }}>
            <button
                onClick={() => { console.log('Selector Clicked'); setIsOpen(!isOpen); }}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all backdrop-blur-md"
            >
                {activeWs ? (
                    <>
                        <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                            {activeWs.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="flex flex-col items-start">
                            <span className="text-xs text-white/90 font-medium leading-none mb-0.5">{activeWs.name}</span>
                            <span className="text-[10px] text-white/50 uppercase tracking-wider leading-none">{activeWs.plan}</span>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="w-6 h-6 rounded bg-gray-700 flex items-center justify-center text-xs font-bold text-white/50">
                            ?
                        </div>
                        <div className="flex flex-col items-start">
                            <span className="text-xs text-white/90 font-medium leading-none">Select Workspace</span>
                        </div>
                    </>
                )}

                <svg className={`w-3 h-3 text-white/50 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        className="absolute top-full left-0 mt-2 w-56 bg-[#0f1115]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden"
                    >
                        <div className="p-2">
                            <div className="text-[10px] text-white/40 px-2 py-1 uppercase tracking-wider font-bold">
                                {t('ui.workspaces', 'My Workspaces')}
                            </div>
                            {workspaces.map(ws => (
                                <button
                                    key={ws._id}
                                    onClick={() => selectWorkspace(ws)}
                                    className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${activeWs._id === ws._id ? 'bg-white/10' : 'hover:bg-white/5'}`}
                                >
                                    <div className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white ${activeWs._id === ws._id ? 'bg-blue-500' : 'bg-gray-700'}`}>
                                        {ws.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div className="flex-1 text-left">
                                        <div className="text-xs text-white/90 font-medium">{ws.name}</div>
                                    </div>
                                    {activeWs._id === ws._id && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]"></div>
                                    )}
                                </button>
                            ))}

                            <div className="h-px bg-white/10 my-1"></div>

                            <button
                                onClick={() => { navigate(`/workspace/${activeWs._id}/settings`); setIsOpen(false); }}
                                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 text-white/60 hover:text-white transition-colors"
                            >
                                <Settings size={14} />
                                <span className="text-xs">{t('ui.workspace_settings', 'Workspace Settings')}</span>
                            </button>

                            <button className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 text-white/60 hover:text-white transition-colors">
                                <span className="w-5 h-5 flex items-center justify-center border border-dashed border-white/30 rounded text-xs">+</span>
                                <span className="text-xs">{t('ui.create_workspace', 'Create Workspace')}</span>
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
