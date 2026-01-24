import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Brain, Lightbulb, Wrench, CheckCircle2,
    ChevronDown, ChevronUp, Sparkles
} from 'lucide-react';

export interface ThoughtStep {
    id: string;
    type: 'analysis' | 'decision' | 'action' | 'result';
    content: string;
    timestamp: Date;
    toolUsed?: string;
    alternatives?: string[];
}

interface ReasoningPanelProps {
    thoughts: ThoughtStep[];
    expanded: boolean;
    onToggle: () => void;
    isThinking?: boolean;
}

const getTypeConfig = (type: string) => {
    switch (type) {
        case 'analysis':
            return {
                icon: <Brain size={14} />,
                color: 'text-purple-400',
                bg: 'bg-purple-500/20',
                border: 'border-purple-500/30',
                label: 'تحليل'
            };
        case 'decision':
            return {
                icon: <Lightbulb size={14} />,
                color: 'text-yellow-400',
                bg: 'bg-yellow-500/20',
                border: 'border-yellow-500/30',
                label: 'قرار'
            };
        case 'action':
            return {
                icon: <Wrench size={14} />,
                color: 'text-cyan-400',
                bg: 'bg-cyan-500/20',
                border: 'border-cyan-500/30',
                label: 'تنفيذ'
            };
        case 'result':
            return {
                icon: <CheckCircle2 size={14} />,
                color: 'text-green-400',
                bg: 'bg-green-500/20',
                border: 'border-green-500/30',
                label: 'نتيجة'
            };
        default:
            return {
                icon: <Brain size={14} />,
                color: 'text-gray-400',
                bg: 'bg-gray-500/20',
                border: 'border-gray-500/30',
                label: 'تفكير'
            };
    }
};

export const ReasoningPanel: React.FC<ReasoningPanelProps> = ({
    thoughts,
    expanded,
    onToggle,
    isThinking
}) => {
    return (
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-all"
            >
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center ${isThinking ? 'animate-pulse' : ''}`}>
                        <Brain size={20} className="text-white" />
                    </div>
                    <div className="text-right">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            التفكير
                            {isThinking && (
                                <span className="text-xs text-purple-400 animate-pulse">جاري التحليل...</span>
                            )}
                        </h3>
                        <p className="text-xs text-gray-500">AI Reasoning Panel</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded-full">
                        {thoughts.length} خطوة
                    </span>
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
                        <div className="max-h-80 overflow-y-auto p-4">
                            {thoughts.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    <Sparkles size={32} className="mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">في انتظار بدء التفكير...</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {thoughts.map((thought, idx) => {
                                        const config = getTypeConfig(thought.type);
                                        return (
                                            <motion.div
                                                key={thought.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: idx * 0.1 }}
                                                className={`p-3 rounded-xl border ${config.bg} ${config.border} relative`}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <div className={`p-1.5 rounded-lg ${config.bg} ${config.color}`}>
                                                        {config.icon}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={`text-xs font-medium ${config.color}`}>
                                                                {config.label}
                                                            </span>
                                                            <span className="text-[10px] text-gray-600">
                                                                {thought.timestamp.toLocaleTimeString('ar-SA')}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-gray-300">{thought.content}</p>

                                                        {thought.toolUsed && (
                                                            <div className="mt-2 text-xs text-gray-500">
                                                                <span className="bg-gray-800 px-2 py-0.5 rounded">
                                                                    أداة: {thought.toolUsed}
                                                                </span>
                                                            </div>
                                                        )}

                                                        {thought.alternatives && thought.alternatives.length > 0 && (
                                                            <div className="mt-2">
                                                                <p className="text-[10px] text-gray-600 mb-1">بدائل أخرى:</p>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {thought.alternatives.map((alt, i) => (
                                                                        <span key={i} className="text-[10px] bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">
                                                                            {alt}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {idx < thoughts.length - 1 && (
                                                    <div className="absolute left-5 -bottom-3 h-3 w-0.5 bg-gray-700" />
                                                )}
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ReasoningPanel;
