import { transientNavigationError } from '../api/routes/browser';

describe('browser navigation recovery classification', () => {
  test('retries transient preview connection failures', () => {
    expect(transientNavigationError(new Error('net::ERR_CONNECTION_REFUSED at http://localhost:4305/'))).toBe(true);
    expect(transientNavigationError(new Error('page.goto: Timeout 20000ms exceeded'))).toBe(true);
  });

  test('does not retry invalid or authorization failures', () => {
    expect(transientNavigationError(new Error('HTTP 401 unauthorized'))).toBe(false);
    expect(transientNavigationError(new Error('Invalid URL'))).toBe(false);
  });
});
