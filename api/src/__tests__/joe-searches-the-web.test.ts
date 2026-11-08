/**
 * JOE SEARCHES THE WEB, AND ANSWERS QUESTIONS ABOUT THE WORLD FROM IT.
 *
 * The owner, 2026-11-08: «make Joe better than Codex and Manus». Joe's engine
 * could read a page only when it knew its address, and the chat's answerer
 * answered «the best phone of 2026» or «gold's price today» from a model's
 * memory. Pinned, with no network:
 *   - each source's answer is read right: Brave's results page, Brave's API,
 *     Bing's and Google's news feeds (Bing's click counter unwrapped to the
 *     article's own address), DuckDuckGo's instant answer, Wikipedia;
 *   - what is searched before answering: questions about the world as it is
 *     now, or an outright «ابحث»; never small talk, Joe himself, or code;
 *   - a page is read where it speaks of the question, not in its menus;
 *   - the engine has web_search beside web_read, named in six languages.
 */
import {
    parseBraveApi, parseBraveResults, parseInstantAnswer, parseNewsRss, parseWikipedia,
} from '../core/engine/web-search';
import { needsWebFacts, relevantExcerpt } from '../core/engine/web-grounding';

describe('each source is read right', () => {
    test('Brave\'s results page: title, address, the line under it; its own addresses left out', () => {
        const html = [
            '<div class="snippet svelte-x" data-pos="0" data-type="web"><a href="https://kolshzin.com/the-best-phones/" class="l1"><div class="title svelte-y">أفضل الهواتف الذكية 2026 &amp; الأسعار</div></a><div class="generic-snippet svelte-z"><div class="content">يمثل هاتف iPhone 18 Pro Max الذروة&nbsp;...</div></div></div>',
            '<div class="snippet" data-type="web"><a href="https://search.brave.com/goggles"><div class="title">Brave</div></a></div>',
            '<div class="snippet" data-type="web"><a href="https://www.cnet.com/tech/mobile/best-phone/"><div class="title">Best Phones in 2026</div></a><div class="generic-snippet"><div>From the iPhone 18 Pro to the Galaxy S26</div></div></div>',
        ].join('');
        expect(parseBraveResults(html)).toEqual([
            { title: 'أفضل الهواتف الذكية 2026 & الأسعار', url: 'https://kolshzin.com/the-best-phones/', snippet: 'يمثل هاتف iPhone 18 Pro Max الذروة ...' },
            { title: 'Best Phones in 2026', url: 'https://www.cnet.com/tech/mobile/best-phone/', snippet: 'From the iPhone 18 Pro to the Galaxy S26' },
        ]);
    });

    test('Brave\'s API answer', () => {
        expect(parseBraveApi({ web: { results: [{ title: '<b>Gold</b> price', url: 'https://x.com/gold', description: 'Today <strong>83</strong> JOD' }, { title: 'bad', url: 'ftp://x' }] } }))
            .toEqual([{ title: 'Gold price', url: 'https://x.com/gold', snippet: 'Today 83 JOD' }]);
    });

    test('Bing\'s news feed: the click counter unwrapped to the article; publisher, date and first lines kept', () => {
        const xml = `<rss><channel><title>x</title><item><title>أسعار الذهب في الأردن اليوم الأحد 8 نوفمبر 2026</title>
<link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;url=https%3a%2f%2fal-ain.com%2farticle%2fgold-prices-in-jordan&amp;c=1</link>
<description>بلغ سعر غرام عيار 21 نحو 83 دينارا</description><pubDate>Sun, 08 Nov 2026 06:00:00 GMT</pubDate><News:Source>العين الإخبارية</News:Source></item></channel></rss>`;
        expect(parseNewsRss(xml)).toEqual([{
            title: 'أسعار الذهب في الأردن اليوم الأحد 8 نوفمبر 2026',
            url: 'https://al-ain.com/article/gold-prices-in-jordan',
            snippet: 'العين الإخبارية · 2026-11-08 — بلغ سعر غرام عيار 21 نحو 83 دينارا',
        }]);
    });

    test('Google\'s news feed keeps its own link (it opens only on a script) with the publisher', () => {
        const xml = '<item><title>Best laptops 2026 - PCWorld</title><link>https://news.google.com/rss/articles/CBMi123?oc=5</link><pubDate>Wed, 04 Nov 2026 10:00:00 GMT</pubDate><source url="https://www.pcworld.com">PCWorld</source></item>';
        expect(parseNewsRss(xml)[0]).toEqual({ title: 'Best laptops 2026 - PCWorld', url: 'https://news.google.com/rss/articles/CBMi123?oc=5', snippet: 'PCWorld · 2026-11-04' });
    });

    test('DuckDuckGo\'s instant answer, and Wikipedia\'s search', () => {
        expect(parseInstantAnswer({ Heading: 'iPhone 18 Pro', AbstractSource: 'Wikipedia', AbstractURL: 'https://en.wikipedia.org/wiki/IPhone_18_Pro', Abstract: 'The iPhone 18 Pro is a smartphone.' }))
            .toEqual([{ title: 'iPhone 18 Pro — Wikipedia', url: 'https://en.wikipedia.org/wiki/IPhone_18_Pro', snippet: 'The iPhone 18 Pro is a smartphone.' }]);
        expect(parseInstantAnswer({ Abstract: '' })).toEqual([]);
        expect(parseWikipedia({ query: { search: [{ title: 'هاتف ذكي', snippet: 'الهاتف <span class="searchmatch">الذكي</span>' }] } }, 'ar'))
            .toEqual([{ title: 'هاتف ذكي', url: `https://ar.wikipedia.org/wiki/${encodeURIComponent('هاتف_ذكي')}`, snippet: 'الهاتف الذكي' }]);
    });
});

describe('what is searched before answering', () => {
    test.each([
        'ما أفضل هاتف 2026؟', 'كم سعر الذهب اليوم', 'كم سعر غرام الذهب عيار 21 اليوم في الأردن؟', 'ابحث عن أفضل مطاعم في عمّان',
        'قارن بين ايفون 18 وجالكسي اس 26', 'شو الطقس بكرة في الرياض', 'what is the best laptop for students', 'latest news about the World Cup',
        'دورلي على سعر رحلة من عمان لدبي',
    ])('«%s» is searched', q => expect(needsWebFacts(q)).toBe(true));

    test.each([
        'مرحبا كيف حالك', 'من أنت؟', 'اكتب لي دالة بايثون لترتيب قائمة', 'اشرح لي ما هي الخوارزمية', 'شكرا', 'what is your name', 'fix this regex error',
    ])('«%s» is not', q => expect(needsWebFacts(q)).toBe(false));
});

describe('a page is read where it speaks of the question', () => {
    test('the menus at its top give way to the paragraph with the figures', () => {
        const menu = Array.from({ length: 80 }, (_, i) => `قسم${i} أخبار محلية رياضة`).join(' ');
        const article = 'وبلغ سعر غرام الذهب من عيار 21 الأكثر رغبة لدى الأردنيين 83 دينارا لجهة البيع، مقابل 79.60 دينارا لجهة الشراء.';
        const page = `${menu} ${'x '.repeat(400)} ${article} ${'y '.repeat(400)}`;
        const ex = relevantExcerpt(page, 'كم سعر غرام الذهب عيار 21 في الأردن؟', 900);
        expect(ex).toContain('83 دينارا');
        expect(ex.length).toBeLessThanOrEqual(900);
    });
});

describe('the engine has web_search', () => {
    test('beside web_read, through the gateway, and named for people in six languages', () => {
        const { webTools, webSearchTool } = require('../core/engine/tools/web');
        expect(webTools.map((t: any) => t.name)).toEqual(['web_read', 'web_search']);
        expect(webSearchTool.parse({ query: '  أفضل هاتف  ' })).toEqual({ ok: true, value: { query: 'أفضل هاتف' } });
        expect(webSearchTool.parse({}).ok).toBe(false);
        expect(webSearchTool.parse({ query: 'x', count: 20 }).ok).toBe(false);
        const { ENGINE_WEB_TOOLS } = require('../modules/tools/definitions/EngineWebTools');
        expect(ENGINE_WEB_TOOLS.map((t: any) => t.name)).toEqual(['engine_web_read', 'engine_web_search']);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const feed = require('fs').readFileSync(require('path').join(__dirname, '..', '..', '..', 'web', 'src', 'lib', 'activity-feed.ts'), 'utf8');
        expect(feed).toMatch(/web_search: \{ ar: 'البحث في الإنترنت', en: 'Search the web', fr: [^}]+de: [^}]+ru: [^}]+es: [^}]+\}/u);
    });
});
