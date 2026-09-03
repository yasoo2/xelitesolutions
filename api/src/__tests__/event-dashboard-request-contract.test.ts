import {
    blueprintFor,
    fieldsFromRequest,
    requestedFilterFields,
    uncoveredFeatures,
} from '../core/design/app-blueprints';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readProjectSource } from '../core/quality/scope-audit';

const REQUEST = 'Build a small event planning dashboard with event title, date, location, attendee capacity, RSVP status, search, status filter, capacity summary, and a responsive browser-tested interface.';

describe('request-derived event dashboard capabilities', () => {
    it('treats capacity as numeric and binds a status filter to the status field', () => {
        const fields = fieldsFromRequest(REQUEST, false) || [];
        const capacity = fields.find(field => field.label === 'attendee capacity');
        const status = fields.find(field => field.label === 'RSVP status');

        expect(capacity?.type).toBe('number');
        expect(requestedFilterFields(REQUEST, fields)).toEqual([status?.key]);
    });

    it('derives a real aggregate for a requested numeric summary', () => {
        const blueprint = blueprintFor('generic', REQUEST, false);
        expect(blueprint.metrics).toEqual(expect.arrayContaining([
            expect.objectContaining({ kind: 'sum', field: 'count1' }),
        ]));
        expect(blueprint.filterFields).toEqual(['flag1']);
    });

    it('does not leave request-level summary or responsive gaps after source proof', () => {
        const blueprint = blueprintFor('generic', REQUEST, false);
        const source = [
            "label: 'event title'",
            "label: 'date'",
            "label: 'location'",
            "label: 'attendee capacity'",
            "label: 'RSVP status'",
            "metrics: [{ kind: 'sum', field: 'count1' }]",
            "computeMetric(metric, rows)",
            "case 'sum': return rows.reduce((total, row) => total + Number(row.count1), 0)",
            "@media (max-width: 720px) { .layout { display: block; } }",
        ].join('\n');

        expect(uncoveredFeatures(REQUEST, blueprint.engine, false, source)).not.toEqual(
            expect.arrayContaining(['capacity summary', 'a responsive browser-tested interface']),
        );
    });

    it('keeps authored stylesheet evidence in the bounded source snapshot', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-source-'));
        try {
            fs.mkdirSync(path.join(root, 'src'), { recursive: true });
            fs.writeFileSync(path.join(root, 'src', 'App.jsx'), 'export default function App(){ return null; }');
            fs.writeFileSync(path.join(root, 'src', 'app.css'), '@media (max-width: 720px) { .layout { display: block; } }');
            const source = readProjectSource([path.join(root, 'src')]);
            expect(source).toContain('@media (max-width: 720px)');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
