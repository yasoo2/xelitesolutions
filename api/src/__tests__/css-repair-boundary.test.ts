import { askForCss, cssRepairable, cssRepairPrompt, safeCss } from '../core/quality/model-round';

jest.mock('../core/llm/intelligent-router', () => ({ routeToModel: jest.fn() }));
const { routeToModel } = require('../core/llm/intelligent-router');

describe('stylesheet repair stays within its capabilities', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each(['form_dead_submit', 'a11y_inputs_without_labels', 'a11y_placeholder_as_label',
        'console_errors', 'auth_failed', 'unknown_future_finding'])(
        'does not spend a model call on %s', async id => {
            expect(await askForCss([{ id }])).toEqual({ css: '', why: 'no stylesheet-repairable findings' });
            expect(routeToModel).not.toHaveBeenCalled();
        },
    );

    it('keeps visual repair evidence without laundering functional findings into CSS', () => {
        const visual = { id: 'small_targets', evidence: [{ sel: 'button.save', w: 20, h: 20 }] };
        const findings = [{ id: 'form_dead_submit' }, visual, { id: 'a11y_inputs_without_labels' }];
        expect(cssRepairable(findings)).toEqual([visual]);
        const prompt = cssRepairPrompt(findings);
        expect(prompt).toContain('button.save');
        expect(prompt).toContain('20x20px');
        expect(prompt).not.toContain('form_dead_submit');
        expect(prompt).not.toContain('a11y_inputs_without_labels');
        expect(findings).toHaveLength(3);
    });

    it.each([
        'form_dead_submit{pointer-events:none}select{display:none}select:focus{display:inline-block}[placeholder="Search..."]{display:none}',
        'input { visibility: hidden }',
        'button { opacity: 0 }',
        'form { content-visibility: hidden }',
        'select { dis/**/play: none }',
        'select { DISPLAY: var(--hidden) }',
        'select { d\\69splay: none }',
    ])('refuses concealment or input disabling: %s', css => {
        expect(safeCss(css).ok).toBe(false);
    });

    it('still accepts measured sizing and contrast corrections', () => {
        expect(safeCss('button.save { min-height: 44px; padding: 8px; color: #111; background: #fff; }').ok).toBe(true);
    });
});
