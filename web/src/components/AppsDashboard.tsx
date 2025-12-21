import React from 'react';
import { 
  Database, Server, Activity, ShieldAlert, Book, Play, Zap, 
  Cpu, BookOpen, Map, Network, Package, BarChart2, LayoutGrid, Beaker, Globe,
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
  { id: 'SYSTEM', label: 'System Process', icon: Server, description: 'Monitor system resources and processes', category: 'Monitor', color: 'text-blue-600 dark:text-blue-400' },
  { id: 'DATABASE', label: 'Database Viewer', icon: Database, description: 'Manage MongoDB collections', category: 'Monitor', color: 'text-yellow-600 dark:text-yellow-400' },
  
  // AI
  { id: 'HEALING', label: 'Self-Healing', icon: ShieldAlert, description: 'AI Error diagnosis and auto-fix', category: 'AI', color: 'text-red-600 dark:text-red-400' },
  { id: 'MEMORY', label: 'Memory', icon: Cpu, description: 'Session context and memory management', category: 'AI', color: 'text-purple-600 dark:text-purple-400' },
  { id: 'KNOWLEDGE', label: 'Knowledge Base', icon: BookOpen, description: 'RAG documents and embeddings', category: 'AI', color: 'text-indigo-600 dark:text-indigo-400' },
  { id: 'PLAN', label: 'Plan Visualizer', icon: Map, description: 'Execution plan and steps', category: 'AI', color: 'text-pink-600 dark:text-pink-400' },
  { id: 'GRAPH', label: 'Project Graph', icon: Network, description: 'File dependency visualization', category: 'AI', color: 'text-orange-600 dark:text-orange-400' },
  { id: 'ARTIFACTS', label: 'Artifacts', icon: Package, description: 'Generated files and assets', category: 'AI', color: 'text-teal-600 dark:text-teal-400' },

  // Dev
  { id: 'DOCS', label: 'Documentation', icon: Book, description: 'AI Auto-generated docs', category: 'Dev', color: 'text-cyan-600 dark:text-cyan-400' },
  { id: 'PLAYGROUND', label: 'API Playground', icon: Play, description: 'Test API endpoints', category: 'Dev', color: 'text-emerald-600 dark:text-emerald-400' },
  { id: 'QUALITY', label: 'Code Quality', icon: Zap, description: 'Complexity and health analytics', category: 'Dev', color: 'text-rose-600 dark:text-rose-400' },
  { id: 'ANALYTICS', label: 'Analytics', icon: BarChart2, description: 'Session stats and usage', category: 'Dev', color: 'text-sky-600 dark:text-sky-400' },
  { id: 'TEST', label: 'Test Runner', icon: Beaker, description: 'Run and manage tests', category: 'Dev', color: 'text-lime-600 dark:text-lime-400' },
  { id: 'BROWSER', label: 'Cloud Browser', icon: Globe, description: 'Interactive browser with devtools', category: 'Dev', color: 'text-amber-600 dark:text-amber-400' },
];

export function AppsDashboard({ onAppSelect }: { onAppSelect: (id: string) => void }) {
  const categories = ['Monitor', 'AI', 'Dev'];

  // Mock System Health
  const cpuUsage = 12;
  const memUsage = 45;
  const uptime = '4d 12h 30m';

  return (
    <div className="h-full bg-[var(--bg-dark)] text-[var(--text-primary)] p-6 overflow-y-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold flex items-center gap-3 mb-2">
          <LayoutGrid className="w-8 h-8 text-[var(--accent-primary)]" />
          Control Center
        </h2>
        <p className="text-[var(--text-secondary)]">Manage your system, AI agents, and development tools from one place.</p>
      </div>

      {/* System Health Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-4 rounded-xl flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 text-blue-500 rounded-lg">
                  <Cpu size={24} />
              </div>
              <div>
                  <div className="text-sm text-[var(--text-secondary)]">CPU Usage</div>
                  <div className="text-xl font-bold">{cpuUsage}%</div>
              </div>
              <div className="ml-auto h-8 w-16 bg-blue-500/10 rounded flex items-end px-1 gap-0.5 pb-1">
                  {[40, 60, 30, 80, 50].map((h, i) => (
                      <div key={i} className="bg-blue-500 w-full rounded-sm" style={{ height: `${h}%` }} />
                  ))}
              </div>
          </div>
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-4 rounded-xl flex items-center gap-4">
              <div className="p-3 bg-purple-500/10 text-purple-500 rounded-lg">
                  <Activity size={24} />
              </div>
              <div>
                  <div className="text-sm text-[var(--text-secondary)]">Memory</div>
                  <div className="text-xl font-bold">{memUsage}%</div>
              </div>
               <div className="ml-auto h-8 w-16 bg-purple-500/10 rounded flex items-end px-1 gap-0.5 pb-1">
                  {[20, 30, 25, 40, 35].map((h, i) => (
                      <div key={i} className="bg-purple-500 w-full rounded-sm" style={{ height: `${h}%` }} />
                  ))}
              </div>
          </div>
           <div className="bg-[var(--bg-card)] border border-[var(--border-color)] p-4 rounded-xl flex items-center gap-4">
              <div className="p-3 bg-green-500/10 text-green-500 rounded-lg">
                  <Server size={24} />
              </div>
              <div>
                  <div className="text-sm text-[var(--text-secondary)]">Uptime</div>
                  <div className="text-xl font-bold">{uptime}</div>
              </div>
          </div>
      </div>

      <div className="space-y-8">
        {categories.map(category => (
          <div key={category}>
            <h3 className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wider mb-4 border-b border-[var(--border-color)] pb-2">
              {category} Tools
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {APPS.filter(app => app.category === category).map(app => (
                <button
                  key={app.id}
                  onClick={() => onAppSelect(app.id)}
                  className="flex flex-col items-start p-4 bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)] hover:border-[var(--accent-primary)] rounded-xl transition-all group text-left"
                >
                  <div className={`p-3 rounded-lg bg-[var(--bg-secondary)] mb-3 group-hover:scale-110 transition-transform ${app.color}`}>
                    <app.icon className="w-6 h-6" />
                  </div>
                  <div className="font-semibold text-[var(--text-primary)] group-hover:text-[var(--text-primary)] mb-1">
                    {app.label}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-muted)] line-clamp-2">
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
