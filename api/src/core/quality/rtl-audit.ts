/**
 * ARABIC THAT READS FROM THE RIGHT, MEASURED ON THE PAGE AS IT IS SHOWN.
 *
 * The owner builds in Arabic. An Arabic interface can pass every other check
 * and still be wrong for him at a glance:
 *
 *   - the page lays out left to right, so every line and column is mirrored;
 *   - one block was given `direction: ltr` and its Arabic starts at the left;
 *   - a heading or a paragraph is pushed to the left by a physical
 *     `text-align: left`, with empty space where the line should begin;
 *   - the menu reads backwards: its first item sits at the far left, so the
 *     eye, the Tab key and a screen reader each meet the items in a different
 *     order;
 *   - the buttons are still in English;
 *   - a field that asks for Arabic text types from the left;
 *   - he asked in Arabic and got an English interface.
 *
 * The old visual audit read the stylesheets for `left`/`right`. That flags
 * correct logical CSS that only LOOKS physical from the outside, and misses a
 * framework's reset that does the damage. This reads the result instead:
 * the computed direction of each Arabic text block, where its first line
 * actually sits in its box, and where each menu item actually is.
 *
 * `readRtl` runs inside the page (it touches nothing outside its own body).
 * `rtlFindings` turns one reading into findings; it is pure, so it is
 * tested without a browser.
 */
import type { AppAuditFinding } from './app-audit';

export interface RtlSpot { sel: string; text: string }

export interface RtlReading {
    /** Arabic letters dominate the visible text of the page. */
    arabic: boolean;
    /** Letters on the page (Arabic plus Latin), and the Arabic share of them. */
    letters: number;
    arabicShare: number;
    /** `<html>`: its computed direction and its lang attribute. */
    htmlDir: string;
    htmlLang: string;
    /** Arabic text blocks measured, and those laid out left to right. */
    arabicBlocks: number;
    ltrBlocks: RtlSpot[];
    ltrBlockCount: number;
    /** Arabic text set with a physical `text-align: left` that visibly hugs the left edge. */
    leftHugging: RtlSpot[];
    leftHuggingCount: number;
    /** Rows of menu items whose first item sits on the left in a right-to-left layout. */
    backwardRows: Array<{ sel: string; first: string; last: string }>;
    /** Buttons and links in an Arabic interface still labelled in another language. */
    foreignLabels: string[];
    /** Text fields asking for Arabic (by placeholder or label) that type from the left. */
    ltrFields: RtlSpot[];
}

/**
 * Runs in the page. Self-contained: no closure over anything outside it,
 * because the browser receives only its source.
 */
export function readRtl(): RtlReading {
    const AR = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
    const LATIN = /[A-Za-z]/g;
    const count = (t: string, re: RegExp) => (t.match(re) || []).length;
    const de = document.documentElement;
    const visible = (el: Element): boolean => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05;
    };
    const selOf = (el: Element): string => {
        const id = (el as HTMLElement).id;
        if (id) return '#' + id;
        const cls = String(el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)[0];
        return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
    };
    const ownText = (el: Element): string => Array.from(el.childNodes)
        .filter(n => n.nodeType === 3)
        .map(n => n.textContent || '')
        .join(' ').replace(/\s+/g, ' ').trim();
    const shareOf = (t: string) => {
        const a = count(t, AR), l = count(t, LATIN);
        return a + l ? a / (a + l) : 0;
    };

    const bodyText = (document.body && document.body.innerText) || '';
    const arChars = count(bodyText, AR);
    const letters = arChars + count(bodyText, LATIN);
    const reading: RtlReading = {
        arabic: arChars > Math.max(40, bodyText.replace(/\s/g, '').length * 0.25),
        letters, arabicShare: letters ? arChars / letters : 0,
        htmlDir: String(getComputedStyle(de).direction || '').toLowerCase(),
        htmlLang: String(de.getAttribute('lang') || '').toLowerCase(),
        arabicBlocks: 0, ltrBlocks: [], ltrBlockCount: 0,
        leftHugging: [], leftHuggingCount: 0,
        backwardRows: [], foreignLabels: [], ltrFields: [],
    };
    if (!reading.arabic) return reading;

    //  Each element that carries Arabic text of its own.
    const TEXT = 'p,h1,h2,h3,h4,h5,h6,li,label,td,th,dd,dt,blockquote,figcaption,legend,summary,caption,button,a,span,div,strong,em,small,b,i';
    const BLOCK_TAGS = /^(P|H[1-6]|LI|TD|TH|DD|DT|BLOCKQUOTE|FIGCAPTION|LEGEND|CAPTION|DIV)$/;
    for (const el of Array.from(document.querySelectorAll(TEXT))) {
        if (el.closest('pre,code,kbd,samp,svg,math,[contenteditable="true"],input,textarea,select')) continue;
        const t = ownText(el);
        if (count(t, AR) < 4 || shareOf(t) < 0.6) continue;
        if (!visible(el)) continue;
        reading.arabicBlocks++;
        const cs = getComputedStyle(el);
        if (cs.direction === 'ltr') {
            reading.ltrBlockCount++;
            if (reading.ltrBlocks.length < 6) reading.ltrBlocks.push({ sel: selOf(el), text: t.slice(0, 40) });
            continue;
        }
        //  A physical left, in a right-to-left block, that shows: the first
        //  line ends well short of the right edge and starts at the left one.
        if (cs.textAlign !== 'left' || !BLOCK_TAGS.test(el.tagName)) continue;
        const box = el.getBoundingClientRect();
        const padR = parseFloat(cs.paddingRight) || 0, padL = parseFloat(cs.paddingLeft) || 0;
        const bR = parseFloat(cs.borderRightWidth) || 0, bL = parseFloat(cs.borderLeftWidth) || 0;
        const range = document.createRange();
        range.selectNodeContents(el);
        const line = Array.from(range.getClientRects()).find(r => r.width > 1);
        if (!line) continue;
        const gapRight = (box.right - padR - bR) - line.right;
        const gapLeft = line.left - (box.left + padL + bL);
        if (gapRight > 24 && gapLeft < 6) {
            reading.leftHuggingCount++;
            if (reading.leftHugging.length < 6) reading.leftHugging.push({ sel: selOf(el), text: t.slice(0, 40) });
        }
    }

    //  Rows of menu items: three or more siblings of one kind on one line.
    const seenRows = new Set<Element>();
    for (const parent of Array.from(document.querySelectorAll('nav,ul,ol,menu,[role="tablist"],[role="menubar"],[role="navigation"],header,footer,div'))) {
        if (reading.backwardRows.length >= 4) break;
        if (seenRows.has(parent)) continue;
        const kids = Array.from(parent.children).filter(c => /^(LI|A|BUTTON)$/.test(c.tagName) && visible(c));
        if (kids.length < 3) continue;
        const tag = kids[0].tagName;
        if (!kids.every(k => k.tagName === tag)) continue;
        if (getComputedStyle(parent).direction !== 'rtl') continue;
        const rects = kids.map(k => k.getBoundingClientRect());
        if (!rects.every(r => Math.abs(r.top - rects[0].top) < 6)) continue;
        const labels = kids.map(k => ((k as HTMLElement).innerText || '').trim().replace(/\s+/g, ' '));
        if (labels.filter(l => count(l, AR) >= 2).length < 2) continue;
        const first = rects[0], last = rects[rects.length - 1];
        if (first.left < last.left - 4) {
            seenRows.add(parent);
            reading.backwardRows.push({ sel: selOf(parent), first: labels[0].slice(0, 24), last: labels[labels.length - 1].slice(0, 24) });
        }
    }

    //  Controls still in another language (one brand name is not a label).
    const UI_WORD = /^(?:home|about|services?|work|portfolio|gallery|contact|browse|explore|view|see|more|learn|book|reserve|submit|send|save|cancel|delete|edit|add|next|previous|prev|back|menu|search|login|log\s*in|logout|sign\s*(?:in|up|out)|register|close|open|ok|yes|no|start|continue|confirm|buy|order|checkout|cart|download|upload|filter|sort|reset|update|create|new)$/i;
    for (const el of Array.from(document.querySelectorAll('a,button,[role="button"],input[type="submit"],input[type="button"]')) as HTMLElement[]) {
        if (reading.foreignLabels.length >= 8) break;
        if (!visible(el)) continue;
        //  A part marked as another language (a language switch, a quote) says so itself.
        const langHost = el.closest('[lang]');
        if (langHost && langHost !== de && !/^ar/i.test(String(langHost.getAttribute('lang')))) continue;
        const raw = el.tagName === 'INPUT' ? (el as HTMLInputElement).value : (el.innerText || el.getAttribute('aria-label') || '');
        const label = String(raw || '').trim().replace(/\s+/g, ' ');
        if (!label || count(label, AR)) continue;
        //  An address is written as it is in every language: an email, a phone, a web address.
        const href = String(el.getAttribute('href') || '').toLowerCase();
        if (/^(mailto|tel|sms|whatsapp):/.test(href)) continue;
        if (/^\S+@\S+\.\S+$/.test(label) || /^(https?:\/\/|www\.)\S+$/i.test(label) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(label) || /^[+\d][\d\s().-]{5,}$/.test(label)) continue;
        const words = label.match(/[A-Za-z]{3,}/g) || [];
        if (words.length >= 2 || UI_WORD.test(label)) reading.foreignLabels.push(label.slice(0, 48));
    }

    //  Fields that ask for Arabic and type from the left.
    for (const el of Array.from(document.querySelectorAll('input,textarea')) as HTMLInputElement[]) {
        if (reading.ltrFields.length >= 6) break;
        const type = String(el.getAttribute('type') || 'text').toLowerCase();
        if (el.tagName === 'INPUT' && !['text', 'search', ''].includes(type)) continue;
        if (!visible(el) || getComputedStyle(el).direction !== 'ltr') continue;
        if (String(el.getAttribute('dir') || '').toLowerCase() === 'auto') continue;
        const labelEl = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest('label');
        const asks = `${el.getAttribute('placeholder') || ''} ${(labelEl && (labelEl as HTMLElement).innerText) || ''} ${el.getAttribute('aria-label') || ''}`;
        if (count(asks, AR) >= 3) reading.ltrFields.push({ sel: selOf(el), text: asks.trim().slice(0, 40) });
    }
    return reading;
}

const AR_LETTER = /[؀-ۿ]/g;
const LATIN_LETTER = /[A-Za-z]/g;

/** The request is written in Arabic. */
export function requestIsArabic(request: string | undefined): boolean {
    const t = String(request || '');
    const a = (t.match(AR_LETTER) || []).length, l = (t.match(LATIN_LETTER) || []).length;
    return a >= 6 && a > l;
}

/** The request asks for English, or for two languages, so English on the page is what he asked for. */
export function asksForEnglish(request: string | undefined): boolean {
    return /\b(english|bilingual|two\s+languages|en\s*\/\s*ar|ar\s*\/\s*en)\b|إنجليزي|انجليزي|إنكليزي|انكليزي|الإنجليزية|الانجليزية|بلغتين|ثنائي(?:ة)?\s+اللغة|متعدد(?:ة)?\s+اللغات|لغات\s+متعددة/iu.test(String(request || ''));
}

const list = (spots: RtlSpot[], quote: (s: string) => string) => spots.slice(0, 3).map(s => `${s.sel} ${quote(s.text)}`).join('، ');

/** The findings one reading supports, and nothing it does not. */
export function rtlFindings(r: RtlReading | null | undefined, request?: string): AppAuditFinding[] {
    if (!r) return [];
    const out: AppAuditFinding[] = [];
    const english = asksForEnglish(request);

    //  He asked in Arabic and the interface came back in another language.
    if (!r.arabic && requestIsArabic(request) && !english && r.letters >= 80 && r.arabicShare < 0.2) {
        out.push({
            id: 'interface_not_arabic', severity: 'high',
            detail: `الطلب بالعربية، لكن واجهة التطبيق بلغة أخرى: ${Math.round(r.arabicShare * 100)}٪ فقط من حروفها عربية`,
            detailEn: `The request is in Arabic but the interface is in another language (only ${Math.round(r.arabicShare * 100)}% of its letters are Arabic). Write every visible label, heading, message and placeholder in Arabic, and set <html lang="ar" dir="rtl">`,
        });
        return out;
    }
    if (!r.arabic) return out;

    const laidOutLtr = r.arabicBlocks >= 3 && r.ltrBlockCount * 2 >= r.arabicBlocks;
    if (laidOutLtr) {
        out.push({
            id: 'rtl_missing', severity: 'high',
            detail: `الصفحة عربية لكنها تُعرض من اليسار إلى اليمين: ${r.ltrBlockCount} من ${r.arabicBlocks} كتلة نص عربي اتجاهها ltr، فكل السطور والأعمدة معكوسة`,
            detailEn: `The page is in Arabic but lays out left to right: ${r.ltrBlockCount} of ${r.arabicBlocks} Arabic text blocks are ltr, so every line and column is mirrored. Set <html lang="ar" dir="rtl"> and remove any direction: ltr on the page's containers`,
            evidence: r.ltrBlocks,
        });
    } else {
        if (r.htmlDir !== 'rtl' || !/^ar\b/.test(r.htmlLang)) {
            out.push({
                id: 'rtl_root_attributes', severity: 'low',
                detail: `الصفحة عربية، لكن عنصر <html> ينقصه ${[r.htmlDir !== 'rtl' ? 'dir="rtl"' : '', !/^ar\b/.test(r.htmlLang) ? 'lang="ar"' : ''].filter(Boolean).join(' و')}: النوافذ المنبثقة والإشعارات خارج الجذر تُعرض معكوسة، وقارئ الشاشة ينطقها بلغة أخرى`,
                detailEn: `The page is in Arabic but <html> lacks ${[r.htmlDir !== 'rtl' ? 'dir="rtl"' : '', !/^ar\b/.test(r.htmlLang) ? 'lang="ar"' : ''].filter(Boolean).join(' and ')}: dialogs and toasts outside the app's root render mirrored, and a screen reader pronounces it in the wrong language. Put them on <html> itself`,
            });
        }
        if (r.ltrBlockCount) {
            out.push({
                id: 'arabic_text_ltr', severity: 'medium',
                detail: `${r.ltrBlockCount} كتلة نص عربي اتجاهها من اليسار إلى اليمين داخل صفحة عربية: ${list(r.ltrBlocks, s => `«${s}»`)}`,
                detailEn: `${r.ltrBlockCount} Arabic text block(s) are set left to right inside an Arabic page: ${list(r.ltrBlocks, s => `"${s}"`)}. Remove dir="ltr" / direction: ltr from them (keep ltr only for code, numbers or Latin text)`,
                evidence: r.ltrBlocks,
            });
        }
    }
    if (r.leftHuggingCount) {
        out.push({
            id: 'arabic_text_left', severity: 'medium',
            detail: `${r.leftHuggingCount} نص عربي مدفوع إلى اليسار بمحاذاة فيزيائية (text-align: left)، وبداية السطر فارغة على اليمين: ${list(r.leftHugging, s => `«${s}»`)}`,
            detailEn: `${r.leftHuggingCount} Arabic text block(s) are pushed to the left by a physical text-align: left, leaving the start of the line empty on the right: ${list(r.leftHugging, s => `"${s}"`)}. Use text-align: start (or right), never left`,
            evidence: r.leftHugging,
        });
    }
    if (r.backwardRows.length) {
        const row = r.backwardRows[0];
        out.push({
            id: 'menu_reads_backwards', severity: 'medium',
            detail: `${r.backwardRows.length} قائمة تُقرأ بالمقلوب: أول عنصر فيها «${row.first}» في أقصى اليسار وآخرها «${row.last}» في اليمين (${row.sel})، فالعين وزر Tab وقارئ الشاشة يمرّون عليها بترتيب مختلف`,
            detailEn: `${r.backwardRows.length} menu row(s) read backwards in the right-to-left layout: the first item "${row.first}" sits at the far left and the last "${row.last}" at the right (${row.sel}), so the eye, the Tab key and a screen reader each meet them in a different order. Remove flex-direction: row-reverse / float: left / direction: ltr from the row and keep the items in reading order`,
            evidence: r.backwardRows,
        });
    }
    if (r.foreignLabels.length && !english) {
        out.push({
            id: 'foreign_labels', severity: 'medium',
            detail: `${r.foreignLabels.length} زر أو رابط في الواجهة العربية ما زال بلغة أخرى: ${r.foreignLabels.slice(0, 3).map(l => `«${l}»`).join('، ')}`,
            detailEn: `${r.foreignLabels.length} button(s) or link(s) in the Arabic interface are still in another language: ${r.foreignLabels.slice(0, 3).map(l => `"${l}"`).join(', ')}. Translate the visible labels to Arabic`,
            evidence: r.foreignLabels,
        });
    }
    //  On a page laid out left to right every field types from the left; the page's own fix covers them.
    if (r.ltrFields.length && !laidOutLtr) {
        out.push({
            id: 'arabic_field_ltr', severity: 'low',
            detail: `${r.ltrFields.length} حقل يطلب نصاً عربياً لكنه يكتب من اليسار: ${list(r.ltrFields, s => `«${s}»`)}`,
            detailEn: `${r.ltrFields.length} text field(s) ask for Arabic text but type from the left: ${list(r.ltrFields, s => `"${s}"`)}. Remove direction: ltr from them, or give them dir="auto"`,
            evidence: r.ltrFields,
        });
    }
    return out;
}
