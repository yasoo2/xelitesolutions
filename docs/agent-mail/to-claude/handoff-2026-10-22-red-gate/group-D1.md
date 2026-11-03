# Group D1: 11 suites, 14 failing tests

## src/__tests__/a-cosmetic-layer-that-starved-the-planner.test.ts
- TEST: the stand-down knows what it is protecting POSITIVE — with the local brain leading, the section author does not stand down
  culprit (first-parent commit where it turned red): 154e231d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /providersAreRationing = insideATest \|\| \(!localBrainLeads/
        Received string:  "/**
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

## src/__tests__/a-floor-that-hears-the-compiler-but-not-the-browser.test.ts
- TEST: the authored interface is rolled back by the browser, not only by the bundler ⛔ ORDERING — the rollback happens BEFORE the delivery verdict is formed
  culprit (first-parent commit where it turned red): 0e2ff096 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toEqual(expected) // deep equality
        - Expected  - 2
        + Received  + 2
          Object {
        -   "rollbackComesFirst": true,
        +   "rollbackComesFirst": false,
            "rollbackFound": true,
        -   "verdictFound": true,
        +   "verdictFound": false,
          }
          78 |             verdictFound: verdictAt > 0,
          79 |             rollbackComesFirst: rollbackAt > 0 && verdictAt > 0 && rollbackAt < verdictAt,
        > 80 |         }).toEqual({ rollbackFound: true, verdictFound: true, rollbackComesFirst: true });
             |            ^
          81 |     });
          82 |
          83 |     /**

## src/__tests__/a-grey-box-where-the-product-should-be.test.ts
- TEST: a product with no photo is drawn, not left blank NEGATIVE — the records grid keeps the caller it already had
  culprit (first-parent commit where it turned red): f8cf0852 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "cardFor(draft[primary.key])"
        Received string:    "/**
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

## src/__tests__/a-page-he-never-chose-delivered-as-a-choice.test.ts
- TEST: a silent fallback is announced where he reads ⛔ POSITIVE — and it reaches the delivery message itself
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /const acceptBlock = `\$\{standDownNotice\}\$\{acceptanceBlock\(acceptance, isAr\)\}/
        Received string:  "/**
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
- TEST: a silent fallback is announced where he reads ⛔ NEGATIVE — the stand-down itself is untouched
  culprit (first-parent commit where it turned red): 82179eeb (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /if \(!appBp && sections\.length && providersAreRationing\) \{/
        Received string:  "/**
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

## src/__tests__/a-palette-the-app-never-reads.test.ts
- TEST: the palette the app is painted with is the palette Joe derived POSITIVE — every token the app reads is one the palette defines
  culprit (first-parent commit where it turned red): c219da21 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toEqual(expected) // deep equality
        - Expected  - 1
        + Received  + 4
        - Array []
        + Array [
        +   "--danger",
        +   "--media-warm",
        + ]
          73 |         //  Named one by one, because «some token is missing» is not something
          74 |         //  anyone can act on and this list is exactly the repair.
        > 75 |         expect(missing).toEqual([]);
             |                         ^
          76 |     });
          77 |
          78 |     it('POSITIVE — a token read with no fallback is one the palette guarantees', () => {
          at Object.<anonymous> (__tests__/a-palette-the-app-never-reads.test.ts:75:25)
- TEST: the palette the app is painted with is the palette Joe derived POSITIVE — a token read with no fallback is one the palette guarantees
  culprit (first-parent commit where it turned red): f8cf0852 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toEqual(expected) // deep equality
        - Expected  - 1
        + Received  + 3
        - Array []
        + Array [
        +   "--media-warm",
        + ]
          90 |         const css = paletteCss(buildPalette('متجر قهوة'));
          91 |         const bare = readWithoutFallback(SRC(APP)).filter(t => !defined(css).has(t));
        > 92 |         expect(bare).toEqual([]);
             |                      ^
          93 |     });
          94 |
          95 |     it('POSITIVE — the surfaces that carry the most area follow the request', () => {
          at Object.<anonymous> (__tests__/a-palette-the-app-never-reads.test.ts:92:22)

## src/__tests__/a-team-not-a-person.test.ts
- TEST: the generated server decides nothing twice the roles are COMPILED from one definition, not retyped
  culprit (first-parent commit where it turned red): 0e2ff096 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /export const ROLES = \$\{JSON\.stringify\(ROLES\.map/
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
- TEST: the accounts routes, and the ways they can be abused and the build message tells the owner the roles exist at all
  culprit (first-parent commit where it turned red): 0e2ff096 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /\$\{describeRoles\(false\)\}/
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

## src/__tests__/app-is-used.test.ts
- TEST: one definition of a dead control the React audit borrows the probe instead of growing its own
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /await probeControls\(page, probeOpts\(\)\)/
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

## src/__tests__/audit-measures-the-system.test.ts
- TEST: the build audits the system it just packaged packaging is reusable, because the repair rebuilds the interface
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /const packaged = built \? packageIntoApi\(true\) : false;/
        Received string:  "/**
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

## src/__tests__/deep-self-qa.test.ts
- TEST: a measurement it cannot make honestly, it does not make and a click that hands over a FILE counts as an effect
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toContain(expected) // indexOf
        Expected substring: "effect = downloaded ? 'download'"
        Received string:    "/**
         * Joe uses what he built.
         *
         * The blueprint promises interaction: a cart whose badge counts up, an accordion
         * that opens, a form that refuses to submit empty, tabs that switch, a counter
         * that counts. The model writes the buttons either way. Nothing ever pressed
         * one — the visual audit measures how the page LOOKS, and a dead button looks
         * perfect.
         *
         * So this presses them. It opens the page in a real browser, finds every control
         * a visitor would try, clicks it, and measures whether anything happened. A
         * button that changes nothing is reported as a button that changes nothing.
         *
         * Nothing here simulates a click or reasons about the source: a control that is
         * not actually pressed is not reported as working, and a page the browser could
         * not open is reported as not audited rather than as passing.
         */·
        import { AuditEyes, boxOf, evalInPage } from './audit-eyes';

## src/__tests__/he-asked-for-six-and-got-an-empty-shelf.test.ts
- TEST: the seed reaches the shelf, not just a variable NEGATIVE — and the catalogue stands down with the other authors
  culprit (first-parent commit where it turned red): 0e2ff096 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /if \(!copyProvidersRationing && seedFields\.length/
        Received string:  "/**
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

## src/__tests__/honest-delivery.test.ts
- TEST: what blocks delivery is an open finding, not a flattering score the builder collects them AFTER the self-repair, from the final audit
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /qualityDeliveryBlocked = openQualityFindings\.length > 0/
        Received string:  "/**
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
