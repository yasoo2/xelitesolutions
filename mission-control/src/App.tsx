
import React from 'react';
import { LayoutDashboard, MessageSquare, Image, FolderKanban } from 'lucide-react';
import { SystemMonitor } from './components/SystemMonitor';
import { NeuralChat } from './components/NeuralChat';
import { CreativeStudio } from './components/CreativeStudio';

function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-cyan-500/30">

      {/* Sidebar (Navigation) */}
      <nav className="fixed left-0 top-0 h-screen w-20 bg-black/20 border-r border-white/5 flex flex-col items-center py-8 gap-8 backdrop-blur-sm z-50">
        <div className="text-cyan-400 font-bold text-2xl mb-8">JOE</div>

        <NavButton icon={<LayoutDashboard />} label="Bridge" active />
        <NavButton icon={<MessageSquare />} label="Nexus" />
        <NavButton icon={<Image />} label="Studio" />
        <NavButton icon={<FolderKanban />} label="Files" />
      </nav>

      {/* Main Content Area */}
      <main className="pl-20 min-h-screen bg-[url('/grid.svg')] bg-fixed">
        <div className="max-w-7xl mx-auto p-8">
          <header className="mb-8 flex justify-between items-end">
            <div>
              <h1 className="text-4xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500">
                MISSION CONTROL
              </h1>
              <p className="text-gray-400 mt-2">Autonomous System Interface v1.0</p>
            </div>
            <div className="text-right">
              <div className="text-emerald-400 font-mono text-sm">● SYSTEM ONLINE</div>
              <div className="text-xs text-gray-500">LATENCY: 12ms</div>
            </div>
          </header>

          {/* Dashboard Grid */}
          <div className="grid grid-cols-3 gap-6">
            <SystemMonitor />

            {/* Chat Interface */}
            <NeuralChat />

            {/* Creative Studio */}
            <CreativeStudio />
          </div>
        </div>
      </main>
    </div>
  );
}

const NavButton = ({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) => (
  <button className={`p-3 rounded-xl transition-all duration-300 group relative ${active ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
    {icon}
    <span className="absolute left-14 bg-black/80 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition pointer-events-none border border-white/10">
      {label}
    </span>
  </button>
);

export default App;
