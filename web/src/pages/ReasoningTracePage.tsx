/**
 * Reasoning Trace Page
 * ====================
 * 
 * صفحة عرض سلسلة التفكير الكاملة مع واجهة تفاعلية احترافية
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  Share2,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Eye,
  EyeOff,
  Filter,
  Search,
  Copy,
  Check
} from 'lucide-react';
import ReasoningDisplay from '@/components/ReasoningDisplay';

interface ThinkingEvent {
  type: string;
  timestamp: number;
  content: string;
  metadata?: any;
  status: 'pending' | 'active' | 'completed' | 'error';
  depth: number;
}

interface ReasoningStats {
  totalEvents: number;
  totalDuration: number;
  toolsUsed: number;
  successRate: number;
  averageEventDuration: number;
}

/**
 * صفحة عرض سلسلة التفكير
 */
export default function ReasoningTracePage() {
  const [events, setEvents] = useState<ThinkingEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [showMetadata, setShowMetadata] = useState(true);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<ReasoningStats | null>(null);

  // محاكاة الأحداث (في التطبيق الفعلي ستأتي من WebSocket)
  useEffect(() => {
    if (!isRunning || isPaused) return;

    const mockEvents: ThinkingEvent[] = [
      {
        type: 'thinking_start',
        timestamp: Date.now(),
        content: 'بدء معالجة المهمة: بناء موقع ويب احترافي',
        status: 'completed',
        depth: 0
      },
      {
        type: 'task_analysis',
        timestamp: Date.now() + 100,
        content: 'تحليل المهمة والمتطلبات',
        metadata: {
          goal: 'بناء موقع ويب احترافي',
          constraints: ['responsive design', 'SEO optimized'],
          requiredTools: ['scaffold_project', 'npm_install', 'npm_build']
        },
        status: 'completed',
        depth: 0
      },
      {
        type: 'goal_breakdown',
        timestamp: Date.now() + 300,
        content: 'تقسيم الهدف إلى 5 خطوات',
        metadata: {
          steps: [
            { step: 1, description: 'إنشاء هيكل المشروع', tools: ['scaffold_project'] },
            { step: 2, description: 'تثبيت المكتبات', tools: ['npm_install'] },
            { step: 3, description: 'كتابة الكود', tools: ['code_write'] },
            { step: 4, description: 'الاختبار', tools: ['test_performance'] },
            { step: 5, description: 'النشر', tools: ['app_deploy'] }
          ]
        },
        status: 'completed',
        depth: 0
      },
      {
        type: 'tool_evaluation',
        timestamp: Date.now() + 500,
        content: 'تقييم الأدوات المتاحة',
        metadata: {
          tools: [
            { name: 'scaffold_project', score: 0.95, reasoning: 'الأفضل للمشاريع الجديدة' },
            { name: 'manual_setup', score: 0.6, reasoning: 'يتطلب وقت أكثر' }
          ]
        },
        status: 'completed',
        depth: 1
      },
      {
        type: 'tool_chosen',
        timestamp: Date.now() + 700,
        content: 'اختيار الأداة: scaffold_project',
        metadata: {
          toolName: 'scaffold_project',
          reasoning: 'أسرع وأكثر موثوقية',
          confidence: 0.98
        },
        status: 'completed',
        depth: 1
      },
      {
        type: 'execution_start',
        timestamp: Date.now() + 900,
        content: 'بدء تنفيذ: scaffold_project',
        metadata: { toolName: 'scaffold_project' },
        status: 'completed',
        depth: 1
      },
      {
        type: 'execution_progress',
        timestamp: Date.now() + 1500,
        content: 'جاري إنشاء الملفات الأساسية...',
        metadata: { progress: 30 },
        status: 'completed',
        depth: 2
      },
      {
        type: 'execution_progress',
        timestamp: Date.now() + 2000,
        content: 'جاري إعداد التكوينات...',
        metadata: { progress: 60 },
        status: 'completed',
        depth: 2
      },
      {
        type: 'execution_complete',
        timestamp: Date.now() + 2500,
        content: 'اكتمل تنفيذ scaffold_project في 1600ms',
        metadata: { toolName: 'scaffold_project', duration: 1600 },
        status: 'completed',
        depth: 1
      },
      {
        type: 'decision_made',
        timestamp: Date.now() + 2700,
        content: 'قرار: استخدام React مع TypeScript',
        metadata: {
          decision: 'React + TypeScript',
          reasoning: 'أفضل أداء وأمان النوع',
          alternatives: ['Vue.js', 'Svelte']
        },
        status: 'active',
        depth: 0
      }
    ];

    const interval = setInterval(() => {
      setEvents(prev => {
        if (prev.length < mockEvents.length) {
          return [...prev, mockEvents[prev.length]];
        }
        return prev;
      });
    }, 800);

    return () => clearInterval(interval);
  }, [isRunning, isPaused]);

  // حساب الإحصائيات
  useEffect(() => {
    if (events.length === 0) return;

    const totalDuration = events[events.length - 1].timestamp - events[0].timestamp;
    const toolEvents = events.filter(e => e.type.includes('tool') || e.type.includes('execution'));
    const successfulTools = toolEvents.filter(e => e.status === 'completed').length;

    setStats({
      totalEvents: events.length,
      totalDuration,
      toolsUsed: toolEvents.length,
      successRate: toolEvents.length > 0 ? (successfulTools / toolEvents.length) * 100 : 0,
      averageEventDuration: totalDuration / events.length
    });
  }, [events]);

  // تصفية الأحداث
  const filteredEvents = events.filter(event => {
    const matchesSearch = event.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = !filterType || event.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const handleDownload = () => {
    const data = JSON.stringify({ events, stats }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reasoning-trace-${Date.now()}.json`;
    a.click();
  };

  const handleCopyToClipboard = () => {
    const data = JSON.stringify({ events, stats }, null, 2);
    navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* الرأس */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">
                🧠 سلسلة التفكير
              </h1>
              <p className="text-gray-400">
                مراقبة عملية التفكير والحوار الداخلي لنظام JOE بشكل فوري
              </p>
            </div>
            
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsRunning(!isRunning)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition"
              >
                {isRunning ? (
                  <>
                    <Pause className="w-4 h-4" />
                    إيقاف
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    تشغيل
                  </>
                )}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setEvents([]);
                  setStats(null);
                }}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition"
              >
                <RotateCcw className="w-4 h-4" />
                إعادة تعيين
              </motion.button>
            </div>
          </div>

          {/* شريط الأدوات */}
          <div className="bg-gray-800/50 backdrop-blur rounded-lg p-4 flex flex-wrap gap-3 items-center">
            {/* البحث */}
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="البحث في الأحداث..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-700 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* التصفية */}
            <select
              value={filterType || ''}
              onChange={(e) => setFilterType(e.target.value || null)}
              className="bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">جميع الأنواع</option>
              <option value="thinking_start">البداية</option>
              <option value="task_analysis">تحليل المهمة</option>
              <option value="tool_evaluation">تقييم الأدوات</option>
              <option value="execution_start">التنفيذ</option>
              <option value="error_detected">الأخطاء</option>
            </select>

            {/* الخيارات */}
            <button
              onClick={() => setShowMetadata(!showMetadata)}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition"
            >
              {showMetadata ? (
                <>
                  <Eye className="w-4 h-4" />
                  إخفاء التفاصيل
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4" />
                  إظهار التفاصيل
                </>
              )}
            </button>

            {/* التحميل والمشاركة */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDownload}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4" />
              تحميل
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCopyToClipboard}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  تم النسخ
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  نسخ
                </>
              )}
            </motion.button>
          </div>
        </motion.div>

        {/* المحتوى الرئيسي */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* عرض سلسلة التفكير */}
          <div className="lg:col-span-3">
            <ReasoningDisplay
              events={filteredEvents}
              isActive={isRunning}
              taskDescription="بناء موقع ويب احترافي"
              autoScroll={true}
            />
          </div>

          {/* الإحصائيات */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            {/* بطاقة الإحصائيات */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg p-6 text-white shadow-xl">
              <h3 className="text-lg font-bold mb-4">الإحصائيات</h3>
              
              <div className="space-y-3">
                <div>
                  <div className="text-sm text-blue-100">إجمالي الأحداث</div>
                  <div className="text-3xl font-bold">{stats?.totalEvents || 0}</div>
                </div>

                <div>
                  <div className="text-sm text-blue-100">المدة الكلية</div>
                  <div className="text-2xl font-bold">
                    {((stats?.totalDuration || 0) / 1000).toFixed(2)}s
                  </div>
                </div>

                <div>
                  <div className="text-sm text-blue-100">الأدوات المستخدمة</div>
                  <div className="text-2xl font-bold">{stats?.toolsUsed || 0}</div>
                </div>

                <div>
                  <div className="text-sm text-blue-100">معدل النجاح</div>
                  <div className="text-2xl font-bold">
                    {(stats?.successRate || 0).toFixed(1)}%
                  </div>
                </div>

                <div>
                  <div className="text-sm text-blue-100">متوسط المدة</div>
                  <div className="text-2xl font-bold">
                    {((stats?.averageEventDuration || 0) / 1000).toFixed(3)}s
                  </div>
                </div>
              </div>
            </div>

            {/* معلومات إضافية */}
            <div className="bg-gray-800/50 backdrop-blur rounded-lg p-4 text-gray-300 text-sm space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>مكتمل: {events.filter(e => e.status === 'completed').length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span>نشط: {events.filter(e => e.status === 'active').length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span>أخطاء: {events.filter(e => e.status === 'error').length}</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
