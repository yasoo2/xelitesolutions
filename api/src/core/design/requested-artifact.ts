/**
 * WHAT HE ASKED TO BE DELIVERED, AND WHETHER IT NEEDS ITS OWN SERVER —
 * two facts, read once, for every reader that routes a build.
 *
 * Eval round 15 (2026-10-24): Joe decided what kind of thing to build in eight
 * places, each matching keywords anywhere in the sentence with its own word
 * list, and the English and Arabic halves of those lists had drifted apart.
 * «اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه الزبائن …» was a database
 * SYSTEM (the data word «الزبائن» won) while its English twin was a CLI; every
 * English API prompt was an 'app' and every Arabic one a 'system'; a landing
 * page was a page in Arabic and a React app in English.
 *
 * The two facts are independent and were packed into one three-valued scope:
 *
 *   kind        — read from the OBJECT of the build verb («Write a command-line
 *                 tool …» → the command-line tool), against a closed lexicon of
 *                 DELIVERABLE kinds declared as bilingual pairs. Domain words
 *                 («orders», «الزبائن») never decide it. An object the lexicon
 *                 does not know returns null: the reader does not guess.
 *   needsServer — read from CLAIMS anywhere in the negation-masked request:
 *                 declared sign-in, accounts, roles, a database, a backend or a
 *                 server; data one party writes and another reads («customers
 *                 book … the owner sees all bookings»); per-user ownership
 *                 («كل موظف يرى سجلاته فقط»); an owned API. Never the head noun:
 *                 «a habit tracking system for myself» owns no server, and «an
 *                 app with suppliers and vendors» needs one as much as «a
 *                 system» with them.
 *
 * Every consumer — classifyBuildScope, isCliRequest, detectAppKind,
 * requestedArtifactWithoutStockEngine, deterministicPhasesFor — reads both
 * from here, so two readers can no longer disagree about one request.
 */
import { normalise, words } from '../language/arabic';

export type ArtifactKind = 'page' | 'app' | 'system' | 'api' | 'cli' | 'report' | 'game' | 'bot' | 'store' | 'booking';

/** One concept, the same entry in both scripts. A side left empty fails the parity test. */
export interface LexiconPair {
    concept: string;
    en: string[];
    ar: string[];
}

interface ArtifactPair extends LexiconPair {
    kind: ArtifactKind | 'neutral' | 'web' | 'service' | 'apiframework';
    presentation?: boolean;
}

/**
 * Kinds of DELIVERABLE — never domains or products. `neutral` heads («tool»,
 * «أداة») take their kind from a modifier; `web` words are modifiers only.
 * Spelling is folded by normalise() when the table is built.
 */
export const ARTIFACT_LEXICON: readonly ArtifactPair[] = [
    { concept: 'command-line tool', kind: 'cli', en: ['cli', 'command line', 'commandline', 'terminal app', 'console app', 'shell script', 'script'], ar: ['سطر اوامر', 'سطر الاوامر', 'طرفيه', 'تيرمينال', 'كونسول', 'سكربت', 'سكريبت'] },
    { concept: 'api', kind: 'api', en: ['api', 'rest api', 'graphql api', 'web api', 'web service', 'backend', 'back end', 'backend api', 'backend service', 'endpoints', 'api endpoints', 'rest endpoints'], ar: ['واجهه برمجيه', 'واجهه برمجه', 'واجهه خلفيه', 'باك اند', 'باكند', 'خدمه ويب', 'نقاط نهايه'] },
    { concept: 'report', kind: 'report', en: ['report'], ar: ['تقرير'] },
    { concept: 'game', kind: 'game', en: ['game', 'quiz', 'quiz game'], ar: ['لعبه', 'مسابقه'] },
    { concept: 'chatbot', kind: 'bot', en: ['chatbot', 'chat bot', 'bot'], ar: ['روبوت محادثه', 'روبوت', 'بوت', 'شات بوت'] },
    { concept: 'store', kind: 'store', en: ['store', 'shop', 'storefront', 'online store', 'online shop', 'e commerce', 'ecommerce', 'marketplace'], ar: ['متجر', 'متجر الكتروني', 'سوق الكتروني'] },
    { concept: 'booking', kind: 'booking', en: ['booking', 'bookings', 'reservation', 'reservations'], ar: ['حجز', 'حجوزات'] },
    { concept: 'system', kind: 'system', en: ['system', 'platform'], ar: ['نظام', 'منصه'] },
    { concept: 'application', kind: 'app', en: ['app', 'application', 'web app', 'webapp', 'web application'], ar: ['تطبيق', 'تطبيق ويب'] },
    { concept: 'dashboard', kind: 'app', en: ['dashboard', 'admin dashboard', 'admin panel', 'control panel', 'panel'], ar: ['لوحه تحكم', 'لوحه', 'داشبورد'] },
    { concept: 'editor or tracker', kind: 'app', en: ['editor', 'tracker', 'board'], ar: ['محرر', 'متتبع'] },
    { concept: 'page', kind: 'page', en: ['page', 'web page', 'website', 'web site', 'site', 'homepage'], ar: ['صفحه', 'صفحه ويب', 'موقع', 'موقع الكتروني'] },
    { concept: 'presentation page', kind: 'page', presentation: true, en: ['landing page', 'landing', 'portfolio', 'brochure', 'one pager'], ar: ['صفحه هبوط', 'هبوط', 'تعريفي', 'موقع تعريفي', 'بورتفوليو', 'لاندنج'] },
    { concept: 'tool or program', kind: 'neutral', en: ['tool', 'program', 'utility', 'software'], ar: ['اداه', 'برنامج'] },
    // «a FastAPI service», «an Express server», «خادم Flask»: a service head is
    // an API only when a framework or API word modifies it (eval round 19:
    // «Create a FastAPI service for a library» was read as a web page).
    { concept: 'service or server', kind: 'service', en: ['service', 'server', 'microservice'], ar: ['خدمه', 'خادم', 'سيرفر'] },
    { concept: 'api framework', kind: 'apiframework', en: ['fastapi', 'flask', 'express', 'expressjs', 'django', 'django rest', 'graphql', 'rest', 'restful', 'http', 'json', 'node', 'nodejs', 'koa', 'nestjs', 'nest', 'spring boot', 'laravel', 'rails'], ar: ['فلاسك', 'اكسبرس', 'جانغو', 'جانجو', 'نود', 'ريست'] },
    { concept: 'web', kind: 'web', en: ['web', 'browser', 'online', 'frontend', 'front end'], ar: ['ويب', 'متصفح', 'الكتروني'] },
];

/**
 * The build verbs — imperatives, desire verbs, verbal nouns and the dialect
 * imperatives Joe's owner writes («أبي», «سوّي», «خلّ», «حط», «شيل») — in
 * folded spelling. A closed grammatical class, shared with the build gate so
 * the gate and the object reader agree on what a build verb is.
 */
export const BUILD_VERBS: readonly LexiconPair[] = [
    { concept: 'build', en: ['build', 'construct'], ar: ['ابن', 'ابني', 'ابنى', 'بن', 'بناء', 'شيد'] },
    { concept: 'create', en: ['create', 'generate', 'scaffold', 'set up', 'setup'], ar: ['انشي', 'انشئ', 'انشاء', 'اقم', 'سوي', 'سو', 'جهز'] },
    { concept: 'make', en: ['make', 'craft', 'produce'], ar: ['اعمل', 'اعملي', 'اصنع', 'عمل', 'خل'] },
    { concept: 'design', en: ['design'], ar: ['صمم', 'تصميم', 'اصمم'] },
    { concept: 'develop', en: ['develop', 'implement', 'code', 'program'], ar: ['طور', 'تطوير', 'برمج', 'نفذ'] },
    { concept: 'write', en: ['write'], ar: ['اكتب'] },
    { concept: 'want', en: ['want', 'need'], ar: ['اريد', 'ابغي', 'ابغا', 'ابي', 'بدي', 'ودي', 'عايز', 'عاوز', 'محتاج', 'احتاج', 'نبي'] },
    { concept: 'put or remove', en: ['add', 'remove'], ar: ['حط', 'شيل'] },
];

const FILLER = new Set(['me', 'us', 'a', 'an', 'the', 'my', 'our', 'please', 'one', 'new', 'simple', 'small', 'لي', 'لنا', 'جديد', 'جديده']);
const BOUNDARY = new Set([
    'for', 'about', 'that', 'which', 'where', 'who', 'whose', 'with', 'to', 'using', 'in', 'on', 'of', 'from', 'by', 'called',
    'named', 'titled', 'similar', 'like', 'so', 'and', 'or', 'as',
    'عن', 'في', 'فيه', 'فيها', 'مع', 'من', 'الي', 'علي', 'حيث', 'الذي', 'التي', 'اسمه', 'اسمها', 'عبر', 'حول', 'يسمي', 'تسمي',
    'شبيه', 'مثل', 'او', 'و',
]);

type Unit = { text: string; pair: ArtifactPair | null; n: number };

const PHRASES = new Map<string, ArtifactPair>();
for (const pair of ARTIFACT_LEXICON) for (const phrase of [...pair.en, ...pair.ar]) PHRASES.set(normalise(phrase), pair);
const MAX_WORDS = Math.max(...[...PHRASES.keys()].map(k => k.split(' ').length));
const VERBS = new Set<string>();
for (const pair of BUILD_VERBS) for (const verb of [...pair.en, ...pair.ar]) VERBS.add(normalise(verb));

/** An Arabic word as written, without the article and without a tanween alef («نظاماً» → «نظام»). */
function readings(token: string): string[] {
    const out = new Set([token]);
    const bare = token.replace(/^ال(?=\S{2,})/u, '');
    out.add(bare);
    for (const t of [token, bare]) if (/ا$/u.test(t) && t.length > 3) out.add(t.slice(0, -1));
    return [...out];
}

function lookup(tokens: string[]): ArtifactPair | null {
    const key = tokens.join(' ');
    if (PHRASES.has(key)) return PHRASES.get(key)!;
    if (tokens.length === 1) for (const r of readings(tokens[0])) if (PHRASES.has(r)) return PHRASES.get(r)!;
    return null;
}

/** Greedy longest-phrase segmentation of a clause into lexicon units. */
function units(tokens: string[]): Unit[] {
    const out: Unit[] = [];
    for (let i = 0; i < tokens.length;) {
        let hit: Unit | null = null;
        for (let n = Math.min(MAX_WORDS, tokens.length - i); n >= 1; n--) {
            const pair = lookup(tokens.slice(i, i + n));
            if (pair) { hit = { text: tokens.slice(i, i + n).join(' '), pair, n }; break; }
        }
        out.push(hit || { text: tokens[i], pair: null, n: 1 });
        i += hit ? hit.n : 1;
    }
    return out;
}

const ARABIC = /[ء-ي]/u;
/** «لعيادة», «باستخدام»: a preposition glued to a word that is not itself an artifact ends the object. */
const gluedPreposition = (u: Unit) => !u.pair && /^(?:لل|ل|ب|ك)\S{3,}/u.test(u.text);

function objectOf(tokens: string[]): Unit[] {
    const np: Unit[] = [];
    for (const u of units(tokens)) {
        if (!np.length && FILLER.has(u.text)) continue;
        if (np.length && (BOUNDARY.has(u.text) || gluedPreposition(u))) break;
        np.push(u);
    }
    return np;
}

/** Kinds a generic head may be narrowed to by its modifiers — within its own family only. */
const NARROWS: Record<string, ArtifactKind[]> = {
    page: ['bot', 'game', 'report'],
    app: ['bot', 'game', 'report', 'store', 'booking'],
    system: ['bot', 'game', 'report', 'store', 'booking'],
    // 'api' is deliberately absent everywhere: «a GitHub API dashboard», «an
    // API testing tool» are things ABOUT an API. Only an API head owns one.
    neutral: ['cli', 'bot', 'game', 'report'],
};
const SPECIFIC: readonly string[] = ['cli', 'api', 'report', 'game', 'bot', 'store', 'booking'];

function kindOfPhrase(np: Unit[]): { kind: ArtifactKind; presentation: boolean; head: string } | null {
    if (!np.length) return null;
    // Arabic puts the head first and its modifiers after (the construct state:
    // the next two units); English puts the head last.
    const arabic = ARABIC.test(np[0].text);
    const head = arabic ? np[0] : np[np.length - 1];
    if (!head.pair) return null;                          // an unknown head: do not guess
    const modifiers = (arabic ? np.slice(1, 3) : np.slice(0, -1).reverse()).map(u => u.pair).filter(Boolean) as ArtifactPair[];
    const presentation = [head.pair, ...modifiers].some(p => p.presentation === true);
    const family = head.pair.kind;
    if (SPECIFIC.includes(family)) return { kind: family as ArtifactKind, presentation: false, head: head.text };
    if (family === 'web' || family === 'apiframework') return null;
    if (family === 'service') {
        return modifiers.some(p => p.kind === 'api' || p.kind === 'apiframework')
            ? { kind: 'api', presentation: false, head: head.text }
            : null;
    }
    const allowed = NARROWS[family] || [];
    const webModifier = modifiers.some(p => p.kind === 'web');
    const narrowed = modifiers.map(p => p.kind).find(k => allowed.includes(k as ArtifactKind) && !(k === 'cli' && webModifier)) as ArtifactKind | undefined;
    if (family === 'neutral') {
        if (narrowed) return { kind: narrowed, presentation: false, head: head.text };
        return webModifier ? { kind: 'app', presentation: false, head: head.text } : null;
    }
    return { kind: narrowed || (family as ArtifactKind), presentation: !narrowed && presentation, head: head.text };
}

const INJECTED_BLOCK = /\n+\[(STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|ATTACHED FILES|RESPONSE LANGUAGE)[\s\S]*$/i;
const CLAUSES = /[:：،,;؛!?\n()«»"]+|\.(?=\s|$)/u;

/**
 * A negation silences the words it governs: «بدون قاعدة بيانات», «no website».
 * JS `\b` is ASCII-oriented and therefore unsafe for Arabic: the marker must be
 * outside every Unicode word on the left and followed by whitespace or the end.
 */
export function maskNegatedSpans(text: string): string {
    const blank = (span: string) => span.replace(/[^\r\n]/gu, ' ');
    return String(text || '')
        .replace(/(?<![\p{L}\p{N}_-])(?:not|no|never|without|ليس|ليست|لا|بدون|غير)(?=\s|$)(?:(?:\s+)[\p{L}\p{N}_-]+){0,8}/giu, blank)
        // «I don't want a web app, I need a CLI» — only a contraction that
        // negates wanting or making something: «don't forget to add login»
        // keeps its claim (eval round 19).
        .replace(/(?<![\p{L}\p{N}_-])(?:(?:do|does|did|should|would|could|must)n['’]?t|won['’]?t|can['’]?t)\s+(?:want|need|build|create|make|use|add|write|include)(?:\s+[\p{L}\p{N}_.-]+){0,6}/giu, blank)
        // «… instead of a website», «بدلاً من موقع»: the thing replaced is not the deliverable.
        .replace(/(?<![\p{L}\p{N}_-])(?:instead\s+of|rather\s+than|بدلا\s+من|بدلاً\s+من|بدل\s+من|بدلا\s+عن|عوضا\s+عن|عوضاً\s+عن)(?:\s+[\p{L}\p{N}_.-]+){1,5}/giu, blank);
}

/** «don't need a backend», «do not build a project-owned server», «من غير خادم». */
const NEGATED_BACKEND = /\b(?:no|without|not|(?:do\s+not|don'?t|never)\s+(?:build|create|implement|need|add|use|write))\s+(?:(?:a|an|any)\s+)?(?:(?:project[- ]owned|own|separate|custom)\s+)?(?:back[- ]?end|server|api\s+server)\b|(?:بدون|دون|بلا|من\s+غير)\s+(?:أي\s+)?(?:خادم|سيرفر|واجهة\s+خلفية|باك\s*اند)/giu;
/** «if authentication is needed, use local/demo persistence» is a fallback, not a claim. */
const CONDITIONAL_DEMO_AUTH = /\bif\s+authentication\s+is\s+needed\b[^.!?\n]{0,160}\b(?:local|demo)\b[^.!?\n]{0,80}\bpersistence\b[^.!?\n]*/gi;

/** What the request CLAIMS that only a server can keep. Each concept in both scripts. */
export const SERVER_CLAIMS: readonly LexiconPair[] = [
    { concept: 'sign-in', en: ['sign in', 'signin', 'log in', 'login', 'authentication', 'auth', 'register an account', 'user registration'], ar: ['تسجيل دخول', 'تسجيل الدخول', 'دخول المستخدمين'] },
    { concept: 'accounts', en: ['user accounts', 'accounts', 'user account'], ar: ['حسابات', 'حساب مستخدم', 'حسابات المستخدمين'] },
    { concept: 'roles', en: ['roles', 'user roles', 'permissions', 'rbac', 'role based access'], ar: ['صلاحيات', 'ادوار المستخدمين', 'ادوار'] },
    { concept: 'database', en: ['database', 'databases', 'sqlite', 'postgres', 'postgresql', 'mysql', 'mariadb', 'mongodb', 'mongo db'], ar: ['قاعده بيانات', 'قاعده البيانات', 'قواعد بيانات', 'بوستجرس', 'ماي اس كيو ال', 'مونجو دي بي', 'مونغو دي بي'] },
    // A server named through its framework or as its own: «a Node.js server»,
    // «an Express backend», «its own server» (eval round 19: the English twin
    // of «مع خادم Node.js» owned no server, and its planned API was removed).
    {
        concept: 'backend',
        en: ['backend', 'back end', 'server side', 'api server', 'web server', 'http server', 'rest server', 'full stack', 'fullstack',
            'node server', 'node.js server', 'nodejs server', 'node backend', 'node.js backend', 'nodejs backend', 'node api',
            'express server', 'express backend', 'express api', 'flask server', 'flask backend', 'flask api', 'django server', 'django backend',
            'fastapi server', 'fastapi backend', 'koa server', 'nestjs server', 'go server', 'golang server', 'python server', 'python backend',
            'own server', 'its own server', 'a dedicated server', 'with a server'],
        ar: ['خادم', 'سيرفر', 'واجهه خلفيه', 'باك اند', 'باكند'],
    },
    // Taking money needs a server that holds the processor's secret: a card
    // flow cannot live in the browser. Recording payments one made is a record,
    // so only processing phrases count.
    { concept: 'payments', en: ['online payments', 'payment processing', 'payment gateway', 'accept payments', 'take payments', 'card payments', 'pay online', 'stripe', 'paypal'], ar: ['دفع الكتروني', 'الدفع الالكتروني', 'بوابه دفع', 'بوابه الدفع', 'الدفع بالبطاقه', 'مدفوعات الكترونيه'] },
];
/**
 * A register records sales from several terminals into one ledger — a claim
 * only when the point of sale IS the deliverable («a POS system for my cafe»).
 * Suppliers, vendors and invoices are records like patients or students: a
 * single operator managing them owns no server (eval round 19: identical
 * dashboards split into app and system by their domain noun).
 */
const POINT_OF_SALE: LexiconPair = { concept: 'point of sale', en: ['pos', 'point of sale'], ar: ['نقاط بيع', 'نقطه بيع', 'كاشير'] };

/** A party that operates the system reads what another party wrote. */
export const OPERATOR_READS: readonly LexiconPair[] = [
    { concept: 'operator', en: ['owner', 'owners', 'admin', 'admins', 'administrator', 'manager', 'managers', 'staff', 'employee', 'employees'], ar: ['صاحب', 'المالك', 'المدير', 'الاداره', 'الموظف', 'الموظفين', 'موظف'] },
    { concept: 'reads', en: ['sees', 'see', 'views', 'view', 'reviews', 'approves', 'receives', 'gets', 'manages', 'tracks'], ar: ['يشوف', 'يري', 'يشاهد', 'يستلم', 'يتابع', 'يدير', 'يراجع', 'تصله'] },
    { concept: 'another party', en: ['customer', 'customers', 'client', 'clients', 'visitor', 'visitors', 'guest', 'guests', 'user', 'users', 'member', 'members', 'patient', 'patients', 'student', 'students', 'buyer', 'buyers', 'traveler', 'travelers'], ar: ['الزبون', 'الزبائن', 'زبون', 'زبائن', 'العميل', 'العملاء', 'الزوار', 'الزائر', 'المستخدم', 'المستخدمين', 'الاعضاء', 'المريض', 'المرضي', 'الطلاب', 'المشتري', 'المسافر'] },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** One phrase list as a regex over FOLDED text: English on ASCII boundaries, Arabic with a glued «و/ف/ب/ل» and «ال» allowed. */
function phraseRegex(pairs: readonly LexiconPair[], flags = 'u'): RegExp {
    const en = pairs.flatMap(p => p.en).map(p => escapeRe(normalise(p)).replace(/ /g, '[\\s-]+'));
    const ar = pairs.flatMap(p => p.ar).map(p => escapeRe(normalise(p)).replace(/ /g, '\\s+'));
    return new RegExp(`\\b(?:${en.join('|')})\\b|(?<![\\p{L}\\p{N}_])(?:[وفبل]?(?:ال|لل)?)(?:${ar.join('|')})(?![\\p{L}\\p{N}_])`, flags);
}
const CLAIM_RES = SERVER_CLAIMS.map(pair => ({ concept: pair.concept, re: phraseRegex([pair]) }));
const POINT_OF_SALE_RE = phraseRegex([POINT_OF_SALE]);
const OPERATOR_RE = phraseRegex([OPERATOR_READS[0]]);
const READS_RE = phraseRegex([OPERATOR_READS[1]]);
const OTHER_PARTY_RE = phraseRegex([OPERATOR_READS[2]]);
/** «each staff member only sees their own records», «وكل موظف يرى سجلاته فقط». */
const OWN_RECORDS_EN = /\beach\s+(?:[a-z]+\s+){0,2}(?:only\s+)?(?:sees?|views?|has|gets|can\s+see|accesses)\s+(?:only\s+)?(?:their|his|her)\s+own\b/u;
const OWN_RECORDS_AR = /(?<![\p{L}\p{N}_])و?كل\s+\S+(?:\s+\S+)?\s+(?:يري|يشوف|يشاهد|يدير)\s+\S+(?:\s+\S+)?\s+فقط/u;
/** «users message each other», «يتواصل المستخدمون فيما بينهم». */
const BETWEEN_PARTIES = /\b(?:message|chat\s+with|follow|comment\s+on|rate)\s+each\s+other\b|\bbetween\s+users\b|فيما\s+بينهم|مع\s+بعضهم|\bmulti[\s-]?(?:vendor|seller|merchant)s?\b|\bmultiple\s+(?:vendors|sellers|merchants)\b|متعدد\s+(?:البايعين|البائعين|التجار)|عده\s+(?:بايعين|بائعين|تجار)/u;

/**
 * A declared category list is field OPTIONS, not a claim: «تطبيق مصاريف
 * بفئات: طعام، مواصلات، فواتير» names a category called «فواتير», not an
 * invoicing system. (Moved here from app-blueprints, which re-exports it.)
 */
export function stripDeclaredOptions(requestRaw: string): string {
    const r = String(requestRaw || '');
    return r
        .replace(/(?:ب|وال|ال)?(?:فئات|تصنيفات|أقسام|اقسام|categories|types)\s*(?:هي|are)?\s*[:：]\s*[^.\n؟?!]{2,160}/gi, ' ')
        .replace(/(?:بفئات|بتصنيفات|بأقسام|باقسام|with\s+categories)\s+[^.\n؟?!:،]{2,160}(?:،[^.\n؟?!]{0,120})?/gi, ' ')
        // Preserve newlines: block schema declarations use them as boundaries.
        // Tidy within lines only. Collapsing every run of whitespace would
        // flatten structured schema declarations; line structure is data.
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function serverClaims(request: string, kind: ArtifactKind | null, object = ''): string[] {
    const masked = maskNegatedSpans(stripDeclaredOptions(String(request || '').replace(INJECTED_BLOCK, '')))
        .replace(NEGATED_BACKEND, ' ')
        .replace(CONDITIONAL_DEMO_AUTH, ' ');
    const text = normalise(masked);
    const claims: string[] = [];
    for (const { concept, re } of CLAIM_RES) {
        const m = text.match(re);
        if (m) claims.push(`${concept}: ${m[0].trim()}`);
    }
    // One party writes and another reads: the operator reads within three
    // words of being named, and someone else is in the request too.
    for (const clause of text.split(CLAUSES)) {
        const op = clause.match(OPERATOR_RE);
        if (!op || op.index === undefined) continue;
        const after = clause.slice(op.index + op[0].length).trim().split(/\s+/).slice(0, 4).join(' ');
        if (READS_RE.test(after) && OTHER_PARTY_RE.test(text)) { claims.push(`shared: ${op[0].trim()} ${after}`); break; }
    }
    if (object && POINT_OF_SALE_RE.test(normalise(object))) claims.push('point of sale');
    if (OWN_RECORDS_EN.test(text) || OWN_RECORDS_AR.test(text)) claims.push('per-user records');
    if (BETWEEN_PARTIES.test(text)) claims.push('between parties');
    if (kind === 'api') claims.push('owned api');
    return claims;
}

export interface RequestedArtifact {
    kind: ArtifactKind | null;
    needsServer: boolean;
    /**
     * Something people look at was asked for: the deliverable itself is a
     * page or an application, or an interface is named beside it («plus a
     * React dashboard», «مع لوحة تحكم»). An interface word inside a purpose
     * phrase — «for a news website», «لـموقع أخبار», «pages from a website» —
     * is the subject, not a deliverable.
     */
    interfaceNamed: boolean;
    evidence: {
        verb: string;
        object: string;
        head: string;
        /** A document that presents (landing, portfolio, «تعريفي»): never promoted to an application by a field list. */
        presentation: boolean;
        serverClaims: string[];
    };
}

/**
 * «a Flask app that exposes a REST API», «تطبيق يوفر واجهة برمجية»: the app is
 * the API's host, and what is delivered is the API. «an API dashboard», «an API
 * client» are things about an API and stay apps.
 */
const EXPOSES_API = /\b(?:that|which|to)\s+(?:exposes?|serves?|provides?|offers?|publish(?:es)?)\s+(?:(?:a|an|its|the)\s+)?(?:(?:rest(?:ful)?|graphql|json|http|web)\s+)?api\b(?!\s+(?:dashboard|client|explorer|tester|testing|docs|keys?|playground))|(?<![\p{L}\p{N}_])(?:يوفر|يقدم|يتيح|توفر|تقدم|تتيح)\s+(?:واجهه\s+برمجيه|api)(?![\p{L}\p{N}_])/u;

function readObject(request: string): { kind: ArtifactKind | null; presentation: boolean; head: string; object: string; verb: string } {
    const read = readVerbObject(request);
    if ((read.kind === 'app' || read.kind === 'system') && EXPOSES_API.test(normalise(maskNegatedSpans(String(request || '').replace(INJECTED_BLOCK, ''))))) {
        return { ...read, kind: 'api', presentation: false };
    }
    return read;
}

function readVerbObject(request: string): { kind: ArtifactKind | null; presentation: boolean; head: string; object: string; verb: string } {
    const clauses = maskNegatedSpans(String(request || '').replace(INJECTED_BLOCK, '')).split(CLAUSES).filter(c => c && c.trim());
    const tried: string[] = [];
    for (const clause of clauses) {
        const tokens = words(clause);
        for (let i = 0; i < tokens.length; i++) {
            if (!VERBS.has(tokens[i])) continue;
            const np = objectOf(tokens.slice(i + 1));
            const k = kindOfPhrase(np);
            tried.push(np.map(u => u.text).join(' '));
            if (k) return { ...k, object: np.map(u => u.text).join(' '), verb: tokens[i] };
        }
    }
    // No build verb at all («نظام فواتير للمحل مع تقارير»): the opening noun phrase.
    const first = words(clauses[0] || '');
    if (!first.some(t => VERBS.has(t))) {
        const np = objectOf(first);
        const k = kindOfPhrase(np);
        if (k) return { ...k, object: np.map(u => u.text).join(' '), verb: '' };
    }
    return { kind: null, presentation: false, head: '', object: tried.join(' | '), verb: '' };
}

const INTERFACE_KINDS: ReadonlySet<string> = new Set(['page', 'app', 'system', 'store', 'booking', 'game', 'bot', 'report']);
/** An interface named as a deliverable beside the object (folded text). */
const COORDINATED_INTERFACE_EN = /\b(?:plus|and|with|along\s+with|together\s+with|as\s+well\s+as|including|alongside)\s+(?:(?:a|an|the|its|their|our|my|some)\s+)?(?:[\w.+#-]+\s+){0,2}?(?:front[\s-]?end|ui|gui|user\s+interface|web\s+(?:ui|interface|app|application|page|pages|client|frontend|site)|website|dashboard|admin\s+(?:panel|dashboard|page|pages|area)|control\s+panel|interface|(?:react|vue|angular|svelte|next(?:\.js)?|nuxt)\s+(?:app|application|ui|frontend|front[\s-]?end|client|site|dashboard|interface)|(?:mobile|client|web|desktop)\s+app)\b/u;
const COORDINATED_INTERFACE_AR = /(?<![\p{L}\p{N}_])(?:مع\s+|و\s*|وكذلك\s+|وايضا\s+|بالاضافه\s+الي\s+|اضافه\s+الي\s+)(?:\S+\s+)?(?:واجهه\s+(?:مستخدم|المستخدم|اماميه|الاماميه|رسوميه|ويب|الويب|react|vue|رياكت|ريأكت)|لوحه\s+(?:تحكم|التحكم|اداره|الاداره)|تطبيق\s+ويب|موقع(?:\s+ويب)?|صفحه\s+ويب|صفحات\s+ويب|داشبورد|فرونت\s*اند)(?![\p{L}\p{N}_])/u;
/** A subject phrase: «for a news website», «لـموقع أخبار», «من موقع». Masked before interface words are read. */
const PURPOSE_PHRASE_EN = /\b(?:for|of|from|about|on|into|by|to)\s+(?:(?:a|an|the|my|our|their|his|her|its|some|any|each|every)\s+)?(?:[\w.+#-]+\s+){0,2}?(?:website|web\s*site|site|web\s*pages?|pages?|apps?|applications?|dashboards?|platforms?|portals?|stores?|shops?)\b/gu;
const PURPOSE_PHRASE_AR = /(?<![\p{L}\p{N}_])(?:(?:لل|ل|ب)(?:ال)?|(?:عن|في|من|علي|الي)\s+(?:ال)?)(?:موقع|مواقع|صفحه|صفحات|تطبيق|تطبيقات|منصه|متجر)\S*/gu;
const INTERFACE_WORD_EN = /\b(?:front[\s-]?end|ui|gui|user\s+interface|web\s+(?:app|application|page|site|interface|ui)|website|dashboard|admin\s+panel|screens?|buttons?|charts?|forms?)\b/u;
const INTERFACE_WORD_AR = /(?<![\p{L}\p{N}_])[وف]?(?:ال)?(?:واجهه\s+(?:مستخدم|المستخدم|اماميه|رسوميه)|لوحه\s+(?:تحكم|اداره)|تطبيق\s+ويب|موقع|صفحه|شاشه|شاشات|ازرار|زر|رسوم\s+بيانيه|رسم\s+بياني|نموذج)(?![\p{L}\p{N}_])/u;

function namesAnInterface(request: string, kind: ArtifactKind | null): boolean {
    if (kind && INTERFACE_KINDS.has(kind)) return true;
    const text = normalise(maskNegatedSpans(String(request || '').replace(INJECTED_BLOCK, '')));
    if (COORDINATED_INTERFACE_EN.test(text) || COORDINATED_INTERFACE_AR.test(text)) return true;
    if (kind) return false;                               // an API or a CLI: only a coordinated interface counts
    // No object the lexicon knows: an interface word outside every subject phrase.
    const unpurposed = text.replace(PURPOSE_PHRASE_EN, ' ').replace(PURPOSE_PHRASE_AR, ' ');
    return INTERFACE_WORD_EN.test(unpurposed) || INTERFACE_WORD_AR.test(unpurposed);
}

/** What the request asks to be delivered, and whether it claims anything only a server can keep. */
export function requestedArtifact(request: string): RequestedArtifact {
    const read = readObject(request);
    const claims = serverClaims(request, read.kind, read.object);
    return {
        kind: read.kind,
        needsServer: claims.length > 0,
        interfaceNamed: namesAnInterface(request, read.kind),
        evidence: { verb: read.verb, object: read.object, head: read.head, presentation: read.presentation, serverClaims: claims },
    };
}

/** Does this text contain a build verb of the shared class (any script, folded)? */
export function hasBuildVerb(text: string): boolean {
    return words(text).some(t => VERBS.has(t));
}

/**
 * A purpose of managing records — «لإدارة مكتبة», «لمتابعة المهام», «to manage
 * tasks», «for tracking orders». Behaviour, not a head noun: it promotes a
 * page head to an application after the object has been read.
 */
const MANAGE_PURPOSE = /\b(?:to|for)\s+(?:manag(?:e|ing)|track(?:ing)?|organi[sz](?:e|ing)|record(?:ing)?|administer(?:ing)?)\b|\bmanagement\s+of\b|(?<![\p{L}\p{N}_])(?:لل|ل)(?:اداره|متابعه|تتبع|تنظيم)(?![\p{L}\p{N}_])/u;
export function statesManagingPurpose(request: string): boolean {
    return MANAGE_PURPOSE.test(normalise(maskNegatedSpans(request)));
}

/**
 * THE FALLBACK FOR AN OBJECT THE LEXICON DOES NOT KNOW («something I can run
 * from the command line», «a file that takes a CSV»). When the object names a
 * kind, the kind decides and these are never consulted: «a web app that
 * imports a CSV file» is an app, not a CLI. Both languages, one source — these
 * were private English-only copies in three files (eval round 15, P301).
 */
const COMMAND_LINE_EN = /\b(?:cli|command[- ]?line|script|utility\s+script|command[- ]?line\s+tool|console\s+app|terminal\s+app|standalone\s+(?:tool|script|utility)|runnable\s+(?:script|tool|utility)|exit\s+code|stdin|stdout|stderr|argument\s+parsing|flag\s+parsing)\b/iu;
// سطر الأوامر / الطرفية / كونسول / سكربت (never the «سكريبت» of «جافا سكريبت») / نص برمجي / رمز الخروج
const COMMAND_LINE_AR = /(?<![\p{L}\p{N}_])(?:[وفب]?(?:ال)?)(?:سطر\s+(?:ال)?[أا]وامر|طرفي[ةه]|تيرمينال|كونسول|(?<!(?:جافا|تايب)\s*)سكر[يِ]?بت|(?:نص|برنامج)\s+(?:برمجي|نصي)|رمز\s+(?:ال)?خروج)(?![\p{L}\p{N}_])/u;

const CSV_INPUT_EN = /\b(?:csv|tsv)\b.*\b(?:column|field|header)\b|\bcolumn\b.*\b(?:csv|tsv)\b|(?:\binput\b|\bfile\b).*\b(?:csv|tsv)\b|\b(?:csv|tsv)\b.*\b(?:input|file)\b/iu;
// «ملف CSV» / «مدخلات CSV» / «CSV … أعمدة»
const CSV_INPUT_AR = /(?:ملف|مدخلات|إدخال|ادخال)[^.؟!\n]{0,40}\b(?:csv|tsv)\b|\b(?:csv|tsv)\b[^.؟!\n]{0,80}(?:ملف|عمود|أعمدة|اعمدة|حقل|حقول|ترويس[ةه])/iu;

/** Fallback only: the text mentions a command-line program anywhere. */
export function mentionsCommandLine(text: string): boolean {
    const t = String(text || '');
    return COMMAND_LINE_EN.test(t) || COMMAND_LINE_AR.test(t);
}

/** Fallback only: CSV/TSV input with columns is input data, not a persistent record schema. */
export function readsCsvInput(text: string): boolean {
    const t = String(text || '');
    return CSV_INPUT_EN.test(t) || CSV_INPUT_AR.test(t);
}

const ARABIC_VERBS = new Set(BUILD_VERBS.flatMap(pair => pair.ar).map(verb => normalise(verb)));
/** An Arabic build verb of the shared class, as a whole word (folded spelling, dialects included). */
export function hasArabicBuildVerb(text: string): boolean {
    return words(text).some(t => ARABIC_VERBS.has(t));
}

/** «بناء», «تصميم»: a verbal noun names a topic — «هل تصميم موقع جديد مكلف؟» orders nothing. */
const VERBAL_NOUNS = new Set(['بناء', 'انشاء', 'تصميم', 'تطوير', 'عمل'].map(w => normalise(w)));
/** An Arabic build ORDER: an imperative or a desire verb of the shared class, never a verbal noun. */
export function hasArabicOrderVerb(text: string): boolean {
    return words(text).some(t => ARABIC_VERBS.has(t) && !VERBAL_NOUNS.has(t));
}
