import React from 'react';
import { 
  Database, Server, Activity, ShieldAlert, Book, Play, Zap, 
  Cpu, BookOpen, Map, Network, Package, BarChart2, LayoutGrid, Beaker,
  LucideIcon
} from 'lucide-react';

interface AppItem {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  category: 'Monitor' | 'AI' | 'Dev';
  color: string;
}

const APPS: AppItem[] = [
  // Monitor
  { id: 'SYSTEM', label: 'System Process', icon: Server, description: 'Monitor system resources and processes', category: 'Monitor', color: 'text-blue-400' },
  { id: 'NETWORK', label: 'Network Inspector', icon: Activity, description: 'Real-time API request logging', category: 'Monitor', color: 'text-green-400' },
  { id: 'DATABASE', label: 'Database Viewer', icon: Database, description: 'Manage MongoDB collections', category: 'Monitor', color: 'text-yellow-400' },
  
  // AI
  { id: 'HEALING', label: 'Self-Healing', icon: ShieldAlert, description: 'AI Error diagnosis and auto-fix', category: 'AI', color: 'text-red-400' },
  { id: 'MEMORY', label: 'Memory', icon: Cpu, description: 'Session context and memory management', category: 'AI', color: 'text-purple-400' },
  { id: 'KNOWLEDGE', label: 'Knowledge Base', icon: BookOpen, description: 'RAG documents and embeddings', category: 'AI', color: 'text-indigo-400' },
  { id: 'PLAN', label: 'Plan Visualizer', icon: Map, description: 'Execution plan and steps', category: 'AI', color: 'text-pink-400' },
  { id: 'GRAPH', label: 'Project Graph', icon: Network, description: 'File dependency visualization', category: 'AI', color: 'text-orange-400' },
  { id: 'ARTIFACTS', label: 'Artifacts', icon: Package, description: 'Generated files and assets', category: 'AI', color: 'text-teal-400' },

  // Dev
  { id: 'DOCS', label: 'Documentation', icon: Book, description: 'AI Auto-generated docs', category: 'Dev', color: 'text-cyan-400' },
  { id: 'PLAYGROUND', label: 'API Playground', icon: Play, description: 'Test API endpoints', category: 'Dev', color: 'text-emerald-400' },
  { id: 'QUALITY', label: 'Code Quality', icon: Zap, description: 'Complexity and health analytics', category: 'Dev', color: 'text-rose-400' },
  { id: 'ANALYTICS', label: 'Analytics', icon: BarChart2, description: 'Session stats and usage', category: 'Dev', color: 'text-sky-400' },
  { id: 'TEST', label: 'Test Runner', icon: Beaker, description: 'Run and manage tests', category: 'Dev', color: 'text-lime-400' },
];

export function AppsDashboard({ onAppSelect }: { onAppSelect: (id: string) => void }) {
  const categories = ['Monitor', 'AI', 'Dev'];

  return (
    <div className="h-full bg-gray-900 text-gray-100 p-6 overflow-y-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold flex items-center gap-3 mb-2">
          <LayoutGrid className="w-8 h-8 text-blue-500" />
          Control Center
        </h2>
        <p className="text-gray-400">Manage your system, AI agents, and development tools from one place.</p>
      </div>

      <div className="space-y-8">
        {categories.map(category => (
          <div key={category}>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 border-b border-gray-800 pb-2">
              {category} Tools
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {APPS.filter(app => app.category === category).map(app => (
                <button
                  key={app.id}
                  onClick={() => onAppSelect(app.id)}
                  className="flex flex-col items-start p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-blue-500/50 rounded-xl transition-all group text-left"
                >
                  <div className={`p-3 rounded-lg bg-gray-900 mb-3 group-hover:scale-110 transition-transform ${app.color}`}>
                    <app.icon className="w-6 h-6" />
                  </div>
                  <div className="font-semibold text-gray-200 group-hover:text-white mb-1">
                    {app.label}
                  </div>
                  <div className="text-xs text-gray-500 group-hover:text-gray-400 line-clamp-2">
                    {app.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
