import { detectAppKind, requestedArtifactWithoutStockEngine } from '../core/design/app-blueprints';

/**
 * Eval run500, 2026-10-23: a quiz game, a report with three charts and a
 * support chatbot — each ABOUT a clinic or a real-estate office — were all
 * delivered as the stock Bookings app: the domain words outscored an artifact
 * the catalogue has no engine for. Measured over the 500-prompt suite: report
 * 0→50, game 0→49, chatbot 0→50 authored from the request; landing, admin,
 * api, fullstack, store, booking and cli kinds unchanged.
 */
describe('the artifact he asked for outranks what it is about', () => {
    it.each([
        'Make a browser quiz game about a dental clinic with 10 questions, a timer per question, score tracking and a restart button.',
        'Create an interactive single-page report for a real estate agency that loads sample viewings data and shows three charts.',
        'Build a customer-support chatbot web page for a hotel that answers common questions and lets the user book or cancel reservations.',
        'اعمل لعبة أسئلة في المتصفح عن عيادة أسنان فيها 10 أسئلة ومؤقت لكل سؤال',
        'اعمل صفحة تقرير تفاعلية لمكتب عقارات تعرض ثلاث رسوم بيانية',
        'ابني روبوت محادثة لخدمة عملاء فندق يجاوب على الأسئلة الشائعة',
    ])('authored from the request: %s', request => {
        expect(requestedArtifactWithoutStockEngine(request)).toBe(true);
        expect(detectAppKind(request)).toBe('custom');
    });

    it.each([
        ['Build a booking web app for a dental clinic where customers pick a date and time slot and book with their name and phone.', 'booking'],
        ['Build an online store for a perfume store: product listing with images and prices, search and category filter, a cart that adds and removes items and updates the total, and a checkout form with validation.', 'store'],
        ['Build an admin dashboard for a gym to manage members, subscriptions, trainers with search and a summary page that reports totals.', null],
    ])('a stock engine that fits keeps its kind: %s', (request, kind) => {
        expect(requestedArtifactWithoutStockEngine(request)).toBe(false);
        if (kind) expect(detectAppKind(request)).toBe(kind);
    });
});
