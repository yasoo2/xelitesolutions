
import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Cpu, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgent } from '../hooks/useAgent';
import { AgentActivity } from './AgentActivity';

export const NeuralChat = () => {
    const { messages, status, sendMessage, steps } = useAgent();
    // ... existing state ...
    const [expanded, setExpanded] = useState(true);
    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;
        sendMessage(input);
        setInput('');
    };

    return (
        <div className="glass-panel p-0 flex flex-col h-[600px] col-span-2 row-span-2 overflow-hidden relative">
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/20">
                <div className="flex items-center gap-2">
                    <Sparkles className="text-purple-400" size={20} />
                    <h2 className="font-bold text-lg neon-text">NEURAL NEXUS</h2>
                </div>

                <div className="flex items-center gap-2 text-xs">
                    <div className={`w-2 h-2 rounded-full ${status === 'thinking' ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} />
                    <span className="uppercase text-gray-400">{status === 'idle' ? 'Ready' : status}</span>
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-50">
                        <Cpu size={48} className="mb-4" />
                        <p>Awaiting Input Protocol...</p>
                    </div>
                )}

                <AnimatePresence>
                    {messages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            {msg.role !== 'user' && (
                                <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-500/50">
                                    <Bot size={16} className="text-cyan-400" />
                                </div>
                            )}

                            <div className={`max-w-[80%] rounded-xl p-3 text-sm ${msg.role === 'user'
                                ? 'bg-purple-600/20 border border-purple-500/30 text-purple-100'
                                : msg.type === 'step'
                                    ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 font-mono text-xs'
                                    : 'bg-white/5 border border-white/10 text-gray-200'
                                }`}>
                                {msg.content}
                            </div>

                            {msg.role === 'user' && (
                                <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center border border-purple-500/50">
                                    <User size={16} className="text-purple-400" />
                                </div>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            <div className="px-4 pb-2"><AgentActivity status={status} steps={steps || []} logs={[]} expanded={expanded} onToggle={() => setExpanded(!expanded)} runId="current" /></div>
            {/* Input Area */}
            <form onSubmit={handleSend} className="p-4 bg-black/40 border-t border-white/10">
                <div className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Enter command..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-4 pr-12 py-3 focus:outline-none focus:border-cyan-500/50 focus:bg-white/10 transition-all font-mono text-sm"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim()}
                        className="absolute right-2 top-2 p-1.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </form>
        </div>
    );
};
