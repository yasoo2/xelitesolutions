/**
 * Time-aware personal greetings for the chat welcome screen.
 *
 * The salute matches the actual time of day (dawn / morning / noon /
 * afternoon / evening / night) and rotates its phrasing with the day of
 * the year — so it genuinely differs day to day, deterministically
 * (no random flicker between re-renders).
 *
 * Joe runs on the user's own machine, so `new Date()` IS their local time.
 */

type Bucket = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';

export interface Greeting {
    salute: string;
    question: string;
}

function bucketOf(hour: number): Bucket {
    if (hour >= 4 && hour < 7) return 'dawn';
    if (hour >= 7 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 15) return 'noon';
    if (hour >= 15 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 23) return 'evening';
    return 'night';
}

// {n} is replaced by « يا فلان» / «, Name» — or removed when the name is unknown.
const AR: Record<Bucket, string[]> = {
    dawn: ['بواكير الخير{n}', 'صباح الفجر الهادئ{n}', 'استيقظتَ قبل الشمس{n}؟ همّة عالية'],
    morning: ['صباح الخير{n}', 'صباح النور{n}', 'أسعد الله صباحك{n}', 'يومٌ جديد وفكرة جديدة{n}'],
    noon: ['ظهيرة سعيدة{n}', 'أهلاً بك في منتصف اليوم{n}', 'نهارك موفق{n}'],
    afternoon: ['مساء الخير{n}', 'عصرية هادئة{n}', 'أهلاً بك{n}، عصرٌ يليق بالإنجاز'],
    evening: ['مساء الخير{n}', 'مساء النور{n}', 'أهلاً بك هذا المساء{n}', 'مساء الإبداع{n}'],
    night: ['سهرة موفقة{n}', 'أهلاً بساهر الليل{n}', 'الليل وقت الصنّاع{n}'],
};
const AR_Q: Record<Bucket, string[]> = {
    dawn: ['ما أول ما نبنيه اليوم؟', 'من أين نبدأ يومنا؟'],
    morning: ['ماذا نبني هذا الصباح؟', 'ما فكرتك الأولى اليوم؟', 'من أين نبدأ؟'],
    noon: ['ما الذي ننجزه الآن؟', 'ماذا نبني اليوم؟'],
    afternoon: ['ما الذي سنصنعه هذا العصر؟', 'ماذا ننجز قبل المغيب؟'],
    evening: ['ما الذي سنصنعه هذا المساء؟', 'ما فكرتك الليلة؟', 'ماذا نبني الآن؟'],
    night: ['ما الذي سنصنعه الليلة؟', 'فكرة تسهر معنا؟'],
};

const EN: Record<Bucket, string[]> = {
    dawn: ['Early bird{n}', 'Up before the sun{n}'],
    morning: ['Good morning{n}', 'Morning{n} — fresh day, fresh ideas'],
    noon: ['Good day{n}', 'Midday hello{n}'],
    afternoon: ['Good afternoon{n}', 'Hello{n}'],
    evening: ['Good evening{n}', 'Evening{n} — a maker\'s favorite hour'],
    night: ['Burning the midnight oil{n}', 'Late night{n}'],
};
const EN_Q: Record<Bucket, string[]> = {
    dawn: ['What shall we build first today?'],
    morning: ['What are we building this morning?', 'Where shall we start?'],
    noon: ['What shall we get done today?'],
    afternoon: ['What shall we make this afternoon?'],
    evening: ['What are we making tonight?', 'What\'s the idea this evening?'],
    night: ['What are we building tonight?'],
};

const FR: Record<Bucket, string[]> = {
    dawn: ['Levé avant le soleil{n}'], morning: ['Bonjour{n}'], noon: ['Bonjour{n}'],
    afternoon: ['Bon après-midi{n}'], evening: ['Bonsoir{n}'], night: ['Bonsoir, oiseau de nuit{n}'],
};
const FR_Q: Record<Bucket, string[]> = {
    dawn: ['On commence par quoi ?'], morning: ['Que construisons-nous ce matin ?'], noon: ['Que fait-on aujourd\'hui ?'],
    afternoon: ['Que crée-t-on cet après-midi ?'], evening: ['Que fabrique-t-on ce soir ?'], night: ['Que construit-on cette nuit ?'],
};

const DE: Record<Bucket, string[]> = {
    dawn: ['Früh auf den Beinen{n}'], morning: ['Guten Morgen{n}'], noon: ['Guten Tag{n}'],
    afternoon: ['Schönen Nachmittag{n}'], evening: ['Guten Abend{n}'], night: ['Nachtschicht{n}?'],
};
const DE_Q: Record<Bucket, string[]> = {
    dawn: ['Womit fangen wir an?'], morning: ['Was bauen wir heute Morgen?'], noon: ['Was schaffen wir heute?'],
    afternoon: ['Was bauen wir heute Nachmittag?'], evening: ['Was bauen wir heute Abend?'], night: ['Was bauen wir heute Nacht?'],
};

const RU: Record<Bucket, string[]> = {
    dawn: ['Раннее утро{n}'], morning: ['Доброе утро{n}'], noon: ['Добрый день{n}'],
    afternoon: ['Добрый день{n}'], evening: ['Добрый вечер{n}'], night: ['Не спится{n}?'],
};
const RU_Q: Record<Bucket, string[]> = {
    dawn: ['С чего начнём?'], morning: ['Что построим этим утром?'], noon: ['Что сделаем сегодня?'],
    afternoon: ['Что создадим сегодня днём?'], evening: ['Что построим этим вечером?'], night: ['Что построим этой ночью?'],
};

const ES: Record<Bucket, string[]> = {
    dawn: ['Madrugador{n}'], morning: ['Buenos días{n}'], noon: ['Buen día{n}'],
    afternoon: ['Buenas tardes{n}'], evening: ['Buenas noches{n}'], night: ['Noche de creador{n}'],
};
const ES_Q: Record<Bucket, string[]> = {
    dawn: ['¿Por dónde empezamos?'], morning: ['¿Qué construimos esta mañana?'], noon: ['¿Qué hacemos hoy?'],
    afternoon: ['¿Qué creamos esta tarde?'], evening: ['¿Qué construimos esta noche?'], night: ['¿Qué construimos esta noche?'],
};

const TABLES: Record<string, [Record<Bucket, string[]>, Record<Bucket, string[]>]> = {
    ar: [AR, AR_Q], en: [EN, EN_Q], fr: [FR, FR_Q], de: [DE, DE_Q], ru: [RU, RU_Q], es: [ES, ES_Q],
};

/** Placeholder identities («User», «anonymous») must never be used as a name. */
export function usableName(raw?: string): string {
    const name = String(raw || '').trim();
    if (!name || /^(user|admin|anonymous|unknown|مستخدم)$/i.test(name)) return '';
    // First name only — a greeting says «يا يونس», not the full legal name.
    return name.split(/\s+/)[0];
}

export function composeGreeting(lang: string, rawName?: string, now: Date = new Date()): Greeting {
    const base = String(lang || 'en').split('-')[0];
    const [salutes, questions] = TABLES[base] || TABLES.en;
    const bucket = bucketOf(now.getHours());
    const day = Math.floor(now.getTime() / 86_400_000);
    const pick = <T,>(arr: T[]): T => arr[day % arr.length];

    const name = usableName(rawName);
    const joiner = base === 'ar' ? ` يا ${name}` : name ? `, ${name}` : '';
    const salute = pick(salutes[bucket]).replace('{n}', name ? joiner : '');
    const question = pick(questions[bucket]);
    return { salute, question };
}
