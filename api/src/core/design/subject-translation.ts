/**
 * Arabic image subjects, translated into the language the archives speak.
 *
 * The model writing an Arabic page asks for Arabic subjects — «مطور برمجيات
 * يعمل على حلول تكنولوجية» — and every archive Joe queries (Openverse,
 * Wikimedia Commons, Pexels, Unsplash) titles and tags its photographs in
 * English. The relevance gate then compares Arabic query words against
 * English evidence: zero matches, guaranteed, for every candidate. So every
 * Arabic build shipped gradients where photographs belonged — not because the
 * archives were empty, but because the question was asked in a language the
 * catalogue does not index. Measured on the user's machine: a whole site,
 * zero real photos.
 *
 * The fix is a DICTIONARY, not a model call: deterministic, instant, and it
 * works when every LLM provider is dead — which is exactly when the fallback
 * path that needs it most tends to run. Coverage is the vocabulary of the
 * sites Joe actually builds (business, tech, food, medical, trades); a word
 * outside it simply contributes nothing, and a subject with no mapped words
 * falls back to the original text so Commons' own Arabic search still gets
 * its chance.
 *
 * The translation feeds the SEARCH and the RELEVANCE GATE only. The alt text
 * the visitor's screen reader hears stays in the page's own language.
 */

/** Normalize an Arabic token the same way the dictionary keys are written:
 *  hamza forms to bare alif, ta marbuta to ha, alif maqsura to ya, no tatweel
 *  or diacritics. Proclitics are NOT stripped here — «برمجيات» starts with a
 *  ب that belongs to the ROOT, and stripping it blindly turned the word into
 *  nonsense. The lookup strips a prefix only when doing so lands on a word
 *  the dictionary actually knows. */
function normalizeArabic(raw: string): string {
    return String(raw || '')
        .replace(/[ً-ْٰـ]/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/[^؀-ۿ]/g, '');
}

/** Prefixes tried ONLY when the exact form is unknown — longest first, and a
 *  strip counts only if it produces a dictionary word. */
const PREFIXES = ['وال', 'بال', 'كال', 'فال', 'لل', 'ال', 'و', 'ف', 'ب', 'ك', 'ل'];

/** Suffixes tried (one at a time) when the exact form is not in the dictionary. */
const SUFFIXES = ['يات', 'ات', 'ون', 'ين', 'ان', 'ها', 'هم', 'كم', 'نا', 'تي', 'ه', 'ي'];

/** Keys are ALREADY normalized (ا not أ, ه not ة, ي not ى, no article). */
const AR_EN: Record<string, string> = {
    // ---- tech ----
    'مطور': 'developer', 'مبرمج': 'programmer', 'برمجه': 'programming', 'برمجي': 'software',
    'برمجيات': 'software', 'برنامج': 'software', 'كود': 'code', 'اكواد': 'code',
    'حاسوب': 'computer', 'كمبيوتر': 'computer', 'لابتوب': 'laptop', 'محمول': 'laptop',
    'شاشه': 'screen', 'لوحه': 'board', 'مفاتيح': 'keyboard', 'تقنيه': 'technology',
    'تقني': 'technology', 'تكنولوجيا': 'technology', 'تكنولوجي': 'technology', 'تكنولوجيه': 'technology',
    'رقمي': 'digital', 'رقميه': 'digital', 'انترنت': 'internet', 'شبكه': 'network',
    'خادم': 'server', 'خوادم': 'servers', 'بيانات': 'data', 'ذكاء': 'intelligence',
    'اصطناعي': 'artificial', 'روبوت': 'robot', 'تطبيق': 'app', 'موقع': 'website',
    'ويب': 'web', 'سحابه': 'cloud', 'سيرفر': 'server', 'قاعده': 'database',
    'امن': 'security', 'سيبراني': 'cyber', 'اختراق': 'hacking', 'تشفير': 'encryption',
    // ---- business ----
    'شركه': 'company', 'شركات': 'companies', 'مكتب': 'office', 'مكاتب': 'offices',
    'اجتماع': 'meeting', 'فريق': 'team', 'عمل': 'work', 'اعمال': 'business',
    'استشار': 'consulting', 'استشارات': 'consulting', 'استشاري': 'consultant', 'مستشار': 'consultant',
    'اداره': 'management', 'اداري': 'management', 'مدير': 'manager', 'موظف': 'employee',
    'موظفين': 'employees', 'توظيف': 'recruitment', 'مقابله': 'interview', 'سيره': 'resume',
    'عرض': 'presentation', 'تقديمي': 'presentation', 'نجاح': 'success', 'نمو': 'growth',
    'تخطيط': 'planning', 'خطه': 'plan', 'استراتيجيه': 'strategy', 'مشروع': 'project',
    'مشاريع': 'projects', 'رياده': 'entrepreneurship', 'ناشئه': 'startup', 'شراكه': 'partnership',
    'مصافحه': 'handshake', 'عقد': 'contract', 'توقيع': 'signing', 'تسويق': 'marketing',
    'اعلان': 'advertising', 'مبيعات': 'sales', 'محاسبه': 'accounting', 'ماليه': 'finance',
    'مال': 'money', 'بنك': 'bank', 'استثمار': 'investment', 'اقتصاد': 'economy',
    'تدريب': 'training', 'ورشه': 'workshop', 'مؤتمر': 'conference', 'ندوه': 'seminar',
    'خدمه': 'service', 'خدمات': 'services', 'خدماتي': 'services', 'دعم': 'support',
    'جوده': 'quality', 'عميل': 'client', 'عملاء': 'clients', 'زبون': 'customer',
    // ---- people & roles ----
    'رجل': 'man', 'امراه': 'woman', 'شخص': 'person', 'ناس': 'people', 'اشخاص': 'people',
    'مهندس': 'engineer', 'هندسه': 'engineering', 'طبيب': 'doctor', 'طبيبه': 'doctor',
    'ممرض': 'nurse', 'ممرضه': 'nurse', 'معلم': 'teacher', 'استاذ': 'professor',
    'طالب': 'student', 'طلاب': 'students', 'طاهي': 'chef', 'شيف': 'chef', 'طباخ': 'cook',
    'مصور': 'photographer', 'محامي': 'lawyer', 'قاضي': 'judge', 'مزارع': 'farmer',
    'عامل': 'worker', 'عمال': 'workers', 'فني': 'technician', 'حرفي': 'craftsman',
    'مصمم': 'designer', 'رسام': 'artist', 'كاتب': 'writer', 'صحفي': 'journalist',
    // ---- places ----
    'مستشفي': 'hospital', 'عياده': 'clinic', 'صيدليه': 'pharmacy', 'مختبر': 'laboratory',
    'مطعم': 'restaurant', 'مقهي': 'cafe', 'كافيه': 'cafe', 'فندق': 'hotel',
    'متجر': 'store', 'محل': 'shop', 'سوق': 'market', 'مول': 'mall',
    'مصنع': 'factory', 'مستودع': 'warehouse', 'مزرعه': 'farm', 'حقل': 'field',
    'مدرسه': 'school', 'جامعه': 'university', 'مكتبه': 'library', 'صاله': 'hall',
    'مدينه': 'city', 'قريه': 'village', 'شارع': 'street', 'مبني': 'building',
    'برج': 'tower', 'جسر': 'bridge', 'مطار': 'airport', 'ميناء': 'port',
    'حديقه': 'garden', 'شاطئ': 'beach', 'صحراء': 'desert', 'غابه': 'forest',
    'جبل': 'mountain', 'بحر': 'sea', 'نهر': 'river', 'مسجد': 'mosque',
    // ---- food ----
    'طعام': 'food', 'اكل': 'food', 'وجبه': 'meal', 'فطور': 'breakfast',
    'غداء': 'lunch', 'عشاء': 'dinner', 'قهوه': 'coffee', 'شاي': 'tea',
    'عصير': 'juice', 'حلويات': 'desserts', 'كيك': 'cake', 'خبز': 'bread',
    'بيتزا': 'pizza', 'برغر': 'burger', 'برجر': 'burger', 'شاورما': 'shawarma',
    'سلطه': 'salad', 'مشويات': 'grilled', 'مأكولات': 'cuisine', 'بحريه': 'seafood',
    'مطبخ': 'kitchen', 'طبخ': 'cooking', 'قائمه': 'menu', 'طبق': 'dish',
    // ---- objects & actions ----
    'سياره': 'car', 'سيارات': 'cars', 'شاحنه': 'truck', 'دراجه': 'bicycle',
    'هاتف': 'phone', 'جوال': 'phone', 'موبايل': 'phone', 'كاميرا': 'camera',
    'كتاب': 'book', 'كتب': 'books', 'قلم': 'pen', 'ورق': 'paper',
    'ادوات': 'tools', 'اله': 'machine', 'الات': 'machinery', 'معدات': 'equipment',
    'يعمل': 'working', 'تعمل': 'working', 'يكتب': 'writing', 'يقرا': 'reading',
    'يجلس': 'sitting', 'يقف': 'standing', 'يبتسم': 'smiling', 'يتحدث': 'talking',
    'يستخدم': 'using', 'يحمل': 'holding', 'يطبخ': 'cooking', 'يرسم': 'drawing',
    'تصميم': 'design', 'رسم': 'drawing', 'بناء': 'construction', 'انشاءات': 'construction',
    'حلول': 'solutions', 'حل': 'solution', 'نظام': 'system', 'انظمه': 'systems',
    'مشاكل': 'problems', 'صعوبات': 'challenges', 'اختبار': 'testing', 'تحليل': 'analysis',
    // ---- sectors ----
    'صحه': 'health', 'صحي': 'health', 'طب': 'medicine', 'طبي': 'medical',
    'اسنان': 'dental', 'عيون': 'eye', 'قلب': 'heart', 'دواء': 'medicine',
    'رياضه': 'sports', 'لياقه': 'fitness', 'جيم': 'gym', 'تمرين': 'exercise',
    'سفر': 'travel', 'سياحه': 'tourism', 'رحله': 'trip', 'طبيعه': 'nature',
    'تعليم': 'education', 'تعليمي': 'education', 'دراسه': 'study', 'شهاده': 'certificate',
    'زراعه': 'agriculture', 'نبات': 'plants', 'زهور': 'flowers', 'اشجار': 'trees',
    'طاقه': 'energy', 'كهرباء': 'electricity', 'شمسيه': 'solar', 'بيئه': 'environment',
    'نقل': 'transport', 'شحن': 'shipping', 'لوجستيات': 'logistics', 'توصيل': 'delivery',
    // The business nouns an eleven-domain freight brief is made of. Measured:
    // each of these used to fall through to transliteration and reach him as
    // an invented English word — «الحاويات» as `hawyats`, «الجمارك» as
    // `jmarks`. A dictionary is a whitelist of a LANGUAGE, which is finite and
    // legitimate; what is not legitimate is presenting a transliteration as
    // though it were the English word.
    'حاويه': 'container', 'حاوي': 'container', 'حاويات': 'containers',
    'جمرك': 'customs', 'جمارك': 'customs', 'تخليص': 'clearance',
    'سائق': 'driver', 'سائقون': 'drivers', 'سواق': 'driver',
    'راتب': 'salary', 'رواتب': 'payroll', 'اجر': 'wage',
    'فوتره': 'billing', 'فواتير': 'invoices', 'فاتوره': 'invoice',
    'شحنه': 'shipment', 'شحنات': 'shipments', 'طرد': 'parcel', 'طرود': 'parcels',
    'مشرف': 'supervisor', 'مشرفين': 'supervisors', 'صلاحيه': 'permission', 'صلاحيات': 'permissions',
    'اسطول': 'fleet', 'جرد': 'stocktake',
    // Measured passthroughs: «ابنِ نظام جرد للمخزون: الأصناف والكميات والموردون»
    // produced tables literally named `asnafs`, `kmyats` and `mwrdwns` — three
    // transliterations sitting in a delivered SQLite file as though they were
    // English. These are ordinary stockroom words and they have ordinary
    // English names.
    'صنف': 'item', 'اصناف': 'items', 'كميه': 'quantity', 'كميات': 'quantities',
    'مورد': 'supplier', 'موردون': 'suppliers', 'موردين': 'suppliers',
    'مخزون': 'stock', 'رصيد': 'balance', 'وحده': 'unit', 'وحدات': 'units',
    'دفعه': 'batch', 'دفعات': 'batches', 'رف': 'shelf', 'رفوف': 'shelves',
    'عقارات': 'real estate', 'عقاري': 'real estate', 'منزل': 'house', 'بيت': 'home',
    'اثاث': 'furniture', 'ديكور': 'interior', 'موضه': 'fashion', 'ملابس': 'clothes',
    'جمال': 'beauty', 'شعر': 'hair', 'عطور': 'perfume', 'مجوهرات': 'jewelry',
    'ساعه': 'watch', 'اطفال': 'children', 'عائله': 'family', 'زفاف': 'wedding',
    'قانون': 'law', 'قانوني': 'legal', 'عداله': 'justice', 'محكمه': 'court',
    // ---- gap-fill: measured passthroughs on real Arabic subjects ----
    // Every entry here was a subject that fell to a gradient because the
    // dictionary did not know it. Housing / property
    'شقه': 'apartment', 'شقق': 'apartments', 'فيلا': 'villa', 'عماره': 'building',
    'غرفه': 'room', 'صاله المعيشه': 'living room', 'مطبخ حديث': 'modern kitchen',
    'حمام': 'bathroom', 'مفتاح': 'key', 'مفروش': 'furnished',
    // sale / commerce verbs & words
    'بيع': 'sale', 'للبيع': 'for sale', 'ايجار': 'rent', 'للايجار': 'for rent',
    'شراء': 'buying', 'خصم': 'discount', 'عرض خاص': 'special offer', 'تخفيضات': 'discounts',
    // sports & venues
    'ملعب': 'stadium', 'كره': 'ball', 'قدم': 'football', 'سله': 'basketball',
    'تنس': 'tennis', 'سباحه': 'swimming', 'مسبح': 'swimming pool', 'جري': 'running',
    'بطوله': 'championship', 'فريق رياضي': 'sports team', 'كابتن': 'captain',
    // beauty & salon
    'صالون': 'salon', 'تجميل': 'beauty salon', 'حلاقه': 'barber', 'قص': 'haircut',
    'مكياج': 'makeup', 'اظافر': 'nails', 'بشره': 'skincare', 'سبا': 'spa', 'مساج': 'massage',
    // events & weddings
    'قاعه': 'hall', 'افراح': 'wedding', 'حفله': 'party', 'مناسبه': 'event',
    'تخرج': 'graduation', 'استقبال': 'reception', 'ورود': 'flowers', 'هدايا': 'gifts',
    'كوش': 'wedding stage', 'دعوه': 'invitation',
    // travel & sky
    'طائره': 'airplane', 'سماء': 'sky', 'غيوم': 'clouds', 'سحاب': 'clouds',
    'مطار دولي': 'international airport', 'جواز': 'passport', 'حقيبه': 'luggage',
    'وجهه': 'destination', 'فندق فاخر': 'luxury hotel', 'منتجع': 'resort',
    // more everyday nouns that appear in briefs
    'قهوه عربيه': 'arabic coffee', 'حلويات شرقيه': 'middle eastern sweets',
    'خضروات': 'vegetables', 'فواكه': 'fruits', 'لحوم': 'meat', 'دجاج': 'chicken',
    'سمك': 'fish', 'ارز': 'rice', 'عسل': 'honey', 'زيتون': 'olives',
    'ورشه سيارات': 'car workshop', 'غسيل': 'car wash', 'اطارات': 'tires',
    'نظافه': 'cleaning', 'تنظيف': 'cleaning', 'صيانه': 'maintenance',
    'كهربائي': 'electrician', 'سباك': 'plumber', 'نجار': 'carpenter', 'دهان': 'painter',
    'حداد': 'blacksmith', 'بلاط': 'tiles', 'اسمنت': 'cement',
    'مخبز': 'bakery', 'مخبوزات': 'baked goods', 'معجنات': 'pastries',
    'زبون سعيد': 'happy customer', 'تقييم': 'review', 'نجوم': 'stars', 'جائزه': 'award',
    // ---- the records a system keeps ----
    // Measured on the 250 Arabic requests of eval run500 (2026-10-27): about
    // seventy nouns a person names as the records of his system reached the
    // database as transliterations — «العلاجات» of a dental clinic's API
    // became the table and route `alajats`, «الجلسات» `jlsats`, «المتبرعين»
    // `mtbrayns`. These are ordinary nouns with ordinary English names; the
    // plural is written out so the table's label is plural too (a stripped
    // suffix lands on the singular). Words whose English depends on the
    // business («الوصفات» recipes or prescriptions, «الباقات» packages or
    // bouquets, «الصفوف» classes or rows,
    // «العلامات» grades or tags, «القطع», «المواد», «العناوين») are left out:
    // a stable transliterated key is honest, a guessed English word is not.
    'علاج': 'treatment', 'علاجات': 'treatments', 'تطعيم': 'vaccination', 'تطعيمات': 'vaccinations',
    'تشخيص': 'diagnosis', 'تشخيصات': 'diagnoses', 'مريض': 'patient', 'مرضي': 'patients',
    'جلسه': 'session', 'جلسات': 'sessions', 'تذكره': 'ticket', 'تذاكر': 'tickets',
    'تبرع': 'donation', 'تبرعات': 'donations', 'متبرع': 'donor', 'متبرعين': 'donors', 'متبرعون': 'donors',
    'مستفيد': 'beneficiary', 'مستفيدين': 'beneficiaries', 'مستفيدون': 'beneficiaries',
    'ضيف': 'guest', 'ضيوف': 'guests', 'نزيل': 'guest', 'نزلاء': 'guests',
    'مسافر': 'traveler', 'مسافرين': 'travelers', 'مسافرون': 'travelers',
    'مدرب': 'trainer', 'مدربين': 'trainers', 'مدربون': 'trainers',
    'متدرب': 'trainee', 'متدربين': 'trainees', 'متدربون': 'trainees',
    'لاعب': 'player', 'لاعبين': 'players', 'لاعبون': 'players',
    // «مرشح» alone is a candidate or a filter (water, coffee, air); only the
    // human plurals are one word. «كفالة» — a sponsorship, a warranty, a
    // guarantee or bail — is left out for the same reason (round 21 review).
    'مرشحين': 'candidates', 'مرشحون': 'candidates',
    'مؤلف': 'author', 'مؤلفين': 'authors', 'مؤلفون': 'authors',
    'مالك': 'owner', 'مالكين': 'owners', 'مالكون': 'owners', 'قارئ': 'reader', 'قراء': 'readers',
    'صديق': 'friend', 'اصدقاء': 'friends', 'حيوان': 'animal', 'حيوانات': 'animals',
    'اشتراك': 'subscription', 'اشتراكات': 'subscriptions', 'اعاره': 'loan', 'اعارات': 'loans',
    'رحلات': 'trips', 'نشاط': 'activity', 'انشطه': 'activities',
    'مباراه': 'match', 'مباريات': 'matches', 'فيلم': 'movie', 'افلام': 'movies',
    'مقابلات': 'interviews', 'وظيفه': 'job', 'وظائف': 'jobs',
    'البوم': 'album', 'البومات': 'albums',
    'شكوي': 'complaint', 'شكاوي': 'complaints', 'ردود': 'replies',
    'مصروف': 'expense', 'مصاريف': 'expenses', 'ميزانيه': 'budget', 'ميزانيات': 'budgets',
    'مقال': 'article', 'مقالات': 'articles', 'تعليق': 'comment', 'تعليقات': 'comments',
    'منشور': 'post', 'منشورات': 'posts', 'مطاعم': 'restaurants', 'مشروب': 'drink', 'مشروبات': 'drinks',
    'درس': 'lesson', 'دروس': 'lessons', 'محصول': 'crop', 'محاصيل': 'crops', 'مواشي': 'livestock',
    'قضيه': 'case', 'قضايا': 'cases', 'مناسبات': 'events', 'طاوله': 'table', 'طاولات': 'tables',
    'مقاس': 'size', 'مقاسات': 'sizes',
};

/**
 * A SUFFIX THAT CHANGES WHAT A WORD COUNTS MUST LAND ON THE SAME WORD.
 *
 * Round 21 review: «القراءة» (reading) came out as "readers". Folding writes
 * its ة as ه, the lone ه was taken off as if it were the pronoun «his», and
 * «قراء» — the broken plural of «قارئ» — answered. «القراءات» (readings) did
 * the same through ات. The ta marbuta and the plural endings are part of what
 * the word means, not decoration on it:
 *
 *   - a plural or dual ending (ات, يات, ون, ين, ان) comes off a SINGULAR, so a
 *     stem the dictionary knows as a plural is a different word;
 *   - a lone ه is a feminine ending as often as it is «his» (and informal
 *     writing uses it for every ة). Taking it off names the same thing only
 *     for a person — «طبيبة» is a doctor, «مهندسة» an engineer — or for the
 *     feminine of an adjective in -ي («برمجية» is «برمجي», software), while
 *     for anything else the stem is another word: «كتابة» writing is not
 *     «كتاب» a book, «قراءة» reading is not «قراء» readers.
 *
 * Shapes of the two languages, not a list of words: an English plural ends in
 * s (not -ss, -us, -is), and a role is named by its agent ending.
 */
const NUMBER_SUFFIX = new Set(['يات', 'ات', 'ون', 'ين', 'ان']);
const pluralEnglish = (en: string) => /[^siu]s$/i.test(String(en || '').trim().split(/\s+/).pop() || '');
const personEnglish = (en: string) => /(?:er|or|ist|ian|ant|ent|ee|ess)$/i.test(String(en || '').trim().split(/\s+/).pop() || '');

/**
 * …AND A PLURAL ENDING THAT CAME OFF IS PUT BACK ON (round 21 review, R7).
 *
 * «الاجتماعات» is meetings: ات came off a singular the dictionary knows,
 * «اجتماع» → "meeting", and the label read "meeting" — one meeting for a
 * table of them. A label is his word in his number, so the English is made
 * plural when a plural or dual ending (ات, يات, ون, ين, ان) came off. English
 * plural shape, not a word list: -y after a consonant → -ies, a sibilant →
 * -es, else -s, on the last word.
 */
function pluralOf(en: string): string {
    const words = String(en || '').trim().split(/\s+/);
    const last = words.pop() || '';
    if (!last || pluralEnglish(last)) return String(en || '').trim();
    const plural = /[^aeiou]y$/i.test(last) ? `${last.slice(0, -1)}ies`
        : /(?:s|x|z|ch|sh)$/i.test(last) ? `${last}es`
            : `${last}s`;
    return [...words, plural].join(' ');
}

/** The exact form, then suffix-stripped forms of it. */
function lookupExact(n: string): string | null {
    if (AR_EN[n]) return AR_EN[n];
    for (const suf of SUFFIXES) {
        if (n.endsWith(suf) && n.length - suf.length >= 3) {
            const bare = n.slice(0, n.length - suf.length);
            const en = AR_EN[bare];
            if (!en) continue;
            if (NUMBER_SUFFIX.has(suf) && pluralEnglish(en)) continue;
            if (suf === 'ه' && (pluralEnglish(en) || !(personEnglish(en) || bare.endsWith('ي')))) continue;
            return NUMBER_SUFFIX.has(suf) ? pluralOf(en) : en;
        }
    }
    return null;
}

function lookup(token: string): string | null {
    const n = normalizeArabic(token);
    if (!n || n.length < 2) return null;
    const direct = lookupExact(n);
    if (direct) return direct;
    for (const pre of PREFIXES) {
        if (n.startsWith(pre) && n.length - pre.length >= 3) {
            const hit = lookupExact(n.slice(pre.length));
            if (hit) return hit;
        }
    }
    return null;
}

/**
 * The subject as the archives should hear it.
 *
 * Latin words pass through untouched (a brand name is its own best search
 * term). Arabic words are looked up; the ones the dictionary does not know
 * contribute nothing — better a shorter precise query than a mixed-language
 * one no index satisfies. A subject with NO recognizable words at all falls
 * back to the original text unchanged, and `translated` says which happened
 * so the build log can report it honestly.
 */
export function englishSubject(subject: string): { query: string; translated: boolean } {
    const src = String(subject || '').trim();
    if (!/[؀-ۿ]/.test(src)) return { query: src, translated: false };

    const words: string[] = [];
    const seen = new Set<string>();
    const push = (w: string) => {
        const k = w.toLowerCase();
        if (!seen.has(k)) { seen.add(k); words.push(w); }
    };
    for (const raw of src.split(/[\s،,.:;()«»"']+/)) {
        if (!raw) continue;
        if (/^[A-Za-z][A-Za-z0-9'&.-]*$/.test(raw)) { push(raw); continue; }
        const en = lookup(raw);
        if (en) for (const part of en.split(' ')) push(part);
        if (words.length >= 6) break;
    }
    if (!words.length) return { query: src, translated: false };
    return { query: words.join(' '), translated: true };
}

/**
 * THE ENGLISH OF A LABEL IS THE ENGLISH OF ALL OF IT.
 *
 * `englishSubject` is a search query: a word it does not know contributes
 * nothing, and a shorter query is still a good one. A LABEL is read by a
 * person as the name of his column, so a part of it is a different name —
 * «اسم الموظف» (the employee's name) became "employee", «قائمة المواعيد» (the
 * appointment list) became "menu", «عقود الإيجار» (lease contracts) "rent".
 *
 * Every Arabic word must be known, or the answer is null and the caller shows
 * his own word. Arabic names the head first («اسم الموظف», «المنتجات
 * الرقمية»), English last («employee name», «digital products»), so the words
 * come back in English order.
 */
export function englishPhrase(phrase: string): string | null {
    const raw = String(phrase || '').trim().split(/[\s،,]+/).filter(Boolean);
    if (!raw.length || !raw.some(w => /[؀-ۿ]/.test(w))) return null;
    const out: string[] = [];
    for (const w of raw) {
        if (/^[A-Za-z][A-Za-z0-9'&.-]*$/.test(w)) { out.push(w); continue; }
        const en = /[؀-ۿ]/.test(w) ? lookup(w) : null;
        if (!en) return null;
        out.push(en);
    }
    return out.reverse().join(' ');
}
