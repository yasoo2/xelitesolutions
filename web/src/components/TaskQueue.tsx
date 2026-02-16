import { X, Play, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface QueuedTask {
    id: string;
    message: string;
    timestamp: Date;
    priority: 'high' | 'normal';
    relatedToCurrentTask: boolean;
}

interface TaskQueueProps {
    tasks: QueuedTask[];
    onRemove: (id: string) => void;
    onExecute: (id: string) => void;
}

export default function TaskQueue({ tasks, onRemove, onExecute }: TaskQueueProps) {
    if (tasks.length === 0) return null;

    return (
        <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-slate-950 via-slate-900/95 to-transparent backdrop-blur-xl border-t border-white/10 shadow-[0_-8px_32px_rgba(0,0,0,0.4)]"
            style={{ maxHeight: '200px' }}
        >
            <div className="max-w-7xl mx-auto px-4 py-3">
                {/* Header */}
                <div className="flex items-center gap-2 mb-2">
                    <Clock size={16} className="text-yellow-500" />
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                        Queued Tasks ({tasks.length})
                    </span>
                </div>

                {/* Tasks List */}
                <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: '140px' }}>
                    <AnimatePresence>
                        {tasks.map((task, index) => (
                            <motion.div
                                key={task.id}
                                initial={{ x: -20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                exit={{ x: 20, opacity: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-gradient-to-r from-slate-800/60 to-slate-800/40 border border-white/5 hover:border-yellow-500/30 transition-all group"
                            >
                                {/* Priority Indicator */}
                                <div
                                    className={`w-2 h-2 rounded-full shrink-0 ${task.priority === 'high'
                                            ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                                            : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]'
                                        }`}
                                />

                                {/* Task Message */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-slate-200 truncate font-medium">
                                        {task.message}
                                    </p>
                                    <p className="text-[10px] text-slate-500 mt-0.5">
                                        {new Date(task.timestamp).toLocaleTimeString('ar-SA', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </p>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1 shrink-0">
                                    {/* Execute Button */}
                                    <button
                                        onClick={() => onExecute(task.id)}
                                        className="p-2 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 border border-yellow-500/20 hover:border-yellow-500/40 transition-all active:scale-90"
                                        title="تنفيذ الآن"
                                    >
                                        <Play size={14} fill="currentColor" />
                                    </button>

                                    {/* Remove Button */}
                                    <button
                                        onClick={() => onRemove(task.id)}
                                        className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 hover:border-red-500/40 transition-all active:scale-90"
                                        title="حذف"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
}
