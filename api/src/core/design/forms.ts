/**
 * Forms that tell the truth about what happened to the message.
 *
 * The content contract already DETECTS a form that only console.logs — but
 * detection is not enforcement, and the repair is handed back to the same weak
 * model that wrote the problem. The result is the pattern this codebase keeps
 * finding: a visitor fills in a contact form, sees «تم الإرسال بنجاح», and
 * nothing was sent anywhere.
 *
 * A static page has exactly one honest way to deliver a message without a
 * server: hand it to the visitor's own mail client. So:
 *
 *   - with a destination address, submit opens a real, pre-filled email. The
 *     page says the mail client was opened — not that the message was sent,
 *     because the visitor still has to press send.
 *   - with no destination, the form validates, keeps what was typed, offers it
 *     for copying, and states plainly that no endpoint is connected and nothing
 *     was transmitted.
 *
 * There is no third branch where it congratulates anybody.
 *
 * The validation is worth having on its own: real constraint checking with
 * aria-invalid, aria-describedby, focus moved to the first bad field, and errors
 * announced in a live region — none of which a weak model writes.
 */

/** The markup contract, handed to the model alongside the blueprint. */
export function formBrief(): string {
    return `FORMS — Joe ships the validation and the submit behaviour; you write the fields.

- Mark a real form with data-joe-form, and give it the destination if the brief
  names one:
    <form data-joe-form data-to="hello@example.com">
      <label for="name">الاسم</label>
      <input id="name" name="name" type="text" required>
      <label for="email">البريد</label>
      <input id="email" name="email" type="email" required>
      <label for="msg">رسالتك</label>
      <textarea id="msg" name="message" required></textarea>
      <button class="btn" type="submit">أرسل</button>
    </form>
- Every field needs a real <label for="…">; a placeholder is not a label.
- Mark the fields that matter with required, and use the right type
  (email/tel/number) so the browser validates them properly.
- Do NOT write submit handlers, validation JavaScript, success messages, or
  console.log('sent'). Joe wires it, and it never claims a message was
  delivered when it was not.`;
}

/**
 * Validation and submission. Vanilla, no dependencies, no network, and it never
 * throws into the page.
 */
export function formRuntime(isArabic: boolean): string {
    const t = isArabic
        ? {
            required: 'هذا الحقل مطلوب.',
            email: 'أدخل بريدًا إلكترونيًا صحيحًا.',
            tel: 'أدخل رقم هاتف صحيح.',
            short: 'النص قصير جدًا.',
            fix: 'صحّح الحقول المحدّدة ثم أعد المحاولة.',
            opened: 'فُتح برنامج البريد لديك برسالة جاهزة — اضغط «إرسال» فيه لإتمام الإرسال.',
            delivered: '✅ وصلت رسالتك — ستظهر في صندوق رسائل الموقع.',
            sending: 'جارٍ الإرسال…',
            noEndpoint: 'لم يُوصَل هذا النموذج بخادم بعد، فلم تُرسَل رسالتك إلى أي جهة. نصّها محفوظ أدناه لتنسخه.',
            copy: 'انسخ نص الرسالة',
            copied: 'نُسخ',
        }
        : {
            required: 'This field is required.',
            email: 'Enter a valid email address.',
            tel: 'Enter a valid phone number.',
            short: 'That is too short.',
            fix: 'Fix the highlighted fields and try again.',
            opened: 'Your mail app was opened with the message ready — press send there to deliver it.',
            delivered: '✅ Your message was delivered to the site inbox.',
            sending: 'Sending…',
            noEndpoint: 'This form is not connected to a server, so your message was NOT sent anywhere. Its text is kept below so you can copy it.',
            copy: 'Copy the message',
            copied: 'Copied',
        };

    return `<script>
/* Joe forms — real validation, honest delivery. */
(function () {
  'use strict';
  var T = ${JSON.stringify(t)};

  function msgFor(field) {
    var v = field.validity;
    if (v.valueMissing) return T.required;
    if (v.typeMismatch) return field.type === 'email' ? T.email : field.type === 'tel' ? T.tel : T.email;
    if (v.tooShort) return T.short;
    return field.validationMessage || T.required;
  }

  function errorBox(field) {
    var id = (field.id || field.name || 'f') + '-error';
    var box = document.getElementById(id);
    if (!box) {
      box = document.createElement('p');
      box.id = id;
      box.className = 'joe-field-error';
      box.setAttribute('role', 'alert');
      (field.parentNode || field).insertBefore(box, field.nextSibling);
    }
    return box;
  }

  function clear(field) {
    field.removeAttribute('aria-invalid');
    var box = document.getElementById((field.id || field.name || 'f') + '-error');
    if (box) box.remove();
    var d = field.getAttribute('aria-describedby');
    if (d) {
      var left = d.split(/\\s+/).filter(function (x) { return x !== (field.id || field.name || 'f') + '-error'; }).join(' ');
      if (left) field.setAttribute('aria-describedby', left); else field.removeAttribute('aria-describedby');
    }
  }

  function mark(field) {
    var box = errorBox(field);
    box.textContent = msgFor(field);
    field.setAttribute('aria-invalid', 'true');
    var d = field.getAttribute('aria-describedby');
    if (!d || d.indexOf(box.id) < 0) field.setAttribute('aria-describedby', (d ? d + ' ' : '') + box.id);
  }

  function status(form) {
    var s = form.querySelector('[data-form-status]');
    if (!s) {
      s = document.createElement('div');
      s.setAttribute('data-form-status', '');
      s.setAttribute('role', 'status');
      s.setAttribute('aria-live', 'polite');
      s.className = 'joe-form-status';
      form.appendChild(s);
    }
    return s;
  }

  function body(form) {
    var out = [];
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === 'submit' || el.type === 'button') return;
      var label = form.querySelector('label[for="' + el.id + '"]');
      out.push((label ? label.textContent.trim() : el.name) + ': ' + el.value);
    });
    return out.join('\\n');
  }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.hasAttribute || !form.hasAttribute('data-joe-form')) return;
    e.preventDefault();

    var fields = Array.prototype.filter.call(form.elements, function (el) {
      return el.name && el.type !== 'submit' && el.type !== 'button' && typeof el.checkValidity === 'function';
    });
    var bad = [];
    fields.forEach(function (el) { clear(el); if (!el.checkValidity()) { mark(el); bad.push(el); } });

    var s = status(form);
    if (bad.length) {
      s.textContent = T.fix;
      s.setAttribute('data-tone', 'error');
      bad[0].focus();
      return;
    }

    var text = body(form);

    /**
     * THE INBOX PATH — real delivery. When the page carries a data-joe-inbox
     * endpoint (Joe injects it at build time), the submission is POSTed to
     * Joe's own server and lands in the site's inbox, readable in the chat
     * with «اعرض رسائل النموذج». On a PUBLISHED copy of the page that
     * endpoint is unreachable, the fetch rejects, and the honest fallback
     * below (mailto / keep-the-text) takes over — capability added, honesty
     * kept.
     */
    var inbox = (form.getAttribute('data-joe-inbox') || '').trim();
    if (inbox && typeof fetch === 'function') {
      var payload = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (el.name && el.type !== 'submit' && el.type !== 'button') payload[el.name] = el.value;
      });
      s.textContent = T.sending;
      s.setAttribute('data-tone', 'warn');
      fetch(inbox, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: payload, page: document.title }),
      }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        s.textContent = T.delivered;
        s.setAttribute('data-tone', 'ok');
        form.reset();
      }).catch(function () { deliverFallback(form, s, text); });
      return;
    }
    deliverFallback(form, s, text);
  });

  function deliverFallback(form, s, text) {
    var to = (form.getAttribute('data-to') || '').trim();
    // A destination that is obviously a placeholder is not a destination.
    if (to && !/example\\.(com|org)|your-?email|@domain/i.test(to) && /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(to)) {
      var subject = form.getAttribute('data-subject') || (document.title || 'Website enquiry');
      // This genuinely opens the visitor's mail client. It does not send —
      // they still have to press send — and the wording says exactly that.
      window.location.href = 'mailto:' + encodeURIComponent(to)
        + '?subject=' + encodeURIComponent(subject)
        + '&body=' + encodeURIComponent(text);
      s.textContent = T.opened;
      s.setAttribute('data-tone', 'ok');
      return;
    }

    // No destination: say so, and keep what they wrote rather than losing it.
    s.setAttribute('data-tone', 'warn');
    s.textContent = '';
    var p = document.createElement('p');
    p.textContent = T.noEndpoint;
    var pre = document.createElement('pre');
    pre.className = 'joe-form-copy';
    pre.textContent = text;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost';
    btn.textContent = T.copy;
    btn.addEventListener('click', function () {
      var done = function () { btn.textContent = T.copied; setTimeout(function () { btn.textContent = T.copy; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { });
      else { var r = document.createRange(); r.selectNode(pre); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); done(); }
    });
    s.appendChild(p); s.appendChild(pre); s.appendChild(btn);
  }

  /**
   * The browser refuses to fire a submit event at all while a required field
   * is empty — it shows its own bubble instead — so none of the above would
   * ever have run. novalidate hands the reporting to us; checkValidity() still
   * applies exactly the same constraint rules, so nothing is loosened, and the
   * messages become ones a screen reader can reach.
   */
  function takeOver() {
    Array.prototype.forEach.call(document.querySelectorAll('form[data-joe-form]'), function (f) {
      f.setAttribute('novalidate', '');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', takeOver);
  else takeOver();

  // Clear a field's error as soon as the visitor fixes it, rather than making
  // them submit again to find out.
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || !el.form || !el.form.hasAttribute || !el.form.hasAttribute('data-joe-form')) return;
    if (el.getAttribute('aria-invalid') === 'true' && el.checkValidity && el.checkValidity()) clear(el);
  });
})();
</script>`;
}

/** Styling for the validation and status output. */
export function formCss(): string {
    return `
/* Form validation & status */
.joe-field-error{margin:var(--space-2) 0 0;color:#dc2626;font-size:var(--step--1)}
[aria-invalid="true"]{border-color:#dc2626!important;outline-color:#dc2626}
.joe-form-status{margin-block-start:var(--space-4);font-size:var(--step-0);line-height:1.6}
.joe-form-status[data-tone="error"]{color:#dc2626}
.joe-form-status[data-tone="ok"]{color:var(--brand-dark)}
.joe-form-status[data-tone="warn"]{color:var(--text-muted)}
.joe-form-copy{white-space:pre-wrap;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);
  padding:var(--space-4);margin:var(--space-4) 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:var(--step--1);overflow:auto;max-height:240px}
@media (prefers-color-scheme:dark){.joe-field-error,.joe-form-status[data-tone="error"]{color:#f87171}}`;
}

/**
 * Point every data-joe-form at Joe's inbox for this site. Injected at build
 * time; idempotent (a rebuild replaces its own attribute). The endpoint is
 * absolute (localhost) on purpose: the PREVIEWED page reaches it, and a
 * PUBLISHED copy fails the fetch and falls back to the honest path.
 */
export function wireFormsToInbox(html: string, siteId: string, port: string | number): string {
    const clean = String(siteId || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80);
    if (!clean) return String(html || '');
    const endpoint = `http://localhost:${port}/api/public/forms/${clean}`;
    return String(html || '').replace(/<form\b[^>]*>/gi, (tag) => {
        if (!/data-joe-form/.test(tag)) return tag;
        const stripped = tag.replace(/\s*data-joe-inbox\s*=\s*"[^"]*"/i, '');
        return stripped.replace(/<form\b/i, `<form data-joe-inbox="${endpoint}"`);
    });
}
