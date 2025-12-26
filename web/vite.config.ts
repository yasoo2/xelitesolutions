import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/artifacts': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['lucide-react', 'framer-motion', 'classnames'],
          markdown: ['react-markdown', 'react-syntax-highlighter'],
          monaco: ['@monaco-editor/react'],
          charts: ['react-force-graph-2d', 'react-force-graph-3d', 'reactflow'],
          terminal: ['xterm', 'xterm-addon-fit']
        }
      }
    }
  }
});
