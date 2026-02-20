async function fetchHealth() {
    const statusBadge = document.getElementById('status-badge');
    try {
        const res = await fetch('/api/health');
        const data = await res.json();

        document.getElementById('db-status').innerText = data.db === 1 ? 'Connected' : 'Offline';

        document.getElementById('uptime').innerText = Math.floor(data.uptime / 60) + 'm ' + (data.uptime % 60) + 's';
        document.getElementById('env').innerText = data.env || 'production';

        statusBadge.innerText = 'System Online';
        statusBadge.style.borderColor = 'rgba(0, 255, 127, 0.4)';
        statusBadge.style.color = '#00ff7f';
    } catch (e) {
        console.error('Health fetch failed', e);
        statusBadge.innerText = 'System Offline';
        statusBadge.style.borderColor = 'rgba(255, 60, 60, 0.4)';
        statusBadge.style.color = '#ff3c3c';
    }
}

async function loadManifest() {
    const manifestArea = document.getElementById('manifest-content');
    if (!manifestArea) return;
    try {
        const res = await fetch('/debug/structure.txt');
        if (res.ok) {
            manifestArea.innerText = await res.text();
        } else {
            manifestArea.innerText = 'Structure manifest not available.';
        }
    } catch (e) {
        manifestArea.innerText = 'Error loading manifest: ' + e.message;
    }
}

async function runTest() {
    const endpoint = document.getElementById('endpoint').value;
    const bodyStr = document.getElementById('body').value;
    const resultArea = document.getElementById('result');

    resultArea.innerText = 'Executing...';

    try {
        const options = {
            method: bodyStr.trim() ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json' }
        };
        if (bodyStr.trim()) {
            try {
                JSON.parse(bodyStr);
                options.body = bodyStr;
            } catch (e) {
                throw new Error('Invalid JSON payload');
            }
        }

        const res = await fetch(endpoint, options);
        const data = await res.json();
        resultArea.innerText = JSON.stringify(data, null, 2);
    } catch (e) {
        resultArea.innerText = 'Error: ' + e.message;
    }
}

// Initialization
if (document.getElementById('db-status')) {
    fetchHealth();
    loadManifest();
    setInterval(fetchHealth, 15000);
}
