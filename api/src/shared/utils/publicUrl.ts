/**
 * THE ADDRESS JOE GIVES OUT.
 *
 * Twenty-three places built links as `http://localhost:${PORT}/…` and handed
 * them to a person or, worse, wrote them INTO a page that gets published. On
 * the machine running Joe that reads fine. Everywhere else it is a dead link
 * pointing at the reader's own computer:
 *
 *   - the user opens Joe from their PHONE on the same network to check a mobile
 *     build, taps the preview link, and lands on nothing;
 *   - a site Joe built is published, a real visitor submits the contact form,
 *     and the browser posts to `localhost` — their localhost. The message is
 *     never sent, and nothing on screen says so.
 *
 * `PUBLIC_URL` already existed for exactly this, was already editable from the
 * panel's Settings tab, and was honoured by the sign-in flow alone.
 *
 * Only addresses on JOE'S OWN port belong here. A link to a project's dev
 * server on some other port is deliberately left as it was — inventing a public
 * address for an arbitrary port would be a guess, and a guess in a link is the
 * same dead end with more confidence.
 */

/** Joe's base address as the READER should see it — no trailing slash. */
export function publicBaseUrl(): string {
    const configured = String(process.env.PUBLIC_URL || '').trim();
    if (configured) return configured.replace(/\/+$/, '');
    const port = String(process.env.PORT || '5002').trim();
    return `http://localhost:${port}`;
}

/** A link on Joe's own port, built from the address the reader can reach. */
export function publicUrlFor(path: string): string {
    const p = String(path || '');
    return `${publicBaseUrl()}${p.startsWith('/') ? p : `/${p}`}`;
}
