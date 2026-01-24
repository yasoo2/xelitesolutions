
import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, CheckCircle, Clock, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

export interface AgentStep {
    key: string;
    name: string;
    status: 'pending' | 'running' | 'done' | 'failed';
    error?: string;
    duration?: number;
}

export interface AgentActivityProps {
    status: 'idle' | 'thinking' | 'executing' | 'error';
    steps?: AgentStep[];
    logs?: string[];
    expanded?: boolean;
    onToggle?: () => void;
    runId?: string | null;
}

export const AgentActivity: React.FC<AgentActivityProps> = ({
    status,
    steps = [],
    logs: _logs = [],
    expanded = true,
    onToggle,
    runId: _runId
}) => {
    // We only show if status is NOT idle/done (unless we want to show result for a bit)
    // But per user request: "disappear and show answer". 
    // So if status is 'idle' (done), we ideally hide or show a collapsed "Done" state.
    // Let's hide completely if idle and no active steps? 
    // Actually, 'idle' usually means "waiting for user" or "done".

    if (status === 'idle') return null;

    const currentStep = useMemo(() => steps.find(s => s.status === 'running') || steps[steps.length - 1], [steps]);

    // Auto-scroll logs
    // (Omitted for brevity as logs might be empty)

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="rounded-xl overflow-hidden glass-panel border border-white/10 bg-black/40 mb-4"
        >
            {/* Header / Summary */}
            <div
                className="p-3 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                onClick={onToggle}
            >
                <div className="flex items-center gap-3">
                    {/* Orb Animation */}
                    <div className="relative w-8 h-8 flex items-center justify-center">
                        <div className={`absolute inset-0 rounded-full blur-md transition-colors duration-500
                            ${status === 'error' ? 'bg-red-500/50' :
                                status === 'thinking' ? 'bg-purple-500/50' : 'bg-cyan-500/50'} 
                            animate-pulse`}
                        />
                        <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center border
                            ${status === 'error' ? 'bg-red-900/80 border-red-500' :
                                status === 'thinking' ? 'bg-purple-900/80 border-purple-500' : 'bg-cyan-900/80 border-cyan-500'}`}
                        >
                            {status === 'error' ? <AlertCircle size={14} className="text-red-200" /> :
                                <Cpu size={14} className={`text-white ${status === 'thinking' || status === 'executing' ? 'animate-spin-slow' : ''}`} />}
                        </div>
                    </div>

                    {/* Text Status */}
                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-200 flex items-center gap-2">
                            {status === 'thinking' ? 'Thinking...' :
                                status === 'executing' ? (currentStep?.name || 'Processing...') :
                                    'System Active'}
                        </span>
                        {steps.length > 0 && (
                            <span className="text-xs text-gray-500">
                                {steps.filter(s => s.status === 'done').length} / {steps.length} steps
                            </span>
                        )}
                    </div>
                </div>

                <div className="text-gray-500">
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
            </div>

            {/* Expanded Content */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-3 pt-0 border-t border-white/5 space-y-2 bg-black/20">
                            {steps.map((step) => (
                                <div key={step.key} className="flex items-center gap-3 text-xs">
                                    <div className="w-4 flex justify-center">
                                        {step.status === 'running' ? (
                                            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-ping" />
                                        ) : step.status === 'done' ? (
                                            <CheckCircle size={12} className="text-green-400" />
                                        ) : step.status === 'failed' ? (
                                            <AlertCircle size={12} className="text-red-400" />
                                        ) : (
                                            <div className="w-2 h-2 bg-gray-600 rounded-full" />
                                        )}
                                    </div>
                                    <span className={`${step.status === 'running' ? 'text-cyan-200 font-medium' :
                                        step.status === 'done' ? 'text-gray-400' : 'text-gray-500'
                                        }`}>
                                        {step.name}
                                    </span>
                                    {step.duration && (
                                        <span className="ml-auto text-[10px] text-gray-600 flex items-center gap-1">
                                            <Clock size={8} /> {step.duration.toFixed(1)}s
                                        </span>
                                    )}
                                </div>
                            ))}

                            {steps.length === 0 && (
                                <div className="text-center text-xs text-gray-600 py-2 italic">
                                    Formulating plan...
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
