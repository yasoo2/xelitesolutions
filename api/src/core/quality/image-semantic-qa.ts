import type { AppAuditFinding } from './app-audit';

const IMAGE_REQUEST = /(?:\b(?:image|images|photo|photos|gallery|logo|visual|illustration)\b|(?:صورة|صور|معرض|شعار|مرئي))/iu;

export interface ImageSemanticQaResult {
    findings: AppAuditFinding[];
    metrics: Record<string, number>;
}

/**
 * A browser cannot know that a photograph is a coffee bean merely by looking
 * at its filename. It can, however, prove that an image-led request produced
 * visible images with an accessible, request-specific description. The source
 * image gate performs the deeper pixel judgement before generation; this is
 * the delivery-time counterpart that catches an empty or decorative result.
 */
export function isImageSemanticQaRequest(request: string): boolean {
    return IMAGE_REQUEST.test(String(request || ''));
}

export async function runImageSemanticQa(args: {
    page: any;
    url: string;
    request: string;
    timeoutMs: number;
    onProgress?: (message: string) => void;
}): Promise<ImageSemanticQaResult> {
    const findings: AppAuditFinding[] = [];
    const metrics: Record<string, number> = { statesVisited: 0, exploratoryActions: 0 };
    if (!isImageSemanticQaRequest(args.request)) return { findings, metrics };

    args.onProgress?.('image semantics: checking visible subjects and descriptions');
    const timeout = Math.min(Math.max(Number(args.timeoutMs) || 0, 4_000), 15_000);
    await args.page.goto(args.url, { waitUntil: 'load', timeout });
    try {
        const images = await args.page.locator('img').evaluateAll((nodes: Element[]) => nodes.map((node: any) => {
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return {
                src: String(node.currentSrc || node.src || ''),
                alt: String(node.getAttribute('alt') || '').trim(),
                labelledBy: String(node.getAttribute('aria-label') || node.getAttribute('aria-labelledby') || '').trim(),
                visible: rect.width > 24 && rect.height > 24 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05,
                loaded: Number(node.naturalWidth || 0) > 0,
            };
        }));
        const visible = images.filter((image: any) => image.visible);
        metrics.statesVisited = 1;
        if (!visible.length) {
            findings.push({
                id: 'image_subjects_missing', severity: 'high',
                detail: 'طُلبت واجهة تعتمد على الصور لكن لم تظهر صورة محتوى مرئية في المعاينة',
                detailEn: 'The request calls for imagery, but no visible content image rendered in the preview',
            });
            return { findings, metrics };
        }
        const unloaded = visible.filter((image: any) => !image.loaded);
        if (unloaded.length) findings.push({
            id: 'image_subjects_not_loaded', severity: 'high',
            detail: `${unloaded.length} صورة مرئية لم تُحمّل فعليًا`,
            detailEn: `${unloaded.length} visible image(s) did not actually load`,
            evidence: unloaded.slice(0, 4).map((image: any) => ({ src: image.src.slice(-120) })),
        });
        const unnamed = visible.filter((image: any) => !image.alt && !image.labelledBy);
        if (unnamed.length) findings.push({
            id: 'image_subjects_unlabelled', severity: 'medium',
            detail: `${unnamed.length} صورة محتوى بلا وصف بديل أو اسم قابل للوصول`,
            detailEn: `${unnamed.length} content image(s) have no alternative description or accessible name`,
            evidence: unnamed.slice(0, 4).map((image: any) => ({ src: image.src.slice(-120) })),
        });
    } catch (error: any) {
        findings.push({
            id: 'image_semantic_qa_failed', severity: 'medium',
            detail: `تعذر إكمال فحص دلالة الصور: ${String(error?.message || error).slice(0, 120)}`,
            detailEn: `Image-semantic QA could not complete: ${String(error?.message || error).slice(0, 120)}`,
        });
    }
    return { findings, metrics };
}
