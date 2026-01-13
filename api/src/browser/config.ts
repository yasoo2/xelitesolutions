export type BrowserConfig = {
  strictSameSite: boolean;
  waitForInstruction: boolean;
  enableGoogleSearch: boolean;
  streamFps: number;
  maxSteps: number;
  retryLimit: number;
  navTimeoutMs: number;
  actionTimeoutMs: number;
};

export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  strictSameSite: false,
  waitForInstruction: true,
  enableGoogleSearch: false,
  streamFps: 10,
  maxSteps: 80,
  retryLimit: 3,
  navTimeoutMs: 45000,
  actionTimeoutMs: 20000,
};
