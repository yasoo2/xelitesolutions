import { execFile } from 'child_process';
import path from 'path';
import { transformSync } from 'esbuild';
import { fileAppStoreJs, fileRecordsControllerJs, fileRecordsViewJsx, fileRecordsWrapperJsx } from '../modules/tools/definitions/react-app-templates';

it.each(['default', 'list', 'table'])('preserves mutation behavior in the %s presentation', async presentation => {
    const compile = (source: string) => transformSync(source, { loader: 'jsx', format: 'cjs' }).code;
    const output = await new Promise<string>((resolve, reject) => {
        // Native Node loads jsdom's ESM dependencies; Jest's CJS loader cannot.
        const child = execFile(process.execPath, [path.join(__dirname, 'fixtures/records-mutation-dom.cjs')],
            { timeout: 150000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) reject(new Error(`${error.message}\n${stdout}\n${stderr}`));
                else resolve(stdout);
            });
        child.stdin!.end(JSON.stringify({ component: compile(fileRecordsWrapperJsx()),
            controller: compile(fileRecordsControllerJs(false)), view: compile(fileRecordsViewJsx(false)),
            store: compile(fileAppStoreJs()), presentation }));
    });
    expect(output).toContain('DOM mutation checks passed');
}, 160000);
