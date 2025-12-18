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
    <div className="h-full flex flex-col bg-gray-900 text-gray-100 p-4 overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Book className="w-6 h-6 text-blue-400" />
          AI Auto-Documentation
        </h2>
        <button
          onClick={generateDocs}
          disabled={generating}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Generating...' : 'Scan & Generate'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {docs.length === 0 && !loading && !generating && (
          <div className="text-center text-gray-500 mt-20">
            <Book className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>No documentation generated yet.</p>
            <p className="text-sm">Click "Scan & Generate" to analyze the codebase.</p>
          </div>
        )}

        {docs.map((doc) => (
          <div key={doc.filePath} className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-blue-300 font-mono">{doc.filePath}</h3>
                <p className="text-gray-400 text-sm mt-1">{doc.summary}</p>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                doc.complexity === 'High' ? 'bg-red-900/50 text-red-300' :
                doc.complexity === 'Medium' ? 'bg-yellow-900/50 text-yellow-300' :
                'bg-green-900/50 text-green-300'
              }`}>
                {doc.complexity} Complexity
              </span>
            </div>

            <div className="space-y-4">
              {doc.exports?.map((exp, idx) => (
                <div key={idx} className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                  <div className="flex items-center gap-2 mb-2">
                    {exp.type === 'class' ? <Box className="w-4 h-4 text-purple-400" /> : <Code className="w-4 h-4 text-green-400" />}
                    <span className="font-mono text-purple-200 font-bold">{exp.name}</span>
                    <span className="text-xs text-gray-500 ml-auto uppercase">{exp.type}</span>
                  </div>
                  <p className="text-gray-300 text-sm mb-2">{exp.description}</p>
                  
                  {exp.params && (
                    <div className="text-xs text-gray-400 font-mono pl-4 border-l-2 border-gray-700 mb-1">
                      <span className="text-gray-500">Params:</span> {exp.params}
                    </div>
                  )}
                  {exp.returns && (
                    <div className="text-xs text-gray-400 font-mono pl-4 border-l-2 border-gray-700">
                      <span className="text-gray-500">Returns:</span> {exp.returns}
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-4 text-xs text-gray-600 text-right">
              Last updated: {new Date(doc.lastUpdated).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
