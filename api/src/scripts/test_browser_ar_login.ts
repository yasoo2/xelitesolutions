import { executePlannedActions } from '../browser/executor';
import { getBrowserSession, stopSession } from '../browser/manager';

async function main() {
  const sessionId = `test-browser-${Date.now()}`;
  const userId = 'test-user';

  const s = await getBrowserSession(sessionId);
  await s.page.setContent(
    `
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>تسجيل الدخول</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; }
          label { display:block; margin-top: 12px; }
          input { width: 320px; padding: 10px; }
          button { margin-top: 16px; padding: 10px 14px; }
          #result { margin-top: 18px; font-weight: 700; color: #16a34a; }
        </style>
      </head>
      <body>
        <h1>صفحة تسجيل الدخول</h1>
        <label for="email">البريد الإلكتروني</label>
        <input id="email" name="email" type="text" aria-label="البريد الإلكتروني" />
        <label for="password">كلمة المرور</label>
        <input id="password" name="password" type="password" aria-label="كلمة المرور" />
        <button id="submit" type="button">تسجيل الدخول</button>
        <div id="result" aria-live="polite"></div>
        <script>
          document.getElementById('submit').addEventListener('click', function () {
            const email = document.getElementById('email').value || '';
            const pass = document.getElementById('password').value || '';
            if (email && pass) document.getElementById('result').textContent = 'تم تسجيل الدخول';
            else document.getElementById('result').textContent = 'بيانات ناقصة';
          });
        </script>
      </body>
    </html>
  `,
    { waitUntil: 'domcontentloaded' },
  );

  const result = await executePlannedActions({
    userId,
    sessionId,
    actions: [
      { type: 'type', role: 'textbox', name: 'البريد الإلكتروني', text: 'user@example.com' },
      { type: 'type', role: 'textbox', name: 'كلمة المرور', text: 'secret' },
      { type: 'click', role: 'button', name: 'تسجيل الدخول' },
      { type: 'assert', text: 'تم تسجيل الدخول' },
    ],
  });

  await stopSession(sessionId);

  if (!result.ok) {
    console.error('Arabic login flow failed:', result);
    process.exit(1);
  }
  console.log('✅ Arabic login flow OK');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

