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

import { NeuralNerve } from './NeuralNerve';

// ... (imports remain)

export const ReasoningPanel: React.FC<ReasoningPanelProps> = ({
    thoughts,
    expanded,
    onToggle,
    isThinking
}) => {
    // Current Status derivation
    const currentStatus = isThinking ? (thoughts.length > 0 && thoughts[thoughts.length - 1].type === 'action' ? 'executing' : 'thinking') : 'idle';

    return (
        <div className="bg-black/80 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/5">
            {/* Active Nerve Header */}
            <div className="relative h-24 bg-gradient-to-b from-gray-900 to-black border-b border-white/10">
                <NeuralNerve status={currentStatus} className="absolute inset-0 z-0 opacity-80" />

                <div className="absolute inset-0 z-10 flex items-center justify-between px-6">
                    <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-full border border-white/10 bg-black/50 backdrop-blur-md ${isThinking ? 'animate-pulse ring-2 ring-purple-500/50' : ''}`}>
                            <Brain size={24} className={isThinking ? "text-purple-400" : "text-gray-500"} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white tracking-wider uppercase font-mono">
                                Neural Core
                            </h3>
                            <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full ${isThinking ? 'bg-green-500 animate-ping' : 'bg-gray-600'}`} />
                                <p className="text-[10px] text-gray-400 font-mono">
                                    {isThinking ? 'PROCESSING_TENSORS...' : 'SYSTEM_IDLE'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <button onClick={onToggle} className="p-2 hover:bg-white/10 rounded-lg transition-colors z-20">
                        {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                    </button>
                </div>
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                    >
                        {/* Telemetry Bar */}
                        <div className="flex items-center gap-1 h-1 bg-gray-900 opacity-50">
                            <div className="h-full bg-purple-600 w-[60%] animate-pulse" />
                            <div className="h-full bg-cyan-600 w-[30%]" />
                            <div className="h-full bg-yellow-600 w-[10%]" />
                        </div>

                        <div className="max-h-80 overflow-y-auto p-4 space-y-4 bg-black/40">
                            {thoughts.length === 0 ? (
                                <div className="text-center py-12 text-gray-600 font-mono text-xs">
                                    <Sparkles size={24} className="mx-auto mb-3 opacity-20" />
                                    AWAITING_INPUT_STREAM...
                                </div>
                            ) : (
                                <div className="space-y-4 relative">
                                    {/* Connectivity Line */}
                                    <div className="absolute left-[19px] top-4 bottom-4 w-px bg-gradient-to-b from-purple-500/0 via-purple-500/20 to-purple-500/0" />

                                    {thoughts.map((thought, idx) => {
                                        const config = getTypeConfig(thought.type);
                                        const isLast = idx === thoughts.length - 1;

                                        return (
                                            <motion.div
                                                key={thought.id}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                className={`relative pl-10 group`}
                                            >
                                                {/* Node Point */}
                                                <div className={`absolute left-[15px] top-3 w-2 h-2 rounded-full border-2 border-black ${config.bg.replace('/20', '')} ${isLast && isThinking ? 'animate-ping' : ''}`} />

                                                <div className={`p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] transition-colors relative overflow-hidden`}>
                                                    {/* Decorator Line */}
                                                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${config.bg.replace('/20', '')} opacity-50`} />

                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className={`text-[10px] font-mono tracking-widest uppercase ${config.color} opacity-80`}>
                                                            {config.label}
                                                        </span>
                                                        <span className="text-[10px] font-mono text-gray-600">
                                                            {thought.timestamp.toLocaleTimeString('ar-SA')}
                                                        </span>
                                                    </div>

                                                    <p className="text-sm text-gray-300 leading-relaxed font-sans">
                                                        {thought.content}
                                                    </p>

                                                    {/* Tools Chip */}
                                                    {thought.toolUsed && (
                                                        <div className="mt-3 flex items-center gap-2">
                                                            <div className="px-2 py-1 rounded bg-black/50 border border-white/10 text-[10px] text-gray-400 font-mono flex items-center gap-2">
                                                                <Wrench size={10} />
                                                                {thought.toolUsed}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        );
                                    })}

                                    {isThinking && (
                                        <div className="pl-10">
                                            <div className="h-8 w-32 bg-white/5 rounded animate-pulse" />
                                        </div>
                                    )}
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
