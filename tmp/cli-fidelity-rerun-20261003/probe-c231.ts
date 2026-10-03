/* Independent Muse probe: NVIDIA CLI scaffold fidelity currency (read-only).
 * Run from Muse tmp with ts-node; CWD-relative logs land in Muse tmp.
 * Each check prints PIN name + OBSERVED value. FAIL = defect still present.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-not-used-anywhere-else';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.MOCK_DB = 'true';
process.env.NODE_ENV = 'test';

import { deterministicPhasesFor } from 'D:/Joe/xelitesolutions/api/src/modules/tools/definitions/ProjectPipelineTool';

let fails = 0;
function check(name: string, observed: string, defectPresent: boolean) {
    // eslint-disable-next-line no-console
    console.log(`${defectPresent ? 'DEFECT-OPEN' : 'DEFECT-CLOSED'} ${name} :: ${observed}`);
    if (defectPresent) fails++;
}

const structOf = (req: string): Record<string, string> => {
    const r = deterministicPhasesFor(req);
    if (!r) throw new Error('deterministicPhasesFor returned null for: ' + req);
    return r.phases[0].tasks[0].args.structure as Record<string, string>;
};

// D1: per-language test filenames
const py = structOf('Build a Python command-line tool that reads a local JSON file and prints matching entries. No website.');
check('D1-py-testfile', Object.keys(py).join(','), !('test.py' in py));
const go = structOf('Build a Go command-line tool that reads a JSON file and filters by property=value. No website.');
check('D1-go-testfile', Object.keys(go).join(','), !Object.keys(go).some((k) => k.endsWith('_test.go')));
const rs = structOf('Build a Rust command-line tool that reads a JSON file and filters by property=value. No website.');
check('D1-rs-testfile', Object.keys(rs).join(','), !('tests/test.rs' in rs || 'tests/cli.rs' in rs));

// D2: package.json forced on non-JS ecosystems
check('D2-py-package.json', 'package.json' in py ? 'present' : 'absent', 'package.json' in py);
check('D2-go-package.json', 'package.json' in go ? 'present' : 'absent', 'package.json' in go);

// D3: go.mod is tsconfig content
const gomod = (go['go.mod'] || '') as string;
check('D3-go.mod', gomod.slice(0, 60).replace(/\n/g, '\\n'), gomod.includes('compilerOptions'));

// D4: Go entry uses strings.Cut without "strings" import
const goEntry = (go['main.go'] || '') as string;
check('D4-go-strings', `hasCut=${goEntry.includes('strings.Cut')} hasImport=${goEntry.includes('"strings"')}`,
    goEntry.includes('strings.Cut') && !goEntry.includes('"strings"'));

// D5: Go test uses exec.Command without "os/exec" import
const goTestKey = Object.keys(go).find((k) => k === 'test.go' || k.endsWith('_test.go')) || '';
const goTest = (go[goTestKey] || '') as string;
check('D5-go-exec', `file=${goTestKey} hasExec=${goTest.includes('exec.Command')} hasImport=${goTest.includes('"os/exec"')}`,
    goTest.includes('exec.Command') && !goTest.includes('"os/exec"'));

// D6: JS entry mixes require + export
const js = structOf('Build a JavaScript command-line tool that reads a JSON file and filters by property=value. Plain JS only, no website.');
check('D6-js-routed', Object.keys(js).join(','), !('index.js' in js));
const jsEntry = (js['index.js'] || '') as string;
check('D6-js-modules', `hasRequire=${jsEntry.includes("require('fs')")} hasExport=${jsEntry.includes('export { filterJson }')}`,
    jsEntry.includes("require('fs')") && jsEntry.includes('export { filterJson }'));

// D7: go-verb false positive ("go build me a CLI" -> Go language)
const gov = structOf('go build me a CLI that reads a JSON file and filters rows. No website.');
check('D7-go-verb', Object.keys(gov).join(','), 'main.go' in gov);

// D8: unknown language silently becomes TypeScript
const cob = structOf('Build a COBOL command-line tool that reads a JSON file and filters rows. No website.');
check('D8-unknown', Object.keys(cob).join(','), 'src/index.ts' in cob);

// D9: JS ignores CSV
const jscsv = structOf('Build a JavaScript command-line tool that reads a CSV file with columns a,b and outputs JSON. Plain JS only, no website.');
check('D9-js-routed', Object.keys(jscsv).join(','), !('index.js' in jscsv));
const jscsvEntry = (jscsv['index.js'] || '') as string;
const jscsvBody = jscsvEntry.split('\n').slice(1).join('\n'); // drop "// ${request}" comment line
check('D9-js-csv', `bodyMentionsCsv=${/csv/i.test(jscsvBody)} bodyLen=${jscsvBody.length}`, !/csv/i.test(jscsvBody));

// D10: sample is always JSON even for CSV requests
const pycsv = structOf('Build a Python CLI tool that reads a CSV file with columns a,b and outputs JSON. No website.');
check('D10-sample', Object.keys(pycsv).join(','), 'sample.json' in pycsv && !('sample.csv' in pycsv));

// D11: raw request interpolated into JSON description unescaped
const tricky = structOf('Build a Python command-line tool that reads JSON. Quote: "hi". No website.');
let d11 = false;
try { JSON.parse((tricky['package.json'] || '') as string); } catch { d11 = true; }
check('D11-escape', d11 ? 'package.json INVALID JSON' : 'package.json valid JSON', d11);

// eslint-disable-next-line no-console
console.log(`PROBE_DONE OPEN_DEFECTS=${fails}`);
process.exit(0);
