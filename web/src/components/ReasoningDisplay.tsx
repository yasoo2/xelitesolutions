/**
 * Reasoning Display Component
 * ============================
 * 
 * مكون يعرض سلسلة التفكير والحوار الداخلي لـ JOE بشكل بصري احترافي
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, 
  Zap, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Target,
  ArrowRight,
  Lightbulb,
  Settings
} from 'lucide-react';

interface ThinkingEvent {
  type: string;
  timestamp: number;
  content: string;
  metadata?: any;
  status: 'pending' | 'active' | 'completed' | 'error';
  depth: number;
}

interface ReasoningDisplayProps {
  events: ThinkingEvent[];
  isActive: boolean;
  taskDescription?: string;
  autoScroll?: boolean;
}

/**
 * مكون عرض الحدث الواحد
 */
const EventCard: React.FC<{ event: ThinkingEvent; index: number }> = ({ event, index }) => {
  const getEventIcon = () => {
    switch (event.type) {
      case 'thinking_start':
        return <Brain className="w-5 h-5" />;
      case 'task_analysis':
        return <Target className="w-5 h-5" />;
      case 'tool_evaluation':
      case 'tool_chosen':
        return <Zap className="w-5 h-5" />;
      case 'execution_start':
      case 'execution_progress':
        return <Settings className="w-5 h-5 animate-spin" />;
      case 'execution_complete':
        return <CheckCircle className="w-5 h-5" />;
      case 'error_detected':
      case 'recovery_attempt':
        return <AlertCircle className="w-5 h-5" />;
      case 'recovery_success':
        return <CheckCircle className="w-5 h-5" />;
      case 'decision_made':
        return <Lightbulb className="w-5 h-5" />;
      default:
        return <ArrowRight className="w-5 h-5" />;
    }
  };

  const getEventColor = () => {
    switch (event.status) {
      case 'active':
        return 'border-blue-500 bg-blue-50 dark:bg-blue-900/20';
      case 'completed':
        return 'border-green-500 bg-green-50 dark:bg-green-900/20';
      case 'error':
        return 'border-red-500 bg-red-50 dark:bg-red-900/20';
      default:
        return 'border-gray-300 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  const getTextColor = () => {
    switch (event.status) {
      case 'active':
        return 'text-blue-700 dark:text-blue-300';
      case 'completed':
        return 'text-green-700 dark:text-green-300';
      case 'error':
        return 'text-red-700 dark:text-red-300';
      default:
        return 'text-gray-700 dark:text-gray-300';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ delay: index * 0.05 }}
      className={`border-l-4 p-4 mb-3 rounded-lg ${getEventColor()} transition-all`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-1 ${getTextColor()}`}>
          {getEventIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h4 className={`font-semibold text-sm ${getTextColor()}`}>
              {event.type.replace(/_/g, ' ').toUpperCase()}
            </h4>
            <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
              {new Date(event.timestamp).toLocaleTimeString('ar-SA')}
            </span>
          </div>
          
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
            {event.content}
          </p>

          {/* عرض البيانات الإضافية */}
          {event.metadata && (
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 mt-2 p-2 bg-white/50 dark:bg-black/20 rounded">
              {event.metadata.toolName && (
                <div>
                  <span className="font-semibold">الأداة:</span> {event.metadata.toolName}
                </div>
              )}
              {event.metadata.confidence && (
                <div>
                  <span className="font-semibold">الثقة:</span> {(event.metadata.confidence * 100).toFixed(0)}%
                </div>
              )}
              {event.metadata.reasoning && (
                <div>
                  <span className="font-semibold">السبب:</span> {event.metadata.reasoning}
                </div>
              )}
            </div>
          )}
        </div>

        {/* مؤشر العمق */}
        {event.depth > 0 && (
          <div className="flex gap-1 mt-1">
            {Array.from({ length: event.depth }).map((_, i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500"
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

/**
 * مكون شريط التقدم
 */
const ProgressBar: React.FC<{ progress: number; duration: number }> = ({ progress, duration }) => {
  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          <Clock className="w-4 h-4" />
          <span>التقدم</span>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {duration}ms
        </span>
      </div>
      
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
};

/**
 * مكون عرض سلسلة التفكير الرئيسي
 */
export const ReasoningDisplay: React.FC<ReasoningDisplayProps> = ({
  events,
  isActive,
  taskDescription,
  autoScroll = true
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  // التمرير التلقائي
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedEvents(newExpanded);
  };

  const progress = events.length > 0 ? Math.min(100, (events.length / 20) * 100) : 0;
  const duration = events.length > 0
    ? events[events.length - 1].timestamp - events[0].timestamp
    : 0;

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-xl overflow-hidden">
      {/* الرأس */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 shadow-lg">
        <div className="flex items-center gap-3 mb-3">
          <motion.div
            animate={{ rotate: isActive ? 360 : 0 }}
            transition={{ duration: 2, repeat: isActive ? Infinity : 0 }}
          >
            <Brain className="w-6 h-6" />
          </motion.div>
          <div>
            <h2 className="text-lg font-bold">سلسلة التفكير</h2>
            <p className="text-sm text-blue-100">
              {taskDescription || 'معالجة المهمة...'}
            </p>
          </div>
        </div>

        {/* شريط التقدم */}
        <ProgressBar progress={progress} duration={duration} />

        {/* الإحصائيات */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-white/20 rounded px-2 py-1">
            <div className="text-blue-100">الخطوات</div>
            <div className="font-bold text-lg">{events.length}</div>
          </div>
          <div className="bg-white/20 rounded px-2 py-1">
            <div className="text-blue-100">الحالة</div>
            <div className="font-bold text-lg">
              {isActive ? '🔄 نشط' : '✅ مكتمل'}
            </div>
          </div>
          <div className="bg-white/20 rounded px-2 py-1">
            <div className="text-blue-100">المدة</div>
            <div className="font-bold text-lg">{(duration / 1000).toFixed(1)}s</div>
          </div>
        </div>
      </div>

      {/* محتوى الأحداث */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2"
      >
        <AnimatePresence>
          {events.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400"
            >
              <div className="text-center">
                <Brain className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>في انتظار بدء المعالجة...</p>
              </div>
            </motion.div>
          ) : (
            events.map((event, index) => (
              <EventCard key={index} event={event} index={index} />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* التذييل */}
      {isActive && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-t border-blue-200 dark:border-blue-800 px-4 py-3">
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300"
          >
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            جاري المعالجة...
          </motion.div>
        </div>
      )}
    </div>
  );
};

/**
 * مكون عرض مختصر لسلسلة التفكير
 */
export const CompactReasoningDisplay: React.FC<ReasoningDisplayProps> = ({
  events,
  isActive
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-center gap-2 mb-2">
        <motion.div animate={{ rotate: isActive ? 360 : 0 }} transition={{ duration: 2, repeat: isActive ? Infinity : 0 }}>
          <Brain className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </motion.div>
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {events.length} خطوات
        </span>
        {isActive && (
          <span className="ml-auto text-xs text-blue-600 dark:text-blue-400 animate-pulse">
            جاري...
          </span>
        )}
      </div>

      <div className="space-y-1 max-h-40 overflow-y-auto text-xs">
        {events.slice(-5).map((event, index) => (
          <div
            key={index}
            className="text-gray-600 dark:text-gray-400 truncate"
          >
            • {event.content}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReasoningDisplay;
