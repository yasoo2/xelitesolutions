import fs from 'fs';
import path from 'path';

export interface ActiveBuiltProject {
    /** The directory whose source files may be repaired. */
    projectDir: string;
    /** The directory served to the browser by the audit. */
    auditDir: string;
    source: 'project-dist' | 'project-build' | 'project-public' | 'project-root' | 'page-site' | 'page-split';
}

export function sessionKeyOf(sessionId: any): string {
    return String(sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isDirectory(dir: string): boolean {
    try { return fs.statSync(dir).isDirectory(); } catch { return false; }
}

function hasIndex(dir: string): boolean {
    return isDirectory(dir) && fs.existsSync(path.join(dir, 'index.html'));
}

function fromProjectDir(projectDir: string): ActiveBuiltProject | null {
    if (!isDirectory(projectDir)) return null;

    // Production output takes precedence: repair source in the project root,
    // but measure exactly what the user will receive.
    const candidates: Array<{ folder: string; source: ActiveBuiltProject['source'] }> = [
        { folder: 'dist', source: 'project-dist' },
        { folder: 'build', source: 'project-build' },
        { folder: 'public', source: 'project-public' },
    ];
    for (const candidate of candidates) {
        const auditDir = path.join(projectDir, candidate.folder);
        if (hasIndex(auditDir)) return { projectDir, auditDir, source: candidate.source };
    }

    // WebPageBuilderTool writes a real static project directly at its root.
    if (hasIndex(projectDir)) return { projectDir, auditDir: projectDir, source: 'project-root' };
    return null;
}

/**
 * Find the session's actual built artifact, not an assumed framework layout.
 * The order mirrors publish-source: a newer active scaffolded project wins over
 * an older page, while a newer static page wins over an older project.
 */
export function findActiveBuiltProject(sessionId: any, explicitProjectDir?: string): ActiveBuiltProject | null {
    if (explicitProjectDir) return fromProjectDir(String(explicitProjectDir).trim());

    const key = sessionKeyOf(sessionId);
    const projects = (global as any).joeProjects || {};
    const pages = (global as any).joePages || {};
    const project = projects[key];
    const page = pages[key];
    const projectBuilt = project?.dir ? fromProjectDir(String(project.dir)) : null;
    const projectTime = Number(project?.updatedAt) || 0;
    const pageTime = Number(page?.updatedAt) || 0;

    if (projectBuilt && (!page || projectTime >= pageTime)) return projectBuilt;

    const artifactDir = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
    if (page?.site?.dir) {
        const siteDir = path.join(artifactDir, String(page.site.dir));
        if (hasIndex(siteDir)) return { projectDir: siteDir, auditDir: siteDir, source: 'page-site' };
    }

    const splitDir = path.join(artifactDir, `joe-${key}`);
    if (hasIndex(splitDir)) return { projectDir: splitDir, auditDir: splitDir, source: 'page-split' };

    // A historical single-file page has no separate index/source directory. Do
    // not route it into a repair loop that cannot re-measure or write back the
    // exact file safely; the normal builder now creates the split artifact above.
    return projectBuilt;
}
