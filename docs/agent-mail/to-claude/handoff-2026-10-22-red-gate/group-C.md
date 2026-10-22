# Group C: 10 suites, 16 failing tests

## src/__tests__/a-bracket-is-his-answers.test.ts
- TEST: a bracket after a column names its answers a single value in brackets is a note, not a list of options
  culprit (first-parent commit where it turned red): 75e32c75 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toBeUndefined()
        Received: ["قيد الانتظار", "قيد الإصلاح", "تم الإصلاح"]
          83 |         //  single option would be inventing a constraint he did not state.
          84 |         const f = field('جدول المنتجات فيه اسم الصنف والسعر والحالة (متوفر)', 'الحالة');
        > 85 |         expect(f?.options).toBeUndefined();
             |                            ^
          86 |     });
          87 | });
          88 |
          at Object.<anonymous> (__tests__/a-bracket-is-his-answers.test.ts:85:28)

## src/__tests__/a-capability-is-not-a-column.test.ts
- TEST: the boundary of the English cut, declared and not hidden a bare English capability with no introducer IS still read as a column
  culprit (first-parent commit where it turned red): 75e32c75 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toEqual(expected) // deep equality
        - Expected  - 1
        + Received  + 0
          Array [
            "name",
            "class",
            "grade",
        -   "sortable by grade",
          ]
          171 |         //  Closing it needs a signal this function does not have.
          172 |         expect(labels('A students table with name, class and grade, sortable by grade'))
        > 173 |             .toEqual(['name', 'class', 'grade', 'sortable by grade']);
              |              ^
          174 |     });
          175 | });
          176 |
          at Object.<anonymous> (__tests__/a-capability-is-not-a-column.test.ts:173:14)

## src/__tests__/a-column-called-fih.test.ts
- TEST: the English half of the same cleaner still runs a list of values is still refused
  culprit (first-parent commit where it turned red): c219da21 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toBeNull()
        Received: [{"key": "text1", "label": "milk", "options": undefined, "role": "text", "type": "text"}, {"key": "text2", "label": "bread", "options": undefined, "role": "text", "type": "text"}, {"key"
          85 |
          86 |     it('a list of values is still refused', () => {
        > 87 |         expect(derivedColumns('A shopping list with milk, bread and eggs')).toBeNull();
             |                                                                             ^
          88 |     });
          89 | });
          90 |
          at Object.<anonymous> (__tests__/a-column-called-fih.test.ts:87:77)

## src/__tests__/a-page-he-named-is-a-criterion-not-a-column.test.ts
- TEST: and a page he named is not a column in a table a real column list is untouched — this is a boundary, not a ban on «فيه»
  culprit (first-parent commit where it turned red): 81e8913c (state before it: pass)
  raw failure at 917c70e:
        expect(received).toBe(expected) // Object.is equality
        Expected: 3
        Received: 0
          67 |     it('a real column list is untouched — this is a boundary, not a ban on «فيه»', () => {
          68 |         const got = ids('جدول فواتير فيه اسم العميل والمبلغ والتاريخ');
        > 69 |         expect(got.filter(i => i.startsWith('column:')).length).toBe(3);
             |                                                                 ^
          70 |     });
          71 |
          72 |     it('a page AND columns in one sentence keeps the columns', () => {
          at Object.<anonymous> (__tests__/a-page-he-named-is-a-criterion-not-a-column.test.ts:69:65)
- TEST: and a page he named is not a column in a table a page AND columns in one sentence keeps the columns
  culprit (first-parent commit where it turned red): 81e8913c (state before it: pass)
  raw failure at 917c70e:
        expect(received).toBe(expected) // Object.is equality
        Expected: 2
        Received: 0
          81 |         //  pages is not a shop with a table.
          82 |         const got = ids('جدول فواتير فيه صفحة المنتجات واسم العميل والمبلغ');
        > 83 |         expect(got.filter(i => i.startsWith('column:')).length).toBe(2);
             |                                                                 ^
          84 |     });
          85 | });
          86 |
          at Object.<anonymous> (__tests__/a-page-he-named-is-a-criterion-not-a-column.test.ts:83:65)

## src/__tests__/a-rename-is-neither-an-add-nor-a-remove.test.ts
- TEST: a rename is read, in either language the column keeps its key and its type — the rows under it are his
  culprit (first-parent commit where it turned red): c219da21 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toEqual(expected) // deep equality
        - Expected  - 2
        + Received  + 2
          Array [
            "رقم الفاتورة:text1",
        -   "المبلغ:money1",
        -   "التاريخ:date1",
        +   "المبلغ:amount",
        +   "التاريخ:date",
          ]
          51 |             'بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ', true);
          52 |         const before = bp.fields.map(f => `${f.label}:${f.key}`);
        > 53 |         expect(before).toEqual(['رقم الفاتورة:text1', 'المبلغ:money1', 'التاريخ:date1']);
             |                        ^
          54 |         const after = applyColumnEdit(bp.fields, columnEdit('غيّر اسم عمود المبلغ إلى القيمة'), true);
          55 |         expect(after.map(f => `${f.label}:${f.key}`)).toEqual(['رقم الفاتورة:text1', 'القيمة:money1', 'التاريخ:date1']);
          56 |     });

## src/__tests__/a-verb-phrase-read-as-a-column.test.ts
- TEST: a column is named by a noun, never by a verb NEGATIVE — TWO columns still outrank the noun, exactly as before
  culprit (first-parent commit where it turned red): 81e8913c (state before it: pass)
  raw failure at 917c70e:
        expect(received).toBe(expected) // Object.is equality
        Expected: "generic"
        Received: "booking"
           98 |         //  The boundary. Requiring two must not weaken the rule it guards:
           99 |         //  a list he WROTE still beats a noun he happened to use.
        > 100 |         expect(detectAppKind('عندي عيادة أسنان، أريد جدولاً فيه اسم المريض ورقم تلفونه ووقت الموعد')).toBe('generic');
              |                                                                                                       ^
          101 |     });
          102 |
          103 |     it('NEGATIVE — a noun that OPENS with a verb letter is still a column', () => {
          at Object.<anonymous> (__tests__/a-verb-phrase-read-as-a-column.test.ts:100:103)
- TEST: a column is named by a noun, never by a verb NEGATIVE — and the archetype that a column list SHOULD override still is
  culprit (first-parent commit where it turned red): 81e8913c (state before it: pass)
  raw failure at 917c70e:
        expect(received).toBe(expected) // Object.is equality
        Expected: "generic"
        Received: "booking"
          119 |         expect(detectAppKind(
          120 |             'عندي عيادة أسنان، أريد جدولاً فيه اسم المريض ورقم تلفونه وتاريخ الموعد',
        > 121 |         )).toBe('generic');
              |            ^
          122 |     });
          123 | });
          124 |
          at Object.<anonymous> (__tests__/a-verb-phrase-read-as-a-column.test.ts:121:12)

## src/__tests__/the-schema-reader-was-blind-in-english.test.ts
- TEST: …and a list of values is still not a schema a shopping list holds things, not columns
  culprit (first-parent commit where it turned red): c219da21 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toBeNull()
        Received: [{"key": "text1", "label": "milk", "options": undefined, "role": "text", "type": "text"}, {"key": "text2", "label": "bread", "options": undefined, "role": "text", "type": "text"}, {"key"
          46 |         //  The English negative that Arabic gets for free from definiteness:
          47 |         //  milk is a value. Read as a schema this becomes an app about milk.
        > 48 |         expect(derivedColumns('A shopping list with milk, bread and eggs')).toBeNull();
             |                                                                             ^
          49 |     });
          50 |
          51 |     it('a list after a field noun holds that field\u2019s values', () => {
          at Object.<anonymous> (__tests__/the-schema-reader-was-blind-in-english.test.ts:48:77)
- TEST: …and a list of values is still not a schema a list after a field noun holds that field’s values
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toBeNull()
        Received: [{"key": "text1", "label": "coffee", "options": undefined, "role": "text", "type": "text"}, {"key": "text2", "label": "tools", "options": undefined, "role": "text", "type": "text"}, {"ke
          50 |
          51 |     it('a list after a field noun holds that field\u2019s values', () => {
        > 52 |         expect(derivedColumns('a list of categories: coffee, tools, sweets')).toBeNull();
             |                                                                               ^
          53 |     });
          54 |
          55 |     it('prose with no container is prose', () => {
          at Object.<anonymous> (__tests__/the-schema-reader-was-blind-in-english.test.ts:52:79)

## src/__tests__/schema-from-blueprint.test.ts
- TEST: the schema follows the app, not a fixed guess Prompt 01 keeps the recognized expenses resource and its five blueprint columns
  culprit (first-parent commit where it turned red): c219da21 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toEqual(expected) // deep equality
        - Expected  - 3
        + Received  + 2
          Array [
        -   "title",
        -   "amount",
        +   "description",
            "category",
        +   "amount",
            "date",
        -   "note",
          ]
          25 |         expect(detectAppKind(PROMPT_01)).toBe('expenses');
          26 |         expect(apiColumnsForRequest(PROMPT_01).map(column => column.key))
        > 27 |             .toEqual(['title', 'amount', 'category', 'date', 'note']);
             |              ^
          28 |     });
          29 |

## src/__tests__/media-review-contract.test.ts
- TEST: request-driven media review contract classifies the workflow as an application instead of a marketing page
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toBe(expected) // Object.is equality
        Expected: "media"
        Received: "generic"
          11 | describe('request-driven media review contract', () => {
          12 |   test('classifies the workflow as an application instead of a marketing page', () => {
        > 13 |     expect(detectAppKind(REQUEST)).toBe('media');
             |                                    ^
          14 |   });
          15 |
          16 |   test('builds the fields and behavior the request names', () => {
          at Object.<anonymous> (__tests__/media-review-contract.test.ts:13:36)
- TEST: request-driven media review contract builds the fields and behavior the request names
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toBe(expected) // Object.is equality
        Expected: "Media Review Board"
        Received: "where users"
          17 |     const bp = blueprintFor('media', REQUEST, false);
          18 |     expect(bp.engine).toBe('records');
        > 19 |     expect(bp.title).toBe('Media Review Board');
             |                      ^
          20 |     expect(bp.fields.map(field => [field.key, field.type])).toEqual([
          21 |       ['image', 'image'], ['title', 'text'], ['tags', 'text'], ['notes', 'textarea'],
          22 |     ]);
          at Object.<anonymous> (__tests__/media-review-contract.test.ts:19:22)
- TEST: request-driven media review contract emits an original-image path and visible invalid-file rejection
  culprit (first-parent commit where it turned red): 76f66a5d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toEqual(expected) // deep equality
        - Expected  - 1
        + Received  + 3
        - Array []
        + Array [
        +   "filter items by tag",
        + ]
          51 |     const covered = requestedFeatures(REQUEST);
          52 |     expect(covered).toEqual([]);
        > 53 |     expect(uncoveredFeatures(REQUEST, bp.engine, false, source)).toEqual([]);
             |                                                                  ^
          54 |   });
          55 |
          56 |   test('proves the media acceptance contract without a provider verdict', async () => {
          at Object.<anonymous> (__tests__/media-review-contract.test.ts:53:66)
    A worker process has failed to exit gracefully and has been force exited. This is likely caused by tests leaking due to improper teardown. Try running with --detectOpenHandles to find leaks. Active ti

## src/__tests__/ai-schema.test.ts
- TEST: and the builder prefers what is already known the api builder awaits the design and says who answered
  culprit (first-parent commit where it turned red): 3917fe1d (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /const designed = await designDataModel\(request, \{ onNote: \(n: string\) => term\(n\) \}\);/
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
- TEST: and the builder prefers what is already known and the interface builds its screens from the SAME design, not a second guess
  culprit (first-parent commit where it turned red): c219da21 (state before it: pass)
  raw failure at 917c70e:
        expect(received).toMatch(expected)
        Expected pattern: /const handedModel = promoted \? \[promoted, \.\.\.model\] : model;/
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
