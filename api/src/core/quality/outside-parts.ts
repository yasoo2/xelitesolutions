/**
 * WHAT JOE SAYS ABOUT A PDF, AND WHAT HE TELLS THE BUILDER BEFORE (design arabic-pdf v9 §3.1, §4.5, §5).
 *
 * The owner hears «<file>»: <words>, in his language (ar, en, es, fr, de, ru); the
 * child's English detail goes to the notes and the builder. Nothing here refuses:
 * a told line is a line in the chat and the report, never a verdict.
 */
import type { PdfProof, PdfTold } from './outside-proof';

export type PdfLineId = PdfTold | 'pdf_route_measured_wrong' | 'pdf_font_not_shipped';
type Lang = 'ar' | 'en' | 'es' | 'fr' | 'de' | 'ru';
export const PDF_LANGS: readonly Lang[] = ['ar', 'en', 'es', 'fr', 'de', 'ru'];

/** §5, exactly these keys. */
export const PDF_WORDS: Record<PdfLineId, Record<Lang, string>> = {
    pdf_text_is_image: { ar: 'الملف صور فقط بلا نص', en: 'the file is pictures only, no text', es: 'el archivo es solo imágenes, sin texto', fr: "le fichier n'est que des images, sans texte", de: 'die Datei enthält nur Bilder, keinen Text', ru: 'файл состоит только из изображений, без текста' },
    pdf_typed_text_missing: { ar: 'ما كتبه جو ليس في الملف', en: 'what Joe typed is not in the file', es: 'lo que Joe escribió no está en el archivo', fr: "ce que Joe a saisi n'est pas dans le fichier", de: 'was Joe eingegeben hat, fehlt in der Datei', ru: 'введённого Joe нет в файле' },
    pdf_number_not_as_typed: { ar: 'المبلغ في الملف ليس كما كُتب', en: 'the amount in the file is not as typed', es: 'el importe no es el escrito', fr: "le montant n'est pas celui saisi", de: 'der Betrag weicht von der Eingabe ab', ru: 'сумма в файле не та, что введена' },
    pdf_text_tiny: { ar: 'النص صغير جداً على الورق', en: 'the text is too small on paper', es: 'el texto es demasiado pequeño', fr: 'le texte est trop petit sur papier', de: 'der Text ist auf Papier zu klein', ru: 'текст слишком мелкий на бумаге' },
    pdf_text_cut: { ar: 'الاسم الطويل مقطوع', en: 'the long name is cut off', es: 'el nombre largo está cortado', fr: 'le nom long est coupé', de: 'der lange Name ist abgeschnitten', ru: 'длинное имя обрезано' },
    pdf_text_hidden: { ar: 'النص مخفي في الملف', en: 'the text is hidden in the file', es: 'el texto está oculto', fr: 'le texte est masqué', de: 'der Text ist verborgen', ru: 'текст скрыт' },
    pdf_text_mirrored: { ar: 'الحروف مقلوبة كالمرآة', en: 'the letters are mirrored', es: 'las letras están en espejo', fr: 'les lettres sont en miroir', de: 'die Buchstaben sind gespiegelt', ru: 'буквы зеркально отражены' },
    pdf_text_upside_down: { ar: 'النص مقلوب رأساً على عقب', en: 'the text is upside down', es: 'el texto está al revés', fr: "le texte est à l'envers", de: 'der Text steht auf dem Kopf', ru: 'текст перевёрнут' },
    pdf_text_off_page: { ar: 'النص خارج الورقة', en: 'the text is outside the page', es: 'el texto queda fuera de la página', fr: 'le texte sort de la page', de: 'der Text liegt außerhalb der Seite', ru: 'текст за пределами страницы' },
    pdf_font_not_embedded: { ar: 'الخط غير مضمّن في الملف', en: 'the font is not embedded', es: 'la fuente no está incrustada', fr: "la police n'est pas incorporée", de: 'die Schrift ist nicht eingebettet', ru: 'шрифт не встроен' },
    pdf_font_not_from_project: { ar: 'العربية مكتوبة بخط من الجهاز لا بخط التطبيق', en: "the Arabic is in a machine font, not the app's", es: 'el árabe usa una fuente del sistema, no la de la app', fr: "l'arabe est dans une police du système, pas celle de l'app", de: 'das Arabische steht in einer Systemschrift, nicht in der der App', ru: 'арабский набран системным шрифтом, а не шрифтом приложения' },
    pdf_letters_reversed: { ar: 'حروف الكلمات معكوسة', en: 'the letters of each word are reversed', es: 'las letras de cada palabra están invertidas', fr: 'les lettres de chaque mot sont inversées', de: 'die Buchstaben jedes Wortes sind umgekehrt', ru: 'буквы в словах переставлены в обратном порядке' },
    pdf_words_reversed: { ar: 'ترتيب الكلمات معكوس', en: 'the words are in reverse order', es: 'las palabras están en orden inverso', fr: "les mots sont dans l'ordre inverse", de: 'die Wörter stehen in umgekehrter Reihenfolge', ru: 'слова идут в обратном порядке' },
    pdf_text_painted_over: { ar: 'شيء مرسوم فوق النص يغطيه', en: 'something drawn over the text covers it', es: 'algo dibujado encima tapa el texto', fr: 'un élément dessiné par-dessus couvre le texte', de: 'etwas darüber Gezeichnetes verdeckt den Text', ru: 'поверх текста нарисовано то, что его закрывает' },
    pdf_text_overlapped: { ar: 'نص آخر مطبوع فوقه', en: 'other text is printed over it', es: 'otro texto se imprime encima', fr: 'un autre texte est imprimé par-dessus', de: 'anderer Text ist darübergedruckt', ru: 'поверх напечатан другой текст' },
    pdf_no_ink: { ar: 'النص لا يظهر على الورق', en: 'the text does not show on paper', es: 'el texto no se ve en papel', fr: 'le texte ne se voit pas sur papier', de: 'der Text ist auf Papier nicht sichtbar', ru: 'текст не виден на бумаге' },
    pdf_text_very_faint: { ar: 'النص باهت جداً', en: 'the text is very faint', es: 'el texto es muy tenue', fr: 'le texte est très pâle', de: 'der Text ist sehr blass', ru: 'текст очень бледный' },
    pdf_text_light: { ar: 'النص فاتح على الورق', en: 'the text prints light', es: 'el texto se imprime claro', fr: "le texte s'imprime clair", de: 'der Text wird hell gedruckt', ru: 'текст печатается светлым' },
    pdf_route_measured_wrong: { ar: 'يصنع الملف بمكتبة لا تشكّل العربية في اختبارات جو', en: "makes the PDF with a library that did not shape Arabic in Joe's tests", es: 'crea el PDF con una biblioteca que no dio forma al árabe en las pruebas de Joe', fr: "produit le PDF avec une bibliothèque qui n'a pas façonné l'arabe dans les tests de Joe", de: 'erzeugt das PDF mit einer Bibliothek, die Arabisch in Joes Tests nicht geformt hat', ru: 'создаёт PDF библиотекой, которая в тестах Joe не соединяла арабские буквы' },
    pdf_font_not_shipped: { ar: 'خط الملف يُحمَّل من خارج المشروع', en: "the PDF's font is loaded from outside the project", es: 'la fuente se carga desde fuera del proyecto', fr: 'la police est chargée hors du projet', de: 'die Schrift wird von außerhalb des Projekts geladen', ru: 'шрифт загружается извне проекта' },
};

export const PDF_PHRASES: Record<'notMeasured' | 'noPdfProduced' | 'textPresent' | 'inAppFont' | 'visibleOnPaper' | 'remedy', Record<Lang, string>> = {
    notMeasured: { ar: 'لم يُقَس', en: 'not measured', es: 'no medido', fr: 'non mesuré', de: 'nicht gemessen', ru: 'не измерено' },
    noPdfProduced: { ar: 'لم يصنع التطبيق ملف PDF أثناء فحوص جو', en: "the app produced no PDF during Joe's checks", es: 'la app no generó ningún PDF durante las pruebas de Joe', fr: "l'app n'a produit aucun PDF pendant les vérifications de Joe", de: 'die App hat während Joes Prüfungen kein PDF erzeugt', ru: 'приложение не создало PDF во время проверок Joe' },
    textPresent: { ar: 'النص موجود', en: 'text present', es: 'texto presente', fr: 'texte présent', de: 'Text vorhanden', ru: 'текст есть' },
    inAppFont: { ar: 'بخط التطبيق', en: "in the app's font", es: 'con la fuente de la app', fr: "dans la police de l'app", de: 'in der Schrift der App', ru: 'шрифтом приложения' },
    visibleOnPaper: { ar: 'ظاهر على الورقة', en: 'visible on paper', es: 'visible en papel', fr: 'visible sur papier', de: 'auf Papier sichtbar', ru: 'виден на бумаге' },
    remedy: { ar: 'قل «أصلح ملف <name>» لأعالجه', en: 'say «fix <name>» to have it fixed', es: 'di «arregla <name>» para corregirlo', fr: 'dites «corrige <name>» pour le faire corriger', de: 'sag «repariere <name>», um es zu beheben', ru: 'скажите «исправь <name>», чтобы исправить' },
};

/**
 * §4.5: a told line carries the remedy only when it fired on no right job and on at
 * least one wrong one. `pdf_text_cut` not with an ellipsis beside it; `pdf_no_ink`
 * only with a marker — stage 1 types none, so there it is a fact.
 */
export const PDF_REMEDY_IDS: ReadonlySet<PdfLineId> = new Set<PdfLineId>(['pdf_letters_reversed', 'pdf_words_reversed', 'pdf_text_mirrored',
    'pdf_text_upside_down', 'pdf_text_cut', 'pdf_text_hidden', 'pdf_text_painted_over', 'pdf_text_overlapped']);

export function carriesRemedy(id: PdfLineId, detail: string, hadMarker: boolean): boolean {
    if (id === 'pdf_no_ink') return hadMarker;
    if (!PDF_REMEDY_IDS.has(id)) return false;
    if (id === 'pdf_text_cut' && /ellipsis/u.test(String(detail || ''))) return false;
    return true;
}

/** The no-PDF line's marker in a record entry. */
export const NO_PDF_PRODUCED = 'no PDF was produced during the checks';

/** One looked-at thing, as DeliveryRecord.pdf keeps it. */
export interface PdfRecordEntry {
    /** 'file': a PDF the delivery wrote; 'qa': bytes the Browser QA walk received; 'code': a source file's mechanism. */
    source: 'file' | 'qa' | 'code';
    name: string;
    told: PdfLineId[];
    notMeasured: string[];
    /** The told ids that carry the remedy words. */
    remedy?: PdfLineId[];
    /** The all-clear's parts: true when measured, else why not. Only on a PDF with nothing told. */
    clear?: { text: true | string; font: true | string; ink: true | string };
}

/**
 * The all-clear's parts of a static proof (Joe typed nothing): each measured part is
 * true; a part that was not measured carries why. Never claims what was not measured.
 */
export function clearParts(p: PdfProof): PdfRecordEntry['clear'] {
    const nm = p.notMeasured || [];
    const why = (test: (what: string) => boolean) => nm.find(n => test(n.what))?.why;
    const everything = why(w => w === 'everything');
    if (everything) return { text: everything, font: everything, ink: everything };
    //  The static branch was reached only when some page holds text (prove.mjs: «typed text, cut, order»).
    const reached = nm.some(n => n.what === 'typed text, cut, order');
    const text: true | string = reached ? true : (why(w => /typed text/u.test(w)) || 'the file was not read far enough');
    const noArabic = why(w => w === 'font, ink');
    const font: true | string = !reached ? text as string : noArabic || why(w => /font/u.test(w)) || true;
    const ink: true | string = !reached ? text as string : noArabic || why(w => /\bink\b/u.test(w)) || true;
    return { text, font, ink };
}

const langOf = (lang: string): Lang => (PDF_LANGS as readonly string[]).includes(lang) ? lang as Lang : 'en';

/** The owner's lines, one per looked-at thing: «<file>»: <words>. */
export function outsideLines(entries: PdfRecordEntry[] | undefined, language: string): string[] {
    const l = langOf(String(language || 'en'));
    const lines: string[] = [];
    for (const e of entries || []) {
        if (!e.name && e.notMeasured.includes(NO_PDF_PRODUCED)) { lines.push(`📄 ${PDF_PHRASES.notMeasured[l]}: ${PDF_PHRASES.noPdfProduced[l]}`); continue; }
        const name = e.name.split('/').pop() || e.name;
        if (e.told.length) {
            for (const id of e.told) {
                const remedy = e.remedy?.includes(id) ? ` — ${PDF_PHRASES.remedy[l].replace('<name>', name)}` : '';
                lines.push(`📄 «${e.name}»: ${PDF_WORDS[id][l]}${remedy}`);
            }
            continue;
        }
        if (e.clear) {
            const part = (v: true | string, words: string) => v === true ? words : `${words}: ${PDF_PHRASES.notMeasured[l]}${l === 'en' ? ` (${v})` : ''}`;
            const parts = [part(e.clear.text, PDF_PHRASES.textPresent[l]), part(e.clear.font, PDF_PHRASES.inAppFont[l]), part(e.clear.ink, PDF_PHRASES.visibleOnPaper[l])];
            lines.push(`📄 «${e.name}»: ${parts.join(' · ')}`);
            continue;
        }
        lines.push(`📄 «${e.name}»: ${PDF_PHRASES.notMeasured[l]}${l === 'en' && e.notMeasured[0] ? ` (${e.notMeasured[0]})` : ''}`);
    }
    return lines;
}

/* ───────────── the brief (§3.1) ───────────── */

/**
 * Variant P (a print view; for a FILE, the server prints that view with headless
 * Chromium) and variant D (a document-only request: the HTML in print/, never
 * index.html, turned into the delivered PDF file). Said in English: it is the
 * builder's instruction, like every other line of the engine's first message.
 */
export function outsideBrief(variant: 'print' | 'document', kitDir: string): string {
    const kit = kitDir.replace(/\\/gu, '/');
    if (variant === 'document') {
        return [
            'The document you deliver is a PDF. If it shows Arabic (or Hebrew, Persian or Urdu), one way was measured to draw it correctly:',
            `write it as an HTML file (\`lang="ar" dir="rtl"\`, the kit's \`print.css\`) and turn it into the PDF with headless Chromium (\`playwright\`: \`page.pdf({ printBackground: false })\`). Joe placed the fonts and \`print.css\` in \`${kit}/\` (read \`${kit}/README.md\`).`,
            'Put that HTML in `print/` and never name it `index.html` (an `index.html` at the root or in `src/`, `public/` or `dist/` makes the project a site).',
            'Add no print button and no server: the PDF file is the delivery.',
            'Joe\'s tests printed Arabic wrong with pdfkit, pdf-lib, ReportLab, fpdf without text shaping and PyMuPDF `insert_text`.',
        ].join(' ');
    }
    return [
        'PDF and printing, when the printed page shows Arabic (or Hebrew, Persian or Urdu). One way was measured to draw these scripts correctly: an HTML page that a browser turns into a PDF.',
        `Joe placed what you need in \`${kit}/\` (fonts and \`print.css\`; read \`${kit}/README.md\`).`,
        `(1) Default: a print view — \`<html lang="ar" dir="rtl">\`, \`<link rel="stylesheet" href="/${kit.replace(/^public\//u, '')}/print.css">\`, the printed part inside an element with class \`joe-print\`, and a print button. Serve the kit's folder statically.`,
        '(2) Only when a FILE is needed without a person pressing print: the server opens that same print view in headless Chromium (`playwright`) and returns `page.pdf({ printBackground: false })`.',
        'Joe\'s tests printed Arabic wrong with pdfkit, pdf-lib, ReportLab, fpdf without text shaping and PyMuPDF `insert_text`; other PDF libraries were not tested: use the browser route for any page that may hold Arabic.',
        'The font is the kit\'s file, never a font of the machine or of the internet. Inside `joe-print` the browser prints your own colours and backgrounds exactly as you designed them, so give the printed part a design that reads on paper. Long names must wrap.',
    ].join(' ');
}
