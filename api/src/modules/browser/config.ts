export type BrowserConfig = {
  strictSameSite: boolean;
  waitForInstruction: boolean;
  enableGoogleSearch: boolean;
  streamFps: number;
  maxSteps: number;
  retryLimit: number;
  navTimeoutMs: number;
  actionTimeoutMs: number;
  captureEvidenceScreenshots: boolean;
  defaultWaitMs: number;
  shortWaitMs: number;
  longWaitMs: number;
};

export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  strictSameSite: false,
  waitForInstruction: true,
  enableGoogleSearch: false,
  streamFps: 10,
  maxSteps: Number(process.env.BROWSER_MAX_STEPS) || 80,
  retryLimit: 3,
  navTimeoutMs: Number(process.env.BROWSER_NAV_TIMEOUT_MS) || 45000,
  actionTimeoutMs: Number(process.env.BROWSER_ACTION_TIMEOUT_MS) || 20000,
  captureEvidenceScreenshots: false,
  defaultWaitMs: Number(process.env.BROWSER_DEFAULT_WAIT_MS) || 450,
  shortWaitMs: Number(process.env.BROWSER_SHORT_WAIT_MS) || 500,
  longWaitMs: Number(process.env.BROWSER_LONG_WAIT_MS) || 900,
};
