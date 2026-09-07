const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { WebSocket } = require('ws');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const base = new URL(process.argv[2] || 'http://127.0.0.1:5000');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Local verification only');
assert(process.env.JWT_SECRET, 'The local server JWT_SECRET is required');

const identity = () => jwt.sign({ sub: crypto.randomBytes(12).toString('hex'), role: 'USER' },
  process.env.JWT_SECRET, { expiresIn: '5m' });
const ownerToken = identity();
const otherToken = identity();

async function request(route, token, method = 'GET', body) {
  const response = await fetch(new URL(route, base), {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() };
}

function rejectedStream(sessionId) {
  return new Promise((resolve, reject) => {
    const url = new URL('/ws/browser', base);
    url.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('sessionId', sessionId);
    url.searchParams.set('token', otherToken);
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error('Foreign browser stream did not close within the deadline'));
    }, 5000);
    socket.on('message', () => {
      clearTimeout(timeout);
      socket.terminate();
      reject(new Error('Foreign account received a browser event'));
    });
    socket.on('error', () => {
      clearTimeout(timeout);
      reject(new Error('WebSocket transport failed before authorization could be verified'));
    });
    socket.on('close', (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, reason: reason.toString() });
    });
  });
}

function liveSubscriptions(token, sessionIds) {
  return new Promise((resolve, reject) => {
    const url = new URL('/ws', base);
    url.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', token);
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error('Live subscription authorization timed out'));
    }, 5000);
    socket.on('open', () => socket.send(JSON.stringify({ type: 'session_subscribe', sessionIds })));
    socket.on('message', data => {
      const message = JSON.parse(data.toString());
      if (message.type !== 'session_subscribed') return;
      clearTimeout(timeout);
      resolve({ sessionIds: message.sessionIds });
      socket.close();
    });
    socket.on('close', (code, reason) => {
      clearTimeout(timeout);
      resolve({ code, reason: reason.toString() });
    });
    socket.on('error', () => {
      clearTimeout(timeout);
      reject(new Error('Live WebSocket transport failed'));
    });
  });
}

(async () => {
  let sessionId;
  try {
    const created = await request('/api/sessions', ownerToken, 'POST', {
      title: 'Browser ownership verification fixture', kind: 'agent',
    });
    assert.equal(created.status, 200, 'Create fixture');
    sessionId = String(created.body.id || created.body._id);
    const streamId = `browser:${sessionId}`;
    const route = `/api/browser/session/status?sessionId=${encodeURIComponent(streamId)}`;
    // Probe as the other account first, before the owner ever opens the stream.
    assert.equal((await request(route, otherToken)).status, 403, 'Foreign saved-login metadata');
    assert.deepEqual(await rejectedStream(streamId), { code: 1008, reason: 'forbidden' });
    assert.equal((await request(route, ownerToken)).status, 200, 'Owner saved-login metadata');
    assert.equal((await request(route, otherToken)).status, 403, 'Foreign metadata after owner access');
    assert.equal((await request(`/api/sessions/${sessionId}/history`, otherToken)).status, 404);
    assert.equal((await request(`/api/sessions/${sessionId}/workspace`, otherToken)).status, 404);
    assert.equal((await request(route, 'invalid-token')).status, 401);
    assert.deepEqual(await liveSubscriptions(otherToken, [sessionId]), { sessionIds: [] });
    assert.deepEqual(await liveSubscriptions(ownerToken, [sessionId]), { sessionIds: [sessionId] });
    assert.deepEqual(await liveSubscriptions('null', []), { code: 1008, reason: 'unauthorized_invalid_token' });
    console.log('PASS: owner access; foreign metadata/history/workspace denied; foreign browser and chat subscriptions denied; invalid tokens rejected');
  } finally {
    if (sessionId) {
      const cleanup = await request(`/api/sessions/${sessionId}`, ownerToken, 'DELETE');
      assert.equal(cleanup.status, 200, 'Remove only the synthetic session');
      console.log('PASS: synthetic session removed');
    }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
