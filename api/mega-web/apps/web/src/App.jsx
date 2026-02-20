
import React from 'react';
export default function App() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="p-8 max-w-2xl text-center">
        <h1 className="text-5xl font-extrabold mb-6 bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
          Welcome to mega-web
        </h1>
        <p className="text-xl opacity-70 mb-8">
          Built by Joe AI — Ready to run.
        </p>
        <div className="flex gap-4 justify-center">
          <button className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl transition-all">
            Start Exploring
          </button>
          <button className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-xl transition-all">
            Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
