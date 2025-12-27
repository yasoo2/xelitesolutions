

const API_URL = 'http://localhost:8080';

async function testRun(name: string, payload: any) {
  console.log(`\n--- Testing ${name} ---`);
  try {
    const res = await fetch(`${API_URL}/runs/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    if (!res.ok) {
      console.log(`Status: ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.log('Body:', text);
      return;
    }

    const data = await res.json();
    console.log('Run ID:', data.runId);
    
    // Check status
    // We can't easily listen to WS here without a lib, but we can poll the run status if we had an endpoint
    // For now, we rely on the immediate response or logs
    console.log('Response:', JSON.stringify(data, null, 2));

  } catch (err) {
    console.error('Error:', err);
  }
}

async function main() {
  // 1. Test Default (Joe System) - Expected to fail if no env key, or work if heuristic
  await testRun('Default Provider (Joe)', {
    text: 'hello joe',
    sessionId: 'test-session-1'
  });

  // 2. Test Custom Provider with Bad Key - Expected to return Auth Failed message
  await testRun('OpenAI with Bad Key', {
    text: 'hello openai',
    sessionId: 'test-session-2',
    provider: 'openai',
    apiKey: 'invalid-key',
    model: 'gpt-4o'
  });

  // 3. Test Heuristic Fallback (Empty/Null)
  await testRun('Heuristic Fallback', {
    text: 'read file test.txt',
    sessionId: 'test-session-3'
  });
}

main();
