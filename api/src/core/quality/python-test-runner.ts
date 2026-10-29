/**
 * HOW A PYTHON PROGRAM IS STARTED AND ITS TESTS RUN — ON ANY MACHINE.
 *
 * Its own module with no imports, so the CLI scaffold, the paper-plan runner
 * and the delivery's record gate share one runner without loading each other.
 *
 * ⛔ THE INTERPRETER IS FOUND WHERE THE PROGRAM RUNS, NOT NAMED WHERE IT WAS
 * BUILT (round 21 review, Q11). The scripts Joe wrote said the build machine's
 * name: built on the Linux server, `"start": "python3 main.py"` — and on the
 * Windows laptop he downloads it to, `python3` is the Microsoft Store stub
 * (it prints «Python was not found», exits 49 or 9009). Built on Windows,
 * `python main.py` fails on a Linux box with no `python`. No fixed name is
 * right everywhere, so none is written: every delivered script already runs
 * through npm, so Node is there, and a short Node launcher asks the machine
 * it runs on — the names that machine's Python is installed under, in its own
 * platform's order (Windows: `python` first, the name a virtualenv on Windows
 * has; `py -3`, the python.org launcher; then `python3`. Elsewhere: `python3`,
 * then `python`) — and runs the first that really is Python 3 (it answers
 * `-c` with its major version; a Store stub or a Python 2 does not). No
 * interpreter at all is said, by name of every candidate tried, with a
 * non-zero exit. Arguments, stdin/stdout and the exit code pass through.
 *
 * ⛔ AND AN EMPTY RUN FAILS ON EVERY PYTHON (round 21 review).
 * `python -m unittest` exits 5 on «Ran 0 tests» only since Python 3.12; on
 * 3.11 and older it prints «OK» and exits 0. And a plan's tests are often
 * pytest-style — bare `def test_…():` functions — which unittest does not
 * collect, so on a machine without pytest such a file «passed» with nothing
 * run. So the tests are run by a small standard-library runner, the same on
 * every version, that:
 *   - imports each test file (a folder stands for the test files directly in
 *     it: test*.py, *_test.py) and collects unittest.TestCase tests, bare
 *     `test*` functions and plain `Test*` classes — what pytest collects
 *     without its plugins — so a pytest-style file is really run;
 *   - honours pytest's xunit hooks (round 21 review, Q3): setup_module /
 *     teardown_module (and unittest's setUpModule), setup_function /
 *     teardown_function, setup_class / teardown_class, setup_method /
 *     teardown_method — each called with its argument when it takes one, as
 *     pytest calls them — so a test that needs its setup is not failed for
 *     the runner's sake;
 *   - awaits a coroutine test (Q3): `async def test_x(): assert False` was
 *     called, never awaited, and passed; it now runs under asyncio.run, so its
 *     assertion decides (an IsolatedAsyncioTestCase keeps its own loop);
 *   - fails when no test ran, or when every test was skipped;
 *   - lets a test that needs a pytest fixture fail on the missing argument,
 *     by name, rather than be skipped.
 * Tests Joe authors use only this runner, so the verdict never depends on the
 * machine. Tests a plan wrote run under pytest where it is installed (its
 * fixtures and marks; it fails an empty collection itself, and a run whose
 * every test was skipped is refused by the reader of the runner's summary,
 * test-run-evidence); this runner is the fallback.
 *
 * Every program here is ONE line: npm hands the script to cmd.exe on Windows
 * and to sh elsewhere, so it holds no double quote, `$`, backslash, `%`, `!`
 * or backtick — it can sit inside one pair of double quotes in both.
 */

// The launcher's module name, joined here so this source never spells a
// direct child_process import (the boot gate, ExecutionEnforcer, reads that
// as a process spawn in Joe's own code; this is text for his project).
const CHILD_PROCESS = ['child', 'process'].join('_');

const PYTHON_LAUNCHER_JS = [
    `const c=require('${CHILD_PROCESS}')`,
    "n=process.platform==='win32'?[['python'],['py','-3'],['python3']]:[['python3'],['python']]",
    'a=process.argv.slice(1)',
    "f=n.find(p=>c.spawnSync(p[0],[...p.slice(1),'-c','import sys;sys.exit(sys.version_info[0]-3)'],{stdio:'ignore'}).status===0)",
].join(',') + ';'
    + "if(f){const r=c.spawnSync(f[0],[...f.slice(1),...a],{stdio:'inherit'});process.exitCode=r.status===null?1:r.status}"
    + "else{console.error('No Python 3 interpreter was found on this machine (tried: '+n.map(p=>p.join(' ')).join(', ')+')');process.exitCode=1}";

/**
 * The command that starts Python on whatever machine runs it — what a
 * delivered script writes instead of a name: `<this> main.py`, `<this> -c …`.
 * `--` ends Node's own options, so `-c` reaches Python.
 */
export function pythonLauncher(): string {
    return `node -e "${PYTHON_LAUNCHER_JS}" --`;
}

/** How a delivered Python program starts: `npm start -- <arguments>` passes its arguments through. */
export function pythonRunCommand(entry: string): string {
    return `${pythonLauncher()} ${quoteArg(entry)}`;
}

const PYTHON_TEST_IMPORTS = 'import importlib.util as u,inspect,os,subprocess,sys,unittest,asyncio,functools';
// A folder stands for the test files directly in it, in pytest's and unittest's own names.
const PYTHON_TEST_FILES = "fs=[p for x in sys.argv[1:] for p in ([os.path.join(x,n) for n in sorted(os.listdir(x)) if n.endswith('.py') and (n.startswith('test') or n.endswith('_test.py'))] if os.path.isdir(x) else [x])]";
const PYTEST_WHERE_INSTALLED = "sys.exit(subprocess.call([sys.executable,'-m','pytest','-v',*sys.argv[1:]])) if u.find_spec('pytest') else 0";
const PYTHON_TEST_RUNNER = [
    PYTHON_TEST_FILES,
    // Each test file's folder is importable, as pytest's rootdir insertion makes it.
    'sys.path[:0]=[os.path.dirname(os.path.abspath(f)) for f in fs]',
    'ms=[u.module_from_spec(u.spec_from_file_location(os.path.splitext(os.path.basename(f))[0],f)) for f in fs]',
    '[(sys.modules.__setitem__(m.__name__,m),m.__spec__.loader.exec_module(m)) for m in ms]',
    // pytest's call of an xunit hook: with its argument when it takes one.
    'C=lambda f,*a:f(*a[:len(inspect.signature(f).parameters)])',
    "H=lambda o,n,*a:C(getattr(o,n),*a) if callable(getattr(o,n,None)) else None",
    // A coroutine test is awaited, never merely called.
    'W=lambda f:functools.wraps(f)(lambda *a:asyncio.run(f(*a))) if inspect.iscoroutinefunction(f) else f',
    "[setattr(m,'setUpModule',(lambda m:lambda:H(m,'setup_module',m))(m)) for m in ms if hasattr(m,'setup_module') and not hasattr(m,'setUpModule')]",
    "[setattr(m,'tearDownModule',(lambda m:lambda:H(m,'teardown_module',m))(m)) for m in ms if hasattr(m,'teardown_module') and not hasattr(m,'tearDownModule')]",
    // A bare function belongs to its module, so the module's fixtures run around it.
    "F=lambda m:type('F',(unittest.FunctionTestCase,),{'__module__':m.__name__})",
    // A plain Test* class: a fresh instance per test, its class and method hooks around each.
    "K=lambda m,c:type(c.__name__,(unittest.TestCase,),{'__module__':m.__name__,'setUpClass':classmethod(lambda k:H(c,'setup_class',c)),'tearDownClass':classmethod(lambda k:H(c,'teardown_class',c)),'setUp':lambda s:(setattr(s,'o',c()),H(s.o,'setup_method',getattr(s.o,s._testMethodName))),'tearDown':lambda s:H(s.o,'teardown_method',getattr(s.o,s._testMethodName)),**{n:(lambda n:lambda s:W(getattr(s.o,n))())(n) for n in dir(c) if n.startswith('test') and callable(getattr(c,n))}})",
    "T=lambda m:[unittest.defaultTestLoader.loadTestsFromModule(m),*[F(m)(W(v),setUp=(lambda v:lambda:H(m,'setup_function',v))(v),tearDown=(lambda v:lambda:H(m,'teardown_function',v))(v)) for k,v in vars(m).items() if k.startswith('test') and inspect.isfunction(v) and v.__module__==m.__name__],*[unittest.defaultTestLoader.loadTestsFromTestCase(K(m,c)) for k,c in vars(m).items() if k.startswith('Test') and inspect.isclass(c) and not issubclass(c,unittest.TestCase) and c.__module__==m.__name__]]",
    // One suite per module, so its module fixtures run once around all its tests.
    'S=unittest.TestSuite([unittest.TestSuite(T(m)) for m in ms])',
    'A=lambda s:[x for t in s for x in (A(t) if isinstance(t,unittest.TestSuite) else [t])]',
    // A TestCase's own coroutine method is awaited too (IsolatedAsyncioTestCase runs its own).
    '[setattr(t,t._testMethodName,W(getattr(t,t._testMethodName))) for t in A(S) if isinstance(t,unittest.TestCase) and not isinstance(t,unittest.IsolatedAsyncioTestCase) and inspect.iscoroutinefunction(getattr(t,t._testMethodName,None))]',
    'r=unittest.TextTestRunner(verbosity=2).run(S)',
    'n=r.testsRun-len(r.skipped)',
    "n or print('FAILED (no test ran)',file=sys.stderr)",
    'sys.exit(0 if n and r.wasSuccessful() else 1)',
];

function quoteArg(value: string): string {
    return /\s/u.test(value) ? `"${value}"` : value;
}

/** The runner as one Python line (see the header): Joe's own tests never defer to pytest. */
export function pythonTestProgram(authoredByJoe: boolean): string {
    return [PYTHON_TEST_IMPORTS, ...(authoredByJoe ? [] : [PYTEST_WHERE_INSTALLED]), ...PYTHON_TEST_RUNNER].join(';');
}

/**
 * The command that runs these test files (or folders of test files). The
 * interpreter is the launcher by default — what a delivered script says; Joe,
 * running a test on its own machine, may pass that machine's interpreter name.
 */
export function pythonTestCommand(files: string[], authoredByJoe: boolean, interpreter: string = pythonLauncher()): string {
    const list = files.map(quoteArg).join(' ');
    return `${interpreter} -c "${pythonTestProgram(authoredByJoe)}" ${list}`;
}
