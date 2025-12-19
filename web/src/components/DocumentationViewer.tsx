import React, { useState, useEffect } from 'react';
import { Book, RefreshCw, Code, Box } from 'lucide-react';
import { API_URL } from '../config';

interface DocEntry {
  filePath: string;
  summary: string;
  exports: Array<{
    name: string;
    type: string;
    description: string;
    params?: string;
    returns?: string;
  }>;
  complexity: string;
  lastUpdated: string;
}

export function DocumentationViewer() {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchDocs();
  }, []);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/docs`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      // Handle both array (from list) and object (cache)
      setDocs(Array.isArray(data) ? data : Object.values(data));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const generateDocs = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${API_URL}/docs/generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      setDocs(data);
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[var(--bg-dark)] text-[var(--text-primary)] p-4 overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Book className="w-6 h-6 text-[var(--accent-primary)]" />
          AI Auto-Documentation
        </h2>
        <button
          onClick={generateDocs}
          disabled={generating}
          className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Generating...' : 'Scan & Generate'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {docs.length === 0 && !loading && !generating && (
          <div className="text-center text-[var(--text-muted)] mt-20">
            <Book className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>No documentation generated yet.</p>
            <p className="text-sm">Click "Scan & Generate" to analyze the codebase.</p>
          </div>
        )}

        {docs.map((doc) => (
          <div key={doc.filePath} className="bg-[var(--bg-card)] rounded-xl p-6 border border-[var(--border-color)] shadow-sm hover:border-[var(--accent-primary)] transition-colors">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--accent-primary)] font-mono">{doc.filePath}</h3>
                <p className="text-[var(--text-secondary)] text-sm mt-1">{doc.summary}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                doc.complexity === 'High' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-500' :
                doc.complexity === 'Medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-500' :
                'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-500'
              }`}>
                {doc.complexity} Complexity
              </span>
            </div>

            <div className="space-y-4">
              {doc.exports.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-[var(--text-muted)] uppercase mb-2 flex items-center gap-2">
                    <Box className="w-4 h-4" /> Exports
                  </h4>
                  <div className="grid gap-3">
                    {doc.exports.map((exp, i) => (
                      <div key={i} className="bg-[var(--bg-secondary)] p-3 rounded-lg border border-[var(--border-color)]">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{exp.name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-color)]">{exp.type}</span>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)] mb-2">{exp.description}</p>
                        {exp.params && (
                           <div className="text-xs font-mono text-[var(--text-muted)] bg-[var(--bg-hover)] p-2 rounded">
                             <span className="text-[var(--accent-secondary)]">params:</span> {exp.params}
                           </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-[var(--border-color)] flex justify-between items-center text-xs text-[var(--text-muted)]">
              <span>Last updated: {new Date(doc.lastUpdated).toLocaleDateString()}</span>
              <div className="flex items-center gap-1">
                <Code className="w-3 h-3" />
                <span>Generated by AI</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
