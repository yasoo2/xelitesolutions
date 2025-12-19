import jwt from 'jsonwebtoken';
import { config } from '../config';

const API = process.env.API_URL || 'http://localhost:8080';

async function main() {
  console.log('Testing Browser Worker via Core Tool...');
  
  const token = jwt.sign({ sub: 'tester', role: 'OWNER' }, config.jwtSecret);
  
  // Open session and navigate
  const res1 = await fetch(`${API}/runs/start`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ text: 'open https://xelitesolutions.com' })
  });
  const j1 = await res1.json();
  console.log('Start response:', j1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
