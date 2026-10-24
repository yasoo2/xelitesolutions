import fs from 'fs';
import path from 'path';
import { ARTIFACT_LEXICON, BUILD_VERBS, OPERATOR_READS, SERVER_CLAIMS, requestedArtifact } from '../core/design/requested-artifact';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { detectAppKind, hasExplicitRecordSchema, isCliRequest, requestedArtifactWithoutStockEngine } from '../core/design/app-blueprints';
import { buildObjectIsAnApi, deterministicPhasesFor } from '../modules/tools/definitions/ProjectPipelineTool';

/**
 * Eval round 15, 2026-10-24: Joe decided WHAT to build in eight places, each
 * matching keywords anywhere in the sentence with its own word list, and the
 * English and Arabic halves of those lists had drifted apart. A command-line
 * tool over «الزبائن» was a database system while its English twin was a CLI;
 * every English API was an 'app' and every Arabic one a 'system'.
 *
 * requestedArtifact reads two independent facts once: the KIND from the build
 * verb's object (a bilingual lexicon of deliverable kinds) and whether the
 * request NEEDS ITS OWN SERVER from what it claims (sign-in, accounts, roles, a
 * database, a backend, data one party writes and another reads, an owned API) —
 * never from the head noun. Every router reads both from it.
 */
jest.setTimeout(180_000);

const scope = (t: string) => PlanningEngine.classifyBuildScope(t);
const firstTools = (t: string) => (deterministicPhasesFor(t)?.phases || []).map(p => p.tasks[0]?.tool);

// prompts500 twins (gen-prompts.mjs), four domains × ten kinds × both languages.
const TWINS = [
    { domain: "dental clinic", prompt: "landing", kind: "page", scope: "page", server: false,
      ar: "اعمل موقع تعريفي احترافي لـعيادة أسنان فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء، ونموذج تواصل يتحقق من البريد الإلكتروني ورقم الهاتف، وقائمة تعمل على الجوال. الموقع بالعربي ومن اليمين لليسار.",
      en: "Build a professional landing website for a dental clinic with a hero section, services, testimonials, a contact form with validated email and phone fields, and a responsive mobile menu." },
    { domain: "dental clinic", prompt: "admin", kind: "app", scope: "app", server: false,
      ar: "ابني لوحة تحكم لإدارة عيادة أسنان: إضافة وتعديل وحذف وبحث في المرضى والمواعيد والعلاجات، مع صفحة ملخص تعرض الإجماليات ورسماً بيانياً.",
      en: "Build an admin dashboard for a dental clinic to manage patients, appointments, treatments: add, edit, delete and search each one, with a summary page showing totals and a chart." },
    { domain: "dental clinic", prompt: "api", kind: "api", scope: "system", server: true,
      ar: "أنشئ واجهة برمجية REST باستخدام Node.js و Express لـعيادة أسنان فيها نقاط وصول لـالمرضى والمواعيد والعلاجات، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.",
      en: "Create a REST API with Node.js and Express for a dental clinic with endpoints for patients, appointments, treatments, input validation, proper error codes, and automated tests for every endpoint." },
    { domain: "dental clinic", prompt: "fullstack", kind: "system", scope: "system", server: true,
      ar: "ابني نظام متكامل لـعيادة أسنان: واجهة React وخادم Node، تسجيل دخول بصلاحيات (مدير وموظف)، إدارة المرضى والمواعيد والعلاجات، وكل موظف يرى سجلاته فقط.",
      en: "Build a complete full-stack system for a dental clinic: React frontend, Node backend, user login with roles (admin and staff), management of patients, appointments, treatments, and each staff member only sees their own records." },
    { domain: "dental clinic", prompt: "store", kind: "store", scope: "app", server: false,
      ar: "ابني متجر إلكتروني لـعيادة أسنان: عرض المنتجات بالصور والأسعار، بحث وفلترة حسب التصنيف، سلة تضيف وتحذف وتحدّث المجموع، ونموذج إتمام طلب مع التحقق من البيانات.",
      en: "Build an online store for a dental clinic: product listing with images and prices, search and category filter, a cart that adds and removes items and updates the total, and a checkout form with validation." },
    { domain: "dental clinic", prompt: "booking", kind: "booking", scope: "system", server: true,
      ar: "ابني تطبيق حجز لـعيادة أسنان: الزبون يختار التاريخ والوقت، ويشوف المواعيد المحجوزة، ويحجز باسمه ورقم هاتفه، وصاحب المكان يشوف كل الحجوزات بعرض تقويم.",
      en: "Build a booking web app for a dental clinic where customers pick a date and time slot, see which slots are already taken, book with their name and phone, and the owner sees all bookings in a calendar view." },
    { domain: "dental clinic", prompt: "cli", kind: "cli", scope: "page", server: false,
      ar: "اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه المرضى لـعيادة أسنان، وتتحقق من كل سطر، وتطبع تقريراً بالأعداد والمجاميع، وتكتب الأسطر الخاطئة في ملف errors.csv.",
      en: "Write a Python command-line tool that reads a CSV file of patients for a dental clinic, validates every row, prints a summary report with counts and totals, and writes the invalid rows to errors.csv." },
    { domain: "dental clinic", prompt: "report", kind: "report", scope: "app", server: false,
      ar: "اعمل صفحة تقرير تفاعلية لـعيادة أسنان تحمّل بيانات تجريبية عن المواعيد، وتعرض ثلاث رسوم بيانية (حسب الشهر، حسب التصنيف، أعلى 5)، وتسمح بالفلترة حسب الفترة الزمنية.",
      en: "Create an interactive single-page report for a dental clinic that loads sample appointments data, shows three charts (by month, by category, top 5), and lets the user filter by date range." },
    { domain: "dental clinic", prompt: "game", kind: "game", scope: "app", server: false,
      ar: "اعمل لعبة أسئلة في المتصفح عن عيادة أسنان فيها 10 أسئلة، ومؤقت لكل سؤال، وحساب النقاط، وشاشة نتيجة نهائية وزر إعادة.",
      en: "Make a browser quiz game about a dental clinic with 10 questions, a timer per question, score tracking, a final results screen and a restart button." },
    { domain: "dental clinic", prompt: "bot", kind: "bot", scope: "app", server: false,
      ar: "ابني صفحة روبوت محادثة لخدمة عملاء عيادة أسنان يجاوب على الأسئلة الشائعة من قائمة مدمجة، ويسمح للمستخدم بحجز أو إلغاء المواعيد من خلال المحادثة، ويحفظ سجل المحادثة.",
      en: "Build a customer-support chatbot web page for a dental clinic that answers common questions from a built-in FAQ list, lets the user book or cancel appointments through the chat, and keeps the conversation history." },
    { domain: "restaurant", prompt: "landing", kind: "page", scope: "page", server: false,
      ar: "اعمل موقع تعريفي احترافي لـمطعم فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء، ونموذج تواصل يتحقق من البريد الإلكتروني ورقم الهاتف، وقائمة تعمل على الجوال. الموقع بالعربي ومن اليمين لليسار.",
      en: "Build a professional landing website for a restaurant with a hero section, services, testimonials, a contact form with validated email and phone fields, and a responsive mobile menu." },
    { domain: "restaurant", prompt: "admin", kind: "app", scope: "app", server: false,
      ar: "ابني لوحة تحكم لإدارة مطعم: إضافة وتعديل وحذف وبحث في الأصناف والطلبات والطاولات، مع صفحة ملخص تعرض الإجماليات ورسماً بيانياً.",
      en: "Build an admin dashboard for a restaurant to manage menu items, orders, tables: add, edit, delete and search each one, with a summary page showing totals and a chart." },
    { domain: "restaurant", prompt: "api", kind: "api", scope: "system", server: true,
      ar: "أنشئ واجهة برمجية REST باستخدام Node.js و Express لـمطعم فيها نقاط وصول لـالأصناف والطلبات والطاولات، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.",
      en: "Create a REST API with Node.js and Express for a restaurant with endpoints for menu items, orders, tables, input validation, proper error codes, and automated tests for every endpoint." },
    { domain: "restaurant", prompt: "fullstack", kind: "system", scope: "system", server: true,
      ar: "ابني نظام متكامل لـمطعم: واجهة React وخادم Node، تسجيل دخول بصلاحيات (مدير وموظف)، إدارة الأصناف والطلبات والطاولات، وكل موظف يرى سجلاته فقط.",
      en: "Build a complete full-stack system for a restaurant: React frontend, Node backend, user login with roles (admin and staff), management of menu items, orders, tables, and each staff member only sees their own records." },
    { domain: "restaurant", prompt: "store", kind: "store", scope: "app", server: false,
      ar: "ابني متجر إلكتروني لـمطعم: عرض المنتجات بالصور والأسعار، بحث وفلترة حسب التصنيف، سلة تضيف وتحذف وتحدّث المجموع، ونموذج إتمام طلب مع التحقق من البيانات.",
      en: "Build an online store for a restaurant: product listing with images and prices, search and category filter, a cart that adds and removes items and updates the total, and a checkout form with validation." },
    { domain: "restaurant", prompt: "booking", kind: "booking", scope: "system", server: true,
      ar: "ابني تطبيق حجز لـمطعم: الزبون يختار التاريخ والوقت، ويشوف المواعيد المحجوزة، ويحجز باسمه ورقم هاتفه، وصاحب المكان يشوف كل الحجوزات بعرض تقويم.",
      en: "Build a booking web app for a restaurant where customers pick a date and time slot, see which slots are already taken, book with their name and phone, and the owner sees all bookings in a calendar view." },
    { domain: "restaurant", prompt: "cli", kind: "cli", scope: "page", server: false,
      ar: "اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه الأصناف لـمطعم، وتتحقق من كل سطر، وتطبع تقريراً بالأعداد والمجاميع، وتكتب الأسطر الخاطئة في ملف errors.csv.",
      en: "Write a Python command-line tool that reads a CSV file of menu items for a restaurant, validates every row, prints a summary report with counts and totals, and writes the invalid rows to errors.csv." },
    { domain: "restaurant", prompt: "report", kind: "report", scope: "app", server: false,
      ar: "اعمل صفحة تقرير تفاعلية لـمطعم تحمّل بيانات تجريبية عن الطلبات، وتعرض ثلاث رسوم بيانية (حسب الشهر، حسب التصنيف، أعلى 5)، وتسمح بالفلترة حسب الفترة الزمنية.",
      en: "Create an interactive single-page report for a restaurant that loads sample orders data, shows three charts (by month, by category, top 5), and lets the user filter by date range." },
    { domain: "restaurant", prompt: "game", kind: "game", scope: "app", server: false,
      ar: "اعمل لعبة أسئلة في المتصفح عن مطعم فيها 10 أسئلة، ومؤقت لكل سؤال، وحساب النقاط، وشاشة نتيجة نهائية وزر إعادة.",
      en: "Make a browser quiz game about a restaurant with 10 questions, a timer per question, score tracking, a final results screen and a restart button." },
    { domain: "restaurant", prompt: "bot", kind: "bot", scope: "app", server: false,
      ar: "ابني صفحة روبوت محادثة لخدمة عملاء مطعم يجاوب على الأسئلة الشائعة من قائمة مدمجة، ويسمح للمستخدم بحجز أو إلغاء الطلبات من خلال المحادثة، ويحفظ سجل المحادثة.",
      en: "Build a customer-support chatbot web page for a restaurant that answers common questions from a built-in FAQ list, lets the user book or cancel orders through the chat, and keeps the conversation history." },
    { domain: "car rental company", prompt: "landing", kind: "page", scope: "page", server: false,
      ar: "اعمل موقع تعريفي احترافي لـشركة تأجير سيارات فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء، ونموذج تواصل يتحقق من البريد الإلكتروني ورقم الهاتف، وقائمة تعمل على الجوال. الموقع بالعربي ومن اليمين لليسار.",
      en: "Build a professional landing website for a car rental company with a hero section, services, testimonials, a contact form with validated email and phone fields, and a responsive mobile menu." },
    { domain: "car rental company", prompt: "admin", kind: "app", scope: "app", server: false,
      ar: "ابني لوحة تحكم لإدارة شركة تأجير سيارات: إضافة وتعديل وحذف وبحث في السيارات والحجوزات والعملاء، مع صفحة ملخص تعرض الإجماليات ورسماً بيانياً.",
      en: "Build an admin dashboard for a car rental company to manage cars, bookings, customers: add, edit, delete and search each one, with a summary page showing totals and a chart." },
    { domain: "car rental company", prompt: "api", kind: "api", scope: "system", server: true,
      ar: "أنشئ واجهة برمجية REST باستخدام Node.js و Express لـشركة تأجير سيارات فيها نقاط وصول لـالسيارات والحجوزات والعملاء، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.",
      en: "Create a REST API with Node.js and Express for a car rental company with endpoints for cars, bookings, customers, input validation, proper error codes, and automated tests for every endpoint." },
    { domain: "car rental company", prompt: "fullstack", kind: "system", scope: "system", server: true,
      ar: "ابني نظام متكامل لـشركة تأجير سيارات: واجهة React وخادم Node، تسجيل دخول بصلاحيات (مدير وموظف)، إدارة السيارات والحجوزات والعملاء، وكل موظف يرى سجلاته فقط.",
      en: "Build a complete full-stack system for a car rental company: React frontend, Node backend, user login with roles (admin and staff), management of cars, bookings, customers, and each staff member only sees their own records." },
    { domain: "car rental company", prompt: "store", kind: "store", scope: "app", server: false,
      ar: "ابني متجر إلكتروني لـشركة تأجير سيارات: عرض المنتجات بالصور والأسعار، بحث وفلترة حسب التصنيف، سلة تضيف وتحذف وتحدّث المجموع، ونموذج إتمام طلب مع التحقق من البيانات.",
      en: "Build an online store for a car rental company: product listing with images and prices, search and category filter, a cart that adds and removes items and updates the total, and a checkout form with validation." },
    { domain: "car rental company", prompt: "booking", kind: "booking", scope: "system", server: true,
      ar: "ابني تطبيق حجز لـشركة تأجير سيارات: الزبون يختار التاريخ والوقت، ويشوف المواعيد المحجوزة، ويحجز باسمه ورقم هاتفه، وصاحب المكان يشوف كل الحجوزات بعرض تقويم.",
      en: "Build a booking web app for a car rental company where customers pick a date and time slot, see which slots are already taken, book with their name and phone, and the owner sees all bookings in a calendar view." },
    { domain: "car rental company", prompt: "cli", kind: "cli", scope: "page", server: false,
      ar: "اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه السيارات لـشركة تأجير سيارات، وتتحقق من كل سطر، وتطبع تقريراً بالأعداد والمجاميع، وتكتب الأسطر الخاطئة في ملف errors.csv.",
      en: "Write a Python command-line tool that reads a CSV file of cars for a car rental company, validates every row, prints a summary report with counts and totals, and writes the invalid rows to errors.csv." },
    { domain: "car rental company", prompt: "report", kind: "report", scope: "app", server: false,
      ar: "اعمل صفحة تقرير تفاعلية لـشركة تأجير سيارات تحمّل بيانات تجريبية عن الحجوزات، وتعرض ثلاث رسوم بيانية (حسب الشهر، حسب التصنيف، أعلى 5)، وتسمح بالفلترة حسب الفترة الزمنية.",
      en: "Create an interactive single-page report for a car rental company that loads sample bookings data, shows three charts (by month, by category, top 5), and lets the user filter by date range." },
    { domain: "car rental company", prompt: "game", kind: "game", scope: "app", server: false,
      ar: "اعمل لعبة أسئلة في المتصفح عن شركة تأجير سيارات فيها 10 أسئلة، ومؤقت لكل سؤال، وحساب النقاط، وشاشة نتيجة نهائية وزر إعادة.",
      en: "Make a browser quiz game about a car rental company with 10 questions, a timer per question, score tracking, a final results screen and a restart button." },
    { domain: "car rental company", prompt: "bot", kind: "bot", scope: "app", server: false,
      ar: "ابني صفحة روبوت محادثة لخدمة عملاء شركة تأجير سيارات يجاوب على الأسئلة الشائعة من قائمة مدمجة، ويسمح للمستخدم بحجز أو إلغاء الحجوزات من خلال المحادثة، ويحفظ سجل المحادثة.",
      en: "Build a customer-support chatbot web page for a car rental company that answers common questions from a built-in FAQ list, lets the user book or cancel bookings through the chat, and keeps the conversation history." },
    { domain: "laundry service", prompt: "landing", kind: "page", scope: "page", server: false,
      ar: "اعمل موقع تعريفي احترافي لـمغسلة ملابس فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء، ونموذج تواصل يتحقق من البريد الإلكتروني ورقم الهاتف، وقائمة تعمل على الجوال. الموقع بالعربي ومن اليمين لليسار.",
      en: "Build a professional landing website for a laundry service with a hero section, services, testimonials, a contact form with validated email and phone fields, and a responsive mobile menu." },
    { domain: "laundry service", prompt: "admin", kind: "app", scope: "app", server: false,
      ar: "ابني لوحة تحكم لإدارة مغسلة ملابس: إضافة وتعديل وحذف وبحث في الطلبات والقطع ومواعيد الاستلام، مع صفحة ملخص تعرض الإجماليات ورسماً بيانياً.",
      en: "Build an admin dashboard for a laundry service to manage orders, items, pickups: add, edit, delete and search each one, with a summary page showing totals and a chart." },
    { domain: "laundry service", prompt: "api", kind: "api", scope: "system", server: true,
      ar: "أنشئ واجهة برمجية REST باستخدام Node.js و Express لـمغسلة ملابس فيها نقاط وصول لـالطلبات والقطع ومواعيد الاستلام، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.",
      en: "Create a REST API with Node.js and Express for a laundry service with endpoints for orders, items, pickups, input validation, proper error codes, and automated tests for every endpoint." },
    { domain: "laundry service", prompt: "fullstack", kind: "system", scope: "system", server: true,
      ar: "ابني نظام متكامل لـمغسلة ملابس: واجهة React وخادم Node، تسجيل دخول بصلاحيات (مدير وموظف)، إدارة الطلبات والقطع ومواعيد الاستلام، وكل موظف يرى سجلاته فقط.",
      en: "Build a complete full-stack system for a laundry service: React frontend, Node backend, user login with roles (admin and staff), management of orders, items, pickups, and each staff member only sees their own records." },
    { domain: "laundry service", prompt: "store", kind: "store", scope: "app", server: false,
      ar: "ابني متجر إلكتروني لـمغسلة ملابس: عرض المنتجات بالصور والأسعار، بحث وفلترة حسب التصنيف، سلة تضيف وتحذف وتحدّث المجموع، ونموذج إتمام طلب مع التحقق من البيانات.",
      en: "Build an online store for a laundry service: product listing with images and prices, search and category filter, a cart that adds and removes items and updates the total, and a checkout form with validation." },
    { domain: "laundry service", prompt: "booking", kind: "booking", scope: "system", server: true,
      ar: "ابني تطبيق حجز لـمغسلة ملابس: الزبون يختار التاريخ والوقت، ويشوف المواعيد المحجوزة، ويحجز باسمه ورقم هاتفه، وصاحب المكان يشوف كل الحجوزات بعرض تقويم.",
      en: "Build a booking web app for a laundry service where customers pick a date and time slot, see which slots are already taken, book with their name and phone, and the owner sees all bookings in a calendar view." },
    { domain: "laundry service", prompt: "cli", kind: "cli", scope: "page", server: false,
      ar: "اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه الطلبات لـمغسلة ملابس، وتتحقق من كل سطر، وتطبع تقريراً بالأعداد والمجاميع، وتكتب الأسطر الخاطئة في ملف errors.csv.",
      en: "Write a Python command-line tool that reads a CSV file of orders for a laundry service, validates every row, prints a summary report with counts and totals, and writes the invalid rows to errors.csv." },
    { domain: "laundry service", prompt: "report", kind: "report", scope: "app", server: false,
      ar: "اعمل صفحة تقرير تفاعلية لـمغسلة ملابس تحمّل بيانات تجريبية عن القطع، وتعرض ثلاث رسوم بيانية (حسب الشهر، حسب التصنيف، أعلى 5)، وتسمح بالفلترة حسب الفترة الزمنية.",
      en: "Create an interactive single-page report for a laundry service that loads sample items data, shows three charts (by month, by category, top 5), and lets the user filter by date range." },
    { domain: "laundry service", prompt: "game", kind: "game", scope: "app", server: false,
      ar: "اعمل لعبة أسئلة في المتصفح عن مغسلة ملابس فيها 10 أسئلة، ومؤقت لكل سؤال، وحساب النقاط، وشاشة نتيجة نهائية وزر إعادة.",
      en: "Make a browser quiz game about a laundry service with 10 questions, a timer per question, score tracking, a final results screen and a restart button." },
    { domain: "laundry service", prompt: "bot", kind: "bot", scope: "app", server: false,
      ar: "ابني صفحة روبوت محادثة لخدمة عملاء مغسلة ملابس يجاوب على الأسئلة الشائعة من قائمة مدمجة، ويسمح للمستخدم بحجز أو إلغاء القطع من خلال المحادثة، ويحفظ سجل المحادثة.",
      en: "Build a customer-support chatbot web page for a laundry service that answers common questions from a built-in FAQ list, lets the user book or cancel items through the chat, and keeps the conversation history." },
];

describe('T1 — every kind reads the same in both languages', () => {
    it.each(TWINS)('$domain / $prompt', ({ ar, en, kind, scope: expectedScope, server }) => {
        for (const text of [ar, en]) {
            const a = requestedArtifact(text);
            expect({ text, kind: a.kind, server: a.needsServer }).toEqual({ text, kind, server });
            expect({ text, scope: scope(text) }).toEqual({ text, scope: expectedScope });
            expect({ text, cli: isCliRequest(text) }).toEqual({ text, cli: kind === 'cli' });
        }
        if (kind === 'cli') {
            for (const text of [ar, en]) {
                expect(detectAppKind(text)).toBeNull();
                expect(deterministicPhasesFor(text)?.phases[0]?.name).toBe('CLI Scaffold');
            }
        }
        if (kind === 'api') {
            for (const text of [ar, en]) {
                expect(buildObjectIsAnApi(text)).toBe(true);
                expect(firstTools(text)).toEqual(['api_project']);
            }
        }
        if (kind === 'report' || kind === 'game' || kind === 'bot') {
            for (const text of [ar, en]) expect(requestedArtifactWithoutStockEngine(text)).toBe(true);
        }
        if (kind === 'booking') {
            // «customers book … the owner sees all bookings»: data one party
            // writes and another reads cannot live in one browser.
            for (const text of [ar, en]) expect(firstTools(text)).toEqual(['api_project', 'react_project']);
        }
    });
});

describe('R1 — behaviour promotes a page head; a presentation page stays a page', () => {
    it.each([
        'Build a website for a library where staff can add, edit, delete and search books',
        'اعمل موقع إلكتروني لإدارة مكتبة: إضافة الكتب وتعديلها وحذفها والبحث فيها',
        'اعمل موقع لمتابعة المهام',
        'Build a page for managing tasks with add, edit and delete',
    ])('%s → app', text => expect(scope(text)).toBe('app'));

    it.each([
        'Build a responsive website for a neighborhood bicycle repair studio called Spoke & Stem. Include a service list with prices, opening hours, location, phone CTA, and a booking form.',
        TWINS[0].ar,
        TWINS[0].en,
        // A landing page ABOUT expense management presents it; «لـإدارة» is its subject.
        "اعمل موقع تعريفي احترافي لـإدارة المصاريف الشخصية فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء، ونموذج تواصل يتحقق من البريد الإلكتروني ورقم الهاتف، وقائمة تعمل على الجوال. الموقع بالعربي ومن اليمين لليسار.",
        "Build a professional landing website for a personal finance with a hero section, services, testimonials, a contact form with validated email and phone fields, and a responsive mobile menu.",
    ])('%s → page', text => expect(scope(text)).toBe('page'));

    it('an English landing feature list is not promoted to an app by its fields', () => {
        for (const row of TWINS.filter(t => t.prompt === 'landing')) {
            expect(firstTools(row.en)).toEqual(['web_page_builder']);
            expect(firstTools(row.ar)).toEqual(['web_page_builder']);
        }
    });
});

describe('R2 — the API head is authoritative', () => {
    it('things ABOUT an API keep their interface', () => {
        const dashboard = 'Build a GitHub API dashboard that shows my repositories';
        expect(requestedArtifact(dashboard).kind).toBe('app');
        expect(firstTools(dashboard)).toEqual(['react_project']);
        const client = 'Build a REST API client app that lets me send requests and see responses';
        expect(requestedArtifact(client).kind).toBe('app');
        expect(buildObjectIsAnApi(client)).toBe(false);
        expect(firstTools(client)).toContain('react_project');
        expect(requestedArtifact('Build an API testing tool like Postman').kind).not.toBe('api');
    });
});

describe('R3 — a head noun never decides the server', () => {
    it.each([
        ['ابنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات', 'ابنِ تطبيقاً لمشتل نباتات: النباتات والموردون والطلبيات', 'system'],
        ['build a system with suppliers and vendors', 'build an app with suppliers and vendors', 'system'],
        ['Build a habit tracking system for myself', 'Build a habit tracking app for myself', 'app'],
        ['ابني نظام لإدارة مهامي الشخصية', 'ابني تطبيق لإدارة مهامي الشخصية', 'app'],
        // An invoice is a document the business issues to a customer.
        ['نظام فواتير للمحل مع تقارير', 'تطبيق فواتير للمحل مع تقارير', 'system'],
    ])('%s ≡ %s → %s', (a, b, expected) => {
        expect(scope(a)).toBe(expected);
        expect(scope(b)).toBe(expected);
    });

    it('ownership comes from claims, not nouns', () => {
        expect(scope('Build a dashboard with user accounts and monthly reports.')).toBe('system');
        // A declared category called «فواتير» is an option of a field, not an invoicing system.
        expect(scope('ابنِ تطبيق مصاريف يومية بفئات: طعام، مواصلات، فواتير، ترفيه')).toBe('app');
        expect(scope('Build an admin dashboard for a restaurant to manage menu items, orders, tables: add, edit, delete and search each one')).toBe('app');
        expect(scope('ابني نظام متكامل: واجهة React وخادم Node، تسجيل دخول بصلاحيات')).toBe('system');
        const weathergo = [
            'Build a real weather web application using React and Vite.',
            'Use the public Open-Meteo geocoding and forecast APIs; do not build a project-owned backend.',
            'Include city search, hourly and seven-day forecasts, favorites in localStorage, and settings persistence.',
            'If authentication is needed for this flow, implement a usable local/demo persistence path and do not block acceptance on credentials.',
        ].join(' ');
        expect(requestedArtifact(weathergo).needsServer).toBe(false);
        expect(scope(weathergo)).toBe('app');
    });
});

describe('R4 — the build gate reads the register he writes in', () => {
    it.each([
        'أبي تعدّل صفحة النادي: خلّ العنوان أوضح، وحط زر اشتراك بارز، وأضف قسم يشرح مواعيد التمرين باللهجة العربية المفهومة، ولا تشيل أي قسم موجود.',
        'أبي موقع لمطعمي', 'ابي جدول مصاريف فيه البند والمبلغ', 'حط لي زر اشتراك في الصفحة', 'خلّ لي صفحة هبوط للنادي',
        'شيل القسم الفارغ من الصفحة', 'سوّي لي متجر قهوة', 'تصميم موقع حديث لشركة برمجيات', 'بناء لوحة تحكم لمتابعة المبيعات',
        'هل يمكنك تصميم صفحة لمعرض فني؟', 'أريد تعديل صفحة النادي ووضع زر اشتراك بارز', 'ابنِ لي نظاماً لمشتل نباتات', 'اصنع لي جدول مصاريف',
        'بنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات', 'اعمل لعبة أسئلة عن الطلبات', 'Make a quiz game about orders',
        // …and when the dialect verb is not the first word of the request.
        'لو سمحت سوّي لي متجر قهوة', 'من فضلك خلّ لي صفحة هبوط للنادي',
    ])('build: %s', text => expect(PlanningEngine.looksLikeBuild(text)).toBe(true));

    it.each([
        'ما هي عاصمة فرنسا؟', 'كيف أشغّل جو على جهازي؟', 'وش الفرق بين React وVue؟', 'ما رأيك في تصميم موقع المطعم؟',
        'كيف أصمم موقعاً متجاوباً؟', 'هل تصميم موقع جديد مكلف؟', 'ما هي أقرب محطة قطار من هنا؟', 'كم سعر تشييل الأثاث؟',
        'وش معنى الاستحطاب؟', 'بدي شي أتابع فيه ديوني', 'I want something to track my debts', 'أبي أعرف وش يعني API',
    ])('not a build: %s', text => expect(PlanningEngine.looksLikeBuild(text)).toBe(false));

    it('a Gulf imperative reaches the deterministic plan', () => {
        expect(deterministicPhasesFor('سوّي لي متجر قهوة')).not.toBeNull();
    });
});

describe('T2 — a command-line tool stays one whatever its data or server', () => {
    it.each([
        'اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه الزبائن لـمحل خياطة، وتتحقق من كل سطر، وتطبع تقريراً بالأعداد والمجاميع، وتكتب الأسطر الخاطئة في ملف errors.csv.',
        'اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه الحجوزات لـخدمة تنظيف منازل، وتتحقق من كل سطر، وتطبع تقريراً بالأعداد والمجاميع، وتكتب الأسطر الخاطئة في ملف errors.csv.',
        'اكتب أداة سطر أوامر تقرأ ملف CSV فيه الطلبات وتطبع المجموع',
        // A declared server claim must not pull a CLI into the system branch.
        'اكتب أداة سطر أوامر تقرأ قاعدة البيانات في الخادم وتطبع الحجوزات',
        'Write a command-line tool that reads the database on the server and prints the bookings',
    ])('%s', text => {
        expect(requestedArtifact(text).kind).toBe('cli');
        expect(isCliRequest(text)).toBe(true);
        expect(scope(text)).toBe('page');
        expect(deterministicPhasesFor(text)?.phases[0]?.name).toBe('CLI Scaffold');
        expect(firstTools(text)).not.toContain('api_project');
    });

    it('the claim is still read — the reader does not hide it', () => {
        expect(requestedArtifact('اكتب أداة سطر أوامر تقرأ قاعدة البيانات في الخادم وتطبع الحجوزات').needsServer).toBe(true);
    });
});

describe('a CLI never reaches the page builders through the planner routes', () => {
    it.each([
        'اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه الزبائن لـمحل خياطة، وتتحقق من كل سطر، وتطبع تقريراً بالأعداد والمجاميع، وتكتب الأسطر الخاطئة في ملف errors.csv.',
        'Write a Python command-line tool that reads a CSV file of customers for a tailor shop, validates every row, prints a summary report with counts and totals, and writes the invalid rows to errors.csv.',
    ])('%s', async text => {
        const plan: any = await PlanningEngine.generatePlan({ intent: { goal: text, complexity: 'low', riskLevel: 'low', rawIntent: {} } as any });
        const tools = (plan.steps || []).map((s: any) => s.tool);
        expect(tools).not.toContain('react_project');
        expect(tools).not.toContain('web_page_builder');
        expect(tools).toContain('project_pipeline');
    });
});

describe('T4 — the object decides, not a word elsewhere in the sentence', () => {
    it('a web app that imports a CSV is an app', () => {
        expect(isCliRequest('Build a web app that imports a CSV file and charts it')).toBe(false);
        expect(scope('Build a web app that imports a CSV file and charts it')).toBe('app');
        const products = 'ابنِ تطبيق لإدارة المنتجات يستورد ملف CSV، فيه اسم المنتج والسعر والكمية';
        expect(isCliRequest(products)).toBe(false);
        expect(hasExplicitRecordSchema(products)).toBe(true);
    });
    it('a web tool is an app in both languages; a chatbot page is a bot', () => {
        expect(requestedArtifact('Build a web tool to manage orders').kind).toBe('app');
        expect(requestedArtifact('ابنِ أداة ويب لإدارة الطلبات').kind).toBe('app');
        expect(requestedArtifact('Build a chatbot page that books orders').kind).toBe('bot');
        expect(scope('Build a chatbot page that books orders')).toBe('app');
    });
});

describe('T5 — nouns Joe has never seen (law 4)', () => {
    it('the head decides, whatever the subject', () => {
        expect(requestedArtifact('Build a zibbet command-line tool').kind).toBe('cli');
        expect(requestedArtifact('اكتب أداة سطر أوامر للزبابيط').kind).toBe('cli');
        expect(scope('Build a florbing system with user accounts and an admin dashboard.')).toBe('system');
        expect(scope('اعمل صفحة فيها نموذج فلربة')).toBe('page');
    });
});

describe('T7 — every lexicon entry is a bilingual pair', () => {
    it.each([...ARTIFACT_LEXICON, ...BUILD_VERBS, ...SERVER_CLAIMS, ...OPERATOR_READS].map(p => [p.concept, p] as const))('%s', (_concept, pair) => {
        expect(pair.en.length).toBeGreaterThan(0);
        expect(pair.ar.length).toBeGreaterThan(0);
    });
    it.each(ARTIFACT_LEXICON.filter(p => !['neutral', 'web'].includes(p.kind)).map(p => [p.concept, p] as const))('%s reads as its kind from either side', (_concept, pair) => {
        expect(requestedArtifact(`Build a ${pair.en[0]}`).kind).toBe(pair.kind);
        expect(requestedArtifact(`ابنِ ${pair.ar[0]}`).kind).toBe(pair.kind);
    });
});

describe('T9 — the copies that disagreed stay gone', () => {
    const src = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
    it('one reader, not four', () => {
        expect(fs.existsSync(path.join(__dirname, '..', 'core', 'design', 'request-classifiers.ts'))).toBe(false);
        expect(src('core/orchestrator/PlanningEngine.ts')).not.toMatch(/export function isCliRequest|export function isCsvInputRequest/);
        const pipeline = src('modules/tools/definitions/ProjectPipelineTool.ts');
        expect(pipeline).not.toMatch(/API_OBJECT_EN|API_OBJECT_AR|const OWN_BACKEND|const NEGATED_BACKEND/);
    });
});
