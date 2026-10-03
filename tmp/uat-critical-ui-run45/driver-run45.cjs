const { chromium } = require('D:/Joe/muse-worktree/api/node_modules/playwright');
const fs = require('fs');

const OUT = 'D:/Joe/muse-worktree/tmp/uat-critical-ui-run45';
const PROMPT = fs.readFileSync(OUT + '/PROMPT45.txt', 'utf8').trim();

(async () => {
  const ctx = await chromium.launchPersistentContext(OUT + '/run45profile', {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-dev-shm-usage'],
    viewport: { width: 1366, height: 900 },
  });
  const page = await ctx.newPage();
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('gravatar')) bad.push(new Date().toISOString() + ' ' + r.status() + ' ' + r.url().replace('http://127.0.0.1:5101', '').slice(0, 140)); });
  await page.goto('http://127.0.0.1:5101/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: OUT + '/r45-01-login.png' });
  const guest = page.getByRole('button', { name: /continue as guest/i });
  if (await guest.count() > 0) {
    await guest.first().click();
    await page.waitForTimeout(5000);
    console.log('LOGIN: guest-click URL=' + page.url());
  } else {
    const emailBox = page.locator('input[type=email]:visible').first();
    const passBox = page.locator('input[type=password]:visible').first();
    await emailBox.fill('uat5101@joe.local');
    await passBox.fill('UatLocal5101!test');
    const loginBtn = page.getByRole('button', { name: /^login$/i });
    if (await loginBtn.count() > 0) await loginBtn.first().click();
    else await passBox.press('Enter');
    await page.waitForTimeout(6000);
    console.log('URL-AFTER-LOGIN:', page.url());
  }
  await page.screenshot({ path: OUT + '/r45-02-after-login.png' });
  await page.goto('http://127.0.0.1:5101/joe', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  const newChat = page.getByRole('button', { name: /new chat/i });
  if (await newChat.count() > 0) { await newChat.first().click(); await page.waitForTimeout(3000); console.log('NEW-CHAT: clicked'); }
  else console.log('NEW-CHAT: button not found');
  const box = page.locator('textarea:visible, [contenteditable=true]:visible').first();
  await box.click();
  await box.fill(PROMPT);
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + '/r45-03-prompt-filled.png' });
  const explicit = page.getByRole('button', { name: /send|submit|start|go|run/i });
  if (await explicit.count() > 0) { await explicit.first().click(); console.log('SEND: button-click'); }
  else { await box.press('Enter'); console.log('SEND: enter-key'); }
  const t0 = Date.now();
  const DEADLINE = 30 * 60 * 1000;
  let lastLen = 0, stableRounds = 0, shot = 0;
  fs.writeFileSync(OUT + '/r45-04-timeline.log', 'SEND-AT ' + new Date().toISOString() + '\n');
  while (Date.now() - t0 < DEADLINE) {
    await page.waitForTimeout(30000);
    const snap = await page.evaluate(() => document.body.innerText);
    const elapsed = Math.round((Date.now() - t0) / 1000);
    fs.appendFileSync(OUT + '/r45-04-timeline.log', 'T+' + elapsed + 's bodyLen=' + snap.length + '\n');
    if (shot % 4 === 0) await page.screenshot({ path: OUT + '/r45-05-t' + elapsed + 's.png' });
    shot++;
    fs.writeFileSync(OUT + '/r45-06-latest-dom.txt', snap.slice(-12000));
    if (Math.abs(snap.length - lastLen) < 50) stableRounds++; else stableRounds = 0;
    lastLen = snap.length;
    const tail = snap.slice(-3000).toLowerCase();
    const terminal = /(run finished|finalverified|build stopped honestly|acceptance rerun did not complete)/.test(tail);
    if (stableRounds >= 4 && terminal && elapsed > 180) { fs.appendFileSync(OUT + '/r45-04-timeline.log', 'EARLY-STOP terminal-phrase at T+' + elapsed + 's\n'); break; }
    if (stableRounds >= 40 && elapsed > 300) { fs.appendFileSync(OUT + '/r45-04-timeline.log', 'EARLY-STOP long-stable at T+' + elapsed + 's\n'); break; }
  }
  await page.screenshot({ path: OUT + '/r45-07-final.png' });
  const finalBody = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(OUT + '/r45-08-final-dom.txt', finalBody);
  console.log('FINAL-LEN:', finalBody.length);
  console.log('BAD-RESPONSES:', JSON.stringify(bad.slice(0, 30), null, 1));
  await ctx.close();
})().catch((e) => { console.error('SEND-FAIL:', e.message); process.exit(1); });
