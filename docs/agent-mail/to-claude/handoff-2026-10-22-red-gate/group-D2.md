# Group D2: 11 suites, 20 failing tests

## src/__tests__/nothing-is-done-until-it-is-proven.test.ts
- TEST: the ledger is published, in his language the rejected English branch also discloses the judge boundary
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "0 of 3 requested criteria were proven"
        Received string:    "⚠️ Delivery blocked: 0 of 6 requested criteria were proven — 4 were not proven, and 2 I did not know how to check:
           ❌ a counter or total — no source to read, so nothing can be proven
           ❌ a title or heading — no source to read, so nothing can be proven
           ❌ a production build — no production build was produced
           ❌ a column «counter» exists in the table — the column «counter» is missing
           ❌ a column «title» exists in the table — the column «title» is missing
           ❌ a column «production build» exists in the table — the column «production build» is missing"
          743 |         const block = acceptanceBlock(a, false);
          744 |         expect(block).toContain('Delivery blocked');
        > 745 |         expect(block).toContain('0 of 3 requested criteria were proven');
              |                       ^
          746 |         expect(block).toContain('1 were not proven');
          747 |         expect(block).toContain('2 I did not know how to check');
          748 |         expect(block).not.toContain('I did not inspect the rest of your request');
          at Object.<anonymous> (__tests__/nothing-is-done-until-it-is-proven.test.ts:745:23)

## src/__tests__/panel-shows-the-audit.test.ts
- TEST: the browser is awake before the audit needs it and the build wakes it BEFORE npm install, not when the audit starts
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toBeLessThan(expected)
        Expected: < -1
        Received:   392997
          46 |         expect(r).toContain('waitForPanelWatcher(auditSid, 15_000)');
          47 |         expect(r).toContain('watchSessionId: auditSid');
        > 48 |         expect(warmAt).toBeLessThan(installAt);
             |                        ^
          49 |         expect(installAt).toBeLessThan(auditAt);
          50 |     });
          51 |
          at Object.<anonymous> (__tests__/panel-shows-the-audit.test.ts:48:24)
- TEST: the browser is awake before the audit needs it and «أصلح ما تبقّى» warms it too — it audits within seconds of starting
  culprit (first-parent commit where it turned red): 30f07853 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /warmBrowserSession\(PANEL_BROWSER_SID\)/
        Received string:  "/**
         * project_repair — «أصلح ما تبقّى».
         *
         * The delivery message learned to say, at the top, that a build was handed over
         * with defects still open:
         *
         *     ⛔ سلّمتُه وهو لا يعمل كما ينبغي — 1 عطل جوهري باقٍ:
         *        • 1 ملف لم يصل: 404 /%22C:/Users/…jpg%22
         *        ↳ قل «أصلح ما تبقّى» وسأفتح المتصفّح على هذه بالذات.
         *
         * …and that last line was a promise with nothing behind it. A sentence
         * offering a command that does not exist is worse than no sentence: it spends
         * the user's trust on a door that opens onto a wall.
         *
         * This is the door. It re-measures the session's built project in a REAL
         * browser — in his panel, where he can watch it — repairs what it can, rebuilds,
         * measures again, and reports all three numbers. It never claims a gain it did
         * not measure, and if the repair made things worse the project is put back.
- TEST: and he is never invited to watch a browser he cannot see and nothing AFTER it invites him to watch — «👁️» three seconds later was a lie
  culprit (first-parent commit where it turned red): c219da21 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /onProgress\?\.\('pressing'\)/
        Received string:  "/**
         * SELF-QA — Joe opens a REAL browser on the app it just built and MEASURES
         * it before handing it over. Not a linter, not a guess: the production dist
         * is served, Chromium loads it, and the checks are the ones a careful
         * reviewer runs by hand:
         *
         *   - page errors and console errors (a broken app announces itself here)
         *   - failed asset requests (the 404 that ships silently)
         *   - images that never painted (naturalWidth 0)
         *   - dead controls (href=\"\" / href=\"#\") — the oldest field complaint
         *   - tap targets under 40px among real controls
         *   - exactly one h1
         *   - the theme toggle actually CHANGES the colours (a shipped build once
         *     flipped the attribute while every colour stayed put)
         *
         * Honest by contract: when the browser cannot launch (a machine without the
         * Playwright browsers), the audit reports itself SKIPPED — it never invents
         * a score.

## src/__tests__/qa-work-is-reported.test.ts
- TEST: the self-QA reaches the user in whatever language he asked in does not let an optional theme probe cancel the behavioural audit
  culprit (first-parent commit where it turned red): c219da21 (state before it: absent)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "await page.click('.theme-toggle,[aria-label=\"Toggle dark mode\"],[aria-label=\"تبديل الوضع الليلي\"]', { timeout: 2_500 });"
        Received string:    "/**
         * SELF-QA — Joe opens a REAL browser on the app it just built and MEASURES
         * it before handing it over. Not a linter, not a guess: the production dist
         * is served, Chromium loads it, and the checks are the ones a careful
         * reviewer runs by hand:
         *
         *   - page errors and console errors (a broken app announces itself here)
         *   - failed asset requests (the 404 that ships silently)
         *   - images that never painted (naturalWidth 0)
         *   - dead controls (href=\"\" / href=\"#\") — the oldest field complaint
         *   - tap targets under 40px among real controls
         *   - exactly one h1
         *   - the theme toggle actually CHANGES the colours (a shipped build once
         *     flipped the attribute while every colour stayed put)
         *
         * Honest by contract: when the browser cannot launch (a machine without the
         * Playwright browsers), the audit reports itself SKIPPED — it never invents
         * a score.

## src/__tests__/the-menu-that-only-exists-on-a-phone.test.ts
- TEST: a control that only exists on a phone is pressed too ⛔ POSITIVE — there is a pass at 390px, after the desktop walk
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toBeGreaterThan(expected)
        Expected: > 0
        Received:   -1
          49 |         const walkAt = APP.indexOf('const homeProbe = await probeControls(page, probeOpts());');
          50 |         const phoneAt = APP.indexOf('await applyViewportSize(page, 390, 844);');
        > 51 |         expect(walkAt).toBeGreaterThan(0);
             |                        ^
          52 |         expect(phoneAt).toBeGreaterThan(walkAt);
          53 |     });
          54 |
          at Object.<anonymous> (__tests__/the-menu-that-only-exists-on-a-phone.test.ts:51:24)
- TEST: a control that only exists on a phone is pressed too ⛔ POSITIVE — only controls the desktop walk never saw
  culprit (first-parent commit where it turned red): 7b3111ab (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "const fresh = (phone.controls || []).filter((c: any) => !seenLabels.has(String(c.label || '')));"
        Received string:    "/**
         * SELF-QA — Joe opens a REAL browser on the app it just built and MEASURES
         * it before handing it over. Not a linter, not a guess: the production dist
         * is served, Chromium loads it, and the checks are the ones a careful
         * reviewer runs by hand:
         *
         *   - page errors and console errors (a broken app announces itself here)
         *   - failed asset requests (the 404 that ships silently)
         *   - images that never painted (naturalWidth 0)
         *   - dead controls (href=\"\" / href=\"#\") — the oldest field complaint
         *   - tap targets under 40px among real controls
         *   - exactly one h1
         *   - the theme toggle actually CHANGES the colours (a shipped build once
         *     flipped the attribute while every colour stayed put)
         *
         * Honest by contract: when the browser cannot launch (a machine without the
         * Playwright browsers), the audit reports itself SKIPPED — it never invents
         * a score.
- TEST: the decorated name and the real name are both kept ⛔ POSITIVE — every writer sets `bare`, and there are two of them
  culprit (first-parent commit where it turned red): 7b3111ab (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "allControls.push({ ...c, bare: c.label, context: 'phone:/', label: `الجوّال ${c.label}` })"
        Received string:    "/**
         * SELF-QA — Joe opens a REAL browser on the app it just built and MEASURES
         * it before handing it over. Not a linter, not a guess: the production dist
         * is served, Chromium loads it, and the checks are the ones a careful
         * reviewer runs by hand:
         *
         *   - page errors and console errors (a broken app announces itself here)
         *   - failed asset requests (the 404 that ships silently)
         *   - images that never painted (naturalWidth 0)
         *   - dead controls (href=\"\" / href=\"#\") — the oldest field complaint
         *   - tap targets under 40px among real controls
         *   - exactly one h1
         *   - the theme toggle actually CHANGES the colours (a shipped build once
         *     flipped the attribute while every colour stayed put)
         *
         * Honest by contract: when the browser cannot launch (a machine without the
         * Playwright browsers), the audit reports itself SKIPPED — it never invents
         * a score.

## src/__tests__/the-terminal-is-where-the-work-happens.test.ts
- TEST: THE WIRING: both builders work in the visible shell the server build does the same, and announces its long-running process
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /const npmCache = path\.join\(proj, '\.npm-cache'\);/
        Received string:  "/**
         * THE BACKEND FRONT — Joe builds real APIs, not just faces.
         *
         * Every world-class builder eventually hits the same wall: a beautiful
         * frontend with nowhere to PUT anything. This tool scaffolds a complete,
         * runnable Express API with a REAL database and ZERO native dependencies:
         *
         *   - node:sqlite when the runtime carries it (Node ≥ 22.5 — the user's
         *     machine runs Node 24, where it is stable);
         *   - a JSON file store with the IDENTICAL interface otherwise, chosen at
         *     boot by the generated db.js itself — the API works on every Node, and
         *     /api/health tells you honestly which backend you got.
         *
         * The discipline is the same as the React scaffolder: hand-written
         * parameterized templates that run by construction (no model writes code),
         * kind-aware resources (a restaurant's API serves dishes, a store's serves
         * products), bounded validation, parameterized statements, and a LIVE PROOF
         * at the end — the tool boots the real server (through the Execution

## src/__tests__/scheduling-system-contract.test.ts
- TEST: multi-entity scheduling systems does not spend a provider call authoring the dormant single-table component
  culprit (first-parent commit where it turned red): 38d84ffc (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "!workflowSemanticContractPassed && !unifiedTables"
        Received string:    "/**
         * STAGE 2 OF THE WORLD-CLASS ROADMAP — real Vite + React projects.
         *
         * Bolt and Lovable generate framework projects, not pages. Joe now does too —
         * with the discipline that makes his pages reliable applied to React: the
         * PROJECT SHAPE is deterministic (hand-written, parameterized templates that
         * compile by construction — a weak model is never asked to write JSX it might
         * break), the DESIGN comes from Joe's own palette engine (same tokens, same
         * AA guarantees, RTL first), and the CONTENT is derived from the request.
         *
         * The scaffold is a complete runnable project: package.json, vite.config,
         * React 18 components, router-free single-page App, tokens.css from the
         * palette. When npm is available the tool INSTALLS and BUILDS it on the spot
         * — streamed live to the terminal — so what is reported as working compiled
         * for real. `dev_server_start` (already in Joe) then serves it live.
         */
        import fs from 'fs';
        import http from 'http';

## src/__tests__/every-loop-is-connected.test.ts
- TEST: renaming the site never needed a model it needs BOTH a site word and a name word — «غيّر اسم المنتج» is not this
  culprit (first-parent commit where it turned red): 32db3692 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /if \(siteWord && nameWord && val && val\.length <= 60/
        Received string:  "/**
         * STAGE 3 OF THE WORLD-CLASS ROADMAP — surgical, diff-based project editing.
         *
         * What Cursor and Aider got right: an edit to a real project touches LINES,
         * not files. Regenerating a whole component to change one heading is how
         * content gets lost — the exact failure the page builder spent months
         * defending against. This tool edits the way a senior engineer does:
         *
         *   1. Common edits are DETERMINISTIC — a colour change rewrites tokens.css
         *      from Joe's palette engine; no model is asked, nothing else can break.
         *   2. Everything else goes through SEARCH/REPLACE blocks: the model must
         *      quote the exact lines it wants changed and what replaces them. A
         *      block whose SEARCH text is not in the file is refused — the model
         *      cannot invent code it never read.
         *   3. Every edited JS/JSX file passes an esbuild SYNTAX GATE before it is
         *      kept; a file that no longer parses is reverted on the spot.
         *   4. When node_modules exists, the REAL `vite build` verifies the whole
         *      project afterwards — and a red build reverts every file, honestly.
- TEST: renaming the site never needed a model and it only runs when nothing else already handled the request
  culprit (first-parent commit where it turned red): 32db3692 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "if (!touched.length) {"
        Received string:    "THE COMMONEST EDIT OF ALL — AND IT NEEDED A MODEL TO MAKE IT.
                 *
                 * «غيّر اسم الموقع إلى …» is the first thing anyone says after seeing
                 * their build. It had no deterministic path: the row editor above
                 * looks for a NAMED row and finds none, and the comment there says
                 * plainly that a rowless «اسم» request «belongs to the model path
                 * below». So the simplest edit in the product was the one that
                 * depended on a network, and on a machine with no key it answered
                 * «لم أجد ما يطابق الطلب» — about a name that is sitting in the file
                 * in one line.
                 *
                 * The brand lives in exactly two places and every other file reads it
                 * from there: `brand:` in src/content.js, and the `<title>` of
                 * index.html. Two known bytes are not a job for a language model.
                 */
                {
                    const siteWord = /(الموقع|موقعي|التطبيق|تطبيقي|المشروع|مشروعي|النظام|الصفحة|صفحتي|site|website|app|project|page)/i.test(request);
                    const nameWord = /(?<![ء-ي])(اسم|الاسم|عنوان|العنوان|سمّه|سمه)(?![ء-ي])|\\b(brand|title|rename)\\b/i.test(request);
- TEST: renaming the site never needed a model and in the tab title too, so the rename is not half done
  culprit (first-parent commit where it turned red): 32db3692 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /<title>\$\{String\(inner\)\.split\(oldBrand\)\.join\(val\)\}<\/title>/
        Received string:  "/**
         * STAGE 3 OF THE WORLD-CLASS ROADMAP — surgical, diff-based project editing.
         *
         * What Cursor and Aider got right: an edit to a real project touches LINES,
         * not files. Regenerating a whole component to change one heading is how
         * content gets lost — the exact failure the page builder spent months
         * defending against. This tool edits the way a senior engineer does:
         *
         *   1. Common edits are DETERMINISTIC — a colour change rewrites tokens.css
         *      from Joe's palette engine; no model is asked, nothing else can break.
         *   2. Everything else goes through SEARCH/REPLACE blocks: the model must
         *      quote the exact lines it wants changed and what replaces them. A
         *      block whose SEARCH text is not in the file is refused — the model
         *      cannot invent code it never read.
         *   3. Every edited JS/JSX file passes an esbuild SYNTAX GATE before it is
         *      kept; a file that no longer parses is reverted on the spot.
         *   4. When node_modules exists, the REAL `vite build` verifies the whole
         *      project afterwards — and a red build reverts every file, honestly.

## src/__tests__/project-text-edit.test.ts
- TEST: named-row text edits — deterministic, no model an explicit value is used verbatim, and ONLY the named row changes
  culprit (first-parent commit where it turned red): 38d84ffc (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /\{ name: 'الإصدار الفاخر',[^\n]*?price: '99 دولار'/
        Received string:  "// The words of the app, in one place — edit here, every component follows.
        export const content = {
          brand: 'react',
          isArabic: true,
          tagline: 'react لمتجر عطور',
          heroTitle: 'react — react لمتجر عطور',
          heroLede: 'منتجات مختارة بعناية وتجربة شراء سريعة وواضحة الأسعار.',
          cta: 'تسوق الآن',
          featuresTitle: 'لماذا نحن؟',
          features: [
            { title: 'سرعة فورية', text: 'بناء Vite حديث — تحميل فوري وتحديث حي أثناء التطوير.' },
            { title: 'هوية متسقة', text: 'ألوان ومقاسات من نظام تصميم واحد، بوضعين ليلي ونهاري.' },
            { title: 'جاهز للتوسع', text: 'مكوّنات React نظيفة قابلة لإضافة صفحات وميزات جديدة.' },
          ],
          contactTitle: 'تواصل معنا',
          ctaBandTitle: 'وصّلنا لك الأفضل',
          ctaBandText: 'اطلب اليوم ويصلك بسرعة وبتغليف يليق.',
          // The hero ARCHETYPE this build wears — 'overlay' lays the copy over a

## src/__tests__/the-app-is-the-system.test.ts
- TEST: the app can actually read and write that table a generated table answers «row» where the catalogue answers «item»
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /return \{ ok: true, item: d\.item \|\| d\.row \|\| row \};/
        Received string:  "/**
         * THE APPLICATION HALF OF A REACT BUILD.
         *
         * `ReactProjectTool` knows how to make a beautiful presentation site. That is
         * the right answer for a café and the wrong answer for «تطبيق خرائط»: the user
         * received Hero + Features + FAQ + a restaurant menu and no map at all, and
         * said so — «معرض صور وكلمات وليس تطبيقات حقيقية».
         *
         * So an app request no longer goes through the section library. It goes
         * through here, and gets a program: state, storage, input, validation,
         * computed numbers, and a real integration where the domain demands one
         * (Leaflet + OpenStreetMap for a map, open-meteo for weather, the session's
         * own Joe API for anything that owns rows).
         *
         * The shell and low-level primitives are hand-written and parameterized — the
         * same discipline the page builder uses. They are scaffolding, not a substitute
         * for domain reasoning: a request-driven engine may be omitted here and authored
         * by Joe's AI file writer from the user's evidence, then `vite build` proves the

## src/__tests__/relations.test.ts
- TEST: the interface reaches the second table the records engine renders the picker, the filter and the parent panel
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "const rel = content.relation"
        Received string:    "import React from 'react';
        import { useRecordsController } from '../app/records-controller.js';
        import RecordsView from './RecordsView.jsx';·
        export default function RecordsApp({ content }) {
          return <RecordsCollection key={JSON.stringify([content.storeKey, content.api || ''])} content={content} />;
        }
        function RecordsCollection({ content }) {
          const controller = useRecordsController(content);
          return <RecordsView content={content} controller={controller} />;
        }
        "
          127 |     it('the records engine renders the picker, the filter and the parent panel', () => {
          128 |         const app = files('نظام حجز مواعيد لعيادة أسنان')['src/components/RecordsApp.jsx'];
        > 129 |         expect(app).toContain('const rel = content.relation');
              |                     ^
          130 |         expect(app).toContain('addParent');            // create a doctor without leaving
          131 |         expect(app).toContain('parentFilter');         // «كل مواعيد هذا الطبيب»
- TEST: the interface reaches the second table an app with no parent still renders — the picker is simply absent
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "const rel = content.relation"
        Received string:    "import React from 'react';
        import { useRecordsController } from '../app/records-controller.js';
        import RecordsView from './RecordsView.jsx';·
        export default function RecordsApp({ content }) {
          return <RecordsCollection key={JSON.stringify([content.storeKey, content.api || ''])} content={content} />;
        }
        function RecordsCollection({ content }) {
          const controller = useRecordsController(content);
          return <RecordsView content={content} controller={controller} />;
        }
        "
          139 |         expect(content).toContain('relation: null');
          140 |         // The same component serves both: the guard is `rel ? … : null`.
        > 141 |         expect(app).toContain('const rel = content.relation');
              |                     ^
          142 |     });
          143 |
- TEST: the interface reaches the second table and an edit now reaches the server instead of only this browser
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "apiUpdate(content.api, editing, patch)"
        Received string:    "import React from 'react';
        import { useRecordsController } from '../app/records-controller.js';
        import RecordsView from './RecordsView.jsx';·
        export default function RecordsApp({ content }) {
          return <RecordsCollection key={JSON.stringify([content.storeKey, content.api || ''])} content={content} />;
        }
        function RecordsCollection({ content }) {
          const controller = useRecordsController(content);
          return <RecordsView content={content} controller={controller} />;
        }
        "
          144 |     it('and an edit now reaches the server instead of only this browser', () => {
          145 |         const app = files('تطبيق ملاحظات')['src/components/RecordsApp.jsx'];
        > 146 |         expect(app).toContain('apiUpdate(content.api, editing, patch)');
              |                     ^
          147 |     });
          148 | });

## src/__tests__/an-export-that-exports-nothing.test.ts
- TEST: the export button is guarded on what the export reads reads visible.length, which is what leaves with him
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "disabled={!visible.length}"
        Received string:    "import React from 'react';
        import { useRecordsController } from '../app/records-controller.js';
        import RecordsView from './RecordsView.jsx';·
        export default function RecordsApp({ content }) {
          return <RecordsCollection key={JSON.stringify([content.storeKey, content.api || ''])} content={content} />;
        }
        function RecordsCollection({ content }) {
          const controller = useRecordsController(content);
          return <RecordsView content={content} controller={controller} />;
        }
        "
          84 |
          85 |     it('reads visible.length, which is what leaves with him', () => {
        > 86 |         expect(records()).toContain('disabled={!visible.length}');
             |                           ^
          87 |     });
          88 |
- TEST: the export button is guarded on what the export reads hands that same visible list to toCsv
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "toCsv("
        Received string:    "
        "
           96 |         const src = records();
           97 |         const btn = src.slice(src.indexOf('disabled={!visible.length}'));
        >  98 |         expect(btn.slice(0, 400)).toContain('toCsv(');
              |                                   ^
           99 |         expect(btn.slice(0, 400)).toContain('visible');
          100 |     });
          101 | });
          at Object.<anonymous> (__tests__/an-export-that-exports-nothing.test.ts:98:35)
