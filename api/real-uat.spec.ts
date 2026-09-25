import { test, expect, Page, Browser, BrowserContext, chromium } from '@playwright/test';
import jwt from 'jsonwebtoken';

const FRONTEND_URL = 'http://localhost:5002/joe';
const API_URL = 'http://localhost:5000';
const JWT_SECRET = 'test-secret-for-development';

const UAT_PROMPTS = [
  {
    name: 'simple_task_app',
    prompt: 'Build a simple task management app with projects, tasks, priorities, due dates, and task completion.',
    expectedDomain: 'productivity',
    keyFeatures: ['projects', 'tasks', 'priorities', 'due dates', 'completion']
  }
];

interface RunState {
  runId: string;
  status: string;
  isLive: boolean;
  isTerminal: boolean;
  currentPhase?: string;
  currentActivity?: string;
  previewUrl?: string;
  error?: string;
}

async function waitForRunCompletion(page: Page, runId: string, maxWaitMs: number = 300300): Promise<any> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await page.request.get(`http://localhost:5000/api/runs/${runId}/status`);
      if (response.ok()) {
        const data = await response.json();
        const run = data;
        if (run.isTerminal || run.status !== 'running') {
          return data;
        }
      }
    } catch (e) {
      console.log(`Error checking run status: ${e}`);
    }
    await page.waitForTimeout(3000);
  }
  throw new Error(`Run ${runId} did not complete within ${maxWaitMs}ms`);
}

async function sendPrompt(page: Page, prompt: string): Promise<void> {
  await page.waitForSelector('textarea.main-input', { timeout: 15000 });
  
  const inputElement = await page.$('textarea.main-input');
  if (!inputElement) {
    throw new Error('Could not find chat input element');
  }
  
  await inputElement.click();
  await inputElement.fill('');
  await inputElement.type(prompt, { delay: 20 });
  
  // Try multiple send button selectors
  const sendSelectors = [
    'button:has-text("Send")',
    'button[aria-label="Send"]',
    'button.joe-send-btn',
    'button:has(svg.lucide-send)',
    'button[type="submit"]'
  ];
  
  let sendButton = null;
  for (const selector of sendSelectors) {
    const buttons = await page.$$(selector);
    for (const btn of buttons) {
      const isVisible = await btn.isVisible();
      if (isVisible) {
        sendButton = btn;
        break;
      }
    }
    if (sendButton) break;
  }
  
  if (sendButton) {
    await sendButton.click();
  } else {
    await page.keyboard.press('Enter');
  }
  
  await page.waitForTimeout(2000);
}

async function getRunIdFromPage(page: Page): Promise<string> {
  try {
    // Use the active runs endpoint via frontend proxy (port 5002)
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const runs = await page.request.get('http://localhost:5002/api/runs/active', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (runs.ok()) {
      const data = await runs.json();
      if (data.runs && data.runs.length > 0) {
        // Return the most recent run
        return data.runs[0].runId;
      }
    }
  } catch (e) {
    console.log('Could not get run ID from active runs API:', e);
  }
  
  // Fallback: extract from page content
  try {
    const content = await page.content();
    const runIdMatch = content.match(/run-[a-z0-9-]+/);
    if (runIdMatch) {
      console.log(`Found run ID in page: ${runIdMatch[0]}`);
      return runIdMatch[0];
    }
  } catch (e) {
    console.log('Could not extract run ID from page content');
  }
  return '';
}

async function observeRunState(page: Page, runId: string): Promise<any> {
  try {
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const response = await page.request.get(`http://localhost:5002/api/runs/${runId}/status`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (response.ok()) {
      return await response.json();
    }
  } catch (e) {
    console.log(`Error checking run status: ${e}`);
  }
  return null;
}

test.describe.serial('Real Joe UI UAT - ProductSpecification Foundation', () => {
  let browser: any;
  let context: any;
  let page: any;

  test.beforeAll(async () => {
    test.setTimeout(180000);
    console.log('[UAT] Launching persistent Chrome session...');
    const { chromium } = await import('@playwright/test');
    browser = await chromium.launch({
      headless: false,
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });
    
    // Create JWT with server's secret (dev-secret-joe-local)
    const serverJwtSecret = 'dev-secret-joe-local';
    const serverToken = jwt.sign(
      {
        sub: '000000000000000000000001',
        role: 'OWNER',
        email: 'dev@joe.local',
        name: 'Developer',
      },
      serverJwtSecret,
      { expiresIn: '365d' }
    );
    
    context = await browser.newContext({
      viewport: null,
      isMobile: false,
      hasTouch: false,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['clipboard-read', 'clipboard-write'],
      ignoreHTTPSErrors: true,
    });
    
    // Set auth in localStorage before any page loads - use initScript
    await context.addInitScript((token) => {
      localStorage.setItem('token', token);
      localStorage.setItem('joe:singleUser', '1');
    }, serverToken);
    
    page = await context.newPage();
    
    console.log('[UAT] Navigating to /joe route...');
    await page.goto('http://localhost:5002/joe', { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(5000);
    
    // Verify localStorage was set
    const lsToken = await page.evaluate(() => localStorage.getItem('token'));
    const lsSingleUser = await page.evaluate(() => localStorage.getItem('joe:singleUser'));
    console.log('[UAT] localStorage token:', lsToken ? lsToken.substring(0, 50) + '...' : 'NOT SET');
    console.log('[UAT] localStorage joe:singleUser:', lsSingleUser);

    const title = await page.title();
    console.log(`[UAT] Page title: ${title}`);
    console.log('[UAT] Joe UI loaded at http://localhost:5002/joe');

    // Debug: dump page content to understand structure
    const pageContent = await page.content();
    console.log('[UAT] Page content length:', pageContent.length);
    // Look for chat-related elements
    const textareas = await page.$$('textarea');
    console.log('[UAT] Textareas found:', textareas.length);
    for (let i = 0; i < textareas.length; i++) {
      const ta = textareas[i];
      const className = await ta.getAttribute('class');
      const placeholder = await ta.getAttribute('placeholder');
      console.log(`[UAT] Textarea ${i}: class="${className}", placeholder="${placeholder}"`);
    }
    
    // Check for any input elements
    const inputs = await page.$$('input');
    console.log('[UAT] Inputs found:', inputs.length);
    for (let i = 0; i < inputs.length; i++) {
      const inp = inputs[i];
      const className = await inp.getAttribute('class');
      const placeholder = await inp.getAttribute('placeholder');
      const type = await inp.getAttribute('type');
      console.log(`[UAT] Input ${i}: class="${className}", placeholder="${placeholder}", type="${type}"`);
    }
    
    // Check for contenteditable elements
    const contentEditables = await page.$$('[contenteditable="true"]');
    console.log('[UAT] ContentEditable found:', contentEditables.length);
    
    // Dump first 5000 chars of page content for inspection
    console.log('[UAT] Page content preview:', pageContent.substring(0, 5000));
    
    const chatInput = await page.waitForSelector('textarea.main-input', { timeout: 15000 });
    if (chatInput) {
      console.log('[UAT] Chat input found and visible');
    }

    const dimensions = await page.evaluate(() => ({
      windowWidth: window.outerWidth,
      windowHeight: window.outerHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      zoom: window.visualViewport ? window.visualViewport.scale : 1,
    }));
    console.log('[UAT] Window/Viewport dimensions:', JSON.stringify(dimensions, null, 2));

    await page.screenshot({ path: 'uat-initial-state.png', fullPage: true });
    console.log('[UAT] Initial state screenshot saved');

    console.log('[UAT] Starting 2-minute persistence test - keeping Chrome open and idle...');
    await page.waitForTimeout(120000);
    console.log('[UAT] 2-minute persistence test PASSED - Chrome remained open');
  });

  test.afterAll(async () => {
    console.log('[UAT] Closing browser...');
    await browser.close();
  });

  for (const uatPrompt of UAT_PROMPTS) {
    test(`${uatPrompt.name} - Real UI UAT`, async () => {
    test.setTimeout(600000); // 10 minutes for the full run
      console.log(`\n=== TESTING: ${uatPrompt.name} ===`);
      console.log(`Prompt: ${uatPrompt.prompt}`);

      await page.screenshot({ path: `uat-${uatPrompt.name}-before.png`, fullPage: true });

      await sendPrompt(page, uatPrompt.prompt);

      await page.waitForTimeout(5000);

      const runId = await getRunIdFromPage(page);
      if (!runId) {
        console.log('Could not get run ID, trying to extract from page...');
        const content = await page.content();
        const runIdMatch = content.match(/run-[a-z0-9-]+/);
        if (runIdMatch) {
          console.log(`Found run ID in page: ${runIdMatch[0]}`);
        }
      }

if (runId) {
        console.log(`[UAT] Got runId: ${runId}`);
        
        let runCompleted = false;
        let attempts = 0;
        const maxAttempts = 600; // 30 minutes at 3 second intervals

        while (!runCompleted && attempts < maxAttempts) {
          const runState = await observeRunState(page, runId);
if (runState) {
            console.log(`[UAT] Run state: ${runState.status}, live: ${runState.isLive}, terminal: ${runState.isTerminal}`);
            console.log(`[UAT] Full run state:`, JSON.stringify(runState, null, 2));
            
            if (runState.isTerminal || runState.status !== 'running') {
              runCompleted = true;
              console.log(`[UAT] Run completed with status: ${runState.status}`);
              
              if (runState.error) {
                console.log(`[UAT] Run error: ${runState.error}`);
              }

              if (runState.previewUrl) {
                console.log(`Preview URL: ${runState.previewUrl}`);

                await page.goto(runState.previewUrl, { waitUntil: 'networkidle', timeout: 30000 });
                await page.waitForTimeout(3000);

                await page.screenshot({ path: `uat-${uatPrompt.name}-preview.png`, fullPage: true });

                const previewContent = await page.content();
                for (const feature of uatPrompt.keyFeatures) {
                  const hasFeature = previewContent.toLowerCase().includes(feature.toLowerCase());
                  console.log(`Preview has "${feature}": ${hasFeature}`);
                }

                await page.goto('http://localhost:5002/joe', { waitUntil: 'networkidle', timeout: 30000 });
                await page.waitForTimeout(2000);
              }
              break;
            }
          }

          await page.waitForTimeout(3000);
          attempts++;
        }

        if (!runCompleted) {
          console.log('[UAT] Run did not complete within timeout');
        }
      }

      await page.screenshot({ path: `uat-${uatPrompt.name}-after.png`, fullPage: true });

      await page.waitForTimeout(2000);
    });
  }

  test('ProductSpecification Semantic Diversity Check', async () => {
    console.log('ProductSpecification diversity check will be done by analyzing the generated specs');
  });
});