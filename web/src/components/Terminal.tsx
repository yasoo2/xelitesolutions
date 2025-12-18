import { useState, useEffect, useRef } from 'react';
import { Plus, X, Terminal as TerminalIcon } from 'lucide-react';
import XTermWrapper from './XTermWrapper';

interface TerminalTab {
  id: string;
  name: string;
  type: 'log' | 'shell';
  output?: string;
}

export default function Terminal({ agentLogs }: { agentLogs: string }) {
  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: 'main', name: 'Agent Log', type: 'log', output: agentLogs }
  ]);
  const [activeId, setActiveId] = useState('main');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sync agent logs
  useEffect(() => {
    setTabs(prev => prev.map(t => t.id === 'main' ? { ...t, output: agentLogs } : t));
  }, [agentLogs]);

  // Auto-scroll log tab
  useEffect(() => {
    if (activeId === 'main' && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agentLogs, activeId]);

  const addTab = () => {
    const newId = `term-${Date.now()}`;
    setTabs(prev => [...prev, {
      id: newId,
      name: `Shell ${prev.filter(t => t.type === 'shell').length + 1}`,
      type: 'shell'
    }]);
    setActiveId(newId);
  };

  const closeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (id === 'main') return;
    setTabs(prev => prev.filter(t => t.id !== id));
    if (activeId === id) setActiveId('main');
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-[#d4d4d4] font-mono text-sm">
      {/* Tabs */}
      <div className="flex bg-[#252526] overflow-x-auto border-b border-[#333] no-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveId(tab.id)}
            className={`
              flex items-center gap-2 px-3 py-2 min-w-[120px] max-w-[200px] border-r border-[#333] text-xs transition-colors
              ${activeId === tab.id ? 'bg-[#1e1e1e] text-white' : 'bg-[#2d2d2d] text-[#999] hover:bg-[#2a2d2e]'}
            `}
          >
            <TerminalIcon size={12} className={activeId === tab.id ? 'text-blue-400' : 'text-gray-500'} />
            <span className="truncate flex-1 text-left">{tab.name}</span>
            {tab.id !== 'main' && (
              <span 
                onClick={(e) => closeTab(e, tab.id)}
                className="p-0.5 rounded-sm hover:bg-[#444] text-gray-500 hover:text-white cursor-pointer"
              >
                <X size={10} />
              </span>
            )}
          </button>
        ))}
        <button 
          onClick={addTab}
          className="px-3 hover:bg-[#333] text-[#999] hover:text-white transition-colors"
          title="New Terminal"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-hidden">
        {tabs.map(tab => (
            <div 
                key={tab.id} 
                className={`absolute inset-0 bg-[#1e1e1e] ${activeId === tab.id ? 'z-10' : 'z-0 invisible'}`}
            >
                {tab.type === 'log' ? (
                    <div ref={scrollRef} className="h-full overflow-y-auto p-4 whitespace-pre-wrap font-mono text-xs text-gray-300">
                        {tab.output || 'No logs yet...'}
                    </div>
                ) : (
                    <div className="h-full w-full p-2">
                        <XTermWrapper id={tab.id} isActive={activeId === tab.id} />
                    </div>
                )}
            </div>
        ))}
      </div>
    </div>
  );
}
