/**
 * Turns the internal engineering report into a small delivery answer.
 * The complete report remains available to the technical Logs surface.
 */
export function isEngineeringReport(markdown: string): boolean {
    const source = String(markdown || '');
    return /Joe Engineering Execution Report|(?:^|\n)#{0,3}\s*(?:✅\s*)?(?:Project delivered|Build stopped honestly|Accepted with gaps)\b|Self-QA in the Browser panel|Visible Browser QA|Project files|npm install\s*\+\s*vite build succeeded|تقرير تنفيذ جو|فحص المتصفح/i.test(source);
}

type Lang = 'en' | 'ar' | 'fr' | 'de' | 'ru' | 'es';
type Phrase = Record<Lang, string>;
type CountForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

function langOf(language: string): Lang {
    const base = String(language || 'en').split('-')[0].toLowerCase();
    return (['en', 'ar', 'fr', 'de', 'ru', 'es'] as const).find(l => l === base) || 'en';
}

/**
 * Every sentence the summary can say, in the six interface languages. The
 * summary is written in the language the user chose; a language Joe does not
 * offer reads English. `{name}` is filled from the report.
 */
const SAY = {
    issueNav: {
        en: 'Some navigation links still need attention.',
        ar: 'بعض روابط التنقل لا تستجيب بعد.',
        fr: 'Certains liens de navigation demandent encore une correction.',
        de: 'Einige Navigationslinks müssen noch korrigiert werden.',
        ru: 'Некоторые навигационные ссылки ещё требуют внимания.',
        es: 'Algunos enlaces de navegación aún necesitan atención.',
    },
    issueMissingSection: {
        en: 'Some links point to sections that are not present.',
        ar: 'بعض الروابط تشير إلى أقسام غير موجودة.',
        fr: 'Certains liens pointent vers des sections absentes.',
        de: 'Einige Links verweisen auf Abschnitte, die es nicht gibt.',
        ru: 'Некоторые ссылки ведут на отсутствующие разделы.',
        es: 'Algunos enlaces apuntan a secciones que no existen.',
    },
    issueTapTarget: {
        en: 'One mobile tap target needs to be larger.',
        ar: 'يوجد عنصر صغير على شاشة الهاتف ويحتاج تكبيرًا.',
        fr: 'Une zone tactile sur mobile doit être agrandie.',
        de: 'Ein Tippziel auf dem Smartphone muss größer werden.',
        ru: 'Один элемент на экране телефона слишком мал и требует увеличения.',
        es: 'Un objetivo táctil en el móvil debe ser más grande.',
    },
    issueHorizontalScroll: {
        en: 'Horizontal scrolling needs to be fixed on a phone.',
        ar: 'يوجد تمرير أفقي على شاشة الهاتف ويحتاج إصلاحًا.',
        fr: 'Le défilement horizontal doit être corrigé sur téléphone.',
        de: 'Das horizontale Scrollen auf dem Smartphone muss behoben werden.',
        ru: 'На экране телефона нужно устранить горизонтальную прокрутку.',
        es: 'Hay que corregir el desplazamiento horizontal en el teléfono.',
    },
    issueNotProven: {
        en: 'Some requested parts were not proven; request acceptance is still incomplete.',
        ar: 'بعض الأجزاء المطلوبة لم تُثبت بعد؛ لا يكتمل قبول الطلب قبل التحقق منها.',
        fr: 'Certaines parties demandées n’ont pas été prouvées ; l’acceptation de la demande reste incomplète.',
        de: 'Einige angeforderte Teile wurden nicht nachgewiesen; die Abnahme der Anfrage ist noch unvollständig.',
        ru: 'Некоторые запрошенные части не подтверждены; приёмка запроса ещё не завершена.',
        es: 'Algunas partes solicitadas no se comprobaron; la aceptación de la solicitud sigue incompleta.',
    },
    issueUnreached: {
        en: 'Some controls were not reached by the test and need another verification pass.',
        ar: 'بعض عناصر الواجهة لم تصل إليها جولة الاختبار؛ يلزم إعادة التحقق.',
        fr: 'Le test n’a pas atteint certains contrôles ; une nouvelle vérification est nécessaire.',
        de: 'Einige Bedienelemente wurden vom Test nicht erreicht und müssen erneut geprüft werden.',
        ru: 'Тест не дошёл до некоторых элементов управления; нужна повторная проверка.',
        es: 'La prueba no alcanzó algunos controles y hace falta otra verificación.',
    },
    issueOther: {
        en: 'One quality finding remains.',
        ar: 'بقيت ملاحظة في فحص الجودة.',
        fr: 'Une remarque de qualité subsiste.',
        de: 'Ein Qualitätsbefund ist noch offen.',
        ru: 'Осталось одно замечание по качеству.',
        es: 'Queda una observación de calidad.',
    },
    headDelivered: {
        en: '## Delivered',
        ar: '## تم التسليم',
        fr: '## Livré',
        de: '## Geliefert',
        ru: '## Сдано',
        es: '## Entregado',
    },
    headResult: {
        en: '## Execution result',
        ar: '## نتيجة التنفيذ',
        fr: '## Résultat de l’exécution',
        de: '## Ergebnis der Ausführung',
        ru: '## Результат выполнения',
        es: '## Resultado de la ejecución',
    },
    headSummary: {
        en: '## Delivery summary',
        ar: '## ملخص التسليم',
        fr: '## Résumé de la livraison',
        de: '## Zusammenfassung der Lieferung',
        ru: '## Итоги сдачи',
        es: '## Resumen de la entrega',
    },
    builtVerified: {
        en: 'The project was built and fully verified.',
        ar: 'اكتمل البناء والتحقق من المشروع.',
        fr: 'Le projet a été construit et entièrement vérifié.',
        de: 'Das Projekt wurde gebaut und vollständig geprüft.',
        ru: 'Проект собран и полностью проверен.',
        es: 'El proyecto se construyó y se verificó por completo.',
    },
    builtUnverified: {
        en: 'The project was built, but verification is incomplete and remaining findings must be fixed.',
        ar: 'اكتمل البناء، لكن التحقق لم يكتمل بعد وتوجد نقاط يجب إصلاحها.',
        fr: 'Le projet a été construit, mais la vérification est incomplète et les remarques restantes doivent être corrigées.',
        de: 'Das Projekt wurde gebaut, aber die Prüfung ist unvollständig und die offenen Befunde müssen behoben werden.',
        ru: 'Проект собран, но проверка не завершена, и оставшиеся замечания нужно исправить.',
        es: 'El proyecto se construyó, pero la verificación está incompleta y hay que corregir las observaciones pendientes.',
    },
    livePreview: {
        en: 'Live preview: {url}',
        ar: 'المعاينة الحية: {url}',
        fr: 'Aperçu en direct : {url}',
        de: 'Live-Vorschau: {url}',
        ru: 'Живой предпросмотр: {url}',
        es: 'Vista previa en vivo: {url}',
    },
    testAccount: {
        en: 'Test account: {user} / {password}',
        ar: 'بيانات الاختبار: {user} / {password}',
        fr: 'Compte de test : {user} / {password}',
        de: 'Testkonto: {user} / {password}',
        ru: 'Тестовая учётная запись: {user} / {password}',
        es: 'Cuenta de prueba: {user} / {password}',
    },
    pagesDone: {
        en: 'Implemented pages: {pages}.',
        ar: 'الصفحات المنفذة: {pages}.',
        fr: 'Pages réalisées : {pages}.',
        de: 'Umgesetzte Seiten: {pages}.',
        ru: 'Готовые страницы: {pages}.',
        es: 'Páginas implementadas: {pages}.',
    },
    browserQa: {
        en: 'Browser QA: **{score}/100**{detail}.',
        ar: 'فحص المتصفح: **{score}/100**{detail}.',
        fr: 'Contrôle dans le navigateur : **{score}/100**{detail}.',
        de: 'Browser-Prüfung: **{score}/100**{detail}.',
        ru: 'Проверка в браузере: **{score}/100**{detail}.',
        es: 'Control en el navegador: **{score}/100**{detail}.',
    },
    qaCoverage: {
        en: ' — {pages} {pageWord} and {actions} {actionWord}',
        ar: ' — {pages} صفحات و{actions} فعلاً استكشافياً',
        fr: ' — {pages} {pageWord} et {actions} {actionWord}',
        de: ' — {pages} {pageWord} und {actions} {actionWord}',
        ru: ' — {pages} {pageWord} и {actions} {actionWord}',
        es: ' — {pages} {pageWord} y {actions} {actionWord}',
    },
    qaStates: {
        en: ' across {states} discovered states',
        ar: ' عبر {states} حالة',
        fr: ' (états découverts : {states})',
        de: ' (entdeckte Zustände: {states})',
        ru: ' (обнаружено состояний: {states})',
        es: ' (estados descubiertos: {states})',
    },
    remaining: {
        en: 'Remaining findings:',
        ar: 'الملاحظات المتبقية:',
        fr: 'Remarques restantes :',
        de: 'Offene Befunde:',
        ru: 'Оставшиеся замечания:',
        es: 'Observaciones pendientes:',
    },
    finalNotVerified: {
        en: 'Final live verification did not complete; the system must be checked again before delivery.',
        ar: 'لم يكتمل التحقق النهائي من التشغيل الحي؛ يجب إعادة الفحص قبل التسليم.',
        fr: 'La vérification finale en conditions réelles n’a pas abouti ; le système doit être revérifié avant la livraison.',
        de: 'Die abschließende Live-Prüfung wurde nicht abgeschlossen; das System muss vor der Lieferung erneut geprüft werden.',
        ru: 'Финальная проверка в живом запуске не завершена; перед сдачей систему нужно проверить снова.',
        es: 'La verificación final en vivo no se completó; hay que volver a comprobar el sistema antes de la entrega.',
    },
    nonBlocking: {
        en: 'The latest browser check still has non-blocking findings; the technical trace names them in Logs.',
        ar: 'توجد ملاحظات غير حاجبة في فحص المتصفح الأخير؛ تفاصيلها التقنية مسماة في السجلات.',
        fr: 'Le dernier contrôle dans le navigateur comporte encore des remarques non bloquantes ; la trace technique les détaille dans Journaux.',
        de: 'Die letzte Browser-Prüfung hat noch nicht blockierende Befunde; die technische Spur nennt sie unter Protokolle.',
        ru: 'В последней проверке в браузере остались неблокирующие замечания; техническая трасса перечисляет их в разделе «Журналы».',
        es: 'La última comprobación en el navegador aún tiene observaciones no bloqueantes; la traza técnica las detalla en Registros.',
    },
    noCritical: {
        en: 'No critical findings were reported in the latest check.',
        ar: 'لم تظهر ملاحظات حرجة في الفحص الأخير.',
        fr: 'Aucune remarque critique n’a été signalée lors du dernier contrôle.',
        de: 'Bei der letzten Prüfung wurden keine kritischen Befunde gemeldet.',
        ru: 'При последней проверке критических замечаний не обнаружено.',
        es: 'No se informaron observaciones críticas en la última comprobación.',
    },
    traceInLogs: {
        en: 'The complete technical trace is available in Logs.',
        ar: 'التفاصيل التقنية الكاملة موجودة في السجلات.',
        fr: 'La trace technique complète est disponible dans Journaux.',
        de: 'Die vollständige technische Spur steht unter Protokolle.',
        ru: 'Полная техническая трасса доступна в разделе «Журналы».',
        es: 'La traza técnica completa está disponible en Registros.',
    },
} satisfies Record<string, Phrase>;

/** The counted words of the coverage line, by plural category (Intl.PluralRules). */
const PAGE_WORD: Record<Exclude<Lang, 'ar'>, CountForms> = {
    en: { one: 'page', other: 'pages' },
    fr: { one: 'page', other: 'pages' },
    de: { one: 'Seite', other: 'Seiten' },
    ru: { one: 'страница', few: 'страницы', many: 'страниц', other: 'страницы' },
    es: { one: 'página', other: 'páginas' },
};
const ACTION_WORD: Record<Exclude<Lang, 'ar'>, CountForms> = {
    en: { one: 'exploratory action', other: 'exploratory actions' },
    fr: { one: 'action exploratoire', other: 'actions exploratoires' },
    de: { one: 'explorative Aktion', other: 'explorative Aktionen' },
    ru: { one: 'исследовательское действие', few: 'исследовательских действия', many: 'исследовательских действий', other: 'исследовательского действия' },
    es: { one: 'acción exploratoria', other: 'acciones exploratorias' },
};

function say(lang: Lang, id: keyof typeof SAY, vars: Record<string, string> = {}): string {
    return SAY[id][lang].replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? vars[name] : whole));
}

function counted(lang: Exclude<Lang, 'ar'>, n: string, forms: CountForms): string {
    const category = new Intl.PluralRules(lang).select(Number(n) || 0);
    return forms[category] ?? forms.other;
}

export function summarizeEngineeringReport(markdown: string, language = 'en'): string {
    const source = String(markdown || '').trim();
    if (!source) return '';

    const lang = langOf(language);
    const lines = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const first = lines[0] || '';
    const title = first.match(/[—-]\s*["«]([^"»]+)["»]/)?.[1]?.trim()
        || first.match(/Project delivered:\s*(.+)$/iu)?.[1]?.trim()
        || '';
    const scoreMatch = source.match(/Visible Browser QA[^\n]*?(\d{1,3})\s*\/\s*100/i)
        || Array.from(source.matchAll(/(?:Self-QA|تدقيق[^\n]*|جودة[^\n]*).*?(\d{1,3})\s*\/\s*100/gi)).pop();
    const score = scoreMatch?.[1] || '';
    const pages = Array.from(source.matchAll(/(?:page|صفحة)\s*[«"]([^»"]+)[»"]/gi))
        .map(match => match[1].trim())
        .filter((page, index, all) => page && all.indexOf(page) === index)
        .slice(0, 8);

    const issueLines = lines
        .filter(line => /^[-•*]\s*/.test(line))
        .map(line => line.replace(/^[-•*]\s*/, '').replace(/\*\*/g, '').trim())
        .filter(line => /unresponsive|does not exist|tap target|horizontal scrolling|controls? (?:were )?(?:gone|unreached)|could not (?:be )?reached|I did not inspect|لم أفحص|لم أتحقق|لا يستجيب|غير موجود|صغير|تمرير أفقي|لم أصل|لا يمكن الوصول|خطأ|عطل/i.test(line))
        .map(line => {
            if (/unresponsive|navigation link/i.test(line)) return say(lang, 'issueNav');
            if (/does not exist/i.test(line)) return say(lang, 'issueMissingSection');
            if (/tap target|hard to hit|صغير/i.test(line)) return say(lang, 'issueTapTarget');
            if (/horizontal scrolling|تمرير أفقي/i.test(line)) return say(lang, 'issueHorizontalScroll');
            if (/I did not inspect|لم أفحص|لم أتحقق/i.test(line)) return say(lang, 'issueNotProven');
            if (/controls? (?:were )?(?:gone|unreached)|could not (?:be )?reached|لم أصل|لا يمكن الوصول/i.test(line)) return say(lang, 'issueUnreached');
            return say(lang, 'issueOther');
        })
        .filter((line, index, all) => all.indexOf(line) === index)
        .slice(0, 3);

    const explicitFinalVerified = /finalVerified:\s*`?true`?/iu.test(source);
    const buildVerified = /verified to compile|تُحقق من تجميعه|vite build (?:succeeded|passed)|(?:vite build|البناء)\s+نجح/iu.test(source)
        || (explicitFinalVerified && /(?:^|\n)#{0,3}\s*(?:✅\s*)?Project delivered\b/iu.test(source));
    // The report can contain a clean build-stage audit followed by a failed
    // final live-run audit. The final machine verdict always outranks an older
    // 100/100; otherwise the chat says "fully verified" while Logs say
    // finalVerified=false and browserQaFailed=true.
    const finalVerificationFailed = /finalVerified:\s*`?false`?|browserQaFailed:\s*`?true`?|Build stopped honestly|Stopped at step|final delivery is blocked|Accepted with gaps|Visible Browser QA:\s*\*\*not run\*\*|I did not deliver the system|لم أسلّم النظام|توقف التسليم|قُبل مع فجوات/iu.test(source);
    const fullyVerified = buildVerified && !finalVerificationFailed && (!score || Number(score) === 100) && issueLines.length === 0;
    const credential = source.match(/Owner account(?:\s*\([^)]*\))?:\s*([^\s/]+)\s*\/\s*([^\s]+)/iu);
    const liveUrl = source.match(/(?:Open at:|live at:?)\s*\*\*?(https?:\/\/[^\s*]+)/iu)?.[1];
    const checked = source.match(/\((\d+)\s+page\(s\),\s*(\d+)\s+control\(s\)[^)]*\)/i);
    const exploratoryActions = Array.from(source.matchAll(/(\d+)\s+exploratory action\(s\)/gi)).pop()?.[1] || '';
    const statesDiscovered = Array.from(source.matchAll(/(\d+)\s+state\(s\) discovered/gi)).pop()?.[1] || '';
    const measuredInteractions = exploratoryActions
        || Array.from(source.matchAll(/(\d+)\s+interaction\(s\) measured/gi)).pop()?.[1]
        || checked?.[2]
        || '';
    // External API selection is a user-facing product dependency, not internal
    // trace noise. Keep the backend's maintained metadata in the compact chat
    // receipt while leaving request URLs and technical evidence in Logs.
    const externalApiStatus = lines.find(line => /^[-•*]?\s*(?:External API|API خارجي):/iu.test(line))
        ?.replace(/^[-•*]\s*/, '')
        .trim();

    const heading = title
        ? `${say(lang, fullyVerified ? 'headDelivered' : 'headResult')}: ${title}`
        : say(lang, fullyVerified ? 'headSummary' : 'headResult');
    const result = [heading, say(lang, fullyVerified ? 'builtVerified' : 'builtUnverified')];
    if (liveUrl) result.push(say(lang, 'livePreview', { url: liveUrl }));
    if (credential) result.push(say(lang, 'testAccount', { user: credential[1], password: credential[2] }));
    if (pages.length) result.push(say(lang, 'pagesDone', { pages: pages.join(' · ') }));
    if (score) {
        let detail = '';
        if (checked) {
            detail = say(lang, 'qaCoverage', {
                pages: checked[1],
                actions: measuredInteractions,
                ...(lang === 'ar' ? {} : {
                    pageWord: counted(lang, checked[1], PAGE_WORD[lang]),
                    actionWord: counted(lang, measuredInteractions, ACTION_WORD[lang]),
                }),
            });
            if (statesDiscovered) detail += say(lang, 'qaStates', { states: statesDiscovered });
        }
        result.push(say(lang, 'browserQa', { score, detail }));
    }
    if (externalApiStatus) result.push(externalApiStatus);
    if (issueLines.length) {
        result.push(say(lang, 'remaining'));
        result.push(...issueLines.map(line => `- ${line}`));
    } else if (finalVerificationFailed) {
        result.push(say(lang, 'finalNotVerified'));
    } else if (score && Number(score) < 100) {
        result.push(say(lang, 'nonBlocking'));
    } else {
        result.push(say(lang, 'noCritical'));
    }
    result.push('', say(lang, 'traceInLogs'));
    return result.join('\n');
}
