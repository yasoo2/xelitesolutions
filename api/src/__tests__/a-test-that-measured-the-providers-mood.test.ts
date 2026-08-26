/**
 * A NEW CAPABILITY PUT A NETWORK CALL ON A PATH HERMETIC TESTS RUN THROUGH.
 *
 * Letting the model author the interface added up to six provider calls to
 * every project build. Every suite that builds a project therefore started
 * waiting on the network, and four of them went red on two machines at once:
 *
 *     thrown: "Exceeded timeout of 10000 ms for a test."
 *       at design-families.test.ts:79   new ReactProjectTool().execute(…)
 *
 *     here (win32)   design-families, build-info, business-profile
 *     Linux, batch 10/30   FAIL business-profile.test.ts (21.869 s)
 *     Linux, batch 11/30   FAIL design-families.test.ts (10.112 s)
 *     Linux, batch 21/30   FAIL project-text-edit, react-card-photos
 *
 * ⛔ AND THE TIMEOUT IS THE SMALL HALF OF IT. A test that reaches a provider
 * measures the provider's mood, not the code: green when the free tier is
 * quiet, red when it is busy. It has stopped being evidence, and its colour
 * would have been read as a fact about the source for as long as nobody
 * noticed. That is the same family as a gate whose empty output counts as
 * success — a signal that no longer measures what its name says.
 *
 * The authoring layer keeps its own guards, which drive it with a stubbed
 * caller and never open a socket. That is where a model-facing feature is
 * tested. This file guards the boundary itself.
 */

import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'),
    'utf-8',
);

describe('the generator never reaches a provider from inside a test', () => {
    it('POSITIVE — the section author stands down under Jest', () => {
        expect(SRC).toMatch(/const insideATest = process\.env\.NODE_ENV === 'test' \|\| !!process\.env\.JEST_WORKER_ID/);
        expect(SRC).toMatch(/providersAreRationing = insideATest \|\|/);
    });

    it('POSITIVE — and so does the COPY author', () => {
        //  Guarding one and not the other is the «one layer, two generators»
        //  class that produced most of this session's defects. Both spend the
        //  same fuel and both sit on the same path.
        const block = SRC.slice(SRC.indexOf('const copyProvidersRationing'), SRC.indexOf('const copyProvidersRationing') + 600);
        expect(block).toContain("process.env.NODE_ENV === 'test'");
        expect(block).toContain('JEST_WORKER_ID');
    });

    it('⛔ NEGATIVE — and this very test proves the switch is ON right now', () => {
        //  Non-emptiness that cannot be faked: if the condition the source
        //  relies on were false inside Jest, the whole guard above would be
        //  describing something that never happens.
        const insideATest = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
        expect({ insideATest, node_env: process.env.NODE_ENV || null, worker: !!process.env.JEST_WORKER_ID })
            .toEqual({ insideATest: true, node_env: process.env.NODE_ENV || null, worker: !!process.env.JEST_WORKER_ID });
    });

    it('NEGATIVE — standing down for rationing is still separate from standing down for tests', () => {
        //  Collapsing the two would make production authoring impossible to
        //  turn on, and would hide the rationing behaviour behind a flag that
        //  is only ever true in CI.
        expect(SRC).toContain('isProviderCoolingDown');
        expect(SRC).toMatch(/interface authoring stood down/);
    });
});
