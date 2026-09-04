import { requirementNamesPage, verifyNamed, type NamedRequirement } from '../core/quality/named-requirements';
import { acceptanceFor, judgeAcceptance } from '../core/quality/acceptance';
import fs from 'fs';
import os from 'os';
import path from 'path';

const requirement = (id: string, text: string): NamedRequirement => ({ id, text, quote: text });

describe('a multi-page site contract survives a unavailable provider', () => {
    it('makes the requested Visit contact form part of the acceptance denominator', () => {
        const request = 'Create Home, Exhibits, Visit, and Education pages, with a Visit contact form.';
        const criterion = acceptanceFor(request).find(item => item.id === 'contact_form');
        expect(criterion).toBeDefined();

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-museum-form-'));
        fs.writeFileSync(path.join(dir, 'Contact.jsx'), `export default function Contact(){return <form onSubmit={()=>{}}><input type="email" /></form>}`);
        const result = judgeAcceptance([criterion!], { dir } as any, false);
        expect(result.accepted).toBe(true);
        expect(result.criteria[0].verdict).toBe('met');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('proves routes, shared navigation, active state, internal links, and the visit form from structural source evidence', async () => {
        const source = `
            import Navbar from './components/Navbar.jsx';
            const pages = [
              { path: '/', title: 'Home', render: () => <Home /> },
              { path: '/exhibits', title: 'Exhibits', render: () => <Exhibits /> },
              { path: '/visit', title: 'Visit', render: () => <Contact /> },
              { path: '/education', title: 'Education', render: () => <Education /> },
            ];
            export function App() { return <><Navbar content={content} pages={pages} /></>; }
            export function Navbar({ pages }) { return <nav className="nav-links">{pages.map(() => null)}</nav>; }
            export function Link({ to }) { const current = usePath() === to;
              return <a href={'#' + to} aria-current={current ? 'page' : undefined} />; }
            const content = { nav: [
              { href: '#/exhibits' }, { href: '#/visit' }, { href: '#/education' },
            ] };
            export function Contact() { return <form onSubmit={() => {}}><input /></form>; }
        `;
        const result = await verifyNamed([
            requirement('site', 'four-page science museum website'),
            requirement('pages', 'Home, Exhibits, Visit, and Education'),
            requirement('home', 'Home page'), requirement('exhibits', 'Exhibits page'),
            requirement('visit', 'Visit page'), requirement('education', 'Education page'),
            requirement('header', 'Shared header'), requirement('active', 'Active-page indicator'),
            requirement('links', 'Internal links'), requirement('form', 'Visit contact form'),
        ], source, false, async () => { throw new Error('provider unavailable'); });

        expect(result.map(item => item.verdict)).toEqual(Array(10).fill('met'));
    });

    it('does not certify a route from a page title alone', async () => {
        const result = await verifyNamed([
            requirement('visit', 'Visit page'),
        ], `const heading = 'Visit';`, false, async () => { throw new Error('provider unavailable'); });

        expect(result[0]).toMatchObject({ verdict: 'unprovable' });
    });

    it('accepts a bare page name and identifies the matching structural criterion for deduplication', async () => {
        const bareVisit = requirement('visit', 'Visit');
        expect(requirementNamesPage(bareVisit, 'Visit')).toBe(true);
        expect(requirementNamesPage(requirement('form', 'Visit contact form'), 'Visit')).toBe(false);

        const source = `
            import Navbar from './Navbar';
            const pages = [
              { path: '/', title: 'Home' }, { path: '/exhibits', title: 'Exhibits' },
              { path: '/visit', title: 'Visit', render: () => <Contact /> },
              { path: '/education', title: 'Education' },
            ];
            const Navbar = () => <nav className="nav-links">{pages.map(() => null)}</nav>;
        `;
        const [result] = await verifyNamed([bareVisit], source, false, async () => { throw new Error('provider unavailable'); });
        expect(result).toMatchObject({ verdict: 'met' });
    });

    it('does not confuse a record field named Home with a four-page site', async () => {
        const result = await verifyNamed([
            requirement('home', 'Home'),
        ], `const schema = { label: 'Home' };`, false, async () => { throw new Error('provider unavailable'); });

        expect(result[0]).toMatchObject({ verdict: 'unprovable' });
    });
});
