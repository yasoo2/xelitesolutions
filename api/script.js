async function fetchHealth() {
    try {
        const res = await fetch('/health');
        const data = await res.json();
        document.getElementById('db-status').innerText = data.db === 1 ? 'Connected' : 'Offline';
        document.getElementById('uptime').innerText = Math.floor(data.uptime / 60) + 'm';
        document.getElementById('env').innerText = data.env;
    } catch (e) {
        console.error('Health fetch failed', e);
    }
}

async function runTest() {
    const endpoint = document.getElementById('endpoint').value;
    const body = document.getElementById('body').value;
    const resultArea = document.getElementById('result');

    resultArea.innerText = 'Executing...';

    try {
        const options = {
            method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) options.body = body;

        const res = await fetch(endpoint, options);
        const data = await res.json();
        resultArea.innerText = JSON.stringify(data, null, 2);
    } catch (e) {
        resultArea.innerText = 'Error: ' + e.message;
    }
}

if (document.getElementById('db-status')) {
    fetchHealth();
    setInterval(fetchHealth, 10000);
}
