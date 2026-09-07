import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'app-audit.ts'), 'utf8');

describe('browser QA restores a readable delivery viewport', () => {
    it('uses a stable desktop baseline rather than a transient phone or tablet size', () => {
        expect(source).toContain('const deliveryViewport = { width: 1280, height: 900 };');
        expect(source).toContain('await applyViewportSize(page, deliveryViewport.width, deliveryViewport.height);');
        expect(source).toContain('const desktop = deliveryViewport;');
    });
});
