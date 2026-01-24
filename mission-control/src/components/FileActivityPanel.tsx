import React from 'react';
import { File, FileCode, FilePlus, FileEdit, FolderOpen, GitBranch, Check, Clock, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FileActivity {
    id: string;
    path: string;
    action: 'created' | 'modified' | 'deleted' | 'read';
    timestamp: Date;
    status: 'pending' | 'success' | 'error';
    diff?: string;
}

interface FileActivityPanelProps {
    activities: FileActivity[];
    expanded: boolean;
    onToggle: () => void;
}

export const FileActivityPanel: React.FC<FileActivityPanelProps> = ({ activities, expanded, onToggle }) => {
    const getIcon = (action: string) => {
        switch (action) {
            case 'created': return <FilePlus size={14} className="text-green-400" />;
            case 'modified': return <FileEdit size={14} className="text-yellow-400" />;
            case 'deleted': return <AlertCircle size={14} className="text-red-400" />;
            default: return <File size={14} className="text-blue-400" />;
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'success': return <Check size={12} className="text-green-400" />;
            case 'pending': return <Clock size={12} className="text-yellow-400 animate-pulse" />;
            case 'error': return <AlertCircle size={12} className="text-red-400" />;
            default: return null;
        }
    };

    const getFileName = (path: string) => path.split('/').pop() || path;
    const getFolder = (path: string) => {
        const parts = path.split('/');
        parts.pop();
        return parts.slice(-2).join('/') || '/';
    };

    return (
        <div className="bg-black/30 border border-white/10 rounded-lg overflow-hidden">
            {/* Header */}
            <button
                onClick={onToggle}
                className="w-full p-3 flex items-center justify-between bg-gradient-to-r from-emerald-900/30 to-cyan-900/30 hover:from-emerald-900/50 hover:to-cyan-900/50 transition-all"
            >
                <div className="flex items-center gap-2">
                    <FolderOpen size={16} className="text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-300">ملفات جو</span>
                    <span className="text-xs bg-emerald-500/20 px-2 py-0.5 rounded-full text-emerald-400">
                        {activities.length} ملف
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <GitBranch size={14} className="text-gray-500" />
                    <span className="text-xs text-gray-500">main</span>
                </div>
            </button>

            {/* File List */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="max-h-48 overflow-y-auto divide-y divide-white/5">
                            {activities.length === 0 ? (
                                <div className="p-4 text-center text-gray-500 text-sm">
                                    <FileCode size={24} className="mx-auto mb-2 opacity-50" />
                                    <p>لم يتم إنشاء ملفات بعد</p>
                                    <p className="text-xs mt-1">اطلب من جو بناء شيء ما</p>
                                </div>
                            ) : (
                                activities.map((activity) => (
                                    <motion.div
                                        key={activity.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        className="p-2 px-3 flex items-center justify-between hover:bg-white/5 transition-colors cursor-pointer group"
                                    >
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            {getIcon(activity.action)}
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-white truncate font-mono">
                                                    {getFileName(activity.path)}
                                                </p>
                                                <p className="text-xs text-gray-500 truncate">
                                                    {getFolder(activity.path)}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {getStatusIcon(activity.status)}
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${activity.action === 'created' ? 'bg-green-500/20 text-green-400' :
                                                    activity.action === 'modified' ? 'bg-yellow-500/20 text-yellow-400' :
                                                        activity.action === 'deleted' ? 'bg-red-500/20 text-red-400' :
                                                            'bg-blue-500/20 text-blue-400'
                                                }`}>
                                                {activity.action === 'created' ? 'جديد' :
                                                    activity.action === 'modified' ? 'معدل' :
                                                        activity.action === 'deleted' ? 'محذوف' : 'قراءة'}
                                            </span>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>

                        {/* Summary Footer */}
                        {activities.length > 0 && (
                            <div className="p-2 px-3 bg-black/20 border-t border-white/5 flex items-center justify-between text-xs text-gray-500">
                                <span>
                                    {activities.filter(a => a.action === 'created').length} جديد •{' '}
                                    {activities.filter(a => a.action === 'modified').length} معدل
                                </span>
                                <span className="text-emerald-400">
                                    آخر تحديث: {activities[0]?.timestamp.toLocaleTimeString('ar-SA')}
                                </span>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
