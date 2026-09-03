import fs from 'fs';
import os from 'os';
import path from 'path';
import { acceptanceFor, judgeAcceptance } from '../core/quality/acceptance';

describe('form validation is a real acceptance criterion', () => {
    it('requires a required-field guard and an announced error summary', () => {
        const request = 'Build a checkout form with required fields, prevent submission, and show a clear error summary.';
        const criteria = acceptanceFor(request);
        expect(criteria.map(c => c.id)).toContain('form_validation');

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-form-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'Form.jsx'), [
            "const missing = fields.filter(f => f.required);",
            "if (missing.length) setError('Required: ' + missing.join(', '));",
            '<p role="alert">{error}</p>',
        ].join('\n'), 'utf-8');

        const result = judgeAcceptance(criteria.filter(c => c.id === 'form_validation'), { dir }, false);
        expect(result.criteria[0].verdict).toBe('met');
    });

    it('does not infer form validation from a required column fragment', () => {
        const ids = acceptanceFor(
            'Build a school equipment checkout system with required student and equipment fields.',
        ).map(c => c.id);
        expect(ids).not.toContain('form_validation');
    });
});
