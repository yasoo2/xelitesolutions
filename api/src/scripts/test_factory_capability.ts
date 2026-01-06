
import { config } from '../config';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

// Force fetch if not global (Node < 18)
// @ts-ignore
if (!globalThis.fetch) globalThis.fetch = require('node-fetch');

async function main() {
  console.log('🏭 Starting Factory Capability Test...');

  const API_URL = `http://localhost:${config.port}`;
  const secret = config.jwtSecret;
  const token = jwt.sign({ sub: 'tester', role: 'OWNER' }, secret);
  
  const targetDir = path.resolve(process.cwd(), 'factory_books_api');
  
  // Cleanup previous run
  if (fs.existsSync(targetDir)) {
    console.log('🧹 Cleaning up previous test artifact...');
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  const prompt = "Create a simple Node.js Express API for a bookstore in folder 'factory_books_api'. It should have a GET /books endpoint returning a mock list. Install dependencies and start the server on port 3333.";

  console.log(`🚀 Sending request to Factory: "${prompt}"`);

  try {
    const res = await fetch(`${API_URL}/runs/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        text: prompt,
        sessionId: `test-factory-${Date.now()}` 
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Factory request failed: ${res.status} ${text}`);
    }

    const json = await res.json();
    console.log('✅ Request accepted. Run ID:', (json as any).runId);

    console.log('⏳ Waiting for factory to build the app (max 60s)...');
    
    // Poll for directory existence
    let scaffolded = false;
    for (let i = 0; i < 60; i++) {
      if (fs.existsSync(path.join(targetDir, 'package.json'))) {
        console.log('\n✨ Project scaffolded!');
        scaffolded = true;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
      process.stdout.write('.');
    }
    
    if (!scaffolded) {
        console.error('\n❌ Timeout waiting for scaffold.');
        process.exit(1);
    }

    // Wait more for installation
    console.log('⏳ Allowing time for npm install...');
    await new Promise(r => setTimeout(r, 10000));

    if (fs.existsSync(targetDir)) {
        console.log('\n📦 Verifying generated files:');
        const files = fs.readdirSync(targetDir);
        console.log('   Files:', files.join(', '));
        
        if (files.includes('package.json') && (files.includes('index.js') || files.includes('server.js') || files.includes('app.js') || files.includes('src'))) {
            console.log('✅ Factory successfully created the project structure!');
        } else {
            console.error('⚠️ Directory created but missing key files.');
            process.exit(1);
        }
    } else {
        console.error('\n❌ Factory failed to create the directory.');
        process.exit(1);
    }

  } catch (err) {
    console.error('\n❌ Error:', err);
    process.exit(1);
  }
}

main();
