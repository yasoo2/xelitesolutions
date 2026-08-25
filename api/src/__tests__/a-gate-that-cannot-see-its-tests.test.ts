import path from 'path';
import ts from 'typescript';
import { minimatch } from 'minimatch';

const API_ROOT = path.resolve(__dirname, '..', '..');
const TSCONFIG_PATH = path.join(API_ROOT, 'tsconfig.json');

function readParsedTsConfig() {
    const read = ts.readConfigFile(TSCONFIG_PATH, ts.sys.readFile);
    if (read.error) {
        throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
    }
    return {
        raw: read.config as { exclude?: unknown },
        parsed: ts.parseJsonConfigFileContent(
            read.config,
            ts.sys,
            API_ROOT,
            undefined,
            TSCONFIG_PATH,
        ),
    };
}

function matchingTestExcludePatterns(exclude: unknown): string[] {
    if (!Array.isArray(exclude)) return [];
    return exclude.filter((pattern): pattern is string => {
        if (typeof pattern !== 'string') return false;
        return minimatch('src/__tests__/probe.test.ts', pattern, { dot: true })
            || minimatch('src/tests/probe.test.ts', pattern, { dot: true })
            || minimatch('src/probe.test.ts', pattern, { dot: true });
    });
}

describe('the TypeScript gate cannot certify tests it never reads', () => {
    it('rejects any exclude pattern that matches a .test.ts path', () => {
        const { raw } = readParsedTsConfig();
        const matchingPatterns = matchingTestExcludePatterns(raw.exclude);
        if (matchingPatterns.length > 0) {
            throw new Error(`EXCLUDE_TEST_PATTERNS=${JSON.stringify(matchingPatterns)}`);
        }
    });

    it('requires at least 200 test files in the effective TypeScript program', () => {
        const { parsed } = readParsedTsConfig();
        const testFileCount = parsed.fileNames.filter(fileName => fileName.endsWith('.test.ts')).length;
        console.log(`EFFECTIVE_TEST_FILES=${testFileCount}`);
        if (testFileCount < 200) {
            throw new Error(`EFFECTIVE_TEST_FILES=${testFileCount} < 200`);
        }
    });
});
