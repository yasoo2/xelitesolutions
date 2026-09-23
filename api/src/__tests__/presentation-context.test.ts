import { presentationShellContext } from '../core/quality/presentation-context';

describe('presentation surrounding context', () => {
    const shell = '// omit this comment\nexport default function App(){return <main id="page" className={dark ? "shell dark" : "shell"}><h1>Title</h1><View /></main>}';
    it('retains the actual shell hierarchy and removes comments only', () => {
        const [app] = presentationShellContext(shell, '');
        expect(app.source).toContain('<h1>Title</h1>');
        expect(app.source).toContain('<View />');
        expect(app.source).not.toContain('omit this comment');
    });
    it('preserves the enclosing component without teaching the view shell-owned helper implementations', () => {
        const [app, css] = presentationShellContext(`
            import View from './View';
            const brand = 'Library';
            function SignIn() { return <form className="credentials"><input name="password" /></form>; }
            export default function App() { return <main className="shell"><h1>{brand}</h1><SignIn /><View /></main>; }
        `, '.credentials{display:flex}.shell{padding:12px}input{width:100%}');
        expect(app.source).toContain("import View from './View'");
        expect(app.source).toContain("const brand = 'Library'");
        expect(app.source).toContain('<SignIn />');
        expect(app.source).toContain('<View />');
        expect(app.source).not.toContain('function SignIn');
        expect(app.scope).toContain('helper function declarations');
        expect(css.source).toContain('.shell{padding:12px}');
        expect(css.source).toContain('input{width:100%}');
        expect(css.source).not.toContain('.credentials');
    });
    it('does not omit helpers when the shell export boundary is not recognized', () => {
        const [app, css] = presentationShellContext('function Header(){return <header className="header"/>} const App=()=> <Header/>; export default App;', '.header{color:red}');
        expect(app.source).toContain('function Header');
        expect(css.source).toContain('.header{color:red}');
        expect(app.scope).toContain('no helper declarations omitted');
    });
    it('keeps global controls, theme tokens, shell selectors and media conditions', () => {
        const [, css] = presentationShellContext(shell, `
          :root{--brand:red} input, .unrelated {width:100%}
          .shell.dark{color:white} #page{margin:0}
          @media(max-width:600px){.shell{display:block}.shop{display:none}}
          @supports(display:grid){button{min-height:44px}}
          .product{padding:20px}@font-face{font-family:X;src:url(x.woff)}
          @keyframes spin{to{transform:rotate(1turn)}}
        `);
        expect(css.source).toContain(':root{--brand:red}');
        expect(css.source).toContain('input{width:100%}');
        expect(css.source).toContain('.shell.dark{color:white}');
        expect(css.source).toContain('#page{margin:0}');
        expect(css.source).toContain('@media (max-width:600px){.shell{display:block}}');
        expect(css.source).toContain('button{min-height:44px}');
        for (const omitted of ['unrelated', '.shop', '.product', '@font-face', '@keyframes']) expect(css.source).not.toContain(omitted);
        expect(css.scope).toContain('omitted');
    });
    it('does not truncate declarations containing nested functions or quoted braces', () => {
        const [, css] = presentationShellContext(shell, ':root{--size:calc(100% - var(--gap, 4px))}label::after{content:"}"}');
        expect(css.source).toContain('calc(100% - var(--gap, 4px))');
        expect(css.source).toContain('content:"}"');
    });
});
