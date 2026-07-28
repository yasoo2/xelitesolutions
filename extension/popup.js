/* Popup: show connection status and offer to open the Joe tab. */
const JOE_URL = 'http://localhost:5002/joe';

function render(connected, origin) {
  document.getElementById('dot').className = 'dot ' + (connected ? 'on' : 'off');
  document.getElementById('label').textContent = connected
    ? ('متصل' + (origin ? ' — ' + origin : ''))
    : 'غير متصل';
}

chrome.runtime.sendMessage({ type: 'joe-status' }, (res) => {
  if (chrome.runtime.lastError || !res) { render(false, ''); return; }
  render(!!res.connected, res.origin || '');
});

document.getElementById('open').addEventListener('click', () => {
  chrome.tabs.create({ url: JOE_URL });
  window.close();
});
