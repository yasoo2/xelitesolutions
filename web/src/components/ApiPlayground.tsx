import React, { useState } from 'react';
import { Play, Send, Trash2, Save, Clock } from 'lucide-react';
import { API_URL } from '../config';

interface HistoryItem {
  method: string;
  url: string;
  status?: number;
  timestamp: number;
}

export function ApiPlayground() {
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('/system/stats');
  const [headers, setHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
  const [body, setBody] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const handleSend = async () => {
    setLoading(true);
    setResponse(null);
    try {
      const fullUrl = url.startsWith('http') ? url : `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
      
      const options: RequestInit = {
        method,
        headers: {
            ...JSON.parse(headers),
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
      };

      if (['POST', 'PUT', 'PATCH'].includes(method) && body) {
        options.body = body;
      }

      const start = Date.now();
      const res = await fetch(fullUrl, options);
      const data = await res.json().catch(() => ({ error: 'Invalid JSON response' }));
      const duration = Date.now() - start;

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        data,
        duration
      });

      setHistory(prev => [{ method, url, status: res.status, timestamp: Date.now() }, ...prev.slice(0, 9)]);

    } catch (e: any) {
      setResponse({
        error: e.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-100 p-4">
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
        <Play className="w-6 h-6 text-green-400" />
        Integrated API Playground
      </h2>

      <div className="flex gap-4 mb-4">
        <select 
          value={method} 
          onChange={(e) => setMethod(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono"
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
        <input 
          type="text" 
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="/path/to/endpoint"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white font-mono"
        />
        <button 
          onClick={handleSend}
          disabled={loading}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
          Send
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 flex-1 overflow-hidden">
        {/* Left Column: Request Config */}
        <div className="flex flex-col gap-4 overflow-y-auto pr-2">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1 uppercase">Headers (JSON)</label>
            <textarea 
              value={headers}
              onChange={(e) => setHeaders(e.target.value)}
              className="w-full h-32 bg-gray-800 border border-gray-700 rounded-lg p-3 font-mono text-xs text-blue-300 focus:outline-none focus:border-blue-500"
            />
          </div>
          {['POST', 'PUT', 'PATCH'].includes(method) && (
            <div className="flex-1 flex flex-col">
              <label className="block text-xs font-medium text-gray-400 mb-1 uppercase">Body (JSON)</label>
              <textarea 
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="flex-1 w-full bg-gray-800 border border-gray-700 rounded-lg p-3 font-mono text-xs text-green-300 focus:outline-none focus:border-green-500"
                placeholder="{}"
              />
            </div>
          )}
          
          <div className="mt-auto">
             <label className="block text-xs font-medium text-gray-400 mb-2 uppercase flex items-center gap-2">
               <Clock className="w-3 h-3" /> Recent Requests
             </label>
             <div className="space-y-2">
               {history.map((h, i) => (
                 <div key={i} 
                      onClick={() => { setMethod(h.method); setUrl(h.url); }}
                      className="flex items-center gap-2 p-2 bg-gray-800/50 hover:bg-gray-800 rounded cursor-pointer text-xs font-mono transition-colors">
                   <span className={`px-1.5 py-0.5 rounded ${
                     h.method === 'GET' ? 'bg-blue-900 text-blue-300' :
                     h.method === 'POST' ? 'bg-green-900 text-green-300' :
                     'bg-red-900 text-red-300'
                   }`}>{h.method}</span>
                   <span className="truncate flex-1 text-gray-400">{h.url}</span>
                   <span className={`text-xs ${h.status && h.status >= 400 ? 'text-red-400' : 'text-green-400'}`}>{h.status}</span>
                 </div>
               ))}
             </div>
          </div>
        </div>

        {/* Right Column: Response */}
        <div className="flex flex-col bg-gray-950 rounded-xl border border-gray-800 overflow-hidden">
          <div className="bg-gray-900 px-4 py-2 border-b border-gray-800 flex justify-between items-center">
            <span className="text-xs font-bold text-gray-400 uppercase">Response</span>
            {response && (
              <div className="flex items-center gap-3 text-xs">
                <span className={`font-mono ${response.status >= 400 ? 'text-red-400' : 'text-green-400'}`}>
                  {response.status} {response.statusText}
                </span>
                <span className="text-gray-600">|</span>
                <span className="text-blue-400">{response.duration}ms</span>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-auto p-4">
            {response ? (
              <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap">
                {JSON.stringify(response.data, null, 2)}
              </pre>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-700 text-sm italic">
                No response yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
