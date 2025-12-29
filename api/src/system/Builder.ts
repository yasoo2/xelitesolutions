import fs from 'fs';
import path from 'path';

export class Builder {
  static scaffold(name: string, type: 'ecommerce' | 'saas' | 'blog', features: string[] = []) {
    const root = path.resolve(process.cwd(), name);
    if (fs.existsSync(root)) throw new Error(`Project ${name} already exists`);

    fs.mkdirSync(root, { recursive: true });

    // Core Architecture
    this.createMonorepo(root, name);
    
    // Backend
    this.createBackend(root, features);

    // Frontend
    this.createFrontend(root, name, features);

    // Infrastructure
    this.createInfra(root);

    return { path: root, features };
  }

  private static createMonorepo(root: string, name: string) {
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      name,
      private: true,
      workspaces: ["apps/*"],
      scripts: {
        "dev": "concurrently \"npm run dev -w apps/api\" \"npm run dev -w apps/web\"",
        "build": "npm run build --workspaces"
      },
      devDependencies: { "concurrently": "^8.0.0" }
    }, null, 2));
    
    fs.mkdirSync(path.join(root, 'apps'), { recursive: true });
  }

  private static createBackend(root: string, features: string[]) {
    const apiRoot = path.join(root, 'apps/api');
    fs.mkdirSync(path.join(apiRoot, 'src'), { recursive: true });
    
    fs.writeFileSync(path.join(apiRoot, 'package.json'), JSON.stringify({
      name: "api",
      version: "1.0.0",
      scripts: { "dev": "nodemon src/index.js" },
      dependencies: { 
        "express": "^4.18.2", 
        "mongoose": "^7.4.0", 
        "cors": "^2.8.5", 
        "dotenv": "^16.3.1",
        ...(features.includes('auth') ? { "jsonwebtoken": "^9.0.0", "bcryptjs": "^2.4.3" } : {})
      },
      devDependencies: { "nodemon": "^3.0.1" }
    }, null, 2));

    let indexContent = `
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/app')
  .then(() => console.log('✅ DB Connected'));

app.get('/', (req, res) => res.json({ status: 'ok' }));
`;

    if (features.includes('products')) {
      indexContent += `
const Product = mongoose.model('Product', new mongoose.Schema({ name: String, price: Number }));
app.get('/api/products', async (req, res) => res.json(await Product.find()));
`;
    }

    indexContent += `\napp.listen(4000, () => console.log('🚀 API on 4000'));`;
    
    fs.writeFileSync(path.join(apiRoot, 'src/index.js'), indexContent.trim());
  }

  private static createFrontend(root: string, name: string, features: string[]) {
    const webRoot = path.join(root, 'apps/web');
    fs.mkdirSync(path.join(webRoot, 'src'), { recursive: true });
    fs.mkdirSync(path.join(webRoot, 'public'), { recursive: true });

    fs.writeFileSync(path.join(webRoot, 'package.json'), JSON.stringify({
      name: "web",
      version: "1.0.0",
      scripts: { "dev": "vite", "build": "vite build" },
      dependencies: { "react": "^18.2.0", "react-dom": "^18.2.0", "axios": "^1.4.0", "lucide-react": "^0.263.1" },
      devDependencies: { "@vitejs/plugin-react": "^4.0.3", "vite": "^4.4.5", "tailwindcss": "^3.3.3", "autoprefixer": "^10.4.14", "postcss": "^8.4.27" }
    }, null, 2));

    fs.writeFileSync(path.join(webRoot, 'vite.config.js'), `
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:4000' } }
});`);

    fs.writeFileSync(path.join(webRoot, 'index.html'), `
<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>${name}</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>
</html>`);

    fs.writeFileSync(path.join(webRoot, 'src/main.jsx'), `
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
`);

    fs.writeFileSync(path.join(webRoot, 'src/App.jsx'), `
import React from 'react';
export default function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
      <h1 className="text-4xl font-bold">Welcome to ${name}</h1>
    </div>
  );
}
`);

    fs.writeFileSync(path.join(webRoot, 'src/index.css'), `@tailwind base;\n@tailwind components;\n@tailwind utilities;`);
    fs.writeFileSync(path.join(webRoot, 'tailwind.config.js'), `export default { content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"], theme: { extend: {} }, plugins: [] }`);
    fs.writeFileSync(path.join(webRoot, 'postcss.config.js'), `export default { plugins: { tailwindcss: {}, autoprefixer: {} } }`);
  }

  private static createInfra(root: string) {
    fs.writeFileSync(path.join(root, 'docker-compose.yml'), `
version: '3.8'
services:
  mongo:
    image: mongo:latest
    ports: ["27017:27017"]
    volumes: [mongo-data:/data/db]
volumes:
  mongo-data:
`);
    fs.writeFileSync(path.join(root, '.gitignore'), `node_modules\ndist\n.env\n`);
  }
}
