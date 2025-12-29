
import { config } from '../config';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';

// Force fetch if not global (Node < 18)
// @ts-ignore
if (!globalThis.fetch) globalThis.fetch = require('node-fetch');

async function main() {
  console.log('🏭 Starting Factory Capability Proof...');

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
  console.log(`   Target: ${API_URL}/runs/start`);

  try {
    const res = await fetch(`${API_URL}/runs/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        text: prompt,
        sessionId: `proof-${Date.now()}` 
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Factory request failed: ${res.status} ${text}`);
    }

    console.log('✅ Request accepted. Monitoring execution...');
    
    // The /run endpoint might return a stream or a simple OK depending on implementation.
    // If it returns a stream, we should read it.
    // Based on previous files, it seems to rely on WebSocket for live updates, but /run might wait?
    // Let's assume it returns a JSON with session info, and the actual work happens async or sync.
    // We'll wait a bit and check for files.
    
    const json = await res.json();
    console.log('📄 Response:', JSON.stringify(json, null, 2));

    // Wait for the factory to do its work (Scaffold -> Install -> Run)
    // This might take 10-30 seconds.
    console.log('⏳ Waiting for factory to build the app (30s)...');
    
    // Poll for directory existence
    for (let i = 0; i < 30; i++) {
      if (fs.existsSync(path.join(targetDir, 'package.json'))) {
        console.log('✨ Project scaffolded!');
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
      process.stdout.write('.');
    }
    
    // Wait more for installation
    console.log('\n⏳ Allowing time for npm install...');
    await new Promise(r => setTimeout(r, 15000));

    if (fs.existsSync(targetDir)) {
        console.log('\n📦 Verifying generated files:');
        const files = fs.readdirSync(targetDir);
        console.log('   Files:', files.join(', '));
        
        if (files.includes('package.json') && files.includes('index.js')) {
            console.log('✅ Factory successfully created the project structure!');
        } else {
            console.error('⚠️ Directory created but missing key files.');
        }

        // Optional: Check if port 3333 is listening? 
        // That might be too flaky if the factory didn't start it yet.
    } else {
        console.error('\n❌ Factory failed to create the directory.');
    }

  } catch (err) {
    console.error('\n❌ Error:', err);
    process.exit(1);
  }
}

main();
