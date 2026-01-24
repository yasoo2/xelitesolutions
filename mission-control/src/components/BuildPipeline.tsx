import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CheckCircle, AlertCircle, ChevronRight,
    Zap, Code, TestTube, Rocket, Sparkles
} from 'lucide-react';

export interface PipelineStage {
    id: string;
    name: string;
    nameAr: string;
    icon: React.ReactNode;
    status: 'pending' | 'running' | 'success' | 'error' | 'skipped';
    duration?: number;
    details?: string;
}

interface BuildPipelineProps {
    stages: PipelineStage[];
    currentStage?: string;
}

const defaultStages: PipelineStage[] = [
    { id: 'plan', name: 'Planning', nameAr: 'التخطيط', icon: <Sparkles size={16} />, status: 'pending' },
    { id: 'code', name: 'Coding', nameAr: 'البرمجة', icon: <Code size={16} />, status: 'pending' },
    { id: 'test', name: 'Testing', nameAr: 'الفحص', icon: <TestTube size={16} />, status: 'pending' },
    { id: 'deploy', name: 'Deploy', nameAr: 'النشر', icon: <Rocket size={16} />, status: 'pending' },
];

export const BuildPipeline: React.FC<BuildPipelineProps> = ({
    stages = defaultStages,
    currentStage: _currentStage
}) => {
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'running': return 'from-cyan-500 to-blue-500';
            case 'success': return 'from-green-500 to-emerald-500';
            case 'error': return 'from-red-500 to-rose-500';
            case 'skipped': return 'from-gray-500 to-gray-600';
            default: return 'from-gray-700 to-gray-800';
        }
    };

    const activeIndex = stages.findIndex(s => s.status === 'running');
    const progress = activeIndex >= 0
        ? ((activeIndex + 0.5) / stages.length) * 100
        : stages.every(s => s.status === 'success') ? 100 : 0;

    return (
        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <Zap size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white">خط البناء</h3>
                        <p className="text-xs text-gray-500">Build Pipeline</p>
                    </div>
                </div>
                <div className="text-xs text-gray-400">
                    {Math.round(progress)}% مكتمل
                </div>
            </div>

            {/* Progress Bar */}
            <div className="h-1.5 bg-gray-800 rounded-full mb-6 overflow-hidden">
                <motion.div
                    className="h-full bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                />
            </div>

            {/* Stages */}
            <div className="flex items-center justify-between relative">
                {/* Connection Line */}
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-800 -translate-y-1/2 z-0" />

                {stages.map((stage, index) => (
                    <React.Fragment key={stage.id}>
                        <motion.div
                            className="relative z-10 flex flex-col items-center"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: index * 0.1 }}
                        >
                            {/* Stage Circle */}
                            <motion.div
                                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getStatusColor(stage.status)} 
                  flex items-center justify-center shadow-lg border-2 
                  ${stage.status === 'running' ? 'border-cyan-400 shadow-cyan-500/30' : 'border-transparent'}
                  transition-all duration-300`}
                                animate={stage.status === 'running' ? {
                                    boxShadow: ['0 0 20px rgba(6, 182, 212, 0.3)', '0 0 40px rgba(6, 182, 212, 0.5)', '0 0 20px rgba(6, 182, 212, 0.3)']
                                } : {}}
                                transition={{ duration: 1.5, repeat: Infinity }}
                            >
                                <div className="text-white">
                                    {stage.status === 'running' ? (
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                        >
                                            {stage.icon}
                                        </motion.div>
                                    ) : stage.status === 'success' ? (
                                        <CheckCircle size={20} />
                                    ) : stage.status === 'error' ? (
                                        <AlertCircle size={20} />
                                    ) : (
                                        stage.icon
                                    )}
                                </div>
                            </motion.div>

                            {/* Stage Label */}
                            <div className="mt-2 text-center">
                                <p className={`text-xs font-medium ${stage.status === 'running' ? 'text-cyan-400' :
                                    stage.status === 'success' ? 'text-green-400' :
                                        stage.status === 'error' ? 'text-red-400' :
                                            'text-gray-500'
                                    }`}>
                                    {stage.nameAr}
                                </p>
                                {stage.duration && (
                                    <p className="text-[10px] text-gray-600 mt-0.5">
                                        {stage.duration.toFixed(1)}s
                                    </p>
                                )}
                            </div>

                            {/* Running Indicator */}
                            {stage.status === 'running' && (
                                <motion.div
                                    className="absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full"
                                    animate={{ scale: [1, 1.3, 1] }}
                                    transition={{ duration: 1, repeat: Infinity }}
                                />
                            )}
                        </motion.div>

                        {/* Connector Arrow */}
                        {index < stages.length - 1 && (
                            <div className="relative z-10 px-2">
                                <ChevronRight
                                    size={16}
                                    className={`${stages[index + 1].status !== 'pending' ? 'text-cyan-500' : 'text-gray-700'
                                        } transition-colors duration-300`}
                                />
                            </div>
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Active Stage Details */}
            <AnimatePresence>
                {stages.find(s => s.status === 'running')?.details && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg"
                    >
                        <p className="text-xs text-cyan-300 font-mono">
                            {stages.find(s => s.status === 'running')?.details}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default BuildPipeline;
