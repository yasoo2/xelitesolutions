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
    <div className="flex flex-col h-full bg-[var(--bg-dark)] text-[var(--text-primary)] font-mono text-sm">
      {/* Tabs */}
      <div className="flex bg-[var(--bg-secondary)] overflow-x-auto border-b border-[var(--border-color)] no-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveId(tab.id)}
            className={`
              flex items-center gap-2 px-3 py-2 min-w-[120px] max-w-[200px] border-r border-[var(--border-color)] text-xs transition-colors
              ${activeId === tab.id ? 'bg-[var(--bg-dark)] text-[var(--accent-primary)] font-bold' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'}
            `}
          >
            <TerminalIcon size={12} className={activeId === tab.id ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'} />
            <span className="truncate flex-1 text-left">{tab.name}</span>
            {tab.id !== 'main' && (
              <span 
                onClick={(e) => closeTab(e, tab.id)}
                className="p-0.5 rounded-sm hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--accent-danger)] cursor-pointer"
              >
                <X size={10} />
              </span>
            )}
          </button>
        ))}
        <button 
          onClick={addTab}
          className="px-3 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
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
                className={`absolute inset-0 bg-[var(--bg-dark)] ${activeId === tab.id ? 'z-10' : 'z-0 invisible'}`}
            >
                {tab.type === 'log' ? (
                    <div ref={scrollRef} className="h-full overflow-y-auto p-4 whitespace-pre-wrap font-mono text-xs text-[var(--text-secondary)]">
                        {tab.output || 'No logs yet...'}
                    </div>
                ) : (
                    <div className="h-full w-full p-2 bg-[var(--bg-dark)]">
                        <XTermWrapper id={tab.id} isActive={activeId === tab.id} />
                    </div>
                )}
            </div>
        ))}
      </div>
    </div>
  );
}
