
import React, { useState } from 'react';
import { LayoutDashboard, MessageSquare, Image, FolderKanban, Sparkles } from 'lucide-react';
import { SystemMonitor } from './components/SystemMonitor';
import { NeuralChat } from './components/NeuralChat';
import { CreativeStudio } from './components/CreativeStudio';
import { JoeStudio } from './components/JoeStudio';

type ActiveView = 'dashboard' | 'studio';

function App() {
  const [activeView, setActiveView] = useState<ActiveView>('studio'); // Default to new studio

  if (activeView === 'studio') {
    return (
      <div className="relative">
        {/* Quick switch back button */}
        <button
          onClick={() => setActiveView('dashboard')}
          className="fixed bottom-4 left-4 z-50 px-4 py-2 bg-gray-800/80 backdrop-blur-sm border border-white/10 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-gray-700/80 transition-all flex items-center gap-2"
        >
          <LayoutDashboard size={14} />
          <span>الداشبورد القديم</span>
        </button>
        <JoeStudio />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans selection:bg-cyan-500/30">

      {/* Sidebar (Navigation) */}
      <nav className="fixed left-0 top-0 h-screen w-20 bg-black/20 border-r border-white/5 flex flex-col items-center py-8 gap-8 backdrop-blur-sm z-50">
        <div className="text-cyan-400 font-bold text-2xl mb-8">JOE</div>

        <NavButton
          icon={<Sparkles />}
          label="Studio V2"
          onClick={() => setActiveView('studio')}
        />
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

          {/* New Studio Banner */}
          <button
            onClick={() => setActiveView('studio')}
            className="w-full mb-6 p-4 bg-gradient-to-r from-purple-600/20 to-cyan-600/20 border border-purple-500/30 rounded-2xl flex items-center justify-between hover:from-purple-600/30 hover:to-cyan-600/30 transition-all group"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-cyan-600 flex items-center justify-center">
                <Sparkles size={24} className="text-white" />
              </div>
              <div className="text-right">
                <h2 className="text-lg font-bold text-white">🚀 جرب Joe Studio الجديد!</h2>
                <p className="text-sm text-gray-400">واجهة متقدمة مع معاينة مباشرة وتفكير شفاف</p>
              </div>
            </div>
            <span className="text-cyan-400 group-hover:translate-x-1 transition-transform">
              انتقل الآن →
            </span>
          </button>

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

const NavButton = ({
  icon,
  label,
  active = false,
  onClick
}: {
  icon: React.ReactNode,
  label: string,
  active?: boolean,
  onClick?: () => void
}) => (
  <button
    onClick={onClick}
    className={`p-3 rounded-xl transition-all duration-300 group relative ${active ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
  >
    {icon}
    <span className="absolute left-14 bg-black/80 px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition pointer-events-none border border-white/10">
      {label}
    </span>
  </button>
);

export default App;

