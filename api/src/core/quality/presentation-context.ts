import ts from 'typescript';

const cssTree = require('css-tree');

/** Preserve shell and global style contracts without unrelated domain styling. */
export function presentationShellContext(shell: string, stylesheet: string) {
    const source = ts.createSourceFile('App.jsx', shell, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
    const defaultComponent = source.statements.find(statement => ts.isFunctionDeclaration(statement)
        && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
    // The view needs its enclosing page, not implementations of shell-owned helpers.
    // Unrecognized export forms retain the full source rather than guessing a boundary.
    const projectedSource = defaultComponent ? ts.factory.updateSourceFile(source,
        source.statements.filter(statement => !ts.isFunctionDeclaration(statement) || statement === defaultComponent)) : source;
    const classes = new Set<string>();
    const ids = new Set<string>();
    const collect = (node: ts.Node) => {
        if (ts.isJsxAttribute(node) && (node.name.getText(source) === 'className' || node.name.getText(source) === 'id')) {
            const target = node.name.getText(source) === 'id' ? ids : classes;
            const literals = (child: ts.Node) => {
                if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) {
                    child.text.split(/\s+/).filter(Boolean).forEach(value => target.add(value));
                }
                ts.forEachChild(child, literals);
            };
            if (node.initializer) literals(node.initializer);
        }
        ts.forEachChild(node, collect);
    };
    collect(defaultComponent || source);
    const ast = cssTree.parse(stylesheet);
    cssTree.walk(ast, {
        enter(node: any, item: any, list: any) {
            // Fonts and animation definitions do not describe the layout contract.
            if (node.type === 'Atrule' && /^(?:font-face|(?:-\w+-)?keyframes)$/i.test(node.name)) {
                list?.remove(item);
                return this.skip;
            }
            if (node.type !== 'Rule') return;
            if (node.prelude?.type !== 'SelectorList') {
                list?.remove(item);
                return this.skip;
            }
            node.prelude.children = node.prelude.children.filter((selector: any) => {
                let relevant = true;
                cssTree.walk(selector, (part: any) => {
                    if (part.type === 'ClassSelector' && !classes.has(part.name)) relevant = false;
                    if (part.type === 'IdSelector' && !ids.has(part.name)) relevant = false;
                });
                return relevant;
            });
            if (node.prelude.children.isEmpty) {
                list?.remove(item);
                return this.skip;
            }
        },
    });
    return [
        { path: 'src/App.jsx', scope: defaultComponent
            ? 'actual default shell component, imports and top-level values; non-default helper function declarations and comments omitted; shell-owned helpers remain implemented in the unchanged file'
            : 'actual shell, comments removed; export boundary unrecognized, no helper declarations omitted',
            source: ts.createPrinter({ removeComments: true }).printFile(projectedSource) },
        { path: 'src/styles/app.css', scope: 'global selectors and literal shell classes/ids only; unrelated domain selectors, font faces and keyframes omitted; define scoped styles for the new view',
            source: cssTree.generate(ast) },
    ];
}
