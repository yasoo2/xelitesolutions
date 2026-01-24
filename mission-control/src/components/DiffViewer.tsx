import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    GitBranch, Plus, Minus, FileCode, Copy, Check,
    ChevronDown, ChevronUp
} from 'lucide-react';

export interface DiffLine {
    type: 'add' | 'remove' | 'context';
    content: string;
    lineNumber?: number;
}

export interface FileDiff {
    path: string;
    additions: number;
    deletions: number;
    lines: DiffLine[];
}

interface DiffViewerProps {
    diffs: FileDiff[];
    expanded: boolean;
    onToggle: () => void;
}

const DiffLineComponent: React.FC<{ line: DiffLine }> = ({ line }) => {
    const getBgColor = () => {
        switch (line.type) {
            case 'add': return 'bg-green-500/10';
            case 'remove': return 'bg-red-500/10';
            default: return 'bg-transparent';
        }
    };

    const getTextColor = () => {
        switch (line.type) {
            case 'add': return 'text-green-400';
            case 'remove': return 'text-red-400';
            default: return 'text-gray-400';
        }
    };

    const getIcon = () => {
        switch (line.type) {
            case 'add': return <Plus size={12} className="text-green-500" />;
            case 'remove': return <Minus size={12} className="text-red-500" />;
            default: return <span className="w-3" />;
        }
    };

    return (
        <div className={`flex font-mono text-xs leading-relaxed ${getBgColor()}`}>
            <div className="w-12 flex items-center justify-center flex-shrink-0 text-gray-600 border-r border-white/5">
                {line.lineNumber}
            </div>
            <div className="w-6 flex items-center justify-center flex-shrink-0">
                {getIcon()}
            </div>
            <div className={`flex py-0.5 pr-4 overflow-x-auto ${getTextColor()}`}>
                <pre className="whitespace-pre">{line.content || ' '}</pre>
            </div>
        </div>
    );
};

export const DiffViewer: React.FC<DiffViewerProps> = ({
    diffs,
    expanded,
    onToggle
}) => {
    const [copiedPath, setCopiedPath] = useState<string | null>(null);

    const copyPath = (path: string) => {
        navigator.clipboard.writeText(path);
        setCopiedPath(path);
        setTimeout(() => setCopiedPath(null), 2000);
    };

    const totalAdditions = diffs.reduce((sum, d) => sum + d.additions, 0);
    const totalDeletions = diffs.reduce((sum, d) => sum + d.deletions, 0);

    return (
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-all"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center">
                        <GitBranch size={20} className="text-white" />
                    </div>
                    <div className="text-right">
                        <h3 className="text-sm font-bold text-white">التغييرات</h3>
                        <p className="text-xs text-gray-500">Visual Diff Viewer</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-green-400 flex items-center gap-1">
                            <Plus size={12} /> {totalAdditions}
                        </span>
                        <span className="text-red-400 flex items-center gap-1">
                            <Minus size={12} /> {totalDeletions}
                        </span>
                    </div>
                    {expanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                </div>
            </button>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-white/5"
                    >
                        {diffs.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                <GitBranch size={32} className="mx-auto mb-2 opacity-30" />
                                <p className="text-sm">لا توجد تغييرات بعد</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {diffs.map((diff, idx) => (
                                    <div key={idx} className="bg-black/20">
                                        <div className="flex items-center justify-between p-3 border-b border-white/5 bg-gray-900/50">
                                            <div className="flex items-center gap-2">
                                                <FileCode size={14} className="text-cyan-400" />
                                                <span className="text-sm text-gray-300 font-mono">{diff.path.split('/').pop()}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-green-400">+{diff.additions}</span>
                                                <span className="text-xs text-red-400">-{diff.deletions}</span>
                                                <button
                                                    onClick={() => copyPath(diff.path)}
                                                    className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white transition-colors"
                                                >
                                                    {copiedPath === diff.path ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="max-h-60 overflow-y-auto">
                                            {diff.lines.map((line, lineIdx) => (
                                                <DiffLineComponent key={lineIdx} line={line} />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default DiffViewer;
