
import { config } from '../config';

async function main() {
  const base = 'http://localhost:7070';
  const key = 'change-me';
  
  console.log(`Testing Worker at ${base}...`);
  
  try {
    // 1. Create Session
    console.log('1. Creating Session...');
    const resp = await fetch(`${base}/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-worker-key': key },
        body: JSON.stringify({ })
    });
    
    if (!resp.ok) {
        console.error(`Session create failed: ${resp.status} ${resp.statusText}`);
        const t = await resp.text();
        console.error(t);
        process.exit(1);
    }
    
    const j = await resp.json();
    console.log('Session Created:', j);
    const sessionId = j.sessionId;
    
    // 2. Run Job
    console.log('2. Running Job (Goto Google)...');
    const nav = await fetch(`${base}/session/${encodeURIComponent(sessionId)}/job/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-worker-key': key },
        body: JSON.stringify({ actions: [{ type: 'goto', url: 'https://www.google.com', waitUntil: 'domcontentloaded' }] })
    });
    
    if (!nav.ok) {
        console.error(`Job run failed: ${nav.status}`);
        const t = await nav.text();
        console.error(t);
    } else {
        const j2 = await nav.json();
        console.log('Job Result:', j2);
    }
    
  } catch (e) {
    console.error('Test Failed:', e);
  }
}

main();
