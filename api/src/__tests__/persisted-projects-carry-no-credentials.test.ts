import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { flushJoeProjects } from '../api/page-store';

const PAGE_STORE_SOURCE = process.env.JOE_PAGESTORE_SRC || path.join(__dirname, '..', 'api', 'page-store.ts');
const REQUIRED_CREDENTIAL_FIELDS = ['runtimeAuth', 'ownerEmail', 'ownerPassword'] as const;

/**
 *  ⛔ THIS GUARD STANDS OVER THE OWNER'S OWN CREDENTIALS, AND IT FOUND NOTHING.
 *
 *  It reads `page-store.ts` and collects every `delete copy.<field>` inside
 *  `persistedProjects`, then asserts that `runtimeAuth`, `ownerEmail` and
 *  `ownerPassword` are among them — that they are stripped before anything is
 *  written to disk.
 *
 *  The body was located with `/…\n}\n\nexport function loadJoeProjects/`. Git
 *  checks these sources out CRLF on Windows, so the pattern could not match,
 *  the body came back empty, and the extractor returned **zero fields** on the
 *  one machine that holds his real credentials.
 *
 *  It failed loudly here only because the next line asserts `>= 3`. Written as
 *  a loop over the fields it would have passed over an empty list and reported
 *  a credential guard that guards nothing — «zero failed» over zero checks,
 *  which is the shape this repository has paid for more than any other.
 *
 *  The claim is about what the source SAYS, not about which bytes end a line.
 */
function derivedPersistedFields(rawSource: string): string[] {
    const source = rawSource.replace(/\r\n/g, '\n');
    const persistedProjectsBody = source.match(/function persistedProjects[\s\S]*?\n}\n\nexport function loadJoeProjects/)?.[0] || '';
    return Array.from(persistedProjectsBody.matchAll(/delete\s+copy\.([A-Za-z_$][\w$]*)\s*;/g), match => match[1]);
}

describe('persisted projects carry no credentials', () => {
    let tmp: string;
    let previousStoreDir: string | undefined;
    let previousProjects: unknown;

    beforeEach(() => {
        previousStoreDir = process.env.JOE_CHAT_STORE_DIR;
        previousProjects = (global as any).joeProjects;
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-credential-guard-'));
        process.env.JOE_CHAT_STORE_DIR = tmp;
        (global as any).joeProjects = {};
    });

    afterEach(() => {
        if (previousStoreDir === undefined) delete process.env.JOE_CHAT_STORE_DIR;
        else process.env.JOE_CHAT_STORE_DIR = previousStoreDir;
        if (previousProjects === undefined) delete (global as any).joeProjects;
        else (global as any).joeProjects = previousProjects;
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('derives every stripped field from persistedProjects and keeps credentials off disk', () => {
        const source = fs.readFileSync(PAGE_STORE_SOURCE, 'utf8');
        const derivedFields = derivedPersistedFields(source);

        expect(derivedFields.length).toBeGreaterThanOrEqual(3);
        for (const field of REQUIRED_CREDENTIAL_FIELDS) expect(derivedFields).toContain(field);

        const project: Record<string, unknown> = { dir: '/p/app', updatedAt: 1 };
        for (const [index, field] of derivedFields.entries()) project[field] = `FAKE_${field}_${index}_XYZ`;
        (global as any).joeProjects = { p1: project };

        flushJoeProjects();

        const file = path.join(tmp, 'joe-projects.json');
        expect(fs.existsSync(file)).toBe(true);
        const raw = fs.readFileSync(file, 'utf8');
        expect(raw.length).toBeGreaterThan(0);
        expect(raw).toContain('/p/app');
        for (const [index, field] of derivedFields.entries()) {
            expect(raw).not.toContain(`FAKE_${field}_${index}_XYZ`);
        }
    });
});
