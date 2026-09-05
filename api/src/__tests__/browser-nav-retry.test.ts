import { navigationNeedsCleanSlate, transientNavigationError } from '../api/routes/browser';

describe('browser navigation recovery classification', () => {
  test('retries transient preview connection failures', () => {
    expect(transientNavigationError(new Error('net::ERR_CONNECTION_REFUSED at http://localhost:4305/'))).toBe(true);
    expect(transientNavigationError(new Error('page.goto: Timeout 20000ms exceeded'))).toBe(true);
  });

  test('does not retry invalid or authorization failures', () => {
    expect(transientNavigationError(new Error('HTTP 401 unauthorized'))).toBe(false);
    expect(transientNavigationError(new Error('Invalid URL'))).toBe(false);
  });

  test('clears a poisoned Chromium error document before reopening a valid preview', () => {
    expect(navigationNeedsCleanSlate(null, 'chrome-error://chromewebdata/')).toBe(true);
    expect(navigationNeedsCleanSlate(new Error('Navigation interrupted by another navigation to chrome-error://chromewebdata'), 'http://localhost:5002/project-preview/run/index.html')).toBe(true);
    expect(navigationNeedsCleanSlate(null, 'http://localhost:5002/project-preview/run/index.html')).toBe(false);
  });
});
