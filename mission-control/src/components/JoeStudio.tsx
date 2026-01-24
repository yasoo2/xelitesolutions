import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    Send, Sparkles, Bot, User,
    LayoutGrid, Columns, Maximize2
} from 'lucide-react';

// Components
import { BuildPipeline } from './BuildPipeline';
import { ReasoningPanel } from './ReasoningPanel';
import { ProjectTree } from './ProjectTree';
import type { FileNode } from './ProjectTree';
import { DiffViewer } from './DiffViewer';
import { LivePreview } from './LivePreview';
import { ScreenshotGallery } from './ScreenshotGallery';

// Hook
import { useAgent } from '../hooks/useAgent';

type LayoutMode = 'full' | 'split' | 'grid';

export const JoeStudio: React.FC = () => {
    // Use the real agent hook
    const {
        messages,
        status,
        sendMessage,
        thoughts,
        pipeline,
        diffs,
        previewUrl,
        fileActivities,
        screenshots
    } = useAgent();

    const [input, setInput] = useState('');
    const [layoutMode, setLayoutMode] = useState<LayoutMode>('split');

    // Panel States
    const [reasoningExpanded, setReasoningExpanded] = useState(true);
    const [diffExpanded, setDiffExpanded] = useState(true);
    const [screenshotExpanded, setScreenshotExpanded] = useState(true);

    // Build project tree from file activities
    const projectTree = useMemo<FileNode>(() => {
        const root: FileNode = {
            name: 'project',
            path: '/project',
            type: 'folder',
            children: []
        };

        fileActivities.forEach(fa => {
            const fileName = fa.path.split('/').pop() || fa.path;
            const ext = fileName.split('.').pop() || '';

            // Add to root children if not already there
            const existing = root.children?.find(c => c.path === fa.path);
            if (!existing) {
                root.children = root.children || [];
                root.children.push({
                    name: fileName,
                    path: fa.path,
                    type: 'file',
                    isNew: fa.action === 'created',
                    isModified: fa.action === 'modified',
                    extension: ext
                });
            }
        });

        return root;
    }, [fileActivities]);

    const isThinking = status === 'thinking' || status === 'executing';

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isThinking) return;

        sendMessage(input);
        setInput('');
    };

    // Format messages for display
    const formattedMessages = messages.map(msg => ({
        ...msg,
        timestamp: new Date()
    }));

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white">
            {/* Header */}
            <header className="border-b border-white/10 bg-black/40 backdrop-blur-xl sticky top-0 z-40">
                <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 via-pink-500 to-cyan-500 flex items-center justify-center ${isThinking ? 'animate-pulse' : ''}`}>
                            <Bot size={24} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
                                Joe Studio
                            </h1>
                            <p className="text-xs text-gray-500">استوديو البناء الذكي</p>
                        </div>
                    </div>

                    {/* Status Indicator */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-xs">
                            <span className={`w-2 h-2 rounded-full ${status === 'idle' ? 'bg-gray-500' :
                                status === 'thinking' ? 'bg-yellow-500 animate-pulse' :
                                    status === 'executing' ? 'bg-cyan-500 animate-pulse' :
                                        'bg-red-500'
                                }`} />
                            <span className="text-gray-400">
                                {status === 'idle' ? 'جاهز' :
                                    status === 'thinking' ? 'يفكر...' :
                                        status === 'executing' ? 'ينفذ...' :
                                            'خطأ'}
                            </span>
                        </div>

                        {/* Layout Switcher */}
                        <div className="flex items-center gap-2 bg-gray-800/50 rounded-xl p-1">
                            <button
                                onClick={() => setLayoutMode('full')}
                                className={`p-2 rounded-lg transition-all ${layoutMode === 'full' ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                <Maximize2 size={16} />
                            </button>
                            <button
                                onClick={() => setLayoutMode('split')}
                                className={`p-2 rounded-lg transition-all ${layoutMode === 'split' ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                <Columns size={16} />
                            </button>
                            <button
                                onClick={() => setLayoutMode('grid')}
                                className={`p-2 rounded-lg transition-all ${layoutMode === 'grid' ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                <LayoutGrid size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-[1800px] mx-auto p-4">
                {/* Build Pipeline - Always visible */}
                <div className="mb-4">
                    <BuildPipeline stages={pipeline} />
                </div>

                {/* Main Grid */}
                <div className={`grid gap-4 ${layoutMode === 'full' ? 'grid-cols-1' :
                    layoutMode === 'split' ? 'grid-cols-2' :
                        'grid-cols-3'
                    }`}>

                    {/* Left Column - Chat & Reasoning */}
                    <div className={`space-y-4 ${layoutMode === 'grid' ? '' : 'col-span-1'}`}>
                        {/* Chat */}
                        <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden flex flex-col h-[400px]">
                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {formattedMessages.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-gray-500">
                                        <div className="text-center">
                                            <Sparkles size={32} className="mx-auto mb-2 opacity-30" />
                                            <p className="text-sm">اطلب من جو بناء أي شيء...</p>
                                        </div>
                                    </div>
                                ) : (
                                    formattedMessages.map(msg => (
                                        <motion.div
                                            key={msg.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            {msg.role === 'assistant' && (
                                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                                                    <Bot size={14} />
                                                </div>
                                            )}
                                            <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === 'user'
                                                ? 'bg-cyan-600/20 border border-cyan-500/30 text-cyan-100'
                                                : 'bg-white/5 border border-white/10 text-gray-200'
                                                }`}>
                                                {msg.content}
                                            </div>
                                            {msg.role === 'user' && (
                                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                                                    <User size={14} />
                                                </div>
                                            )}
                                        </motion.div>
                                    ))
                                )}
                            </div>

                            {/* Input */}
                            <form onSubmit={handleSend} className="p-3 border-t border-white/5 bg-black/20">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        placeholder="اكتب أمرك لجو..."
                                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500/50 transition-all"
                                        dir="rtl"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!input.trim() || isThinking}
                                        className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-cyan-600 rounded-xl text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                                    >
                                        <Send size={16} />
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* Reasoning Panel */}
                        <ReasoningPanel
                            thoughts={thoughts}
                            expanded={reasoningExpanded}
                            onToggle={() => setReasoningExpanded(!reasoningExpanded)}
                            isThinking={isThinking}
                        />
                    </div>

                    {/* Middle Column - Preview & Diff */}
                    <div className={`space-y-4 ${layoutMode === 'full' ? 'hidden' : ''}`}>
                        <LivePreview
                            url={previewUrl}
                            isLoading={isThinking}
                            lastUpdate={new Date()}
                        />

                        <DiffViewer
                            diffs={diffs}
                            expanded={diffExpanded}
                            onToggle={() => setDiffExpanded(!diffExpanded)}
                        />
                    </div>

                    {/* Right Column - Tree & Screenshots */}
                    <div className={`space-y-4 ${layoutMode !== 'grid' ? 'hidden' : ''}`}>
                        <ProjectTree
                            root={projectTree}
                            onFileSelect={(path) => console.log('Selected:', path)}
                        />

                        <ScreenshotGallery
                            screenshots={screenshots}
                            expanded={screenshotExpanded}
                            onToggle={() => setScreenshotExpanded(!screenshotExpanded)}
                        />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default JoeStudio;
