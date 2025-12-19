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

  if (loading) return <div className="p-8 text-center text-[var(--text-muted)]">Analyzing codebase...</div>;
  if (!data) return <div className="p-8 text-center text-[var(--accent-danger)]">Failed to load analytics</div>;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-[var(--accent-success)]';
    if (score >= 50) return 'text-[var(--accent-warning)]';
    return 'text-[var(--accent-danger)]';
  };

  return (
    <div className="h-full flex flex-col bg-[var(--bg-dark)] text-[var(--text-primary)] p-4 overflow-hidden">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
          <BarChart2 className="w-6 h-6 text-[var(--accent-primary)]" />
          Code Quality Analytics
        </h2>
        <div className="flex items-center gap-2 bg-[var(--bg-card)] px-3 py-1 rounded-full border border-[var(--border-color)]">
           <span className="text-sm text-[var(--text-muted)]">Health Score:</span>
           <span className={`text-xl font-bold ${getScoreColor(data.overview.score)}`}>{data.overview.score}/100</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-color)] shadow-sm">
          <div className="flex items-center gap-2 text-[var(--text-muted)] mb-1 text-sm">
            <FileText className="w-4 h-4" /> Total Files
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">{data.overview.totalFiles}</div>
        </div>
        <div className="bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-color)] shadow-sm">
          <div className="flex items-center gap-2 text-[var(--text-muted)] mb-1 text-sm">
            <Hash className="w-4 h-4" /> Lines of Code
          </div>
          <div className="text-2xl font-bold text-[var(--text-primary)]">{data.overview.totalLoc}</div>
        </div>
        <div className="bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-color)] shadow-sm">
          <div className="flex items-center gap-2 text-[var(--text-muted)] mb-1 text-sm">
            <CheckCircle className="w-4 h-4" /> Pending Tasks
          </div>
          <div className="text-2xl font-bold text-[var(--accent-warning)]">{data.overview.totalTodos}</div>
        </div>
        <div className="bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-color)] shadow-sm">
          <div className="flex items-center gap-2 text-[var(--text-muted)] mb-1 text-sm">
            <Layers className="w-4 h-4" /> Avg Complexity
          </div>
          <div className="text-2xl font-bold text-[var(--accent-secondary)]">{data.overview.avgComplexity}</div>
        </div>
      </div>

      <h3 className="text-lg font-semibold mb-4 text-[var(--text-secondary)]">Most Complex Files</h3>
      <div className="flex-1 overflow-y-auto bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--bg-hover)] text-[var(--text-secondary)] sticky top-0">
            <tr>
              <th className="p-3 font-medium">File Path</th>
              <th className="p-3 font-medium text-right">LOC</th>
              <th className="p-3 font-medium text-right">Complexity</th>
              <th className="p-3 font-medium text-right">Tasks</th>
              <th className="p-3 font-medium text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {data.files.map((file) => (
              <tr key={file.path} className="hover:bg-[var(--bg-hover)] transition-colors">
                <td className="p-3 font-mono text-[var(--text-primary)] opacity-80">{file.path}</td>
                <td className="p-3 text-right text-[var(--text-muted)]">{file.loc}</td>
                <td className="p-3 text-right font-medium text-[var(--accent-secondary)]">{file.complexity}</td>
                <td className="p-3 text-right text-[var(--accent-warning)]">{file.todoCount > 0 ? file.todoCount : '-'}</td>
                <td className="p-3 text-right">
                  {file.complexity > 20 ? (
                    <span className="flex items-center justify-end gap-1 text-[var(--accent-danger)]">
                      <AlertTriangle className="w-3 h-3" /> Refactor
                    </span>
                  ) : (
                    <span className="flex items-center justify-end gap-1 text-[var(--accent-success)]">
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
