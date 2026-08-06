/**
 * «قم بتذكيري فيها عندما نقرر ان نخرج جو للعامه».
 *
 * Run this the day the decision is made — or any day, to see where things
 * stand. It reads the settings this machine would actually start with and
 * prints, in his own language, exactly what must change before Joe answers
 * anybody but him. It changes nothing.
 *
 * Run:  npm run go-live-check
 */
export {};
import { goLiveCheck } from '../../shared/go-live';

const v = goLiveCheck(process.env);

console.log('\n══════════════ فحص الاستعداد للإطلاق العام ══════════════\n');
console.log(v.public
    ? '🌍 هذا التشغيل مضبوط كخادم عام (PUBLIC_URL خارجي أو JOE_PUBLIC=1).'
    : '🏠 هذا التشغيل محلي — لا شيء ممّا يلي مطلوب اليوم، وكلّه مطلوب يوم تفتح الباب.');
console.log('');

if (!v.blockers.length) {
    console.log('✅ لا مانع: الإعدادات صالحة لخدمة مستخدمين آخرين.');
} else {
    console.log(`⛔ ${v.blockers.length} إعداداً يجب تغييرها قبل الإطلاق:`);
    v.blockers.forEach((b, i) => console.log(`   ${i + 1}. ${b}`));
}
if (v.advice.length) {
    console.log(`\nℹ️ ويُستحسن أيضاً:`);
    v.advice.forEach(a => console.log(`   • ${a}`));
}
console.log('\nالملفّات التي تُغيَّر فيها هذه القيم: start-joe.ps1 و api/.env');
console.log('وعند التشغيل كخادم عام، يرفض جو الإقلاع بإعدادات المستخدم الواحد — لا يكتفي بالتحذير.\n');
