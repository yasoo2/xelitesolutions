/**
 * STAGE 5 — «هذا مشروعي على GitHub، افهمه وطوّره».
 *
 * Importing a repository is only the first useful action.  This tool also makes
 * a deterministic first-pass engineering review from the checkout itself: it
 * discovers package roots, verifies whether a safe test can really be run, and
 * records only evidence-backed hygiene findings.  The review deliberately does
 * not ask an LLM to guess at the codebase, and it never installs dependencies
 * or runs an arbitrary package script merely because it is named "test".
 */
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { analyzeProject, formatAnalysis } from '../../../core/project/analyze';
import { broadcast, broadcastThinkingDetail, broadcastTerminalLine } from '../../../api/ws';
import { persistJoeProjects, writeJoeProject } from '../../../api/page-store';

export function githubUrlFrom(text: string): string | null {
    const m = String(text || '').match(/https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[\/#?\s]|$)/i)
        || String(text || '').match(/(?:^|\s)github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[\/#?\s]|$)/i);
    if (!m) return null;
    return `https://github.com/${m[1]}/${m[2].replace(/\.git$/i, '')}.git`;
}

export type RepositoryFinding = {
    severity: 'high' | 'medium' | 'low';
    code: string;
    message: string;
    evidence: string;
};

export type RepositoryVerification = {
    status: 'passed' | 'failed' | 'not_configured' | 'skipped_dependencies_missing' | 'skipped_unsafe_script' | 'timed_out' | 'unavailable';
    packagePath?: string;
    command?: string;
    exitCode?: number | null;
    message: string;
};

export type RepositoryAudit = {
    packageRoots: Array<{ path: string; name: string; scripts: string[]; packageManager: 'npm' | 'yarn' | 'pnpm'; dependenciesInstalled: boolean }>;
    keyFiles: string[];
    findings: RepositoryFinding[];
    verification: RepositoryVerification;
};

const REVIEW_SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'coverage', '.next', '.turbo', 'vendor', '__pycache__', '.venv', 'venv']);
const MAX_REVIEW_DEPTH = 4;
const MAX_PACKAGE_ROOTS = 24;

function relative(root: string, item: string): string {
    return path.relative(root, item).replace(/\\/g, '/') || '.';
}

function readJson(file: string): any | null {
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}

function discoverPackageRoots(root: string): Array<{ dir: string; relativePath: string; pkg: any }> {
    const discovered: Array<{ dir: string; relativePath: string; pkg: any }> = [];
    const visit = (dir: string, depth: number) => {
        if (discovered.length >= MAX_PACKAGE_ROOTS || depth > MAX_REVIEW_DEPTH) return;
        const packagePath = path.join(dir, 'package.json');
        if (fs.existsSync(packagePath)) {
            const pkg = readJson(packagePath);
            if (pkg) discovered.push({ dir, relativePath: relative(root, dir), pkg });
        }
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith('.') || REVIEW_SKIP_DIRS.has(entry.name)) continue;
            visit(path.join(dir, entry.name), depth + 1);
        }
    };
    visit(root, 0);
    return discovered.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function packageManagerFor(dir: string): 'npm' | 'yarn' | 'pnpm' {
    if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
    return 'npm';
}

/**
 * A package.json script is repository-controlled input.  We run only conventional
 * test runners after checking the entire test hook chain, so an import cannot
 * turn a "test" label into an unexpected install, publish, network download, or
 * destructive shell operation.
 */
export function isSafeTestScript(script: string, hooks: string[] = []): boolean {
    const text = [script, ...hooks].join('\n').trim();
    if (!text) return false;
    const blocked = /(?:\bsudo\b|\brm\s+-rf\b|\bcurl\b|\bwget\b|\binvoke-webrequest\b|\bpowershell\b|\bgit\s+push\b|\b(?:npm|yarn|pnpm)\s+publish\b|\b(?:npm|yarn|pnpm)\s+(?:install|add|ci)\b)/i;
    const conventionalRunner = /(?:^|\s)(?:jest|vitest|mocha|ava|pytest|phpunit|rspec|cargo\s+test|go\s+test|node\s+--test)\b/i;
    return !blocked.test(text) && conventionalRunner.test(script);
}

function findKeyFiles(dir: string): string[] {
    const names = ['README.md', 'README', 'LICENSE', '.gitignore', '.env.example', 'Dockerfile', 'docker-compose.yml', 'tsconfig.json'];
    return names.filter(name => fs.existsSync(path.join(dir, name)));
}

function formatRepositoryAudit(audit: RepositoryAudit, isAr: boolean): string {
    const packages = audit.packageRoots
        .slice(0, 8)
        .map(p => `${p.path === '.' ? 'الجذر' : p.path} (${p.name || 'غير مسمى'}؛ ${p.scripts.length ? p.scripts.join(', ') : 'بلا أوامر'})`)
        .join('؛ ');
    const findings = audit.findings.length
        ? audit.findings.map(f => `• [${f.severity.toUpperCase()}] ${f.message} — الدليل: ${f.evidence}`).join('\n')
        : '• لم تكشف المراجعة الحتمية عن مشكلة بنيوية مؤكدة. هذا ليس حكماً بأن الكود خالٍ من العيوب؛ بل يعني أن الفحص الأولي لم يجد دليلاً محلياً قاطعاً.';
    const verification = audit.verification;
    if (isAr) {
        return [
            '🔎 مراجعة هندسية محلية (مدعمة بالأدلة):',
            `• مكونات Node المكتشفة: ${packages || 'لا يوجد package.json ضمن نطاق الفحص'}.`,
            `• حالة الاختبار: ${verification.message}${verification.command ? ` (${verification.command})` : ''}.`,
            '• نقاط تحتاج الانتباه:',
            findings,
        ].join('\n');
    }
    const enPackages = audit.packageRoots.map(p => `${p.path} (${p.name})`).join(', ');
    const enFindings = audit.findings.length ? audit.findings.map(f => `• [${f.severity}] ${f.message} — evidence: ${f.evidence}`).join('\n') : '• No deterministic structural hygiene issue was proven by this first pass.';
    return `🔎 Local engineering review:\n• Node packages: ${enPackages || 'none found'}.\n• Test verification: ${verification.message}${verification.command ? ` (${verification.command})` : ''}.\n• Findings:\n${enFindings}`;
}

/** A bounded, dependency-free review that can be unit-tested without GitHub. */
export async function auditImportedProject(
    dir: string,
    opts: { isAr: boolean; onLine?: (line: string) => void } = { isAr: true },
): Promise<RepositoryAudit> {
    const packages = discoverPackageRoots(dir);
    const packageRoots = packages.map(({ dir: packageDir, relativePath, pkg }) => ({
        path: relativePath,
        name: String(pkg.name || path.basename(packageDir)),
        scripts: Object.keys(pkg.scripts || {}).sort(),
        packageManager: packageManagerFor(packageDir),
        dependenciesInstalled: fs.existsSync(path.join(packageDir, 'node_modules')),
    }));
    const keyFiles = findKeyFiles(dir);
    const findings: RepositoryFinding[] = [];

    if (!fs.existsSync(path.join(dir, 'README.md')) && !fs.existsSync(path.join(dir, 'README'))) {
        findings.push({ severity: 'medium', code: 'missing-readme', message: opts.isAr ? 'لا يوجد README في جذر المستودع.' : 'No README exists at the repository root.', evidence: 'README.md/README not found' });
    }
    if (!fs.existsSync(path.join(dir, '.gitignore'))) {
        findings.push({ severity: 'medium', code: 'missing-gitignore', message: opts.isAr ? 'لا يوجد ملف .gitignore في الجذر.' : 'No .gitignore exists at the repository root.', evidence: '.gitignore not found' });
    }
    if (fs.existsSync(path.join(dir, '.env'))) {
        findings.push({ severity: 'high', code: 'tracked-env-file', message: opts.isAr ? 'يوجد ملف .env داخل النسخة المستوردة؛ راجع عدم تضمين أسرار في التحكم بالإصدارات.' : 'A .env file is present in the imported checkout; review whether secrets were committed.', evidence: '.env exists (contents intentionally not read)' });
    }
    if (packages.length === 0) {
        findings.push({ severity: 'low', code: 'no-node-package', message: opts.isAr ? 'لم يُكتشف مشروع Node ضمن عمق الفحص المحدود.' : 'No Node package was discovered within the bounded scan depth.', evidence: `max depth ${MAX_REVIEW_DEPTH}` });
    }
    if (!fs.existsSync(path.join(dir, '.github', 'workflows'))) {
        findings.push({ severity: 'low', code: 'no-ci-workflow', message: opts.isAr ? 'لم يُكتشف مسار GitHub Actions في الجذر؛ تحقق من وجود تحقق مستمر خارج GitHub Actions إن كان ذلك مقصوداً.' : 'No GitHub Actions workflow directory was found; confirm continuous verification exists elsewhere if intentional.', evidence: '.github/workflows not found' });
    }

    const packagesWithTests = packages.filter(({ pkg }) => typeof pkg?.scripts?.test === 'string');
    // Monorepos often expose a root convenience script plus real test scripts in
    // subpackages. Prefer the first independently safe candidate so a wrapper
    // requiring manual review cannot conceal a conventional child test.
    const testCandidate = packagesWithTests.find(({ pkg }) => {
        const scripts = pkg.scripts || {};
        return isSafeTestScript(String(scripts.test || ''), ['pretest', 'posttest'].map(key => String(scripts[key] || '')).filter(Boolean));
    }) || packagesWithTests[0];
    let verification: RepositoryVerification;
    if (!testCandidate) {
        verification = {
            status: 'not_configured',
            message: opts.isAr ? 'لم يُشغّل اختبار: لا يوجد أمر test معلن في ملفات package.json المكتشفة.' : 'No test was run: no test script is declared in the discovered package.json files.',
        };
        findings.push({ severity: 'medium', code: 'no-test-script', message: opts.isAr ? 'لا يوجد أمر اختبار معلن في حزم Node المكتشفة.' : 'No test script is declared in the discovered Node packages.', evidence: 'package.json scripts.test absent' });
    } else {
        const scripts = testCandidate.pkg.scripts || {};
        const testScript = String(scripts.test || '');
        const hookScripts = ['pretest', 'posttest'].map(key => String(scripts[key] || '')).filter(Boolean);
        const manager = packageManagerFor(testCandidate.dir);
        const nativeNodeTest = /(?:^|\s)node\s+--test\b/i.test(testScript);
        const installed = fs.existsSync(path.join(testCandidate.dir, 'node_modules'));
        const testCommand = manager === 'pnpm' ? 'pnpm test' : manager === 'yarn' ? 'yarn test' : 'npm test';
        if (!isSafeTestScript(testScript, hookScripts)) {
            verification = {
                status: 'skipped_unsafe_script', packagePath: testCandidate.relativePath, command: testCommand,
                message: opts.isAr ? 'لم يُشغّل أمر الاختبار تلقائياً لأن نصه أو خطافاته لا يطابقان قائمة مشغلات الاختبار الآمنة.' : 'The test command was not run automatically because its script or hooks do not match the safe test-runner allow-list.',
            };
            findings.push({ severity: 'medium', code: 'test-script-needs-review', message: opts.isAr ? 'أمر الاختبار يحتاج مراجعة يدوية قبل تشغيله آلياً.' : 'The test script needs manual review before automatic execution.', evidence: `scripts.test=${testScript.slice(0, 160)}` });
        } else if (!nativeNodeTest && !installed) {
            verification = {
                status: 'skipped_dependencies_missing', packagePath: testCandidate.relativePath, command: testCommand,
                message: opts.isAr ? 'لم يُشغّل الاختبار: يعتمد على حزم غير مثبتة في النسخة المستوردة. لم تثبّت الأداة أي اعتماديات من تلقاء نفسها.' : 'The test was not run because required packages are not installed in the imported checkout. The tool did not install dependencies automatically.',
            };
            findings.push({ severity: 'low', code: 'test-dependencies-not-installed', message: opts.isAr ? 'تعذر التحقق التنفيذي قبل تثبيت الاعتماديات؛ الاستيراد نفسه لا يغير بيئة المشروع.' : 'Executable verification is pending dependency installation; import intentionally does not mutate the project environment.', evidence: `${relative(dir, testCandidate.dir)}/node_modules not found` });
        } else {
            opts.onLine?.(`verification: ${testCommand} (bounded to 120s)`);
            const { executionEngine } = require('../../../kernel/ExecutionEngine');
            const command = manager === 'pnpm' ? 'pnpm' : manager === 'yarn' ? 'yarn' : 'npm';
            const handle = executionEngine.runArgvStreaming(command, ['test'], {
                cwd: testCandidate.dir,
                timeout: 120_000,
                onLine: (line: string, stream: 'stdout' | 'stderr') => opts.onLine?.(`  [test:${stream}] ${line.slice(0, 360)}`),
            });
            const result = await handle.done;
            verification = result.ok
                ? { status: 'passed', packagePath: testCandidate.relativePath, command: testCommand, exitCode: result.exitCode, message: opts.isAr ? 'نجح الاختبار الحتمي المحدود.' : 'The bounded deterministic test passed.' }
                : result.exitCode === 124
                    ? { status: 'timed_out', packagePath: testCandidate.relativePath, command: testCommand, exitCode: result.exitCode, message: opts.isAr ? 'توقف الاختبار عند حد 120 ثانية.' : 'The test reached the 120-second limit.' }
                    : { status: 'failed', packagePath: testCandidate.relativePath, command: testCommand, exitCode: result.exitCode, message: opts.isAr ? 'فشل الاختبار؛ راجع مخرجات الطرفية الظاهرة.' : 'The test failed; review the visible terminal output.' };
            if (!result.ok) {
                findings.push({ severity: 'high', code: verification.status === 'timed_out' ? 'test-timeout' : 'test-failure', message: verification.status === 'timed_out' ? (opts.isAr ? 'تجاوز الاختبار المهلة المسموح بها.' : 'The test exceeded the permitted time limit.') : (opts.isAr ? 'فشل اختبار موجود في المشروع.' : 'A project test failed.'), evidence: `${testCommand} exit=${result.exitCode === null ? 'unavailable' : result.exitCode}` });
            }
        }
    }

    return { packageRoots, keyFiles, findings, verification };
}

export class ImportProjectTool extends BaseTool {
    name = 'import_project';
    description = 'Clone an existing GitHub repository (or open a local folder), perform a bounded evidence-backed local engineering review, and make it the session\'s active project for surgical edits.';
    version = '1.1.0';
    tags = ['import', 'github', 'project', 'analyze', 'verify'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            request: { type: 'string', description: 'The user\'s words — usually carrying the GitHub URL' },
            url: { type: 'string' },
            path: { type: 'string', description: 'A local folder to open instead of cloning' },
        },
        required: ['request'],
    };
    permissions: ToolPermission[] = ['execute', 'write', 'internet'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 6;
    auditFields = ['request', 'url'];

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        const request = String(input?.request || '').trim();
        const sessionId = context?.sessionId;
        const sessionKey = String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
        const isAr = /[؀-ۿ]/.test(request) || !request;
        try { broadcast({ type: 'build_started', sessionId, data: { tool: 'import_project', sessionId } } as any); } catch { /* UI optional */ }

        const term = (line: string) => {
            logs.push(line);
            try { broadcastTerminalLine(sessionId, line + '\r\n'); } catch { /* UI optional */ }
        };

        let dir = '';
        const localPath = String(input?.path || '').trim();
        if (localPath) {
            if (!fs.existsSync(localPath)) return { ok: false, error: `no_such_path: ${localPath}`, logs };
            dir = localPath;
            term(`import_project: opening local folder ${dir}`);
        } else {
            const url = String(input?.url || '').trim() || githubUrlFrom(request) || '';
            if (!url) {
                return {
                    ok: true,
                    output: { message: isAr ? 'أعطني رابط المستودع — مثال: «استورد https://github.com/user/repo وافهمه»' : 'Give me the repository URL, e.g. "import https://github.com/user/repo".' },
                    logs,
                } as any;
            }
            const repoName = (url.match(/\/([\w.-]+?)(?:\.git)?$/) || [, 'project'])[1];
            const { workspaceService } = require('../../services/WorkspaceService');
            const root = String(input?.root || workspaceService.getExplorerRoot());
            dir = path.join(root, repoName);
            if (fs.existsSync(dir)) dir = path.join(root, `${repoName}-${Date.now().toString(36).slice(-4)}`);
            if (sessionId) broadcastThinkingDetail(sessionId, isAr ? `أستنسخ المستودع ${url}…` : `Cloning ${url}…`);
            term(`git clone --depth 1 ${url}`);
            // Through the Single Execution Authority — a direct spawn here
            // blocked startup on the user's machine (ExecutionEnforcer).
            const { executionEngine } = require('../../../kernel/ExecutionEngine');
            const code = await (async () => {
                const h = executionEngine.runArgvStreaming('git', ['clone', '--depth', '1', url, dir], {
                    timeout: 180_000,
                    onLine: (line: string) => term(`  ${line.slice(0, 160)}`),
                });
                const result = await h.done;
                if (result.exitCode === null) return -1;
                if (result.exitCode === 124 && result.error === 'timeout') return -2;
                return result.exitCode;
            })();
            if (code !== 0) {
                return {
                    ok: false,
                    error: 'clone_failed',
                    output: { message: isAr ? `تعذر استنساخ المستودع (${code === -2 ? 'انتهت المهلة' : code === -1 ? 'git غير متاح' : 'رفض الخادم — تأكد أن المستودع عام وأن الرابط صحيح'}).` : 'Clone failed.' },
                    logs,
                } as any;
            }
            term(`clone OK → ${dir}`);
        }

        // Understand it — facts from the files, no model.
        if (sessionId) broadcastThinkingDetail(sessionId, isAr ? 'أقرأ بنية المشروع وتقنياته…' : 'Reading the project\'s structure and stack…');
        const analysis = analyzeProject(dir);
        logs.push(`analysis: ${analysis.stack.join(',') || 'unknown'} — ${analysis.totalFiles} files, ${analysis.totalLines} lines`);

        // The deterministic engineering review is intentionally after a successful
        // checkout. It adds no network call and does not install packages.
        if (sessionId) broadcastThinkingDetail(sessionId, isAr ? 'أتحقق من أوامر الاختبار ومؤشرات الجودة المحلية…' : 'Checking test commands and local quality signals…');
        const repositoryAudit = await auditImportedProject(dir, { isAr, onLine: term });
        logs.push(`review: packages=${repositoryAudit.packageRoots.length} verification=${repositoryAudit.verification.status} findings=${repositoryAudit.findings.length}`);

        // Register as the ACTIVE project: the surgical editor, run, and undo
        // now all point here.
        writeJoeProject(sessionKey, {
            dir, type: 'imported', brand: analysis.name, stack: analysis.stack,
            updatedAt: Date.now(), lastRequest: request.slice(0, 80),
        }, context?.runId);
        persistJoeProjects();

        const nextSteps = isAr
            ? '\n\nالمشروع الآن نشط في هذه الجلسة — أرسل أيّ سطر:\n   • «عدل …» → تعديل جراحي بالأسطر مع بوابة فحص نحوي\n   • «شغّل المشروع» → تشغيله ومعاينته\n   • «ثبّت الاعتماديات ثم شغّل الاختبارات» → تنفيذ واعٍ لتبعيات المشروع\n   • اسألني عن أي جزء منه'
            : '\n\nThe project is now active in this session — edit it surgically, run it, install dependencies and run tests on request, or ask about any part of it.';
        return {
            ok: true,
            output: { message: `${formatAnalysis(analysis, isAr)}\n\n${formatRepositoryAudit(repositoryAudit, isAr)}${nextSteps}`, dir, analysis, repositoryAudit },
            logs,
        } as any;
    }
}
