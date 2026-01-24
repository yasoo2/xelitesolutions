import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Folder, FolderOpen, File, FileCode, FileJson, FileImage,
    ChevronRight, RefreshCw
} from 'lucide-react';

export interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileNode[];
    isNew?: boolean;
    isModified?: boolean;
    extension?: string;
}

interface ProjectTreeProps {
    root: FileNode;
    onFileSelect?: (path: string) => void;
    selectedPath?: string;
    isLoading?: boolean;
    onRefresh?: () => void;
}

const getFileIcon = (extension: string) => {
    switch (extension) {
        case 'tsx':
        case 'jsx':
            return <FileCode size={14} className="text-cyan-400" />;
        case 'ts':
        case 'js':
            return <FileCode size={14} className="text-yellow-400" />;
        case 'json':
            return <FileJson size={14} className="text-orange-400" />;
        case 'css':
        case 'scss':
            return <FileCode size={14} className="text-pink-400" />;
        case 'png':
        case 'jpg':
        case 'svg':
            return <FileImage size={14} className="text-purple-400" />;
        case 'md':
            return <File size={14} className="text-gray-400" />;
        default:
            return <File size={14} className="text-gray-500" />;
    }
};

const TreeNode: React.FC<{
    node: FileNode;
    depth: number;
    onSelect?: (path: string) => void;
    selectedPath?: string;
    expanded?: Set<string>;
    onToggle?: (path: string) => void;
}> = ({ node, depth, onSelect, selectedPath, expanded, onToggle }) => {
    const isExpanded = expanded?.has(node.path);
    const isSelected = selectedPath === node.path;
    const ext = node.name.split('.').pop() || '';

    return (
        <div>
            <motion.div
                className={`flex items - center gap - 1.5 py - 1 px - 2 rounded - lg cursor - pointer transition - all
          ${isSelected ? 'bg-cyan-500/20 text-cyan-300' : 'hover:bg-white/5 text-gray-300'}
          ${node.isNew ? 'border-l-2 border-green-500' : ''}
          ${node.isModified ? 'border-l-2 border-yellow-500' : ''}
`}
                style={{ paddingRight: `${depth * 12 + 8} px` }}
                onClick={() => {
                    if (node.type === 'folder' && onToggle) {
                        onToggle(node.path);
                    } else if (node.type === 'file' && onSelect) {
                        onSelect(node.path);
                    }
                }}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
            >
                {/* Expand/Collapse Icon */}
                {node.type === 'folder' && (
                    <motion.div
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <ChevronRight size={12} className="text-gray-500" />
                    </motion.div>
                )}

                {/* Node Icon */}
                {node.type === 'folder' ? (
                    isExpanded ? (
                        <FolderOpen size={14} className="text-yellow-500" />
                    ) : (
                        <Folder size={14} className="text-yellow-600" />
                    )
                ) : (
                    getFileIcon(ext)
                )}

                {/* Node Name */}
                <span className="text-xs font-mono truncate flex-1">{node.name}</span>

                {/* Status Indicators */}
                {node.isNew && (
                    <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 rounded">جديد</span>
                )}
                {node.isModified && (
                    <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 rounded">معدل</span>
                )}
            </motion.div>

            {/* Children */}
            <AnimatePresence>
                {node.type === 'folder' && isExpanded && node.children && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {node.children.map((child) => (
                            <TreeNode
                                key={child.path}
                                node={child}
                                depth={depth + 1}
                                onSelect={onSelect}
                                selectedPath={selectedPath}
                                expanded={expanded}
                                onToggle={onToggle}
                            />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export const ProjectTree: React.FC<ProjectTreeProps> = ({
    root,
    onFileSelect,
    selectedPath,
    isLoading,
    onRefresh
}) => {
    const [expanded, setExpanded] = useState<Set<string>>(new Set([root.path]));

    const handleToggle = (path: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    return (
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="p-3 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
                        <Folder size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white">مستكشف المشروع</h3>
                        <p className="text-xs text-gray-500">Project Explorer</p>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={onRefresh}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                        disabled={isLoading}
                    >
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Tree */}
            <div className="max-h-80 overflow-y-auto p-2">
                {isLoading ? (
                    <div className="flex items-center justify-center py-8 text-gray-500">
                        <RefreshCw size={20} className="animate-spin mr-2" />
                        <span className="text-sm">جاري التحميل...</span>
                    </div>
                ) : (
                    <TreeNode
                        node={root}
                        depth={0}
                        onSelect={onFileSelect}
                        selectedPath={selectedPath}
                        expanded={expanded}
                        onToggle={handleToggle}
                    />
                )}
            </div>

            {/* Footer Stats */}
            <div className="p-2 border-t border-white/5 flex items-center justify-between text-xs text-gray-500">
                <span>
                    {root.children?.filter(c => c.isNew).length || 0} جديد •{' '}
                    {root.children?.filter(c => c.isModified).length || 0} معدل
                </span>
                {selectedPath && (
                    <span className="text-cyan-400 truncate max-w-[150px]">
                        {selectedPath.split('/').pop()}
                    </span>
                )}
            </div>
        </div>
    );
};

export default ProjectTree;
