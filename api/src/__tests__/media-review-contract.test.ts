import { blueprintFor, detectAppKind, requestedFeatures, uncoveredFeatures } from '../core/design/app-blueprints';
import { namedRequirements, verifyNamed } from '../core/quality/named-requirements';
import { acceptanceFor } from '../core/quality/acceptance';
import { requestedCapabilities } from '../core/quality/scope-audit';
import { buildAppFiles, fileAppStoreJs, fileRecordsAppJsx } from '../modules/tools/definitions/react-app-templates';
import fs from 'fs';
import path from 'path';

const REQUEST = 'Create a media review board where users upload an image, add title, tags, and notes, filter items by tag, preview the uploaded image, and delete an item only after confirmation. Use persistent local storage and preserve the original uploaded image.';

describe('request-driven media review contract', () => {
  test('classifies the workflow as an application instead of a marketing page', () => {
    expect(detectAppKind(REQUEST)).toBe('media');
  });

  test('builds the fields and behavior the request names', () => {
    const bp = blueprintFor('media', REQUEST, false);
    expect(bp.engine).toBe('records');
    expect(bp.title).toBe('Media Review Board');
    expect(bp.fields.map(field => [field.key, field.type])).toEqual([
      ['image', 'image'], ['title', 'text'], ['tags', 'text'], ['notes', 'textarea'],
    ]);
    expect(bp.fields.find(field => field.key === 'image')?.required).toBe(true);
    expect(bp.fields.find(field => field.key === 'title')?.primary).toBe(true);
    expect(bp.filterFields).toContain('tags');
    expect(bp.preserveOriginalImages).toBe(true);
  });

  test('emits an original-image path and visible invalid-file rejection', () => {
    const bp = blueprintFor('media', REQUEST, false);
    const files = buildAppFiles(bp, { isArabic: false, brand: 'Media Review', storeKey: 'media-review' } as any, 'app');
    const source = Object.values(files).join('\n');
    expect(source).toContain('preserveOriginalImages: true');
    expect(source).toContain("kind: 'media'");
    expect(fileAppStoreJs()).toContain("if (maxEdge === 0) { resolve(String(reader.result || '')); return; }");
    expect(fileRecordsAppJsx(false)).toContain('Choose a valid image file.');
    expect(fileRecordsAppJsx(false)).toContain("if (e.target.type !== 'file')");
    expect(fileRecordsAppJsx(false)).toContain('name={f.key}');
    expect(fileRecordsAppJsx(false)).toContain("' media-workspace'");
    expect(fileRecordsAppJsx(false)).toContain("' media-gallery'");
    expect(fileRecordsAppJsx(false)).toContain("' media-card'");
    expect(fileRecordsAppJsx(false)).toContain("data-gallery-contract={imageField ? 'media' : undefined}");
    expect(fileRecordsAppJsx(false)).toContain('Choose an image to preview');
    expect(fileRecordsAppJsx(false)).not.toContain('src={draft[f.key] || cardFor');
    expect(files['src/styles/app.css']).toContain('.media-workspace{display:grid');
    expect(files['src/styles/app.css']).toContain('.media-gallery{grid-template-columns:repeat(auto-fill');
    expect(files['src/styles/app.css']).toContain('.media-composer{position:sticky');
    expect(files['src/styles/app.css']).toContain('.kind-media{--brand:#087f73');
    expect(files['src/App.jsx']).toContain("'app kind-' + String(content.kind || 'generic')");
    expect(source).not.toContain('Testimonials');
    const covered = requestedFeatures(REQUEST);
    expect(covered).toEqual([]);
    expect(uncoveredFeatures(REQUEST, bp.engine, false, source)).toEqual([]);
  });

  test('proves the media acceptance contract without a provider verdict', async () => {
    const bp = blueprintFor('media', REQUEST, false);
    const files = buildAppFiles(bp, { isArabic: false, brand: 'Media Review', storeKey: 'media-review' } as any, 'app');
    const source = Object.values(files).join('\n');
    const requirements = [
      'upload an image',
      'filter items by tag',
      'preview the uploaded image',
      'delete an item only after confirmation',
      'persistent local storage',
      'preserve the original uploaded image',
    ].map((text, index) => ({ id: `media-${index}`, text, quote: text }));
    const verdicts = await verifyNamed(requirements, source, false, async () => {
      throw new Error('provider must not be needed for deterministic media evidence');
    });
    expect(verdicts.map(verdict => verdict.verdict)).toEqual(requirements.map(() => 'met'));
  });

  test('does not retain the legacy word-only reviews-and-ratings classifier', () => {
    const delivery = fs.readFileSync(path.join(__dirname, '../modules/tools/definitions/ReactProjectTool.ts'), 'utf8');
    expect(delivery).not.toContain("[/reviews?|ratings?|تقييمات|مراجعات/i, 'التقييمات والمراجعات', 'reviews and ratings']");
    expect(requestedCapabilities(REQUEST).map(capability => capability.id)).not.toContain('reviews');
    const criteria = acceptanceFor(REQUEST);
    expect(criteria.map(criterion => criterion.id)).not.toContain('reviews');
    expect(criteria.some(criterion => criterion.id.startsWith('rule:') && /add title/i.test(criterion.en))).toBe(false);
    expect(criteria.some(criterion => criterion.id.startsWith('rule:') && /claim completion/i.test(criterion.en))).toBe(false);
  });

  test('keeps Joe verification checklists out of the product requirement ledger', async () => {
    const request = `${REQUEST}, then test invalid file rejection, image preview, and desktop and phone layouts in Joe's visible Browser.`;
    const result = await namedRequirements(request, false, async () => JSON.stringify({ requirements: [
      { text: 'preview the uploaded image', quote: 'preview the uploaded image' },
      { text: 'invalid file rejection', quote: 'invalid file rejection' },
      { text: 'image preview', quote: 'image preview' },
      { text: 'desktop and phone layouts', quote: 'desktop and phone layouts' },
    ] }));
    expect(result.requirements.map(requirement => requirement.text)).toEqual(['preview the uploaded image']);
    expect(result.rejected.filter(item => /verification checklist/.test(item.reason))).toHaveLength(3);
  });

  test('rejects a brochure that merely repeats the requested capabilities', () => {
    const prose = `<h1>Media review</h1><p>Upload an image. Filter items by tag. Preview the uploaded image. Persistent local storage. Preserve the original uploaded image.</p>`;
    expect(uncoveredFeatures(REQUEST, 'records', false, prose)).toEqual(expect.arrayContaining([
      expect.stringMatching(/upload/i),
      expect.stringMatching(/filter/i),
      expect.stringMatching(/preview/i),
      expect.stringMatching(/persistent/i),
      expect.stringMatching(/preserve/i),
    ]));
  });

  test('runs a request-specific browser scenario before accepting delivery', () => {
    const qa = fs.readFileSync(path.join(__dirname, '../core/quality/media-review-qa.ts'), 'utf8');
    const audit = fs.readFileSync(path.join(__dirname, '../core/quality/app-audit.ts'), 'utf8');
    expect(qa).toContain('setInputFiles');
    expect(qa).toContain("dialog.dismiss()");
    expect(qa).toContain("dialog.accept()");
    expect(qa).toContain('page.reload');
    expect(qa).toContain('exploratoryActions');
    expect(audit).toContain('mediaQa.metrics');
    expect(qa).toContain('media_original_image_not_preserved');
    expect(audit).toContain('runMediaReviewQa');
  });

  test('places generated React projects inside the explicit user workspace', () => {
    const builder = fs.readFileSync(path.join(__dirname, '../modules/tools/definitions/ReactProjectTool.ts'), 'utf8');
    expect(builder).toContain("const contextWorkspaceId = String(context?.workspaceId || input?.workspaceId || '').trim()");
    expect(builder).toContain('workspaceService.getActiveRoot(contextWorkspaceId || undefined)');
    expect(builder).not.toContain('const root = String(input?.root || workspaceService.getExplorerRoot())');
  });
});
