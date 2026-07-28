/* Joe Browser Connector — background service worker.
 * Holds a WebSocket to Joe and executes the commands Joe sends in the user's REAL
 * browser (their logins, any site). Commands: navigate, read, screenshot, click, type.
 * MV3 service workers idle out, so we persist state and use an alarm to reconnect. */

const KEEPALIVE_ALARM = 'joe-keepalive';
let ws = null;
let joeToken = '';
let joeOrigin = '';
let controlledTabId = null;

async function loadState() {
  const s = await chrome.storage.local.get(['joeToken', 'joeOrigin', 'controlledTabId']);
  joeToken = s.joeToken || '';
  joeOrigin = s.joeOrigin || '';
  controlledTabId = (typeof s.controlledTabId === 'number') ? s.controlledTabId : null;
}

function wsUrl() {
  if (!joeOrigin || !joeToken) return '';
  const base = joeOrigin.replace(/^http/i, 'ws');
  return `${base}/ws/extension?token=${encodeURIComponent(joeToken)}`;
}

function setBadge(on) {
  try {
    chrome.action.setBadgeText({ text: on ? '●' : '' });
    chrome.action.setBadgeBackgroundColor({ color: on ? '#22c55e' : '#ef4444' });
  } catch (e) { /* ignore */ }
}

function connect() {
  const url = wsUrl();
  if (!url) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  try { ws = new WebSocket(url); } catch (e) { return; }
  ws.onopen = () => setBadge(true);
  ws.onclose = () => { setBadge(false); ws = null; };
  ws.onerror = () => { setBadge(false); };
  ws.onmessage = async (ev) => {
    let msg = null;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (!msg || msg.type === 'hello' || msg.type === 'pong') return;
    if (!msg.id || !msg.cmd) return;
    try {
      const result = await handleCommand(msg.cmd, msg.args || {});
      ws.send(JSON.stringify({ id: msg.id, ok: true, result }));
    } catch (e) {
      try { ws.send(JSON.stringify({ id: msg.id, ok: false, error: String((e && e.message) || e) })); } catch (e2) { /* ignore */ }
    }
  };
}

async function getTargetTab() {
  if (controlledTabId != null) {
    try { const t = await chrome.tabs.get(controlledTabId); if (t) return t; } catch (e) { /* gone */ }
  }
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs && tabs[0];
  if (tab) { controlledTabId = tab.id; await chrome.storage.local.set({ controlledTabId }); return tab; }
  return null;
}

function waitForLoad(tabId, timeout) {
  timeout = timeout || 15000;
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      chrome.tabs.get(tabId, (t) => {
        if (chrome.runtime.lastError || !t) return resolve();
        if (t.status === 'complete' || (Date.now() - start) > timeout) return resolve();
        setTimeout(check, 200);
      });
    };
    setTimeout(check, 300);
  });
}

async function handleCommand(cmd, args) {
  if (cmd === 'navigate') {
    let tab = await getTargetTab();
    if (!tab) { tab = await chrome.tabs.create({ url: args.url }); controlledTabId = tab.id; await chrome.storage.local.set({ controlledTabId }); }
    else { await chrome.tabs.update(tab.id, { url: args.url }); }
    await waitForLoad(tab.id);
    const info = await chrome.tabs.get(tab.id);
    return { url: info.url, title: info.title };
  }
  if (cmd === 'read') {
    const tab = await getTargetTab(); if (!tab) throw new Error('no_tab');
    const out = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ title: document.title, url: location.href, text: ((document.body && document.body.innerText) || '').slice(0, 8000) })
    });
    return out && out[0] && out[0].result;
  }
  if (cmd === 'screenshot') {
    const tab = await getTargetTab(); if (!tab) throw new Error('no_tab');
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 60 });
    const info = await chrome.tabs.get(tab.id);
    return { dataUrl, url: info.url };
  }
  if (cmd === 'click') {
    const tab = await getTargetTab(); if (!tab) throw new Error('no_tab');
    const out = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [args.text || '', args.selector || ''],
      func: (text, selector) => {
        let el = null;
        if (selector) { try { el = document.querySelector(selector); } catch (e) { } }
        if (!el && text) {
          const t = String(text).toLowerCase();
          el = Array.from(document.querySelectorAll('a,button,[role="button"],input[type="submit"],input[type="button"]'))
            .find((c) => ((c.innerText || c.value || '').toLowerCase().indexOf(t) !== -1));
        }
        if (!el) return { clicked: false };
        el.scrollIntoView({ block: 'center' }); el.click();
        return { clicked: true, label: (el.innerText || el.value || '').slice(0, 60) };
      }
    });
    return out && out[0] && out[0].result;
  }
  if (cmd === 'type') {
    const tab = await getTargetTab(); if (!tab) throw new Error('no_tab');
    const out = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [args.text || '', args.selector || ''],
      func: (text, selector) => {
        let el = selector ? document.querySelector(selector)
          : (document.activeElement && /input|textarea/i.test(document.activeElement.tagName) ? document.activeElement
            : document.querySelector('input,textarea'));
        if (!el) return { typed: false };
        el.focus(); el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { typed: true };
      }
    });
    return out && out[0] && out[0].result;
  }
  throw new Error('unknown_cmd:' + cmd);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'joe-token' && msg.token) {
    joeToken = msg.token; joeOrigin = msg.origin || joeOrigin;
    chrome.storage.local.set({ joeToken, joeOrigin });
    connect();
    if (sendResponse) sendResponse({ ok: true });
  } else if (msg && msg.type === 'joe-status') {
    if (sendResponse) sendResponse({ connected: !!(ws && ws.readyState === WebSocket.OPEN), origin: joeOrigin });
  }
  return true;
});

chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== KEEPALIVE_ALARM) return;
  if (!ws || ws.readyState > 1) connect();
  else { try { ws.send(JSON.stringify({ type: 'ping' })); } catch (e) { } }
});

chrome.runtime.onStartup.addListener(async () => { await loadState(); connect(); });
chrome.runtime.onInstalled.addListener(async () => { await loadState(); connect(); });
(async () => { await loadState(); connect(); })();
