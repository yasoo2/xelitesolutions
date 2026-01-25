
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Brain, Lightbulb, Wrench, CheckCircle2,
    ChevronDown, ChevronUp, Sparkles, Terminal
} from 'lucide-react';
import { NeuralNerve } from './NeuralNerve';

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
            return { icon: <Brain size={12} />, color: 'text-purple-400', label: 'ANALYZE' };
        case 'decision':
            return { icon: <Lightbulb size={12} />, color: 'text-yellow-400', label: 'DECIDE' };
        case 'action':
            return { icon: <Wrench size={12} />, color: 'text-cyan-400', label: 'EXECUTE' };
        case 'result':
            return { icon: <CheckCircle2 size={12} />, color: 'text-green-400', label: 'RESULT' };
        default:
            return { icon: <Brain size={12} />, color: 'text-gray-400', label: 'PROCESS' };
    }
};

const TypewriterText: React.FC<{ text: string; speed?: number }> = ({ text, speed = 10 }) => {
    const [displayed, setDisplayed] = useState('');

    useEffect(() => {
        let i = 0;
        const timer = setInterval(() => {
            if (i < text.length) {
                setDisplayed(prev => prev + text.charAt(i));
                i++;
            } else {
                clearInterval(timer);
            }
        }, speed);
        return () => clearInterval(timer);
    }, [text, speed]);

    return <span>{displayed}{displayed.length < text.length && <span className="animate-pulse">_</span>}</span>;
};

export const ReasoningPanel: React.FC<ReasoningPanelProps> = ({
    thoughts,
    expanded,
    onToggle,
    isThinking
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [thoughts, expanded]);

    // Current Status derivation
    const currentStatus = isThinking ? (thoughts.length > 0 && thoughts[thoughts.length - 1].type === 'action' ? 'executing' : 'thinking') : 'idle';

    return (
        <div className="bg-black/90 backdrop-blur-3xl border border-white/10 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/5 font-mono relative">

            {/* Scanline Overlay */}
            <div className="absolute inset-0 pointer-events-none z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] opacity-20" />

            {/* Active Nerve Header */}
            <div className="relative h-20 bg-black border-b border-white/10 group cursor-pointer" onClick={onToggle}>
                <NeuralNerve status={currentStatus} className="absolute inset-0 z-0 opacity-60 mix-blend-screen" />

                <div className="absolute inset-0 z-10 flex items-center justify-between px-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded bg-white/5 border border-white/10 ${isThinking ? 'animate-pulse border-purple-500/50' : ''}`}>
                            <Terminal size={16} className={isThinking ? "text-purple-400" : "text-gray-500"} />
                        </div>
                        <div>
                            <h3 className="text-xs font-bold text-white tracking-[0.2em] uppercase">
                                Neural Stream
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`w-1 h-1 rounded-full ${isThinking ? 'bg-green-500 animate-ping' : 'bg-gray-700'}`} />
                                <p className="text-[10px] text-gray-500">
                                    {isThinking ? `PROCESSING [${thoughts.length} OPS]` : 'IDLE'}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-1.5 rounded hover:bg-white/10 transition-colors z-20">
                        {expanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
                    </div>
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
                        <div className="h-0.5 w-full bg-gray-900 flex">
                            {isThinking && <motion.div
                                className="h-full bg-cyan-500 shadow-[0_0_10px_#06b6d4]"
                                initial={{ width: "0%" }}
                                animate={{ width: "100%" }}
                                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                            />}
                        </div>

                        <div
                            ref={scrollRef}
                            className="max-h-[350px] overflow-y-auto p-4 space-y-2 bg-black/80 font-mono text-xs relative"
                        >
                            {/* Matrix Rain Background Hint */}
                            <div className="absolute inset-0 opacity-5 pointer-events-none bg-[url('https://media.giphy.com/media/U3qYN8S0j3bpK/giphy.gif')] bg-cover mix-blend-overlay" />

                            {thoughts.length === 0 ? (
                                <div className="text-center py-12 text-gray-700">
                                    <div className="inline-block px-3 py-1 border border-gray-800 rounded bg-black">
                                        INITIALIZING DATA FEED...
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {thoughts.map((thought, idx) => {
                                        const config = getTypeConfig(thought.type);
                                        const isLast = idx === thoughts.length - 1;

                                        return (
                                            <motion.div
                                                key={thought.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                className={`flex gap-3 px-2 py-1 ${isLast ? 'bg-white/[0.03]' : ''} border-l-2 ${isLast && isThinking ? 'border-cyan-500' : 'border-transparent hover:border-white/10'} transition-all`}
                                            >
                                                {/* Timestamp */}
                                                <span className="text-gray-600 w-16 flex-shrink-0 opacity-50">
                                                    {thought.timestamp.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                </span>

                                                {/* Type Indicator */}
                                                <div className={`w-20 flex-shrink-0 flex items-center gap-1.5 ${config.color}`}>
                                                    {config.icon}
                                                    <span className="opacity-80 font-bold">{config.label}</span>
                                                </div>

                                                {/* Content */}
                                                <div className="flex-1 text-gray-300 break-words leading-relaxed">
                                                    {isLast && isThinking ? (
                                                        <TypewriterText text={thought.content} speed={5} />
                                                    ) : (
                                                        <span>{thought.content}</span>
                                                    )}

                                                    {thought.toolUsed && (
                                                        <span className="ml-2 text-[10px] text-cyan-600 bg-cyan-900/10 px-1 rounded border border-cyan-900/30">
                                                            {`[TOOL: ${thought.toolUsed}]`}
                                                        </span>
                                                    )}
                                                </div>
                                            </motion.div>
                                        );
                                    })}

                                    {isThinking && (
                                        <div className="flex gap-3 px-2 py-1 items-center animate-pulse opacity-50">
                                            <span className="text-gray-700 w-16">--:--:--</span>
                                            <div className="w-20 text-gray-600 flex items-center gap-1.5">
                                                <Sparkles size={12} />
                                                LOADING
                                            </div>
                                            <div className="h-3 w-4 bg-cyan-500/50" />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
