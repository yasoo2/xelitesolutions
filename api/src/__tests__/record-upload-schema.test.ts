import { blueprintFor, detectAppKind, fieldsFromRequest, recordFeatureCovered } from '../core/design/app-blueprints';
import { buildAppFiles } from '../modules/tools/definitions/react-app-templates';

describe('explicit record fields retain requested upload actions', () => {
    it.each([
        ['Create a media review board where users upload an image and add title, tags, and notes.', ['title', 'tags', 'notes']],
        ['Build an inventory app where users upload a photo and add item name, quantity, and price.', ['item name', 'quantity', 'price']],
        ['Build an inspection register with inspector name, visit date, and remarks. Allow users to upload an image.', ['inspector name', 'visit date', 'remarks']],
    ])('keeps the action and the user fields together: %s', (request, labels) => {
        const fields = fieldsFromRequest(request, false) || [];
        expect(fields.filter(field => field.type === 'image')).toHaveLength(1);
        expect(fields.map(field => field.label.toLowerCase())).toEqual(expect.arrayContaining(labels));
        expect(fields.filter(field => field.type !== 'image').map(field => field.label.toLowerCase())).toEqual(labels);
        expect(fields.find(field => field.primary)?.label.toLowerCase()).toBe(labels[0]);
        const bp = blueprintFor(detectAppKind(request) || 'generic', request, false);
        expect(bp.fields.filter(field => field.type === 'image')).toHaveLength(1);
        expect(bp.fields.map(field => field.label.toLowerCase())).toEqual(expect.arrayContaining(labels));
        expect(bp.relation).toBeUndefined();
    });

    it.each([
        'Build a register with customer name, phone, and notes.',
        'Build a register with customer name, phone, and notes. Add explanatory text about image formats.',
        'Build a register with customer name, phone, and notes. Do not upload an image.',
        'Build a register with customer name, phone, and notes. Explain how to upload an image elsewhere.',
    ])('does not invent an upload field: %s', request => {
        const fields = fieldsFromRequest(request, false) || [];
        expect(fields.length).toBeGreaterThanOrEqual(2);
        expect(fields.some(field => field.type === 'image')).toBe(false);
    });

    it('does not duplicate an image already in the explicit list', () => {
        const request = 'Build an inventory app with image, item name and quantity. Allow users to upload an image.';
        const fields = fieldsFromRequest(request, false) || [];
        expect(fields.filter(field => field.type === 'image')).toHaveLength(1);
    });

    it('does not certify a dormant upload branch after the configured image field is removed', () => {
        const request = 'Build an inventory app where users upload an image and add item name, quantity, and price.';
        const bp = blueprintFor('generic', request, false);
        const emit = (fields: typeof bp.fields) => Object.values(buildAppFiles({ ...bp, fields }, {
            isArabic: false, brand: 'Inspection', storeKey: 'inspection', sourceRequest: request,
        }, 'inspection')).join('\n');
        const full = emit(bp.fields);
        expect(recordFeatureCovered('upload an image', request, full)).toBe(true);
        expect(recordFeatureCovered('upload an image', request, emit(bp.fields.filter(field => field.type !== 'image')))).toBe(false);
        expect(recordFeatureCovered('upload an image', request, full.replaceAll('type="file"', 'type="text"'))).toBe(false);
    });

    it('keeps independent non-record upload evidence supported', () => {
        expect(recordFeatureCovered('upload an image', '', '<input type="file" accept="image/*" onChange={upload} />')).toBe(true);
        expect(recordFeatureCovered('upload an image', '', '<p>Upload an image</p>')).toBe(false);
    });

    it('does not treat an action label as executable upload evidence', () => {
        expect(recordFeatureCovered('upload image', '', '<input type="text" aria-label="upload image" />')).toBe(false);
    });

    it('does not use an unrelated image schema as the active content schema', () => {
        const source = `const unused = { fields: [{ type: 'image' }] };
            export const content = { fields: [{ type: 'text' }] };
            const fields = content.fields;
            const view = fields.map(f => f.type === 'image' && <input type="file" accept="image/*" />);`;
        expect(recordFeatureCovered('upload image', '', source)).toBe(false);
    });

    it('allows independent upload alongside an unrelated fields renderer', () => {
        const source = `const fields = ['name'];
            const labels = fields.map(label => <span>{label}</span>);
            const upload = <input type="file" accept="image/*" onChange={saveImage} />;`;
        expect(recordFeatureCovered('upload image', '', source)).toBe(true);
    });
});
