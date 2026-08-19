import { ToolDefinition, ToolPermission } from '../types';
import { isWithinRoot, resolveToolPath } from '../utils';
import { isProviderFailure } from '../../../core/llm/intelligent-router';
import fs from 'fs';
import path from 'path';
import { prepareArtifactContent } from '../artifact-validation';

type ArtifactProfile = {
    kind: 'markdown_document' | 'structured_data' | 'source_code' | 'frontend_asset' | 'text_document';
    instructions: string;
};

/**
 * The destination is evidence too.  A plan can request an architecture document
 * and a general-purpose model can still answer with a polished landing page if
 * the prompt says "UI/UX designer" unconditionally.  Classify only from the
 * file extension — never from product names — and make the expected artifact
 * explicit in every generation request.
 */
function artifactProfileFor(filePath: string): ArtifactProfile {
    const ext = path.extname(filePath).toLowerCase();
    if (['.md', '.mdx', '.rst', '.adoc'].includes(ext)) {
        return {
            kind: 'markdown_document',
            instructions: 'This is a technical document. Return Markdown prose, headings, tables, lists, and code blocks only when they document a concrete interface or command. Do not return an HTML page, CSS, visual mock-up, or UI implementation. Ground each section in the supplied requirements and state assumptions or open decisions explicitly.',
        };
    }
    if (['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext)) {
        return {
            kind: 'structured_data',
            instructions: 'This is a structured configuration or data artifact. Return syntactically valid content in the destination format only. Do not return HTML, CSS, prose explanations, or placeholder values unless the requirements explicitly require them.',
        };
    }
    if (['.html', '.htm', '.css', '.scss', '.sass', '.jsx', '.tsx', '.vue', '.svelte'].includes(ext)) {
        return {
            kind: 'frontend_asset',
            instructions: 'This is a frontend artifact. Apply visual and responsive-design guidance only when it serves the supplied requirements; do not invent product features, framework dependencies, or placeholder content.',
        };
    }
    if (['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.cs', '.rb', '.php', '.sh', '.sql'].includes(ext)) {
        const javascriptLike = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext);
        const languageRules = javascriptLike
            ? 'The destination is JavaScript/TypeScript. For .js/.jsx/.mjs/.cjs use JavaScript syntax (CommonJS require/module.exports or ECMAScript imports); for .ts/.tsx use valid TypeScript. NEVER emit Python constructs such as from ... import, def, elif, @app.route, None, True, False, Flask, Django, or Python indentation blocks.'
            : ext === '.py'
                ? 'The destination is Python. Return valid Python only and do not emit JavaScript/TypeScript imports, require(), module.exports, or JSX.'
                : 'Return only the source language required by the destination extension; do not substitute another language.';
        return {
            kind: 'source_code',
            instructions: `This is source code. ${languageRules} Return only executable source for the destination language, with concrete interfaces and error handling required by the supplied requirements. Do not return an HTML page or prose document unless the destination language requires it.`,
        };
    }
    return {
        kind: 'text_document',
        instructions: 'Return the exact text artifact implied by the destination and supplied requirements. Do not assume a web application, visual design, framework, or deployment target.',
    };
}

function resolveArtifactAwarePath(filePath: string, workspaceId?: string, projectRoot?: string): string {
    const requestedRoot = String(projectRoot || '').trim();
    if (!requestedRoot || !path.isAbsolute(requestedRoot)) {
        return resolveToolPath(filePath, { workspaceId });
    }

    // Callers that still provide a workspace-relative path must remain compatible
    // with the historical contract. PhaseExecutor normally passes a logical path
    // relative to the runtime artifact; in that case the second resolution below
    // anchors it to the verified artifact root.
    const workspaceResolved = resolveToolPath(filePath, { workspaceId });
    const artifactRoot = path.resolve(requestedRoot);
    if (isWithinRoot(workspaceResolved, artifactRoot)) {
        return workspaceResolved;
    }
    return resolveToolPath(filePath, { workspaceId, projectRoot: artifactRoot });
}

function artifactMismatch(filePath: string, content: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    const looksLikeHtmlDocument = /<!doctype\s+html|<html\b|<\/(?:head|body|html)>/i.test(content);
    if (['.md', '.mdx', '.rst', '.adoc'].includes(ext) && looksLikeHtmlDocument) {
        return `artifact_type_mismatch: ${filePath} requires a technical document, but the model returned an HTML document`;
    }
    if (['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext) && looksLikeHtmlDocument) {
        return `artifact_type_mismatch: ${filePath} requires structured data, but the model returned an HTML document`;
    }
    return null;
}

/**
 * Validate executable source with the parser for the destination extension.
 * A model can satisfy the import/package contract while still emitting
 * TypeScript-only syntax into a `.js` file; that must be rejected before disk
 * writes, otherwise the later project test is the first place the defect shows.
 */
function sourceSyntaxMismatch(filePath: string, content: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    const loaderByExtension: Record<string, string> = {
        '.js': 'js', '.mjs': 'js', '.cjs': 'js',
        '.jsx': 'jsx', '.ts': 'ts', '.tsx': 'tsx',
    };
    const loader = loaderByExtension[ext];
    if (!loader) return null;
    try {
        const { transformSync } = require('esbuild');
        transformSync(content, { loader, target: 'esnext', logLevel: 'silent' });
        return null;
    } catch (error: any) {
        const detail = String(error?.message || error || 'syntax parse failed').split(/\r?\n/u)[0].trim();
        return `source_syntax_mismatch: ${filePath} is not valid ${loader.toUpperCase()} syntax (${detail})`;
    }
}

type RuntimeContract = {
    root: string;
    manifestPath: string;
    declaredPackages: Set<string>;
    kind: 'web' | 'native' | 'node' | 'other';
    packageNames: string[];
};

const NODE_BUILTINS = new Set([
    'assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http', 'https',
    'module', 'os', 'path', 'process', 'readline', 'stream', 'timers', 'tty',
    'url', 'util', 'worker_threads', 'zlib',
]);

function packageNameFromSpecifier(specifier: string): string {
    const value = String(specifier || '').trim();
    if (value.startsWith('@')) return value.split('/').slice(0, 2).join('/');
    return value.split('/')[0] || value;
}

function importedPackageNames(content: string): string[] {
    const found = new Set<string>();
    const patterns = [
        /\bimport\s+(?:[\s\S]*?\s+from\s+)?['\"]([^'\"]+)['\"]/g,
        /\bexport\s+(?:[\s\S]*?\s+from\s+)?['\"]([^'\"]+)['\"]/g,
        /\brequire\(\s*['\"]([^'\"]+)['\"]\s*\)/g,
        /\bimport\(\s*['\"]([^'\"]+)['\"]\s*\)/g,
    ];
    for (const pattern of patterns) {
        for (const match of content.matchAll(pattern)) {
            const specifier = String(match[1] || '').trim();
            if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')
                || specifier.startsWith('#') || specifier.startsWith('@/')
                || /^(?:node:|https?:)/iu.test(specifier)) continue;
            found.add(packageNameFromSpecifier(specifier));
        }
    }
    return [...found];
}

function runtimeContractFor(projectRoot: unknown, workspaceId?: string): RuntimeContract | null {
    // The active workspace can contain many products and is not a runtime
    // contract. Only an explicit projectRoot bound by the engineering pipeline
    // may constrain generated source. The optional workspaceId remains in the
    // signature for forward compatibility with trusted callers.
    void workspaceId;
    let root = String(projectRoot || '').trim();
    if (!root) return null;
    root = path.resolve(root);
    const manifestPath = path.join(root, 'package.json');
    if (!fs.existsSync(manifestPath)) return null;
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as any;
        const declared = new Set<string>();
        for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
            const values = manifest?.[section];
            if (values && typeof values === 'object') Object.keys(values).forEach(name => declared.add(name));
        }
        const packageNames = [...declared].sort();
        const has = (name: string) => declared.has(name);
        const web = has('react-dom') || has('vite') || has('next') || has('react-scripts') || has('webpack') || has('parcel');
        const native = has('react-native') || has('expo');
        const kind: RuntimeContract['kind'] = native ? 'native' : web ? 'web' : has('express') || has('fastify') || has('koa') ? 'node' : 'other';
        return { root, manifestPath, declaredPackages: declared, kind, packageNames };
    } catch {
        return null;
    }
}

/**
 * A workspace may contain several independently runnable products. When a
 * phase writes an absolute artifact path for a product nested below the
 * pipeline's previously bound root, the artifact's nearest package.json is
 * the only honest runtime contract for that write. Falling back to the bound
 * root preserves the historical behavior for logical paths and non-project
 * documents while preventing an API manifest from constraining a React app.
 */
function runtimeContractForTarget(
    filePath: string,
    fallbackRoot: unknown,
    workspaceId?: string,
): RuntimeContract | null {
    const trustedFallbackRoot = String(fallbackRoot || '').trim() || undefined;
    // Without an explicit runtime-bound root, a logical relative path is not
    // evidence of a runnable product. Preserve the historical no-contract
    // behavior instead of walking from the active workspace into an unrelated
    // product's manifest.
    if (!trustedFallbackRoot && !path.isAbsolute(filePath)) return null;

    let absolutePath: string;
    try {
        absolutePath = resolveArtifactAwarePath(filePath, workspaceId, trustedFallbackRoot);
    } catch {
        return runtimeContractFor(trustedFallbackRoot, workspaceId);
    }

    let directory = absolutePath;
    try {
        if (!fs.statSync(absolutePath).isDirectory()) directory = path.dirname(absolutePath);
    } catch {
        directory = path.dirname(absolutePath);
    }

    while (true) {
        const targetContract = runtimeContractFor(directory, workspaceId);
        if (targetContract) return targetContract;
        const parent = path.dirname(directory);
        if (parent === directory) break;
        directory = parent;
    }
    return runtimeContractFor(fallbackRoot, workspaceId);
}

function runtimeGuidanceFor(contract: RuntimeContract | null): string {
    if (!contract) return '';
    const stack = contract.kind === 'web'
        ? 'web React/Vite/Next'
        : contract.kind === 'native' ? 'React Native/Expo' : contract.kind;
    return `\nVERIFIED PROJECT RUNTIME CONTRACT:\n- Project root: ${contract.root}\n- Detected stack: ${stack}\n- Declared packages only: ${contract.packageNames.join(', ') || '(none)'}\n- Preserve this stack. Do not switch frameworks or import a package absent from package.json.\n- For a web React project, use browser/React DOM APIs; never emit react-native, Expo, or React Navigation imports unless they are declared in this manifest.\n`;
}

function runtimeArtifactMismatch(filePath: string, content: string, contract: RuntimeContract | null): string | null {
    if (!contract || !/\.(?:js|mjs|cjs|ts|tsx|jsx)$/iu.test(filePath) || path.basename(filePath).toLowerCase() === 'package.json') return null;
    const imports = importedPackageNames(content);
    const undeclared = imports.filter(name => !contract.declaredPackages.has(name) && !NODE_BUILTINS.has(name));
    const nativeImports = imports.filter(name => /^(?:react-native|expo|@react-navigation)(?:$|[\/])/iu.test(name));
    const webImports = imports.filter(name => /^(?:react-dom|vite|next|react-scripts)(?:$|[\/])/iu.test(name));
    const stackMismatch = (contract.kind === 'web' && nativeImports.length > 0)
        || (contract.kind === 'native' && webImports.length > 0);
    const errors: string[] = [];
    if (stackMismatch) errors.push(`imports ${[...new Set([...nativeImports, ...webImports])].join(', ')}, which conflicts with the verified ${contract.kind} project stack`);
    if (undeclared.length > 0) errors.push(`imports undeclared package(s): ${undeclared.join(', ')}`);
    return errors.length > 0
        ? `runtime_contract_mismatch: ${filePath} ${errors.join('; ')}. Update the project manifest only when the requirements explicitly require a stack change.`
        : null;
}

/**
 * Resolve relative imports against the file that contains them, not against the
 * project root. A syntactically valid model completion can still point from
 * `src/components/WeatherApp.jsx` to `./styles/app.css`, although the stylesheet
 * is actually one directory above. Vite is the first component to report that
 * mistake unless the author gate checks the filesystem before writing it.
 */
function localImportResolutionError(
    filePath: string,
    content: string,
    contract: RuntimeContract | null,
    plannedPhaseFiles: readonly string[] = [],
): string | null {
    if (!contract || !/\.(?:js|mjs|cjs|ts|tsx|jsx)$/iu.test(filePath)) return null;
    const specs = new Set<string>();
    const patterns = [
        /\bimport\s+(?:[\s\S]*?\s+from\s+)?['\"]([^'\"]+)['\"]/g,
        /\bexport\s+(?:[\s\S]*?\s+from\s+)?['\"]([^'\"]+)['\"]/g,
        /\brequire\(\s*['\"]([^'\"]+)['\"]\s*\)/g,
        /\bimport\(\s*['\"]([^'\"]+)['\"]\s*\)/g,
    ];
    for (const pattern of patterns) {
        for (const match of content.matchAll(pattern)) {
            const specifier = String(match[1] || '').trim();
            if (specifier.startsWith('.')) specs.add(specifier);
        }
    }
    if (!specs.size) return null;

    const extensions = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.css', '.scss', '.sass', '.less', '.json'];
    const planned = new Set<string>();
    for (const plannedFile of plannedPhaseFiles) {
        const candidate = String(plannedFile || '').trim();
        if (!candidate) continue;
        const absolute = path.resolve(contract.root, candidate);
        const relative = path.relative(contract.root, absolute);
        if (!relative.startsWith('..') && !path.isAbsolute(relative)) planned.add(absolute);
    }
    const resolves = (specifier: string): boolean => {
        const clean = specifier.split(/[?#]/, 1)[0];
        const candidate = path.resolve(path.dirname(path.resolve(filePath)), clean);
        const relative = path.relative(contract.root, candidate);
        if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
        const files = extensions.map(ext => candidate + ext);
        if (files.some(target => planned.has(target))) return true;
        if (files.some(target => fs.existsSync(target) && fs.statSync(target).isFile())) return true;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
            return extensions.slice(1).some(ext => {
                const target = path.join(candidate, `index${ext}`);
                return planned.has(target) || (fs.existsSync(target) && fs.statSync(target).isFile());
            });
        }
        return false;
    };
    const unresolved = [...specs].filter(specifier => !resolves(specifier));
    return unresolved.length
        ? `unresolved_local_import: ${filePath} imports ${unresolved.map(value => `\"${value}\"`).join(', ')}, but no file resolves from the importing file. Inspect the existing project layout and correct the relative path.`
        : null;
}

/**
 * Lazily resolve the LLM to avoid a circular import.
 *
 * This used to answer a load failure with
 * `async () => "Error: LLM not available in Elite Tools context"` — a stand-in
 * that returns an error message SHAPED LIKE AN ANSWER. The caller writes the
 * return value to disk, so the error text became the file's contents.
 */
const getLLM = () => {
    let mod: any;
    try {
        mod = require('../../../core/llm');
    } catch (e: any) {
        throw new Error(`LLM module unavailable: ${e?.message || e}`);
    }
    const fn = mod.callLLM || mod.default?.callLLM;
    if (typeof fn !== 'function') throw new Error('LLM module exports no callLLM function');
    return fn;
};

/**
 * AIGeneratorTool - Advanced AI-driven file generator
 * 
 * Unlike standard write_file, this tool uses the LLM to generate substantial, 
 * high-quality content based on a requirements prompt.
 */
export class AIGeneratorTool implements ToolDefinition {
    name = 'ai_write_file';
    version = '1.0.0';
    description = 'Generate and write high-quality, professional file content using AI based on a description.';
    tags = ['generation', 'ai', 'write', 'elite', 'code'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string', description: 'Destination file path relative to workspace root' },
            description: { type: 'string', description: 'Detailed description of what the file should contain' },
            aestheticMode: { type: 'string', enum: ['glass', 'neon', 'minimal', 'corporate'], description: 'Visual style direction' },
            language: { type: 'string', enum: ['ar', 'en', 'dual'], description: 'Primary language for content' },
            context: { type: 'string', description: 'Additional technical context (e.g., framework versions, project goal)' }
        },
        required: ['path', 'description']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string' },
            bytes: { type: 'number' },
            summary: { type: 'string' }
        }
    };

    permissions: ToolPermission[] = ['write'];
    sideEffects: ToolPermission[] = ['write'];
    // Engineering pipelines commonly write more than ten evidence-backed files in
    // one minute (the next phase must not be blocked merely because earlier phases
    // already consumed the bucket). Keep a real abuse guard, but size it for a
    // bounded build rather than a chat turn; the ToolService still returns an
    // explicit rate_limited result after this ceiling.
    rateLimitPerMinute = 60;
    auditFields = ['path'];
    mockSupported = false;

    async execute(input: {
        path: string;
        description: string;
        aestheticMode?: string;
        language?: string;
        context?: string
    }, context?: any) {
        const logs: string[] = [];
        // Both fields are `required` in the schema, and the schema was the only
        // thing enforcing them. Called with nothing, this tool went straight to
        // the model and spent a full generation on an empty brief before dying
        // on an undefined path — the sandboxed audit caught it burning a real
        // LLM call for a request that could never be written anywhere.
        const filePath = String(input?.path ?? '').trim();
        const description = String(input?.description ?? '').trim();
        if (!filePath || !description) {
            return {
                ok: false,
                error: 'ai_write_file needs both a path and a description of what the file should contain — no model was called.',
                logs,
            };
        }
        const contextWorkspaceId = context?.workspaceId;
        let callLLM: any;
        try { callLLM = getLLM(); }
        catch (e: any) { return { ok: false, error: String(e?.message || e), logs }; }

        const isRepair = input.context?.includes('repairTicket') || input.context?.includes('buildContext');
        const runtimeContract = runtimeContractForTarget(filePath, context?.projectRoot, contextWorkspaceId);
        const runtimeGuidance = runtimeGuidanceFor(runtimeContract);
        const artifact = artifactProfileFor(filePath);
        const frontendGuidance = artifact.kind === 'frontend_asset'
            ? `\nFRONTEND QUALITY RULES:\n- Use accessible, responsive implementation only where the requirements call for a user interface.\n- Follow the selected style direction if supplied; otherwise favour clear, maintainable UI over decorative effects.\n- Support ${input.language === 'ar' ? 'Arabic with RTL layout' : 'the requested language'} when user-facing text is required.\n`
            : '';
        const runtimePathGuidance = artifact.kind === 'source_code' && /\.(?:js|mjs|cjs|ts|tsx)$/iu.test(filePath)
            ? `\nRUNTIME PATH EVIDENCE RULES:\n- Before writing a local require/import in executable code, inspect the verified project context and existing filesystem layout supplied to this task. The specifier must resolve from the importing file to an existing file or directory entry.\n- Never assume a conventional folder such as routes, src/routes, models, or middleware. If the evidence shows src/routes, use that exact relative path; if it shows routes, use routes. Do not create a duplicate folder or placeholder module to hide an unresolved path.\n- For a server or entrypoint, trace every local runtime import one hop at a time and preserve the project\'s actual module system. If the layout evidence is missing, stop and request/perform discovery before emitting imports; do not guess.\n`
            : '';
            const systemPrompt = `You are an engineering artifact author. Generate one complete, production-ready file that satisfies the supplied, evidenced requirements.

ARTIFACT CONTRACT (${artifact.kind}):
${artifact.instructions}
${isRepair ? `\nREPAIR MODE ACTIVE:\n- Fix only the documented defect using the supplied repair evidence.\n- Preserve the existing architecture and avoid unrelated changes.\n` : ''}
${frontendGuidance}${runtimePathGuidance}${runtimeGuidance}
GENERAL RULES:
- Treat the supplied requirements as authoritative; do not invent a product, framework, build command, or visual interface.
- Do not use placeholders. Write concrete content, and mark genuinely unresolved decisions as explicit assumptions only in documentation artifacts.
- Do not include explanations outside the destination file content.
- Output only the content of the requested file. Use Markdown fences only when the requested file is itself a Markdown document.`;

        const userPrompt = `Generate the content for the file: "${filePath}"

Artifact contract:
${artifact.instructions}

Task requirements:
${input.description}

Verified project and requirements context:
${input.context || 'No additional project context was provided. Do not assume a web development environment.'}
${artifact.kind === 'frontend_asset' ? `\nVisual direction (use only if relevant):\n${input.aestheticMode || 'Use a clear, maintainable visual style consistent with the requirements.'}` : ''}
${runtimePathGuidance}${runtimeGuidance}

Primary language for user-facing content: ${input.language === 'ar' ? 'Arabic (RTL where applicable)' : 'English (LTR where applicable)'}

Return the complete file content now.`;

        try {
            const llmContext = context?.engineeringPipeline === true
                ? { ...context, purpose: 'internal', engineeringPipeline: true }
                : undefined;
            const callForArtifact = (retryKind: 'format' | 'syntax' | 'imports' | null = null) => {
                const retryInstruction = retryKind === 'syntax'
                    ? `SYNTAX RETRY REQUIRED:\nThe previous completion was rejected by the parser for the destination extension. Return the complete file again with valid ${path.extname(filePath).toLowerCase() || 'source'} syntax. Preserve the requested behavior and all imports, close every JSX tag/bracket, and emit no Markdown fences or explanatory prose.`
                    : retryKind === 'imports'
                        ? `IMPORT PATH RETRY REQUIRED:\nThe previous completion referenced a local file that does not exist from the importing file. Re-read the verified project layout in context and return the complete file again with every relative import resolving from this file. Do not invent or duplicate folders, do not change package.json, and emit no Markdown fences or explanatory prose.`
                        : `FORMAT RETRY REQUIRED:\nThe previous completion violated the destination artifact contract. Return the complete file again, with no Markdown fences or explanatory prose. For JSON, return strict parseable JSON only. Do not omit, truncate, or replace any content.`;
                return callLLM(
                    retryKind ? `${userPrompt}\n\n${retryInstruction}` : userPrompt,
                    [{ role: 'system', content: retryKind
                        ? `${systemPrompt}\n\n${retryKind === 'syntax' ? 'SYNTAX RETRY' : retryKind === 'imports' ? 'IMPORT PATH RETRY' : 'FORMAT RETRY'}: the previous response was rejected before writing. Re-emit one complete artifact matching the extension exactly; do not explain the repair.`
                        : systemPrompt }],
                    llmContext,
                );
            };

            let content = await callForArtifact();

            // Engineering phases are long-lived and already carry a run-scoped
            // recovery permit in the router. If the first mesh walk returns the
            // honest no-provider notice, spend exactly one bounded second walk
            // before stopping the phase. Ordinary user calls remain fail-fast;
            // no outage text is ever treated as file content.
            if (isProviderFailure(content) && context?.engineeringPipeline === true) {
                logs.push(`engineering provider retry requested for ${filePath}`);
                await new Promise(resolve => setTimeout(resolve, 250));
                content = await callForArtifact();
            }

            // When no provider answers, the router returns an apology STRING
            // rather than throwing. Writing it would put "تعذّر الوصول إلى محرّك
            // الذكاء" into the user's source file as its contents.
            if (isProviderFailure(content)) {
                return { ok: false, error: String(content), logs: [...logs, 'no LLM provider answered; nothing was written'] };
            }

            let prepared = prepareArtifactContent(filePath, content);
            // A provider occasionally truncates a structured artifact or leaves
            // a Markdown wrapper open. These are format defects, not evidence
            // that the engineering request is impossible. Give the same
            // provider one bounded format-only retry, while keeping the real
            // validator as the gate and never writing the rejected completion.
            const retryableFormatError = !!prepared.error
                && /incomplete Markdown fence|not valid JSON|valid JSON/i.test(prepared.error)
                && !/artifact_type_mismatch: .*Python source markers|artifact_type_mismatch: .*Node\.js source markers/i.test(prepared.error);
            if (retryableFormatError) {
                logs.push(`format retry requested for ${filePath}: ${prepared.error}`);
                content = await callForArtifact('format');
                if (isProviderFailure(content)) {
                    return { ok: false, error: String(content), logs: [...logs, 'format retry received no LLM provider answer; nothing was written'] };
                }
                prepared = prepareArtifactContent(filePath, content);
            }

            // An empty completion or a destination-level contract violation is
            // a failed generation. Writing it would replace an existing file
            // with invalid content and report success.
            if (prepared.error) {
                return { ok: false, error: prepared.error, logs: [...logs, 'generated content violated the destination artifact contract; nothing was written'] };
            }
            let finalContent = prepared.content;
            const validationErrorFor = (candidate: string): { error: string; kind: 'artifact' | 'runtime' | 'imports' | 'syntax' } | null => {
                const artifactError = artifactMismatch(filePath, candidate);
                if (artifactError) return { error: artifactError, kind: 'artifact' };
                const runtimeError = runtimeArtifactMismatch(filePath, candidate, runtimeContract);
                if (runtimeError) return { error: runtimeError, kind: 'runtime' };
                let importingPath = filePath;
                try { importingPath = resolveArtifactAwarePath(filePath, contextWorkspaceId, context?.projectRoot); } catch { /* the final write guard reports path errors */ }
                const importsError = localImportResolutionError(
                    importingPath,
                    candidate,
                    runtimeContract,
                    Array.isArray(context?.plannedPhaseFiles) ? context.plannedPhaseFiles : [],
                );
                if (importsError) return { error: importsError, kind: 'imports' };
                const syntaxError = sourceSyntaxMismatch(filePath, candidate);
                if (syntaxError) return { error: syntaxError, kind: 'syntax' };
                return null;
            };

            let validation = validationErrorFor(finalContent);
            const retrySource = async (kind: 'imports' | 'syntax', reason: string) => {
                logs.push(`${kind === 'imports' ? 'import path' : 'syntax'} retry requested for ${filePath}: ${reason}`);
                content = await callForArtifact(kind);
                if (isProviderFailure(content)) return { providerFailure: String(content) };
                prepared = prepareArtifactContent(filePath, content);
                if (prepared.error) return { artifactError: prepared.error };
                finalContent = prepared.content;
                validation = validationErrorFor(finalContent);
                return {};
            };
            if (validation?.kind === 'imports') {
                const retried = await retrySource('imports', validation.error);
                if (retried.providerFailure) {
                    return { ok: false, error: retried.providerFailure, logs: [...logs, 'import path retry received no LLM provider answer; nothing was written'] };
                }
                if (retried.artifactError) {
                    return { ok: false, error: retried.artifactError, logs: [...logs, 'import path retry violated the destination artifact contract; nothing was written'] };
                }
            }
            if (validation?.kind === 'syntax') {
                const retried = await retrySource('syntax', validation.error);
                if (retried.providerFailure) {
                    return { ok: false, error: retried.providerFailure, logs: [...logs, 'syntax retry received no LLM provider answer; nothing was written'] };
                }
                if (retried.artifactError) {
                    return { ok: false, error: retried.artifactError, logs: [...logs, 'syntax retry violated the destination artifact contract; nothing was written'] };
                }
            }
            if (validation) {
                const logMessage = validation.kind === 'runtime'
                    ? 'generated content violated the verified project runtime contract; nothing was written'
                    : validation.kind === 'imports'
                        ? 'generated content referenced a local import that does not resolve from the importing file; nothing was written'
                        : validation.kind === 'syntax'
                            ? 'generated source failed the destination-extension syntax contract after bounded retry; nothing was written'
                            : 'generated content violated the destination artifact contract; nothing was written';
                return {
                    ok: false,
                    // The bounded syntax retry has already been spent. Keep the
                    // rejected completion off disk, but let PhaseExecutor carry
                    // the exact file evidence into the existing self-fix path
                    // instead of stopping before downstream verification runs.
                    ...(validation.kind === 'syntax' ? { recoverable: true } : {}),
                    error: validation.error,
                    logs: [...logs, logMessage],
                };
            }

            // resolveToolPath keeps the write inside the workspace and throws on
            // escape. `path.isAbsolute(p) ? p : resolve(root, p)` meant any
            // absolute path the model produced was written verbatim, anywhere on
            // the machine — proven, not theorised: the same pattern in the
            // unreachable twin of this tool created /etc/joe-owned.txt in a test.
            const absPath = resolveArtifactAwarePath(filePath, contextWorkspaceId, context?.projectRoot);
            fs.mkdirSync(path.dirname(absPath), { recursive: true });
            fs.writeFileSync(absPath, finalContent, 'utf-8');

            const stats = fs.statSync(absPath);
            logs.push(`AI file generation successful: ${filePath} (${stats.size} bytes)`);

            return {
                ok: true,
                output: {
                    path: filePath,
                    bytes: stats.size,
                    summary: `Generated high-quality content for ${filePath}`
                },
                logs
            };

        } catch (e: any) {
            return {
                ok: false,
                error: `AI Generation failed: ${e.message}`,
                logs: [e.message]
            };
        }
    }
}
