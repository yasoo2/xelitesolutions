import {
    blueprintFor,
    fieldsFromRequest,
    requestedFilterFields,
} from '../core/design/app-blueprints';
import { acceptanceFor, judgeAcceptance } from '../core/quality/acceptance';
import { fileAppShellJsx, fileAppStoreJs, fileRecordsAppJsx } from '../modules/tools/definitions/react-app-templates';
import { requestSpokenCapabilities } from '../modules/tools/definitions/ReactProjectTool';

const REQUEST = 'Build a personal reading log with book title, author, pages, start date, finish date, rating, and reading status. Add filters for status and rating plus a progress metric.';

describe('request-derived filters and progress are real capabilities', () => {
    it('keeps rating numeric and derives both requested filters', () => {
        const fields = fieldsFromRequest(REQUEST, false) || [];
        const bp = blueprintFor('generic', REQUEST, false);
        const ratingKey = fields.find(field => field.label === 'rating')?.key;
        const statusKey = fields.find(field => field.label === 'reading status')?.key;

        expect(fields.find(field => field.label === 'pages')?.type).toBe('number');
        expect(fields.find(field => field.label === 'rating')?.type).toBe('number');
        expect(requestedFilterFields(REQUEST, fields)).toEqual(expect.arrayContaining([statusKey, ratingKey]));
        expect(requestedFilterFields(REQUEST, fields)).toHaveLength(2);
        expect(bp.filterFields).toEqual(expect.arrayContaining([statusKey, ratingKey]));
    });

    it('binds progress to the completed state, not the first option', () => {
        const bp = blueprintFor('generic', REQUEST, false);
        const progress = bp.metrics.find(metric => metric.kind === 'progress');

        expect(bp.doneValue).toBe('Completed');
        expect(progress).toEqual(expect.objectContaining({
            field: 'flag1',
            equals: 'Completed',
        }));
    });

    it('emits a multi-filter UI and a row-backed progress calculation', () => {
        const source = fileRecordsAppJsx(false);
        const shell = fileAppShellJsx(blueprintFor('generic', REQUEST, false), false);
        const store = fileAppStoreJs();

        expect(source).toMatch(/filterFields/);
        expect(source).toMatch(/const filterDefs/);
        expect(source).toMatch(/filters\[field\.key\]/);
        expect(store).toMatch(/case 'progress'/);
        expect(store).toMatch(/denominator/);
    });

    it('acceptance checks each requested filter and the progress metric', () => {
        const criteria = acceptanceFor(REQUEST);
        const filterCriteria = criteria.filter(criterion => criterion.id.startsWith('filter:'));
        const progress = criteria.find(criterion => criterion.id === 'progress_metric');
        const bp = blueprintFor('generic', REQUEST, false);
        const source = `${fileAppStoreJs()}\n${fileRecordsAppJsx(false)}\n${fileAppShellJsx(bp, false)}\ncontent: { filterFields: [${(bp.filterFields || []).map(key => `'${key}'`).join(', ')}], metrics: [{ kind: 'progress', field: 'flag1', equals: 'Completed' }] }`;
        const dir = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'joe-reading-contract-'));
        require('fs').writeFileSync(require('path').join(dir, 'RecordsApp.jsx'), source);

        expect(filterCriteria.map(criterion => criterion.expectedFilter?.field))
            .toEqual(expect.arrayContaining(bp.filterFields || []));
        expect(filterCriteria).toHaveLength(2);
        expect(progress?.expectedProgress).toBe(true);
        const judged = judgeAcceptance([...filterCriteria, progress!], { dir }, false);
        expect(judged.unmet).toBe(0);
        expect(judged.met).toBe(3);
        expect(bp.metrics.some(metric => metric.kind === 'progress')).toBe(true);
    });

    it('does not duplicate a feature sentence as a false change rule', () => {
        const ids = acceptanceFor(REQUEST).map(criterion => criterion.id);

        expect(ids).not.toContain('rule:1');
        expect(ids).toEqual(expect.arrayContaining([
            'filter:scalar2',
            'filter:flag1',
            'progress_metric',
        ]));
    });

    it('does not report a proved rating field as reviews or as an unmet gap', () => {
        const spoken = requestSpokenCapabilities(
            ['rating', 'reviews and ratings'],
            REQUEST,
            'records',
            [{ verdict: 'met', expectedColumn: 'rating', en: 'a column «rating» exists in the table' }],
        );

        expect(spoken).toEqual([]);
    });
});
