import React, { useState, useEffect } from 'react';
import { BarChart2, CheckCircle, AlertTriangle, FileText, Layers, Hash } from 'lucide-react';
import { API_URL } from '../config';

interface FileStat {
  path: string;
  size: number;
  loc: number;
  todoCount: number;
  complexity: number;
}

interface AnalyticsData {
  overview: {
    totalFiles: number;
    totalLoc: number;
    totalTodos: number;
    score: number;
    avgComplexity: number;
  };
  files: FileStat[];
}

export function CodeQuality() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuality();
  }, []);

  const fetchQuality = async () => {
    try {
      const res = await fetch(`${API_URL}/analytics/quality`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Analyzing codebase...</div>;
  if (!data) return <div className="p-8 text-center text-red-500">Failed to load analytics</div>;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-100 p-4 overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <BarChart2 className="w-6 h-6 text-purple-400" />
          Code Quality Analytics
        </h2>
        <div className="flex items-center gap-2 bg-gray-800 px-3 py-1 rounded-full border border-gray-700">
           <span className="text-sm text-gray-400">Health Score:</span>
           <span className={`text-xl font-bold ${getScoreColor(data.overview.score)}`}>{data.overview.score}/100</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
          <div className="flex items-center gap-2 text-gray-400 mb-1 text-sm">
            <FileText className="w-4 h-4" /> Total Files
          </div>
          <div className="text-2xl font-bold text-white">{data.overview.totalFiles}</div>
        </div>
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
          <div className="flex items-center gap-2 text-gray-400 mb-1 text-sm">
            <Hash className="w-4 h-4" /> Lines of Code
          </div>
          <div className="text-2xl font-bold text-white">{data.overview.totalLoc}</div>
        </div>
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
          <div className="flex items-center gap-2 text-gray-400 mb-1 text-sm">
            <CheckCircle className="w-4 h-4" /> Pending TODOs
          </div>
          <div className="text-2xl font-bold text-yellow-400">{data.overview.totalTodos}</div>
        </div>
        <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
          <div className="flex items-center gap-2 text-gray-400 mb-1 text-sm">
            <Layers className="w-4 h-4" /> Avg Complexity
          </div>
          <div className="text-2xl font-bold text-blue-400">{data.overview.avgComplexity}</div>
        </div>
      </div>

      <h3 className="text-lg font-semibold mb-4 text-gray-300">Most Complex Files</h3>
      <div className="flex-1 overflow-y-auto bg-gray-800 rounded-xl border border-gray-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-900/50 text-gray-400 sticky top-0">
            <tr>
              <th className="p-3 font-medium">File Path</th>
              <th className="p-3 font-medium text-right">LOC</th>
              <th className="p-3 font-medium text-right">Complexity</th>
              <th className="p-3 font-medium text-right">TODOs</th>
              <th className="p-3 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {data.files.map((file) => (
              <tr key={file.path} className="hover:bg-gray-700/50 transition-colors">
                <td className="p-3 font-mono text-gray-300">{file.path}</td>
                <td className="p-3 text-right text-gray-400">{file.loc}</td>
                <td className="p-3 text-right font-medium text-blue-300">{file.complexity}</td>
                <td className="p-3 text-right text-yellow-500">{file.todoCount > 0 ? file.todoCount : '-'}</td>
                <td className="p-3 text-right">
                  {file.complexity > 20 ? (
                    <span className="flex items-center justify-end gap-1 text-red-400">
                      <AlertTriangle className="w-3 h-3" /> Refactor
                    </span>
                  ) : (
                    <span className="flex items-center justify-end gap-1 text-green-400">
                      <CheckCircle className="w-3 h-3" /> Good
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
