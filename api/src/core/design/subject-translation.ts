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
    'عقارات': 'real estate', 'عقاري': 'real estate', 'منزل': 'house', 'بيت': 'home',
    'اثاث': 'furniture', 'ديكور': 'interior', 'موضه': 'fashion', 'ملابس': 'clothes',
    'جمال': 'beauty', 'شعر': 'hair', 'عطور': 'perfume', 'مجوهرات': 'jewelry',
    'ساعه': 'watch', 'اطفال': 'children', 'عائله': 'family', 'زفاف': 'wedding',
    'قانون': 'law', 'قانوني': 'legal', 'عداله': 'justice', 'محكمه': 'court',
};

/** The exact form, then suffix-stripped forms of it. */
function lookupExact(n: string): string | null {
    if (AR_EN[n]) return AR_EN[n];
    for (const suf of SUFFIXES) {
        if (n.endsWith(suf) && n.length - suf.length >= 3) {
            const bare = n.slice(0, n.length - suf.length);
            if (AR_EN[bare]) return AR_EN[bare];
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
