/**
 * «هذا يعني ان يجب ان اطور جو لالاف الميزات … وهذا غير ممكن»
 *
 * He was right. The model knew six domains and my answer had been to add a
 * seventh — a whitelist of the world, which has no end.
 *
 * The distinction that makes it tractable: a list of DOMAINS grows with the
 * world; a list of word SHAPES grows with a language. Every case below is a
 * business named NOWHERE in the source, and every one of them gets tables.
 */
import { inferModel, inferKind, isCapability, fieldsForKind } from '../core/design/entity-inference';

const keys = (r: string) => inferModel(r).entities.map(e => e.key);

describe('a business nobody hardcoded still gets a database', () => {
    it('a car rental', () => {
        expect(keys('a car rental system with vehicles, rentals, drivers and invoices'))
            .toEqual(['vehicles', 'rentals', 'drivers', 'invoices']);
    });

    it('a library', () => {
        expect(keys('a library: books, borrowers, loans, and fines')).toContain('borrowers');
        expect(keys('a library: books, borrowers, loans, and fines')).toContain('loans');
    });

    it('and an Arabic request whose words are in no dictionary', () => {
        // «الحيوانات» and «التطعيمات» are not in the translator. A key does not
        // need to be an English word — it needs to be legal and stable.
        const k = keys('ابنِ نظاماً لعيادة بيطرية: الحيوانات، التطعيمات، الأطباء، المواعيد');
        expect(k.length).toBeGreaterThanOrEqual(3);
        for (const key of k) expect(key).toMatch(/^[a-z0-9_]+$/);
    });

    it('nothing in the source names any of them', () => {
        // The prose may MENTION a veterinary clinic as an example; the RULES
        // must not, so the comments are stripped before looking.
        const src = require('fs').readFileSync(
            require('path').join(__dirname, '..', 'core', 'design', 'entity-inference.ts'), 'utf-8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        for (const domain of ['veterinar', 'library', 'librar', 'rental', 'gym', 'restaurant', 'nursery', 'pharmac']) {
            expect(`${domain}:${src.toLowerCase().includes(domain)}`).toBe(`${domain}:false`);
        }
    });
});

describe('and it refuses to pretend a capability is a table', () => {
    it('live streaming, video calls and AI moderation are not rows', () => {
        for (const c of ['Live streaming', 'Video calls', 'AI moderation', 'Recommendations']) {
            expect(`${c}:${isCapability(c)}`).toBe(`${c}:true`);
        }
    });

    it('but «Ads platform» is an ads table wearing a hat', () => {
        expect(isCapability('Ads platform')).toBe(false);
    });

    it('and his own twelve features split into both', () => {
        const r = inferModel('Build a next-generation social media platform.\nFeatures:\nPosts\nStories\n'
            + 'Reels\nLive streaming\nGroups\nPages\nMessaging\nVideo calls\nAI moderation\n'
            + 'Recommendations\nAds platform\nCreator dashboard');
        expect(r.entities.map(e => e.key)).toContain('posts');
        expect(r.capabilities.join(' ')).toMatch(/streaming|Video calls|moderation/i);
    });
});

describe('the shape decides the columns, not the industry', () => {
    it('a person, a payment, a time and a container each get their own', () => {
        expect(inferKind('borrowers')).toBe('person');
        expect(inferKind('invoices')).toBe('money');
        expect(inferKind('appointments')).toBe('when');
        expect(inferKind('channels')).toBe('grouping');
        expect(inferKind('vaccines')).toBe('thing');
    });

    it('a person gets a phone, a payment gets an amount, a thing gets a picture', () => {
        expect(fieldsForKind('person').map(f => f.key)).toContain('phone');
        expect(fieldsForKind('money').map(f => f.key)).toContain('amount');
        expect(fieldsForKind('when').map(f => f.key)).toContain('date');
        expect(fieldsForKind('thing').map(f => f.key)).toContain('image');
        // Nobody asks for a photograph of an invoice.
        expect(fieldsForKind('money').map(f => f.key)).not.toContain('image');
    });

    it('and every key it emits is a legal SQL identifier', () => {
        for (const req of ['a bakery with cakes and orders', 'نظام لمغسلة: الملابس والفواتير',
            'a kennel: dogs, bookings, owners', 'ورشة سيارات: القطع والإصلاحات']) {
            for (const e of inferModel(req).entities) {
                expect(e.key).toMatch(/^[a-z][a-z0-9_]*$/);
                expect(e.fields.length).toBeGreaterThanOrEqual(2);
            }
        }
    });
});

describe('and it sits BEFORE the model, not after', () => {
    it('the designer tries it while every provider is rate-limited', () => {
        const d = require('fs').readFileSync(
            require('path').join(__dirname, '..', 'core', 'design', 'schema-designer.ts'), 'utf-8');
        expect(d).toMatch(/const \{ inferModel \} = require\('\.\/entity-inference'\);/);
        expect(d.indexOf('inferModel(request)')).toBeLessThan(d.indexOf("require('../llm/structured')"));
        //  …and what it returns goes through the same validation as a
        //  model's. This pinned the call site character for character and
        //  broke the day validateDesign gained a floor argument — a
        //  guard on the spelling of a line, not on the property the test
        //  is named for. The property is that the shape reader's output
        //  is validated, whatever the call looks like.
        expect(d).toMatch(/validateDesign\(inferred\.entities/);
    });
});
