import { ToolDefinition } from '../types';
import https from 'https';
import { pick, languageDirective, languageName } from '../../../shared/utils/language';
import { isArabicReply } from '../../../shared/reply-language';

/**
 * Everything in the analysis report the user reads. The report used to be written
 * in hardcoded Arabic, so switching the interface language translated the buttons
 * around it and left the report itself untouched.
 */
export function githubReportLanguage(input: any, repoName = ''): string {
    const language = input?.__language ?? input?.language;
    const text = String(input?.request ?? input?.prompt ?? input?.description ?? repoName ?? '');
    if (isArabicReply({ language, text })) return 'ar';
    const explicit = String(language || '').trim().toLowerCase().split(/[-_]/)[0];
    return explicit || 'en';
}

const MSG = {
    unreachable: {
        ar: 'تعذّر الوصول إلى GitHub (api.github.com) — يبدو أن هناك انقطاعاً مؤقتاً في الشبكة أو في DNS. تحقّق من اتصالك بالإنترنت ثم أعد المحاولة.',
        en: 'Could not reach GitHub (api.github.com) — this looks like a temporary network or DNS outage. Check your connection and try again.',
        fr: "Impossible de joindre GitHub (api.github.com) — panne temporaire de réseau ou de DNS, semble-t-il. Vérifiez votre connexion puis réessayez.",
        de: 'GitHub (api.github.com) ist nicht erreichbar — offenbar eine vorübergehende Netzwerk- oder DNS-Störung. Prüfe deine Verbindung und versuche es erneut.',
        ru: 'Не удалось подключиться к GitHub (api.github.com) — похоже на временный сбой сети или DNS. Проверьте подключение и повторите попытку.',
        es: 'No se pudo conectar con GitHub (api.github.com) — parece una caída temporal de red o DNS. Comprueba tu conexión e inténtalo de nuevo.',
    },
    noRepo: {
        ar: 'لا يوجد ريبو محدّد للتحليل: مرّر repoName (مثل owner/repo) أو اربط ريبو في مساحة العمل أولاً.',
        en: 'No repository selected for analysis: pass repoName (e.g. owner/repo) or connect a repository to your workspace first.',
        fr: "Aucun dépôt sélectionné pour l'analyse : indiquez repoName (ex. owner/repo) ou connectez d'abord un dépôt à votre espace de travail.",
        de: 'Kein Repository für die Analyse ausgewählt: Gib repoName an (z. B. owner/repo) oder verbinde zuerst ein Repository mit deinem Workspace.',
        ru: 'Репозиторий для анализа не выбран: передайте repoName (например, owner/repo) или сначала подключите репозиторий к рабочему пространству.',
        es: 'No hay repositorio seleccionado para analizar: pasa repoName (p. ej. owner/repo) o conecta primero un repositorio a tu espacio de trabajo.',
    },
    title: { ar: 'تحليل المستودع', en: 'Repository analysis', fr: 'Analyse du dépôt', de: 'Repository-Analyse', ru: 'Анализ репозитория', es: 'Análisis del repositorio' },
    description: { ar: 'الوصف', en: 'Description', fr: 'Description', de: 'Beschreibung', ru: 'Описание', es: 'Descripción' },
    link: { ar: 'الرابط', en: 'Link', fr: 'Lien', de: 'Link', ru: 'Ссылка', es: 'Enlace' },
    visibility: { ar: 'الخصوصية', en: 'Visibility', fr: 'Visibilité', de: 'Sichtbarkeit', ru: 'Видимость', es: 'Visibilidad' },
    isPrivate: { ar: 'خاص', en: 'private', fr: 'privé', de: 'privat', ru: 'приватный', es: 'privado' },
    isPublic: { ar: 'عام', en: 'public', fr: 'public', de: 'öffentlich', ru: 'публичный', es: 'público' },
    defaultBranch: { ar: 'الفرع الافتراضي', en: 'Default branch', fr: 'Branche par défaut', de: 'Standard-Branch', ru: 'Ветка по умолчанию', es: 'Rama por defecto' },
    files: { ar: 'عدد الملفات', en: 'Files', fr: 'Fichiers', de: 'Dateien', ru: 'Файлов', es: 'Archivos' },
    stars: { ar: 'النجوم', en: 'Stars', fr: 'Étoiles', de: 'Sterne', ru: 'Звёзды', es: 'Estrellas' },
    forks: { ar: 'النسخ', en: 'Forks', fr: 'Forks', de: 'Forks', ru: 'Форки', es: 'Forks' },
    openIssues: { ar: 'المشاكل المفتوحة', en: 'Open issues', fr: 'Tickets ouverts', de: 'Offene Issues', ru: 'Открытые issues', es: 'Issues abiertos' },
    createdAt: { ar: 'أُنشئ', en: 'Created', fr: 'Créé', de: 'Erstellt', ru: 'Создан', es: 'Creado' },
    lastPush: { ar: 'آخر تحديث', en: 'Last push', fr: 'Dernier push', de: 'Letzter Push', ru: 'Последний push', es: 'Último push' },
    languages: { ar: 'اللغات', en: 'Languages', fr: 'Langages', de: 'Sprachen', ru: 'Языки', es: 'Lenguajes' },
    noLanguages: { ar: 'لم تُحدَّد لغات بعد', en: 'none detected yet', fr: 'aucun détecté pour le moment', de: 'noch keine erkannt', ru: 'пока не определены', es: 'ninguno detectado aún' },
    topFiles: { ar: 'أبرز الملفات', en: 'Key files', fr: 'Fichiers principaux', de: 'Wichtige Dateien', ru: 'Основные файлы', es: 'Archivos principales' },
    of: { ar: 'من', en: 'of', fr: 'sur', de: 'von', ru: 'из', es: 'de' },
    latestCommits: { ar: 'آخر الكوميتات', en: 'Latest commits', fr: 'Derniers commits', de: 'Neueste Commits', ru: 'Последние коммиты', es: 'Últimos commits' },
    unknownAuthor: { ar: 'مجهول', en: 'unknown', fr: 'inconnu', de: 'unbekannt', ru: 'неизвестно', es: 'desconocido' },
    engineeringRead: { ar: 'القراءة الهندسية', en: 'Engineering read', fr: 'Lecture technique', de: 'Technische Einschätzung', ru: 'Инженерный разбор', es: 'Lectura de ingeniería' },
    noSummary: {
        ar: '_(تعذّر توليد القراءة الهندسية من النموذج الآن — كل البيانات أعلاه حقيقية ومأخوذة مباشرة من GitHub API.)_',
        en: '_(The model could not produce the engineering read right now — every fact above is real and comes straight from the GitHub API.)_',
        fr: "_(Le modèle n'a pas pu produire la lecture technique pour l'instant — toutes les données ci-dessus sont réelles et proviennent directement de l'API GitHub.)_",
        de: '_(Das Modell konnte die technische Einschätzung gerade nicht erzeugen — alle Angaben oben sind echt und stammen direkt aus der GitHub-API.)_',
        ru: '_(Модель сейчас не смогла подготовить инженерный разбор — все данные выше настоящие и получены напрямую из GitHub API.)_',
        es: '_(El modelo no ha podido generar la lectura de ingeniería ahora mismo — todos los datos anteriores son reales y provienen directamente de la API de GitHub.)_',
    },
    analyzed: {
        ar: 'تم تحليل $repo مباشرة من GitHub API', en: '$repo analyzed directly from the GitHub API',
        fr: '$repo analysé directement via l\'API GitHub', de: '$repo direkt über die GitHub-API analysiert',
        ru: '$repo проанализирован напрямую через GitHub API', es: '$repo analizado directamente desde la API de GitHub',
    },
} as const;

/**
 * GitHubRepoManagerTool - GitHub repository management
 * Create, manage, and push code to GitHub repositories
 */
export class GitHubRepoManagerTool implements ToolDefinition {
    name = 'github_repo_manager';
    version = '1.1.0';
    description = 'Create, manage and ANALYZE GitHub repositories (analyze = real repo report: languages, file tree, README, latest commits)';
    tags = ['github', 'repository', 'git', 'analysis'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string' as const,
                enum: ['create', 'push', 'list', 'delete', 'analyze'],
                description: 'Action to perform'
            },
            repoName: {
                type: 'string' as const,
                description: 'Repository name ("owner/repo" or bare name). For analyze, omit to use the workspace\'s connected repo.'
            },
            description: {
                type: 'string' as const,
                description: 'Repository description'
            },
            private: {
                type: 'boolean' as const,
                description: 'Make repository private'
            },
            token: {
                type: 'string' as const,
                description: 'GitHub personal access token'
            }
        },
        required: ['action']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' as const },
            repoUrl: { type: 'string' as const },
            message: { type: 'string' as const }
        }
    };

    permissions = ['execute' as const];
    sideEffects = ['write' as const];
    rateLimitPerMinute = 10;
    auditFields = ['action', 'repoName'];
    mockSupported = false;

    async execute(input: any) {
        const { action, repoName, description = '', private: isPrivate = false, token } = input;
        const logs: string[] = [];

        try {
            logs.push(`GitHub action: ${action} for repo: ${repoName || 'N/A'}`);

            let githubToken = (token || process.env.GITHUB_TOKEN || '').replace(/[\s\n\r]/g, '');

            // Fallback to user secrets if token is still missing
            if (!githubToken && (input as any).userId) {
                try {
                    const { getUserSecret } = require('../../services/secrets');
                    const secretFn = await getUserSecret((input as any).userId, 'github', 'GITHUB_TOKEN');
                    if (secretFn) {
                        githubToken = secretFn.replace(/[\s\n\r]/g, '');
                        logs.push(`Using GitHub token from user secrets`);
                    }
                } catch (e) {
                    logs.push(`Failed to fetch user secret: ${(e as any).message}`);
                }
            }

            if (!githubToken && action !== 'list') {
                throw new Error('GitHub token required. Set GITHUB_TOKEN env var, provide token in input, or set GITHUB_TOKEN in User Secrets.');
            }

            switch (action) {
                case 'create':
                    return await this.createRepo(repoName, description, isPrivate, githubToken, logs);

                case 'list':
                    return await this.listRepos(githubToken, logs);

                case 'delete':
                    return await this.deleteRepo(repoName, githubToken, logs);

                case 'analyze':
                    return await this.analyzeRepo(repoName, githubToken, input, logs);

                default:
                    throw new Error(`Unknown action: ${action}`);
            }

        } catch (error: any) {
            logs.push(`Error: ${error.message}`);
            return {
                ok: false,
                // A dead network is the one failure the user can actually fix, so it
                // gets a sentence in their own language instead of a Node error code.
                error: error?.code === 'GITHUB_UNREACHABLE'
                    ? `${pick(MSG.unreachable, githubReportLanguage(input))} (${error.attempts} × — ${error.cause})`
                    : error.message,
                logs
            };
        }
    }

    private async createRepo(name: string, description: string, isPrivate: boolean, token: string, logs: string[]) {
        const data = JSON.stringify({
            name,
            description,
            private: isPrivate,
            auto_init: true
        });

        try {
            const result = await this.githubRequest('POST', '/user/repos', data, token);
            logs.push(`Repository created: ${result.html_url}`);

            return {
                ok: true,
                output: {
                    success: true,
                    repoUrl: result.html_url,
                    cloneUrl: result.clone_url,
                    message: `Repository ${name} created successfully`
                },
                logs
            };
        } catch (error: any) {
            // Smart Recovery: Repo already exists
            if (error.message && error.message.includes('name already exists')) {
                logs.push(`Smart Recovery: Repository '${name}' already exists. Fetching details...`);
                try {
                    const username = await this.getUsername(token);
                    const existingRepo = await this.githubRequest('GET', `/repos/${username}/${name}`, null, token);
                    return {
                        ok: true,
                        output: {
                            success: true,
                            repoUrl: existingRepo.html_url,
                            cloneUrl: existingRepo.clone_url,
                            message: `Repository ${name} already exists (recovered successfully)`
                        },
                        logs
                    };
                } catch (fetchError: any) {
                    throw new Error(`Failed to recover existing repo: ${fetchError.message}`);
                }
            }
            throw error;
        }
    }

    private async listRepos(token: string, logs: string[]) {
        const repos = await this.githubRequest('GET', '/user/repos?per_page=10', null, token);

        logs.push(`Found ${repos.length} repositories`);

        return {
            ok: true,
            output: {
                success: true,
                repos: repos.map((r: any) => ({
                    name: r.name,
                    url: r.html_url,
                    private: r.private
                })),
                message: `Listed ${repos.length} repositories`
            },
            logs
        };
    }

    private async deleteRepo(name: string, token: string, logs: string[]) {
        const username = await this.getUsername(token);
        await this.githubRequest('DELETE', `/repos/${username}/${name}`, null, token);

        logs.push(`Repository deleted: ${name}`);

        return {
            ok: true,
            output: {
                success: true,
                message: `Repository ${name} deleted successfully`
            },
            logs
        };
    }

    private async getUsername(token: string): Promise<string> {
        const user = await this.githubRequest('GET', '/user', null, token);
        return user.login;
    }

    /** Find the repo the user connected in the UI ("the connected repo").
     *
     *  ToolService does NOT forward the real workspace id: when a tool is called
     *  from an orchestrated run it substitutes a synthetic `session-<id>`, so a
     *  lookup by that id can never match and previously threw — and because all
     *  the lookups shared one try/catch, that first throw skipped the fallbacks
     *  entirely and the analysis died with "no repo specified" even though a repo
     *  was plainly connected. Each source is now attempted independently and
     *  logged, so a miss is diagnosable instead of silent. */
    private async resolveConnectedRepo(input: any, logs: string[]): Promise<string> {
        let svc: any;
        try {
            svc = require('../../services/WorkspaceService').workspaceService;
        } catch (e: any) {
            logs.push(`WorkspaceService unavailable: ${e.message}`);
            return '';
        }
        const userId = String(input?.__userId || input?.userId || '').trim();
        const rawWsId = String(input?.__workspaceId || input?.workspaceId || '').trim();
        // A synthetic "session-…"/"default-workspace" id is not a workspace id.
        const realWsId = /^[0-9a-fA-F]{24}$/.test(rawWsId) ? rawWsId : '';
        if (rawWsId && !realWsId) logs.push(`Ignoring synthetic workspace id "${rawWsId}"`);

        const pick = (ws: any): string => String(ws?.integrations?.github?.activeRepo || '').trim();

        if (realWsId && userId) {
            try {
                const ws = await svc.getWorkspace(realWsId, userId);
                const r = pick(ws);
                if (r) { logs.push(`Connected repo from workspace ${realWsId}: ${r}`); return r; }
            } catch (e: any) { logs.push(`getWorkspace(${realWsId}) failed: ${e.message}`); }
        }

        if (userId) {
            try {
                const all = await svc.getUserWorkspaces(userId);
                for (const w of (Array.isArray(all) ? all : [])) {
                    const r = pick(w);
                    if (r) { logs.push(`Connected repo from workspace "${w?.name || w?._id}": ${r}`); return r; }
                }
                logs.push(`No connected repo in ${Array.isArray(all) ? all.length : 0} workspace(s) of user ${userId}`);
            } catch (e: any) { logs.push(`getUserWorkspaces failed: ${e.message}`); }
        } else {
            logs.push('No userId reached the tool — cannot list workspaces.');
        }

        // Local single-user mode: the run may carry no usable user id at all, yet
        // the machine has exactly one connected repo. Scan every stored workspace.
        try {
            if (typeof svc.getAllWorkspacesForLookup === 'function') {
                const all = await svc.getAllWorkspacesForLookup();
                for (const w of (Array.isArray(all) ? all : [])) {
                    const r = pick(w);
                    if (r) { logs.push(`Connected repo found by global scan: ${r}`); return r; }
                }
                logs.push('Global workspace scan found no connected repo.');
            }
        } catch (e: any) { logs.push(`Global workspace scan failed: ${e.message}`); }

        return '';
    }

    /** REAL repository analysis straight from the GitHub API (metadata, languages,
     *  file tree, README, latest commits) + a best-effort LLM architectural summary.
     *  When no repoName is given, resolves "the connected repo" from the workspace's
     *  integrations.github.activeRepo. Raw facts are always returned even if the
     *  LLM summary fails — nothing here is fabricated. */
    private async analyzeRepo(repoName: string | undefined, token: string, input: any, logs: string[]) {
        let fullName = String(repoName || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
        if (fullName && !fullName.includes('/')) {
            fullName = `${await this.getUsername(token)}/${fullName}`;
        }
        if (!fullName) fullName = await this.resolveConnectedRepo(input, logs);
        const lang = githubReportLanguage(input, fullName);
        if (!fullName) {
            return { ok: false, error: pick(MSG.noRepo, lang), logs };
        }
        logs.push(`Analyzing ${fullName} via GitHub API`);

        const meta = await this.githubRequest('GET', `/repos/${fullName}`, null, token);
        const defaultBranch = String(meta.default_branch || 'main');

        let languages: Record<string, number> = {};
        try { languages = await this.githubRequest('GET', `/repos/${fullName}/languages`, null, token); } catch (e: any) { logs.push(`languages fetch failed: ${e.message}`); }

        let files: string[] = []; let fileCount = 0; let treeTruncated = false;
        try {
            const tree = await this.githubRequest('GET', `/repos/${fullName}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`, null, token);
            const blobs = (Array.isArray(tree?.tree) ? tree.tree : []).filter((e: any) => e.type === 'blob');
            fileCount = blobs.length;
            treeTruncated = !!tree?.truncated;
            files = blobs.slice(0, 80).map((e: any) => e.path);
        } catch (e: any) { logs.push(`tree fetch failed: ${e.message}`); }

        let readme = '';
        try {
            const r = await this.githubRequest('GET', `/repos/${fullName}/readme`, null, token);
            if (r?.content) readme = Buffer.from(String(r.content), 'base64').toString('utf-8').slice(0, 4000);
        } catch { logs.push('No README found'); }

        let commits: any[] = [];
        try {
            const cs = await this.githubRequest('GET', `/repos/${fullName}/commits?per_page=5`, null, token);
            commits = (Array.isArray(cs) ? cs : []).map((c: any) => ({
                sha: String(c.sha || '').slice(0, 7),
                message: String(c.commit?.message || '').split('\n')[0],
                author: c.commit?.author?.name,
                date: c.commit?.author?.date,
            }));
        } catch (e: any) { logs.push(`commits fetch failed: ${e.message}`); }

        const repo = {
            fullName,
            url: meta.html_url,
            description: meta.description || '',
            private: !!meta.private,
            defaultBranch,
            stars: meta.stargazers_count || 0,
            forks: meta.forks_count || 0,
            openIssues: meta.open_issues_count || 0,
            createdAt: meta.created_at,
            lastPush: meta.pushed_at,
            languages,
            fileCount: treeTruncated ? `${fileCount}+` : fileCount,
            files,
            latestCommits: commits,
            readmeExcerpt: readme ? readme.slice(0, 1500) : '',
        };

        // Best-effort architectural summary over the REAL facts above, written in
        // whichever language the user picked in the interface.
        let summary = '';
        try {
            const { routeToModel } = require('../../../core/llm/intelligent-router');
            summary = await routeToModel([
                {
                    role: 'system',
                    content: 'You are an expert software engineer. The data below is REAL, fetched directly from the GitHub API. ' +
                        'Analyse it and write a concise report: what the project is and what it is for, its stack and languages, ' +
                        'the file structure, recent activity, and observations/recommendations. Never invent anything that is not in the data. ' +
                        languageDirective(lang),
                },
                { role: 'user', content: `Repository ${fullName} (answer in ${languageName(lang)}):\n${JSON.stringify({ ...repo, readmeExcerpt: readme }, null, 1).slice(0, 9000)}` },
            ]);
        } catch (e: any) { logs.push(`LLM summary failed (raw facts still returned): ${e.message}`); }

        // Build the READABLE report the user actually sees. The facts are printed
        // from the API data itself, so a failed model call costs the commentary,
        // never the report: the analysis is never an empty "done" line.
        const langList = Object.entries(languages)
            .sort((a: any, b: any) => b[1] - a[1])
            .map(([name, bytes]) => `${name} (${Math.round(Number(bytes) / 1024)} KB)`);
        const fmtDate = (d: any) => { try { return new Date(d).toISOString().slice(0, 10); } catch { return String(d || '—'); } };
        const L = (k: keyof typeof MSG) => pick(MSG[k] as any, lang);
        const listSep = isArabicReply({ language: lang, text: '' }) ? '، ' : ', ';
        const lines: string[] = [];
        lines.push(`## ${L('title')} \`${fullName}\``);
        lines.push('');
        if (repo.description) lines.push(`**${L('description')}:** ${repo.description}`);
        lines.push(`**${L('link')}:** ${repo.url}`);
        lines.push(`**${L('visibility')}:** ${repo.private ? L('isPrivate') : L('isPublic')} · **${L('defaultBranch')}:** ${repo.defaultBranch}`);
        lines.push(`**${L('files')}:** ${repo.fileCount} · **${L('stars')}:** ${repo.stars} · **${L('forks')}:** ${repo.forks} · **${L('openIssues')}:** ${repo.openIssues}`);
        lines.push(`**${L('createdAt')}:** ${fmtDate(repo.createdAt)} · **${L('lastPush')}:** ${fmtDate(repo.lastPush)}`);
        lines.push(`**${L('languages')}:** ${langList.length ? langList.join(listSep) : L('noLanguages')}`);
        if (files.length) {
            lines.push('');
            lines.push(`**${L('topFiles')} (${Math.min(files.length, 15)} ${L('of')} ${repo.fileCount}):**`);
            lines.push(files.slice(0, 15).map(f => `- \`${f}\``).join('\n'));
        }
        if (commits.length) {
            lines.push('');
            lines.push(`**${L('latestCommits')}:**`);
            lines.push(commits.map(c => `- \`${c.sha}\` ${c.message} — ${c.author || L('unknownAuthor')} (${fmtDate(c.date)})`).join('\n'));
        }
        if (summary && summary.trim()) {
            lines.push('');
            lines.push(`### ${L('engineeringRead')}`);
            lines.push(summary.trim());
        } else {
            lines.push('');
            lines.push(L('noSummary'));
        }
        const report = lines.join('\n');

        return {
            ok: true,
            output: {
                success: true,
                repo,
                // `answer` is what the chat surfaces; the one-line `message` used to
                // win and the whole report was thrown away.
                answer: report,
                summary: report,
                message: pick(MSG.analyzed, lang).replace('$repo', fullName),
            },
            logs,
        };
    }

    /**
     * A DNS blip or a dropped socket is not a reason to fail a whole analysis.
     * `getaddrinfo ENOTFOUND api.github.com` was reaching the user verbatim even
     * though the very next call to GitHub succeeded. Retry the transient class of
     * errors with backoff, and if the network really is down say so in a sentence
     * the user can act on instead of leaking a Node error code.
     */
    private static readonly TRANSIENT_NET_CODES = new Set([
        'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH',
    ]);

    private static isTransientNetworkError(e: any): boolean {
        const code = String(e?.code || '');
        if (GitHubRepoManagerTool.TRANSIENT_NET_CODES.has(code)) return true;
        const msg = String(e?.message || '');
        return /socket hang up|network timeout|request timed out|getaddrinfo/i.test(msg);
    }

    private async githubRequest(method: string, path: string, data: string | null, token: string): Promise<any> {
        const delays = [400, 1200, 2500];
        let lastError: any;
        for (let attempt = 0; attempt <= delays.length; attempt++) {
            try {
                return await this.githubRequestOnce(method, path, data, token);
            } catch (e: any) {
                lastError = e;
                // 4xx/5xx from GitHub itself is an answer, not a connectivity problem:
                // retrying a 404 or a bad token only wastes the user's time.
                if (!GitHubRepoManagerTool.isTransientNetworkError(e)) throw e;
                if (attempt === delays.length) break;
                await new Promise(r => setTimeout(r, delays[attempt]));
            }
        }
        const unreachable: any = new Error(`GitHub unreachable after ${delays.length + 1} attempts: ${String(lastError?.code || lastError?.message || lastError)}`);
        unreachable.code = 'GITHUB_UNREACHABLE';
        unreachable.attempts = delays.length + 1;
        unreachable.cause = String(lastError?.code || lastError?.message || lastError);
        throw unreachable;
    }

    private githubRequestOnce(method: string, path: string, data: string | null, token: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const options: any = {
                hostname: 'api.github.com',
                path: path,
                method: method,
                headers: {
                    'User-Agent': 'Joe-AI-Agent',
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                }
            };

            if (data) {
                options.headers['Content-Length'] = Buffer.byteLength(data);
            }

            const req = https.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => responseData += chunk);
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(responseData ? JSON.parse(responseData) : {});
                        } catch (e) {
                            resolve({});
                        }
                    } else {
                        reject(new Error(`GitHub API error: ${res.statusCode} - ${responseData}`));
                    }
                });
            });

            req.on('error', reject);
            // Without a timeout a half-open socket keeps the whole run hanging.
            req.setTimeout(20000, () => {
                const err: any = new Error('GitHub request timed out after 20s');
                err.code = 'ETIMEDOUT';
                req.destroy(err);
            });
            if (data) req.write(data);
            req.end();
        });
    }
}
