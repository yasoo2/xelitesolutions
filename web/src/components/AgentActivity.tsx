import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// --- Types ---
export interface AgentStep {
    key: string;
    name: string;
    displayName?: string;
    status: 'running' | 'done' | 'failed' | 'pending';
    duration?: number;
    input?: any;
    result?: any;
    error?: any;
}

export interface AgentActivityProps {
    runId: string;
    steps: AgentStep[];
    status: 'idle' | 'running' | 'done' | 'failed';
    logs: string[];
    expanded: boolean;
    onToggle: () => void;
    showTechnical?: boolean;
    onToggleTechnical?: () => void;
}

export const AgentActivity: React.FC<AgentActivityProps> = ({ status }) => {
    // Ephemeral: If done, disappear completely.
    if (status === 'done') return null;

    // Safety: Minimal error state
    if (status === 'failed') {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="my-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-medium flex items-center justify-center gap-2"
            >
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                Thinking Interrupted
            </motion.div>
        );
    }

    if (status === 'idle') return null;

    // Active "Thinking" State
    return (
        <div className="w-full flex items-center justify-center py-8">
            <div className="relative flex flex-col items-center justify-center gap-6">

                {/* Visual Orb Container */}
                <div className="relative w-16 h-16 flex items-center justify-center">
                    {/* Ring 1: Rotating Outer */}
                    <motion.div
                        className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-500 border-r-blue-500"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, ease: "linear", repeat: Infinity }}
                    />

                    {/* Ring 2: Rotating Inner (Counter) */}
                    <motion.div
                        className="absolute inset-2 rounded-full border-2 border-transparent border-b-purple-500 border-l-pink-500"
                        animate={{ rotate: -360 }}
                        transition={{ duration: 3, ease: "linear", repeat: Infinity }}
                    />

                    {/* Ring 3: Pulse Ring */}
                    <motion.div
                        className="absolute inset-0 rounded-full border border-blue-400/30"
                        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 2, ease: "easeInOut", repeat: Infinity }}
                    />

                    {/* Core: Glowing Center */}
                    <motion.div
                        className="w-4 h-4 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)]"
                        animate={{
                            scale: [1, 1.2, 1],
                            opacity: [0.8, 1, 0.8],
                            boxShadow: [
                                "0 0 10px rgba(56, 189, 248, 0.5)",
                                "0 0 25px rgba(56, 189, 248, 0.8)",
                                "0 0 10px rgba(56, 189, 248, 0.5)"
                            ]
                        }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                    />
                </div>

                {/* Text Animation */}
                <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center gap-1"
                >
                    <h3
                        className="text-sm font-bold tracking-widest uppercase"
                        style={{ color: '#22d3ee', textShadow: '0 0 10px rgba(34, 211, 238, 0.5)' }}
                    >
                        Thinking
                    </h3>
                    <div className="flex gap-1 h-1">
                        {[0, 1, 2].map((i) => (

                            <motion.div
                                key={i}
                                className="w-1 h-1 rounded-full bg-white"
                                animate={{ y: [0, -3, 0], opacity: [0.3, 1, 0.3] }}
                                transition={{
                                    duration: 0.6,
                                    repeat: Infinity,
                                    delay: i * 0.15,
                                    ease: "easeInOut"
                                }}
                            />
                        ))}
                    </div>
                </motion.div>

                {/* Optional: Ambient Glow Background */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-blue-500/5 blur-[50px] rounded-full pointer-events-none -z-10" />
            </div>
        </div>
    );
};
