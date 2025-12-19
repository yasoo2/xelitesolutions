import { setTimeout as wait } from 'timers/promises';

const API = process.env.API_URL || 'http://localhost:8080';

type RunStartResp = { runId: string; sessionId?: string; result?: any };
type RunDetailsResp = { run: any; execs: Array<any>; artifacts: Array<{ name: string; href: string }> };

async function startRun(text: string): Promise<RunStartResp> {
  const res = await fetch(`${API}/runs/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`start failed: ${res.status}`);
  return res.json();
}

async function getRun(runId: string): Promise<RunDetailsResp> {
  const res = await fetch(`${API}/run/${encodeURIComponent(runId)}`);
  if (!res.ok) throw new Error(`run details failed: ${res.status}`);
  return res.json();
}

function hasImageArtifact(artifacts: RunDetailsResp['artifacts']) {
  return artifacts.some(a => /\.(png|jpg|jpeg|webp)$/i.test(a.name));
}

function findExec(execs: RunDetailsResp['execs'], name: string) {
  return execs.find(e => String(e.name).toLowerCase() === name.toLowerCase());
}

async function testPrompt(text: string) {
  const { runId } = await startRun(text);
  await wait(500); // small delay for execution
  const details = await getRun(runId);
  const execOk = details.execs.some(e => e.ok === true);
  const imageOk = hasImageArtifact(details.artifacts);
  return { ok: execOk || imageOk, details };
}

async function main() {
  const prompts: string[] = [
    // Currency
    'كم سعر الدولار اليوم بالنسبة لليرة التركية',
    'سعر الدينار الكويتي مقابل الشيكل اليوم',
    'أريد سعر اليورو مقابل الدولار الأمريكي',
    // Image generation
    'صمم صورة قطة لطيفة',
    'صمم صورة شعار بسيط بألوان الأزرق والأبيض',
    'تصميم صورة أيقونية لمتجر الكتروني',
    // Web search
    'ابحث عن أفضل مكتبات React للأداء',
    'بحث عن أحدث أخبار الذكاء الاصطناعي',
    'search حول تاريخ العملة التركية',
    // Page design
    'صمم صفحة هبوط بسيطة',
    'أريد صفحة HTML تعرض بطاقات منتجات',
    'landing page بالعربية',
    // E-commerce scaffold
    'بناء موقع لمتجر الكتروني وعرضه أمامي',
    'أريد متجر إلكتروني بسيط',
    'ecommerce demo site',
    // File write/edit
    'write هذه ملاحظة مهمة',
    'write سجل الملاحظات اليوم',
    'write قائمة المهام',
    // Mixed
    'تصميم صفحة ثم عرضها',
    'صمم صورة ثم أعرض الرابط',
    'ابحث ثم لخص النتائج',
    // More currency variants
    'قيمة الدولار مقابل الليرة التركية',
    'سعر دينار كويتي ضد شيكل',
    'قيمة اليورو مقابل دولار',
    // More images
    'تصميم صورة كلب مرح',
    'تصميم صورة طائر ملون',
    'صمم صورة خلفية بدرجات الأزرق',
    // More pages
    'صفحة HTML تحتوي عنوان ومحتوى',
    'landing عربية مع بطاقات',
    'إنشاء صفحة منتجات',
    // More ecommerce
    'متجر بسيط يعرض 6 منتجات',
    'shop demo',
    'ecommerce Arabic',
    // Search again
    'ابحث عن أطر CSS الحديثة',
    'بحث عن أدوات اختبار الواجهة',
    'search new js features',
    // Snapshot again
    'browser https://www.google.com',
    'browser https://www.bbc.com',
    'browser https://vercel.com',
    // Utility
    'echo مرحباً جو',
    'echo هذا اختبار موسع',
    'echo النهاية',
    // Additional prompts to reach 50 and diversify
    'سعر الدولار مقابل الشيكل',
    'ابحث عن سعر الذهب اليوم',
    'landing page dark mode',
    'متجر متعدد الصفحات بسيط',
    'write مذكرة للفريق بالعربية',
  ];

  const failures: Array<{ text: string; reason: string }> = [];
  let passCount = 0;

  for (const text of prompts) {
    try {
      const { ok } = await testPrompt(text);
      if (!ok) failures.push({ text, reason: 'no ok exec or image artifact' });
      else passCount++;
      await wait(200);
    } catch (e: any) {
      failures.push({ text, reason: e?.message || 'error' });
    }
  }

  console.log(`QA Suite: passed=${passCount} failed=${failures.length}`);
  if (failures.length) {
    console.log('Failures:');
    failures.forEach(f => console.log(`- "${f.text}": ${f.reason}`));
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
