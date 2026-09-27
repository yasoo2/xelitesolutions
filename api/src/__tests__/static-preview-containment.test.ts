import path from 'node:path';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
import ts from 'typescript';

// Compile the real API entry with the production build settings. Examining
// ts-jest's function alone would miss closure names introduced by bundling.
const apiRoot = path.resolve(__dirname, '../..');
let containmentSource: string;
let previewInitializer: string;

beforeAll(() => {
    const built = buildSync({
        absWorkingDir: apiRoot,
        entryPoints: ['src/api/index.ts'],
        bundle: true,
        platform: 'node',
        outfile: 'dist/index.js',
        packages: 'external',
        write: false,
    });
    const parsed = ts.createSourceFile('index.js', built.outputFiles[0].text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
        if (ts.isFunctionDeclaration(node) && node.name?.text === 'isWithinRoot') {
            containmentSource = node.getText(parsed);
        }
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
            && node.name.text === 'STATIC_PREVIEW_SERVER_SOURCE' && node.initializer) {
            previewInitializer = node.initializer.getText(parsed);
        }
        // esbuild can hoist a declaration and initialize it inside an __esm
        // wrapper when a module is also loaded dynamically.
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
            && ts.isIdentifier(node.left) && node.left.text === 'STATIC_PREVIEW_SERVER_SOURCE') {
            previewInitializer = node.right.getText(parsed);
        }
        ts.forEachChild(node, visit);
    };
    visit(parsed);
    expect(containmentSource).toBeDefined();
    expect(previewInitializer).toBeDefined();
});

const dialects = [
    { platform: 'linux', paths: path.posix, root: '/preview/dist' },
    { platform: 'win32', paths: path.win32, root: 'Q:/preview/dist' },
] as const;

describe.each(dialects)('production static preview containment on $platform', ({ platform, paths, root }) => {
    function compiledContainment(): (child: string, parent: string) => boolean {
        // Only Node built-ins are available: an esbuild closure would fail here.
        return vm.runInNewContext(`(${containmentSource})`, {
            process: { platform },
            require: (name: string) => {
                if (name !== 'path') throw new Error(`Unexpected standalone dependency: ${name}`);
                return paths;
            },
        });
    }

    it('executes the bundled canonical function without outer references and preserves the boundary and case rules', () => {
        const inside = compiledContainment();
        expect(inside(root, root)).toBe(true);
        expect(inside(paths.join(root, 'index.html'), root)).toBe(true);
        expect(inside(paths.join(root, '..', 'private.txt'), root)).toBe(false);
        expect(inside(paths.join(root + '-sibling', 'private.txt'), root)).toBe(false);
        expect(inside(paths.join(root.toUpperCase(), 'index.html'), root)).toBe(platform === 'win32');
    });

    it('uses that exact function in the bundled server, serving valid paths and rejecting traversal and siblings', () => {
        const isWithinRoot = compiledContainment();
        const source = vm.runInNewContext(previewInitializer, { isWithinRoot });
        const index = paths.join(root, 'index.html');
        const normalize = (value: string) => platform === 'win32' ? value.toLowerCase() : value;
        let handle = (_request: any, _response: any): void => { throw new Error('Preview server did not register a handler'); };
        const served: string[] = [];
        const fakeFs = {
            existsSync: (file: string) => normalize(file) === normalize(index),
            statSync: (file: string) => ({
                isDirectory: () => normalize(file) === normalize(root),
                isFile: () => normalize(file) === normalize(index),
            }),
            createReadStream: (file: string) => ({
                on() { return this; },
                pipe(response: any) { served.push(file); response.end('index content'); },
            }),
        };
        vm.runInNewContext(source, {
            process: { platform, cwd: () => root, env: { PORT: '43123' } },
            require: (name: string) => {
                if (name === 'path') return paths;
                if (name === 'fs') return fakeFs;
                if (name === 'http') return { createServer: (handler: typeof handle) => {
                    handle = handler;
                    return { listen: () => undefined };
                } };
                throw new Error(`Unexpected preview dependency: ${name}`);
            },
        });
        const request = (url: string) => {
            const response = { statusCode: 200, body: '', setHeader: () => undefined,
                end(body: string) { this.body = body; } };
            handle({ url }, response);
            return response;
        };
        expect(request('/index.html')).toMatchObject({ statusCode: 200, body: 'index content' });
        const servedBeforeEscape = served.length;
        for (const escape of ['/../private.txt', '/%2e%2e/private.txt', '/../dist-sibling/private.txt']) {
            expect(request(escape)).toMatchObject({ statusCode: 403, body: 'forbidden' });
        }
        expect(served).toHaveLength(servedBeforeEscape);
        expect(request('/../DIST/index.html').statusCode).toBe(platform === 'win32' ? 200 : 403);
    });
});
