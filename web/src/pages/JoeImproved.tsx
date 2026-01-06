/**
 * JOE Improved Interface
 * =======================
 * 
 * واجهة محسنة واحترافية لنظام JOE
 * مع تصميم حديث وانيميشنات سلسة
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  MessageSquare,
  Settings,
  MoreVertical,
  Send,
  Loader,
  AlertCircle,
  CheckCircle,
  Brain,
  Sparkles,
  Code,
  Maximize2,
  Minimize2,
  Copy,
  Download,
  Trash2,
  Plus,
  Search,
  Filter,
  Clock,
  TrendingUp,
} from 'lucide-react';

interface Message {
  id: string;
  type: 'user' | 'agent' | 'system';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
  metadata?: {
    toolsUsed?: string[];
    executionTime?: number;
    thinkingProcess?: string;
  };
}

interface JoeSession {
  id: string;
  title: string;
  created: Date;
  updated: Date;
  messages: Message[];
  status: 'idle' | 'thinking' | 'executing' | 'error';
}

export default function JoeImproved() {
  const [sessions, setSessions] = useState<JoeSession[]>([]);
  const [activeSession, setActiveSession] = useState<JoeSession | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showThinkingProcess, setShowThinkingProcess] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // تهيئة الجلسة الأولى
  useEffect(() => {
    const initialSession: JoeSession = {
      id: '1',
      title: 'جلسة جديدة',
      created: new Date(),
      updated: new Date(),
      messages: [
        {
          id: '1',
          type: 'system',
          content: 'مرحباً! أنا JOE، مساعدك الذكي. كيف يمكنني مساعدتك اليوم؟',
          timestamp: new Date(),
          status: 'sent',
        },
      ],
      status: 'idle',
    };
    setSessions([initialSession]);
    setActiveSession(initialSession);
  }, []);

  // التمرير إلى آخر رسالة
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !activeSession) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
      status: 'sent',
    };

    // إضافة الرسالة للجلسة
    const updatedSession = {
      ...activeSession,
      messages: [...activeSession.messages, userMessage],
      status: 'thinking' as const,
    };
    setActiveSession(updatedSession);
    setSessions(sessions.map(s => s.id === activeSession.id ? updatedSession : s));
    setInputValue('');
    setIsLoading(true);

    // محاكاة استجابة JOE
    setTimeout(() => {
      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'agent',
        content: 'تم معالجة طلبك بنجاح! سأقوم بتنفيذ المهمة المطلوبة.',
        timestamp: new Date(),
        status: 'sent',
        metadata: {
          toolsUsed: ['browser_automation', 'data_extraction', 'form_filling'],
          executionTime: 2.5,
          thinkingProcess: 'تحليل الطلب → اختيار الأدوات المناسبة → التنفيذ',
        },
      };

      const finalSession = {
        ...updatedSession,
        messages: [...updatedSession.messages, agentMessage],
        status: 'idle' as const,
      };
      setActiveSession(finalSession);
      setSessions(sessions.map(s => s.id === activeSession.id ? finalSession : s));
      setIsLoading(false);
    }, 2000);
  };

  const createNewSession = () => {
    const newSession: JoeSession = {
      id: Date.now().toString(),
      title: `جلسة جديدة - ${new Date().toLocaleDateString('ar-SA')}`,
      created: new Date(),
      updated: new Date(),
      messages: [
        {
          id: '1',
          type: 'system',
          content: 'جلسة جديدة. كيف يمكنني مساعدتك؟',
          timestamp: new Date(),
          status: 'sent',
        },
      ],
      status: 'idle',
    };
    setSessions([...sessions, newSession]);
    setActiveSession(newSession);
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
      {/* Sidebar */}
      <AnimatePresence>
        {showSidebar && (
          <motion.div
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="w-72 bg-gradient-to-b from-slate-800 to-slate-900 border-r border-slate-700 flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-700 bg-gradient-to-r from-blue-600 to-purple-600">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">JOE</h1>
                  <p className="text-xs text-blue-100">مساعدك الذكي</p>
                </div>
              </div>
              <button
                onClick={createNewSession}
                className="w-full py-2 px-4 bg-white/20 hover:bg-white/30 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 font-medium"
              >
                <Plus className="w-4 h-4" />
                جلسة جديدة
              </button>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {sessions.map((session) => (
                <motion.button
                  key={session.id}
                  whileHover={{ x: 4 }}
                  onClick={() => setActiveSession(session)}
                  className={`w-full text-right p-3 rounded-lg transition-all duration-200 group ${
                    activeSession?.id === session.id
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg'
                      : 'hover:bg-slate-700 bg-slate-700/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium truncate">{session.title}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {session.messages.length} رسالة
                      </p>
                    </div>
                    {session.status === 'thinking' && (
                      <Loader className="w-4 h-4 animate-spin ml-2 text-blue-300" />
                    )}
                  </div>
                </motion.button>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-700 space-y-2">
              <button className="w-full py-2 px-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm">
                <Settings className="w-4 h-4" />
                الإعدادات
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="h-16 bg-gradient-to-r from-slate-800 to-slate-700 border-b border-slate-600 flex items-center justify-between px-6 shadow-lg"
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 hover:bg-slate-600 rounded-lg transition-all duration-200"
            >
              {showSidebar ? (
                <Minimize2 className="w-5 h-5" />
              ) : (
                <Maximize2 className="w-5 h-5" />
              )}
            </button>
            <div>
              <h2 className="font-semibold">{activeSession?.title}</h2>
              <p className="text-xs text-slate-400">
                {activeSession?.status === 'thinking' ? (
                  <span className="flex items-center gap-1">
                    <Loader className="w-3 h-3 animate-spin" />
                    جاري التفكير...
                  </span>
                ) : (
                  'جاهز'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowThinkingProcess(!showThinkingProcess)}
              className={`p-2 rounded-lg transition-all duration-200 ${
                showThinkingProcess
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-slate-600 text-slate-300'
              }`}
              title="عرض عملية التفكير"
            >
              <Brain className="w-5 h-5" />
            </button>
            <button className="p-2 hover:bg-slate-600 rounded-lg transition-all duration-200">
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
        </motion.div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <AnimatePresence>
            {activeSession?.messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.1 }}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-md lg:max-w-2xl rounded-2xl p-4 ${
                    message.type === 'user'
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg'
                      : message.type === 'system'
                      ? 'bg-slate-700 border border-slate-600'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 shadow-lg'
                  }`}
                >
                  <p className="text-sm leading-relaxed">{message.content}</p>
                  {message.metadata && (
                    <div className="mt-3 pt-3 border-t border-white/20 space-y-2">
                      {message.metadata.toolsUsed && (
                        <div className="text-xs text-white/80">
                          <span className="font-semibold">الأدوات المستخدمة:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {message.metadata.toolsUsed.map((tool) => (
                              <span
                                key={tool}
                                className="px-2 py-1 bg-white/20 rounded text-white/90"
                              >
                                {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {message.metadata.executionTime && (
                        <div className="text-xs text-white/80 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {message.metadata.executionTime}s
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Thinking Process Panel */}
        <AnimatePresence>
          {showThinkingProcess && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-slate-800 border-t border-slate-700 p-4 max-h-48 overflow-y-auto"
            >
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-yellow-400" />
                  عملية التفكير
                </h3>
                <div className="space-y-2 text-sm text-slate-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>تحليل الطلب والفهم</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>اختيار الأدوات المناسبة</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Loader className="w-4 h-4 text-blue-400 animate-spin" />
                    <span>جاري التنفيذ...</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Area */}
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="bg-gradient-to-t from-slate-900 to-slate-800 border-t border-slate-700 p-6"
        >
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="اكتب أمرك هنا... (Shift+Enter للسطر الجديد)"
                className="w-full bg-slate-700 border border-slate-600 rounded-xl p-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={3}
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSendMessage}
              disabled={isLoading || !inputValue.trim()}
              className="p-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all duration-200 shadow-lg"
            >
              {isLoading ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </motion.button>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            💡 اكتب أي أمر وسأقوم بتنفيذه باستخدام أدواتي المتقدمة
          </p>
        </motion.div>
      </div>
    </div>
  );
}
