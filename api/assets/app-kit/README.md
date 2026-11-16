# Joe's print kit

Placed by Joe for a page that prints or makes a PDF in Arabic, Hebrew, Persian or Urdu.
It holds `print.css`, the fonts in `fonts/` (Cairo, Amiri; SIL Open Font License, `OFL.txt`)
and this file. Nothing here changes what your app decided: your own font, colours, `dir` and
layout win.

## The way measured to print these scripts right

An HTML page that a browser turns into a PDF. Joe's tests printed Arabic wrong with pdfkit,
pdf-lib, ReportLab, fpdf without text shaping and PyMuPDF `insert_text`.

1. **A print view** (the default): its own page with `<html lang="ar" dir="rtl">`, the kit's
   `print.css`, the printed part inside an element with class `joe-print`, and a print button.

   ```html
   <link rel="stylesheet" href="/vendor/joe-kit/print.css">
   <div class="joe-print"> … the part that is printed … </div>
   <button class="no-print" onclick="window.print()">طباعة</button>
   ```

   Serve the kit's folder statically, so `/vendor/joe-kit/fonts/…` answers.

2. **A PDF file without a person pressing print**: the server opens that same print view in
   headless Chromium (`playwright`) and returns its PDF:

   ```js
   const pdf = await page.pdf({ printBackground: false });
   ```

## Patterns

- A print view on its own route is the simplest thing that works everywhere.
- `react-to-print`: the printed component carries `joe-print`; keep `copyStyles`.
- A popup (`window.open`) must link `print.css` in the popup's own document.
- Swapping `document.body.innerHTML` around printing is fragile: use `@media print` and `.no-print`.
- Inside `.joe-print` your colours and backgrounds print exactly as designed; to save ink, design
  the printed part light, or add `print-color-adjust: economy`.
- Your own font wins: the kit's Cairo is only the default for a page that names none.
- A part in another language keeps its own `dir="ltr"`: the kit never overrides it.
- Long names: give their element `overflow-wrap: anywhere` yourself where a narrow box must hold
  them. The kit does not, so that amounts in fixed cells stay whole.
- Set your own `@page` (an 80 mm receipt: `@page { size: 80mm auto; margin: 3mm }`).
- A name or an amount drawn on a `<canvas>`, or under a CSS `filter`, is printed as a picture:
  nobody can search or copy it, and Joe cannot check it. Print it as text.
- One print button per row is fine; a date goes inside `<bdi>`.
