import React, { useState } from 'react';
import { Users, Send, Loader2 } from 'lucide-react';
import { API_URL } from '../config';
import ReactMarkdown from 'react-markdown';

interface DiscussionItem {
  expert: {
    role: string;
    name: string;
    focus: string;
    color: string;
  };
  content: string;
}

export default function CouncilPanel() {
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [discussion, setDiscussion] = useState<DiscussionItem[]>([]);

  const consult = async () => {
    if (!topic) return;
    setLoading(true);
    setDiscussion([]);
    
    try {
      const res = await fetch(`${API_URL}/advanced/council/consult`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic })
      });
      const data = await res.json();
      setDiscussion(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] text-white p-6">
      <div className="flex items-center gap-3 mb-6">
        <Users className="text-blue-400" size={32} />
        <div>
          <h2 className="text-xl font-bold">The AI Council</h2>
          <p className="text-sm text-gray-400">Consult a team of virtual experts</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <input 
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="Enter a complex topic (e.g., 'Should we migrate to Next.js?')"
          className="flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
        />
        <button 
          onClick={consult}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Send size={18} />}
          Consult
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-2">
        {discussion.map((item, i) => (
          <div key={i} className="flex gap-4 animate-fade-in-up" style={{ animationDelay: `${i * 0.2}s` }}>
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-lg shrink-0"
              style={{ background: item.expert.color, boxShadow: `0 0 15px ${item.expert.color}40` }}
            >
              {item.expert.name[0]}
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-bold text-lg" style={{ color: item.expert.color }}>{item.expert.name}</span>
                <span className="text-xs text-gray-500 bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full">{item.expert.role}</span>
              </div>
              <div className="bg-[var(--bg-secondary)] p-4 rounded-xl rounded-tl-none border border-[var(--border-color)] text-gray-200 leading-relaxed shadow-sm">
                <ReactMarkdown>{item.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        
        {discussion.length === 0 && !loading && (
          <div className="text-center text-gray-500 mt-20">
            <Users size={48} className="mx-auto mb-4 opacity-20" />
            <p>The council is waiting for your topic.</p>
          </div>
        )}
      </div>
    </div>
  );
}
