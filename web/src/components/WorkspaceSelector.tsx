import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { api } from '../services/apiClient';

interface Workspace {
    _id: string;
    name: string;
    slug: string;
    plan: 'free' | 'pro' | 'enterprise';
}

// Custom Premium Styles for Workspace Selector
const selectorStyles = {
    container: "relative w-full z-50",
    triggerBtn: "w-full flex items-center justify-between gap-2 px-3 py-2 bg-[#1E2028] hover:bg-[#2A2D36] border border-white/10 rounded-lg transition-all duration-200 group shadow-sm",
    activeAvatar: "w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white bg-gradient-to-br from-indigo-500 to-purple-600 shadow-sm",
    nameText: "text-xs font-medium text-gray-200 group-hover:text-white truncate max-w-[100px]",
    planBadge: "text-[9px] uppercase tracking-wider text-gray-500 font-semibold bg-white/5 px-1.5 py-0.5 rounded ml-auto",
    chevron: "w-3 h-3 text-gray-500 group-hover:text-gray-300 transition-transform duration-200",
    dropdown: "absolute top-full left-0 mt-2 min-w-[240px] bg-[#181A20] border border-white/10 rounded-xl shadow-2xl overflow-hidden backdrop-blur-xl z-[9999]",
    itemBtn: "w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors border-l-2 border-transparent hover:border-indigo-500",
    itemAvatar: (isActive: boolean) => `w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white ${isActive ? 'bg-indigo-500' : 'bg-gray-700'}`,
    itemText: "text-xs text-gray-300 font-medium",
    sectionTitle: "px-3 py-2 text-[10px] uppercase font-bold text-gray-500 tracking-wider bg-white/5",
    divider: "h-px bg-white/5 my-1"
};

export const WorkspaceSelector: React.FC = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [activeWs, setActiveWs] = useState<Workspace | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchWorkspaces = async () => {
        try {
            const data = await api.get('/workspaces');
            setWorkspaces(data as Workspace[]);

            const savedId = localStorage.getItem('active_workspace_id');
            const found = (data as Workspace[]).find((w: any) => w._id === savedId) || (data as Workspace[])[0];

            if (found) {
                setActiveWs(found);
                localStorage.setItem('active_workspace_id', found._id);
                window.dispatchEvent(new CustomEvent('workspace:changed', { detail: found }));
            }
        } catch (e) {
            console.error('Failed to fetch workspaces', e);
        }
    };

    useEffect(() => {
        fetchWorkspaces();
    }, []);

    const selectWorkspace = (ws: Workspace, e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveWs(ws);
        localStorage.setItem('active_workspace_id', ws._id);
        window.dispatchEvent(new CustomEvent('workspace:changed', { detail: ws }));
        setIsOpen(false);
    };

    const handleCreate = async (e: React.MouseEvent) => {
        e.stopPropagation();

        const name = prompt(t('ui.enter_workspace_name', 'Enter Workspace Name:'));
        if (!name) return;

        try {
            const newWs = await api.post('/workspaces', { name });

            await fetchWorkspaces();

            if (newWs && (newWs as Workspace)._id) {
                // The fetchWorkspaces might have already set it if it was the first one, 
                // but let's explicitly select the new one if we returned it.
                const created = newWs as Workspace;
                setActiveWs(created);
                localStorage.setItem('active_workspace_id', created._id);
                window.dispatchEvent(new CustomEvent('workspace:changed', { detail: created }));
            }

        } catch (err) {
            console.error('Failed to create workspace', err);
            alert('Failed to create workspace');
        }
        setIsOpen(false);
    };

    return (
        <div className={selectorStyles.container} ref={containerRef}>
            <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className={selectorStyles.triggerBtn}
            >
                {activeWs ? (
                    <div className="flex items-center gap-2 overflow-hidden">
                        <div className={selectorStyles.activeAvatar}>
                            {activeWs.name.substring(0, 2).toUpperCase()}
                        </div>
                        <span className={selectorStyles.nameText}>{activeWs.name}</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-gray-800 flex items-center justify-center text-[10px] text-gray-500">?</div>
                        <span className="text-xs text-gray-400">Select...</span>
                    </div>
                )}

                {activeWs && <span className={selectorStyles.planBadge}>{activeWs.plan.substring(0, 1)}</span>}

                <svg className={`${selectorStyles.chevron} ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -5, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -5, scale: 0.98 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className={selectorStyles.dropdown}
                        style={{ position: 'absolute', top: '100%', left: 0, zIndex: 9999 }}
                    >
                        <div className={selectorStyles.sectionTitle}>{t('ui.workspaces', 'Workspaces')}</div>

                        <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                            {workspaces.map(ws => (
                                <button
                                    key={ws._id}
                                    onClick={(e) => selectWorkspace(ws, e)}
                                    className={selectorStyles.itemBtn}
                                >
                                    <div className={selectorStyles.itemAvatar(activeWs?._id === ws._id)}>
                                        {ws.name.substring(0, 2).toUpperCase()}
                                    </div>
                                    <span className={selectorStyles.itemText}>{ws.name}</span>
                                    {activeWs && activeWs._id === ws._id && (
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 ml-auto shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className={selectorStyles.divider}></div>

                        {activeWs && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/workspace/${activeWs._id}/settings`);
                                    setIsOpen(false);
                                }}
                                className={selectorStyles.itemBtn}
                            >
                                <Settings size={14} className="text-gray-400" />
                                <span className={selectorStyles.itemText}>{t('ui.settings', 'Settings')}</span>
                            </button>
                        )}

                        <button
                            onClick={handleCreate}
                            className={selectorStyles.itemBtn}
                        >
                            <div className="w-4 h-4 rounded border border-dashed border-gray-500 flex items-center justify-center text-[10px] text-gray-500">+</div>
                            <span className={selectorStyles.itemText}>{t('ui.create', 'Create New')}</span>
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
