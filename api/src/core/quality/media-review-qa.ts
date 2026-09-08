import type { AppAuditFinding } from './app-audit';

const MEDIA_REVIEW_REQUEST = /(?:media|image|photo|asset)\s+(?:review|library|catalog|collection)|(?:لوحة|مكتبة|مجموعة)\s+(?:مراجعة\s+)?(?:الوسائط|الصور)/iu;
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl6sAAAAASUVORK5CYII=';

export function isMediaReviewRequest(request: string): boolean {
    return MEDIA_REVIEW_REQUEST.test(String(request || ''));
}

export interface MediaReviewQaResult {
    findings: AppAuditFinding[];
    metrics: {
        pressed: number;
        formsFilled: number;
        fieldsFilled: number;
        formsPersisted: number;
        qaRecordsDeleted: number;
        semanticFieldsTested: number;
        statesVisited: number;
        exploratoryActions: number;
        controlsDiscovered: number;
    };
}

export async function runMediaReviewQa(args: {
    page: any;
    url: string;
    timeoutMs: number;
    onDialog: (dialog: any) => void;
    onProgress?: (message: string) => void;
}): Promise<MediaReviewQaResult> {
    const { page, url, timeoutMs, onDialog, onProgress } = args;
    const findings: AppAuditFinding[] = [];
    const metrics: MediaReviewQaResult['metrics'] = {
        pressed: 0,
        formsFilled: 0,
        fieldsFilled: 0,
        formsPersisted: 0,
        qaRecordsDeleted: 0,
        semanticFieldsTested: 0,
        statesVisited: 0,
        exploratoryActions: 0,
        controlsDiscovered: 0,
    };
    const fail = (id: string, detailEn: string, detail: string) => findings.push({ id, severity: 'high', detail, detailEn });
    const title = `QA Aurora ${Date.now()}`;
    const tag = `qa-${Date.now()}`;
    const expectedImage = `data:image/png;base64,${PNG_BASE64}`;
    const wait = Math.min(8_000, timeoutMs);
    let temporaryDialogHandler: ((dialog: any) => void) | null = null;
    const restoreDialogHandling = () => {
        try {
            if (temporaryDialogHandler) page.off('dialog', temporaryDialogHandler);
            page.off('dialog', onDialog);
            page.on('dialog', onDialog);
        } catch { /* page may be closed */ }
        temporaryDialogHandler = null;
    };

    try {
        onProgress?.('media review: checking upload validation');
        await page.goto(url, { waitUntil: 'load', timeout: wait });
        metrics.statesVisited += 1;
        metrics.controlsDiscovered = await page.locator('button, a[href], input, textarea, select, [tabindex]').count();
        const form = page.locator('form').filter({ has: page.locator('input[type="file"]') }).first();
        const fileInput = form.locator('input[type="file"]').first();
        if (!(await fileInput.count())) {
            fail('media_image_upload_missing', 'The requested image upload control is missing', 'حقل رفع الصورة المطلوب غير موجود');
            return { findings, metrics };
        }
        const accept = String(await fileInput.getAttribute('accept') || '');
        if (!/image\/\*/i.test(accept)) {
            fail('media_image_accept_missing', 'The upload control does not restrict selection to images', 'حقل الرفع لا يقيّد الاختيار بملفات الصور');
        }
        await fileInput.setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
        metrics.exploratoryActions += 1;
        metrics.semanticFieldsTested += 1;
        metrics.statesVisited += 1;
        const invalidAlert = form.getByRole('alert').filter({ hasText: /valid image|صورة صالح/iu });
        const invalidVisible = await invalidAlert.waitFor({ state: 'visible', timeout: 1_500 }).then(() => true).catch(() => false);
        if (!invalidVisible) {
            fail('media_invalid_file_accepted', 'A non-image file was not rejected with visible feedback', 'لم يُرفض الملف غير الصوري برسالة واضحة');
        }

        onProgress?.('media review: uploading an original image and metadata');
        await fileInput.setInputFiles({ name: 'aurora.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BASE64, 'base64') });
        await form.locator('[name="title"]').fill(title);
        await form.locator('[name="tags"]').fill(tag);
        await form.locator('[name="notes"]').fill('Original review note');
        await form.getByRole('button', { name: /^Add$/i }).click();
        metrics.exploratoryActions += 5;
        metrics.pressed += 1;
        metrics.formsFilled += 1;
        metrics.fieldsFilled += 4;
        metrics.statesVisited += 1;
        const row = page.locator('.row').filter({ hasText: title }).first();
        await row.waitFor({ state: 'visible', timeout: wait });
        const storedSrc = String(await row.locator('img.row-pic').getAttribute('src') || '');
        if (storedSrc !== expectedImage) {
            fail('media_original_image_not_preserved', 'The uploaded image was transformed or replaced instead of preserving its original data', 'تم تغيير الصورة المرفوعة أو استبدالها بدل الحفاظ على بياناتها الأصلية');
        }

        onProgress?.('media review: proving keyboard preview and metadata editing');
        await row.locator('.row-open').focus();
        await row.locator('.row-open').press('Enter');
        metrics.exploratoryActions += 1;
        metrics.pressed += 1;
        metrics.statesVisited += 1;
        const dialog = page.getByRole('dialog').filter({ hasText: title });
        await dialog.waitFor({ state: 'visible', timeout: wait });
        if (String(await dialog.locator('img.record-modal-pic').getAttribute('src') || '') !== expectedImage) {
            fail('media_preview_image_mismatch', 'The image preview does not show the original uploaded image', 'معاينة الصورة لا تعرض الصورة الأصلية المرفوعة');
        }
        await dialog.getByRole('button', { name: /^Edit\b/i }).click();
        await form.locator('[name="notes"]').fill('Edited review note');
        await form.getByRole('button', { name: /Save changes/i }).click();
        metrics.exploratoryActions += 3;
        metrics.pressed += 2;
        metrics.statesVisited += 1;
        if (!(await page.locator('.row').filter({ hasText: /Edited review note/i }).count())) {
            fail('media_metadata_edit_failed', 'Edited metadata was not reflected in the saved item', 'لم تظهر تعديلات البيانات الوصفية في العنصر المحفوظ');
        }

        onProgress?.('media review: proving tag filtering and reload persistence');
        const filter = page.locator('.filter-input[aria-label="Tags"]').first();
        await filter.fill('no-such-tag');
        metrics.exploratoryActions += 1;
        metrics.statesVisited += 1;
        if (await page.locator('.row').filter({ hasText: title }).count()) {
            fail('media_tag_filter_failed', 'A non-matching tag did not hide the item', 'لم تُخفِ تصفية الوسم غير المطابق العنصر');
        }
        await filter.fill(tag);
        metrics.exploratoryActions += 1;
        metrics.statesVisited += 1;
        await page.locator('.row').filter({ hasText: title }).first().waitFor({ state: 'visible', timeout: wait });
        await page.reload({ waitUntil: 'load', timeout: wait });
        metrics.exploratoryActions += 1;
        metrics.statesVisited += 1;
        await page.locator('.row').filter({ hasText: title }).first().waitFor({ state: 'visible', timeout: wait });
        if (String(await page.locator('.row').filter({ hasText: title }).first().locator('img.row-pic').getAttribute('src') || '') !== expectedImage) {
            fail('media_reload_persistence_failed', 'The item or its original image did not survive a browser reload', 'لم يبقَ العنصر أو صورته الأصلية بعد إعادة تحميل المتصفح');
        }
        if (!findings.some(finding => /reload_persistence|original_image_not_preserved/.test(finding.id))) {
            metrics.formsPersisted += 1;
        }

        onProgress?.('media review: proving cancel-delete and confirm-delete');
        const deleteButton = () => page.locator('.row').filter({ hasText: title }).first().getByRole('button', { name: /^Delete$/i });
        page.off('dialog', onDialog);
        temporaryDialogHandler = (dialog: any) => dialog.dismiss().catch(() => { });
        page.once('dialog', temporaryDialogHandler);
        await deleteButton().click();
        metrics.exploratoryActions += 1;
        metrics.pressed += 1;
        metrics.statesVisited += 1;
        temporaryDialogHandler = null;
        await page.waitForTimeout(150);
        if (!(await page.locator('.row').filter({ hasText: title }).count())) {
            fail('media_cancel_delete_failed', 'Cancelling the delete confirmation still removed the item', 'أدى إلغاء تأكيد الحذف إلى إزالة العنصر');
        }
        temporaryDialogHandler = (dialog: any) => dialog.accept().catch(() => { });
        page.once('dialog', temporaryDialogHandler);
        await deleteButton().click();
        metrics.exploratoryActions += 1;
        metrics.pressed += 1;
        metrics.statesVisited += 1;
        temporaryDialogHandler = null;
        await page.waitForTimeout(150);
        restoreDialogHandling();
        if (await page.locator('.row').filter({ hasText: title }).count()) {
            fail('media_confirm_delete_failed', 'Confirming deletion did not remove the item', 'لم يؤدِ تأكيد الحذف إلى إزالة العنصر');
        }
        if (!findings.some(finding => finding.id === 'media_confirm_delete_failed')) metrics.qaRecordsDeleted += 1;
        await filter.fill('');
        const rowsLeft = await page.locator('.row').count();
        if (!rowsLeft && !(await page.locator('.empty').count())) {
            fail('media_empty_state_missing', 'Deleting the final item did not reveal an empty state', 'لم تظهر حالة فارغة بعد حذف العنصر الأخير');
        }
    } catch (error: any) {
        fail(
            'media_review_scenario_qa_failed',
            `The complete media-review browser scenario could not finish: ${String(error?.message || error).slice(0, 140)}`,
            `تعذر إكمال سيناريو مراجعة الوسائط في المتصفح: ${String(error?.message || error).slice(0, 140)}`,
        );
    } finally {
        restoreDialogHandling();
    }
    return { findings, metrics };
}
