process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-not-a-secret';
import { requestedArtifact } from '../core/design/requested-artifact';
import { requestedDeliveryRoles } from '../modules/tools/definitions/ProjectPipelineTool';

/**
 * The hard exam, 2026-11-05, H13: «Build a project management REST API only,
 * with Node, Express and SQLite: …». Thirty files, a test suite, an OpenAPI
 * document — refused four times with «the request asks for an interface, but
 * no delivered part serves one».
 *
 * An English object's head is its last word, and the last word of «a project
 * management REST API only» was «only»: no head, no artifact, and a request
 * the reader could not name is held to need a page. «Build only an API» and
 * «واجهة برمجية فقط» were read as APIs all along; only the word after the
 * head was in the way.
 */
const H13 = 'Build a project management REST API only, with Node, Express and SQLite: organizations, projects, tasks and comments; JWT authentication with refresh tokens; role-based permissions per organization; pagination, filtering and sorting; OpenAPI documentation; and a full test suite.';

describe('a word after the head does not hide what is built', () => {
    it('H13: a REST API only is an API, with a server and no page to serve', () => {
        expect(requestedArtifact(H13).kind).toBe('api');
        expect(requestedDeliveryRoles(H13)).toEqual({ service: true, interface: false, program: false });
    });

    it('«only», «just», «alone» after the head; the same read as before it', () => {
        for (const t of ['Build an API only.', 'Build a REST API just for my shop inventory.', 'Build an API alone, nothing else.', 'Build only an API for my shop.']) {
            expect(requestedArtifact(t).kind).toBe('api');
        }
        expect(requestedArtifact('Make a CLI tool only, no web.').kind).toBe('cli');
        expect(requestedArtifact('ابني واجهة برمجية فقط لإدارة المهام').kind).toBe('api');
    });

    it('a word between two nouns is still part of the phrase: «an admin only dashboard» is a dashboard', () => {
        expect(requestedArtifact('Build an admin only dashboard.').kind).toBe('app');
        expect(requestedArtifact('Build a members only page for my club.').kind).toBe('page');
    });
});
