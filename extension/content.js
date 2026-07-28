/* Runs on the Joe web app. Reads the current session token from localStorage and
 * hands it (with the page origin) to the background service worker, which opens
 * the control channel to Joe. Re-sends periodically so a refreshed token is
 * picked up. Nothing is sent anywhere except to this extension's background. */
(function () {
  function push() {
    try {
      const token = localStorage.getItem('token') || '';
      if (token) chrome.runtime.sendMessage({ type: 'joe-token', token: token, origin: location.origin });
    } catch (e) { /* ignore */ }
  }
  push();
  setInterval(push, 15000);
  window.addEventListener('focus', push);
})();
