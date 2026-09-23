import fs from 'fs';
import path from 'path';

describe('the session queue uses the authenticated session contract', () => {
    const source = fs.readFileSync(
        path.resolve(__dirname, '../../../web/src/components/CommandComposer.tsx'),
        'utf8',
    );

    it('sends the current token on both queue reads and writes', () => {
        expect(source).toMatch(/function authenticatedHeaders\(json = false\)/);
        expect(source).toMatch(/sessions\/\$\{encodeURIComponent\(sid\)\}\/queue`, \{\s*headers: authenticatedHeaders\(\)/);
        expect(source).toMatch(/method: 'PUT',[\s\S]{0,120}headers: authenticatedHeaders\(true\)/);
    });

    it('history loading never impersonates or clears an executing run', () => {
        const history = source.slice(source.indexOf('async function loadHistory('), source.indexOf('async function handleFileSelect('));
        expect(history).toContain('/history');
        expect(history).not.toMatch(/setStatus\(|setIsThinking\(/);
    });
});
