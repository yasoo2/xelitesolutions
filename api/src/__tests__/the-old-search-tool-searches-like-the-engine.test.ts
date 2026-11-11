/**
 * THE OLD SEARCH TOOL SEARCHES THE WAY THE ENGINE DOES (SearchApiTool).
 *
 * The Manus-style exam, 2026-11-09 (M04): `search_api` scraped DuckDuckGo
 * alone and ended the run with «Search Failed: DDG detected an anomaly … making
 * requests too quickly». Pinned: it asks Joe's own web search first (several
 * public sources, a refusing one rested); the DuckDuckGo scrape only when that
 * finds nothing; and a failure says what both said.
 */
const engineSearch = jest.fn();
const ddg = jest.fn();
jest.mock('../core/engine/web-search', () => ({ searchWeb: (...a: any[]) => engineSearch(...a) }));
jest.mock('duck-duck-scrape', () => ({ search: (...a: any[]) => ddg(...a), SafeSearchType: { STRICT: 0 } }));

import { SearchApiTool } from '../modules/tools/definitions/SearchApiTool';

beforeEach(() => { engineSearch.mockReset(); ddg.mockReset(); });

test('Joe\'s own web search answers first; DuckDuckGo is never asked then', async () => {
    engineSearch.mockResolvedValue({ provider: 'news', hits: [{ title: 'سعر الذهب اليوم', url: 'https://example.com/gold', snippet: '21 قيراط' }] });
    const out: any = await new SearchApiTool().execute({ query: 'سعر الذهب عيار 21 في الأردن', limit: 3 });
    expect(out.ok).toBe(true);
    expect(out.output).toEqual({ results: [{ title: 'سعر الذهب اليوم', url: 'https://example.com/gold', description: '21 قيراط' }], provider: 'news' });
    expect(engineSearch).toHaveBeenCalledWith('سعر الذهب عيار 21 في الأردن', { count: 3 });
    expect(ddg).not.toHaveBeenCalled();
});

test('nothing found there: the DuckDuckGo scrape, the last resort', async () => {
    engineSearch.mockResolvedValue({ provider: 'none', hits: [], note: 'every source refused' });
    ddg.mockResolvedValue({ noResults: false, results: [{ title: 't', url: 'https://d.example/x', description: 'd' }] });
    const out: any = await new SearchApiTool().execute({ query: 'x y z' });
    expect(out.output.provider).toBe('duckduckgo');
    expect(out.output.results).toHaveLength(1);
});

test('both refused: the failure says what each said', async () => {
    engineSearch.mockRejectedValue(new Error('offline'));
    ddg.mockRejectedValue(new Error('DDG detected an anomaly in the request'));
    const out: any = await new SearchApiTool().execute({ query: 'x y z' });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/DDG detected an anomaly .*and the web search before it: offline/);
});
