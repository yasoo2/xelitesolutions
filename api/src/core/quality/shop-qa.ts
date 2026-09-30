import type { AppAuditFinding } from './app-audit';

const SHOP_REQUEST = /(?:\b(?:store|shop|e-?commerce|cart|checkout|catalog(?:ue)?|product)\b|(?:متجر|تجارة\s*إلكترونية|سلة|عربة\s*تسوق|إتمام\s*الشراء|منتج))/iu;
const ADD_TO_CART = /(?:add\s*(?:to)?\s*(?:cart|basket)|buy\s*now|أضف\s*(?:إلى|ل)?\s*السلة|اضف\s*(?:الى|ل)?\s*السلة|اشتر)/iu;
const CART = /(?:cart|basket|bag|سلة|عربة)/iu;

export function isShopQaRequest(request: string): boolean {
    return SHOP_REQUEST.test(String(request || ''));
}

export interface ShopQaResult {
    findings: AppAuditFinding[];
    metrics: Record<string, number>;
}

/**
 * Exercise the transaction a customer asked for before the generic control
 * sweep spends its budget on theme toggles and navigation. It supports Joe's
 * maintained data-cart contract plus accessible labels from authored apps.
 */
export async function runShopQa(args: {
    page: any;
    url: string;
    request: string;
    timeoutMs: number;
    onProgress?: (message: string) => void;
}): Promise<ShopQaResult> {
    const findings: AppAuditFinding[] = [];
    const metrics: Record<string, number> = {
        pressed: 0, formsFilled: 0, fieldsFilled: 0, formsPersisted: 0,
        semanticFieldsTested: 0, statesVisited: 0, exploratoryActions: 0, controlsDiscovered: 0,
    };
    if (!isShopQaRequest(args.request)) return { findings, metrics };
    const fail = (id: string, detailEn: string, detail: string, severity: 'high' | 'medium' = 'high') => findings.push({ id, severity, detail, detailEn });
    const timeout = Math.min(Math.max(Number(args.timeoutMs) || 0, 4_000), 15_000);
    try {
        args.onProgress?.('shop: finding a product a customer can add');
        await args.page.goto(args.url, { waitUntil: 'load', timeout });
        metrics.statesVisited += 1;
        const add = args.page.locator('[data-add], button').filter({ hasText: ADD_TO_CART }).first();
        metrics.controlsDiscovered = await args.page.locator('button, a[href], input, select').count();
        if (!await add.count()) {
            fail('shop_add_to_cart_missing', 'The requested store has no visible Add to cart action', 'المتجر المطلوب لا يعرض إجراءً مرئيًا لإضافة منتج إلى السلة');
            return { findings, metrics };
        }
        const before = await args.page.locator('[data-cart-count]').allTextContents().catch(() => []);
        await add.click({ timeout });
        metrics.pressed += 1;
        metrics.exploratoryActions += 1;
        metrics.statesVisited += 1;
        await args.page.waitForTimeout(200);
        const after = await args.page.locator('[data-cart-count]').allTextContents().catch(() => []);
        const badgeChanged = before.join('|') !== after.join('|') && after.some((value: string) => Number(String(value).replace(/\D/g, '')) > 0);
        // Contract first: an explicit cart control wins over DOM order, so a
        // product-first layout cannot steal the cart click. The text fallback
        // skips add controls, which legitimately mention the cart.
        const explicitCart = args.page.locator('[data-cart-open]').first();
        const openCart = (await explicitCart.count())
            ? explicitCart
            : args.page.locator('button:not([data-add])').filter({ hasText: CART }).first();
        if (!await openCart.count()) {
            fail('shop_cart_missing', 'Adding a product did not expose a customer-accessible cart', 'إضافة المنتج لم تكشف سلة يمكن للعميل الوصول إليها');
            return { findings, metrics };
        }
        args.onProgress?.('shop: opening the cart and proving its line item');
        await openCart.click({ timeout });
        metrics.pressed += 1;
        metrics.exploratoryActions += 1;
        metrics.statesVisited += 1;
        const cart = args.page.locator('#joe-cart, .cart-panel, [role="dialog"]').filter({ hasText: /(?:total|subtotal|الإجمالي|سلتك|your cart)/iu }).first();
        const cartVisible = await cart.waitFor({ state: 'visible', timeout: Math.min(timeout, 5_000) }).then(() => true).catch(() => false);
        const lines = cartVisible ? await cart.locator('[data-cart-items] > *, .cart-lines > *, .joe-cart-line').count() : 0;
        if (!cartVisible || (!badgeChanged && !lines)) {
            fail('shop_add_to_cart_failed', 'Adding a product did not produce an observable cart item or count', 'لم تؤد إضافة المنتج إلى عنصر أو عداد سلة قابل للملاحظة');
            return { findings, metrics };
        }
        const total = cartVisible ? String(await cart.innerText()) : '';
        if (!/(?:total|subtotal|الإجمالي)/iu.test(total)) {
            fail('shop_total_missing', 'The open cart does not expose an observable running total', 'السلة المفتوحة لا تعرض إجماليًا قابلًا للملاحظة');
        }
        args.onProgress?.('shop: reloading to prove cart persistence');
        await args.page.reload({ waitUntil: 'load', timeout });
        metrics.exploratoryActions += 1;
        metrics.statesVisited += 1;
        const persisted = await args.page.locator('[data-cart-count]').allTextContents().then((values: string[]) => values.some(value => Number(String(value).replace(/\D/g, '')) > 0)).catch(() => false);
        if (!persisted) {
            fail('shop_cart_persistence_failed', 'The cart did not persist after a real browser reload', 'لم تبق السلة بعد إعادة تحميل المتصفح');
        } else {
            metrics.formsPersisted += 1;
        }
    } catch (error: any) {
        fail('shop_scenario_qa_failed', `The shopping browser journey could not finish: ${String(error?.message || error).slice(0, 140)}`, `تعذر إكمال رحلة المتجر في المتصفح: ${String(error?.message || error).slice(0, 140)}`);
    }
    return { findings, metrics };
}
