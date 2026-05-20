import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { authenticate } from '../middleware/auth';
import { ExecutionGateway } from '../../kernel/ExecutionGateway';
import { workspaceService } from '../../modules/services/WorkspaceService';
import { executionFirewall } from '../../orchestration/AgentExecutionFirewall';

const router = Router();

type SpawnResult = { code: number | null; stdout: string; stderr: string };

function maskUrlCredentials(raw: string) {
  return String(raw || '').replace(/https?:\/\/[^@\s]+@/g, (m) => m.replace(/\/\/[^@]+@/, '//***@'));
}

function sanitizeRepoDirName(input: string) {
  const raw = String(input || '').trim();
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120);
  const normalized = cleaned.replace(/^\.+$/, '').replace(/^-+/, '').replace(/-+$/, '');
  return normalized || `repo-${Date.now()}`;
}

async function spawnWithTimeout(command: string, args: string[], cwd: string, timeoutMs: number, maxOutputChars = 2_000_000): Promise<SpawnResult> {
  const workDir = path.resolve(cwd || process.cwd());
  return await executionFirewall.runAsSystem(async () => {
    const result = await ExecutionGateway.execute({
      id: `project_${Date.now()}`,
      type: 'shell',
      payload: {
        command: `${command} ${args.join(' ')}`,
        options: { cwd: workDir, timeout: timeoutMs, shell: true }
      },
      priority: 'normal'
    });
    
    return {
      code: result.data?.exitCode ?? (result.success ? 0 : -1),
      stdout: result.data?.output || '',
      stderr: result.data?.error || result.error || ''
    };
  });
}

// Updated Resolver to use dynamic workspaceService.getActiveRoot()
async function resolvePathInsideWorkspace(inputPath: string, workspaceId?: string): Promise<string | null> {
  const raw = String(inputPath || '').trim();
  if (!raw) return null;

  const activeRoot = workspaceService.getActiveRoot(workspaceId);
  const workspaceReal =
    (await fs.promises.realpath(activeRoot).catch(() => null)) || activeRoot;

  // We treat the "workspace" as the root. 
  // Code should be able to access files inside it.
  const candidate = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(workspaceReal, raw);
  const candidateReal =
    (await fs.promises.realpath(candidate).catch(() => null)) || candidate;

  // Security check: Must be inside active root
  const rel = path.relative(workspaceReal, candidateReal);
  const inside = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  return inside ? candidateReal : null;
}

interface GraphNode {
  id: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
}

interface GraphLink {
  source: string;
  target: string;
}

async function getAllFiles(dirPath: string, arrayOfFiles: string[] = [], ignore: string[] = ['node_modules', '.git', 'dist', 'build', '.DS_Store']): Promise<string[]> {
  try {
    await fs.promises.access(dirPath);
  } catch {
    return arrayOfFiles;
  }

  const files = await fs.promises.readdir(dirPath);

  for (const file of files) {
    if (ignore.includes(file)) continue;

    const fullPath = path.join(dirPath, file);
    try {
      const stat = await fs.promises.stat(fullPath);
      if (stat.isDirectory()) {
        arrayOfFiles = await getAllFiles(fullPath, arrayOfFiles, ignore);
      } else {
        arrayOfFiles.push(fullPath);
      }
    } catch { }
  }

  return arrayOfFiles;
}

function getImports(content: string): string[] {
  const imports: string[] = [];

  // Static imports
  const importRegex = /import\s+.*?\s+from\s+['"](.*?)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Dynamic imports and requires
  const requireRegex = /(?:require|import)\(['"](.*?)['"]\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

type SearchResult = { path: string; line: number; preview: string };

async function searchInDir(dirPath: string, query: string, results: SearchResult[], limit: number, ignore: string[]) {
  if (results.length >= limit) return;
  let entries: fs.Dirent[] = [];
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const ent of entries) {
    if (results.length >= limit) return;
    if (ignore.includes(ent.name)) continue;
    const fullPath = path.join(dirPath, ent.name);

    if (ent.isDirectory()) {
      await searchInDir(fullPath, query, results, limit, ignore);
      continue;
    }
    if (!ent.isFile()) continue;

    let stat: fs.Stats | null = null;
    try {
      stat = await fs.promises.stat(fullPath);
    } catch {
      continue;
    }
    if (!stat || stat.size > 1_000_000) continue;

    let buf: Buffer;
    try {
      buf = await fs.promises.readFile(fullPath);
    } catch {
      continue;
    }
    if (buf.includes(0)) continue;

    const text = buf.toString('utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length && results.length < limit; i++) {
      if (lines[i].includes(query)) {
        results.push({ path: fullPath, line: i + 1, preview: lines[i].trim().slice(0, 300) });
      }
    }
  }
}

// ------------------------------------------------------------------
// WORKSPACE MANAGEMENT ROUTES
// ------------------------------------------------------------------

// Get Current Root
router.get('/root', authenticate as any, (req: Request, res: Response) => {
  const workspaceId =
    (typeof req.headers['x-workspace-id'] === 'string' && req.headers['x-workspace-id'].trim())
      ? req.headers['x-workspace-id'].trim()
      : (req.query && typeof (req.query as any).workspaceId === 'string' && String((req.query as any).workspaceId).trim())
        ? String((req.query as any).workspaceId).trim()
        : '';
  const activeRoot = workspaceService.getActiveRoot(workspaceId || undefined);
  res.json({ path: activeRoot, name: path.basename(activeRoot) });
});

// Set Active Root (Switch Workspace)
router.post('/root', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { path: newPath } = req.body;
    if (!newPath) return res.status(400).json({ error: 'Path required' });

    const workspaceId =
      (typeof req.headers['x-workspace-id'] === 'string' && req.headers['x-workspace-id'].trim())
        ? req.headers['x-workspace-id'].trim()
        : (req.body && typeof (req.body as any).workspaceId === 'string' && String((req.body as any).workspaceId).trim())
          ? String((req.body as any).workspaceId).trim()
          : '';
    
    // [FIX] إنشاء المجلد إذا لم يكن موجوداً
    if (!fs.existsSync(newPath)) {
      try {
        fs.mkdirSync(newPath, { recursive: true });
      } catch (e: any) {
        return res.status(400).json({ error: `Cannot create directory: ${e.message}` });
      }
    }
    
    const success = await workspaceService.setActiveRoot(newPath, workspaceId || undefined);
    if (!success) {
      return res.status(404).json({ error: 'Path does not exist' });
    }

    const activeRoot = workspaceService.getActiveRoot(workspaceId || undefined);
    res.json({ success: true, path: activeRoot, name: path.basename(activeRoot) });
  } catch (e) {
    res.status(500).json({ error: 'Failed to switch workspace' });
  }
});

// Reset to System Root
router.post('/reset', authenticate as any, (req: Request, res: Response) => {
  const workspaceId =
    (typeof req.headers['x-workspace-id'] === 'string' && req.headers['x-workspace-id'].trim())
      ? req.headers['x-workspace-id'].trim()
      : (req.body && typeof (req.body as any).workspaceId === 'string' && String((req.body as any).workspaceId).trim())
        ? String((req.body as any).workspaceId).trim()
        : '';
  workspaceService.resetToSystem(workspaceId || undefined);
  const activeRoot = workspaceService.getActiveRoot(workspaceId || undefined);
  res.json({ success: true, path: activeRoot, name: path.basename(activeRoot) });
});

// Clone GitHub Repo
router.post('/git/clone', authenticate as any, async (req: Request, res: Response) => {
  return res.status(400).json({ error: "DEPRECATED: Please ask Joe to clone the repository. Say 'Clone https://github.com/...' and he will handle it." });
});

// ------------------------------------------------------------------
// FILE OPERATIONS
// ------------------------------------------------------------------

router.get('/graph', authenticate as any, async (req: Request, res: Response) => {
  try {
    const workspaceId =
      (typeof req.headers['x-workspace-id'] === 'string' && req.headers['x-workspace-id'].trim())
        ? req.headers['x-workspace-id'].trim()
        : (req.query && typeof (req.query as any).workspaceId === 'string' && String((req.query as any).workspaceId).trim())
          ? String((req.query as any).workspaceId).trim()
          : '';
    const activeRoot = workspaceService.getActiveRoot(workspaceId || undefined);
    const cwdRaw = req.query.path ? String(req.query.path) : activeRoot;
    const cwd = (await resolvePathInsideWorkspace(cwdRaw, workspaceId || undefined)) || activeRoot;

    try {
      await fs.promises.access(cwd);
    } catch {
      return res.json({ nodes: [], links: [] });
    }

    const files = await getAllFiles(cwd);
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const fileIdMap = new Map<string, string>();

    // 1. Create Nodes
    for (const f of files) {
      const relPath = path.relative(cwd, f);
      if (relPath.length > 200) continue;

      const id = relPath;
      fileIdMap.set(f, id);

      let size = 0;
      try {
        const stat = await fs.promises.stat(f);
        size = stat.size;
      } catch { }

      nodes.push({
        id,
        name: path.basename(f),
        type: 'file',
        size,
        extension: path.extname(f)
      });
    }

    // 2. Create Links
    const BATCH_SIZE = 10;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (f) => {
        if (!['.ts', '.tsx', '.js', '.jsx', '.css', '.scss'].includes(path.extname(f))) return;

        try {
          const content = await fs.promises.readFile(f, 'utf-8');
          const imports = getImports(content);
          const sourceId = fileIdMap.get(f);

          if (!sourceId) return;

          imports.forEach(imp => {
            let targetFile = imp;
            if (imp.startsWith('.')) {
              targetFile = path.resolve(path.dirname(f), imp);
            }
            const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
            let foundTargetId = null;

            for (const ext of extensions) {
              const tryPath = targetFile + ext;
              if (fileIdMap.has(tryPath)) {
                foundTargetId = fileIdMap.get(tryPath);
                break;
              }
            }

            if (foundTargetId) {
              links.push({ source: sourceId, target: foundTargetId });
            }
          });
        } catch (e) { }
      }));
    }
    res.json({ nodes, links });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Graph generation failed' });
  }
});

// File Tree Endpoint (Lazy)
router.get('/tree', authenticate as any, async (req: Request, res: Response) => {
  try {
    const workspaceId =
      (typeof req.headers['x-workspace-id'] === 'string' && req.headers['x-workspace-id'].trim())
        ? req.headers['x-workspace-id'].trim()
        : (req.query && typeof (req.query as any).workspaceId === 'string' && String((req.query as any).workspaceId).trim())
          ? String((req.query as any).workspaceId).trim()
          : '';
    const activeRoot = workspaceService.getActiveRoot(workspaceId || undefined);
    const rootPathRaw = req.query.path ? String(req.query.path) : activeRoot;
    const rootPath = await resolvePathInsideWorkspace(rootPathRaw, workspaceId || undefined);
    if (!rootPath) return res.status(400).json({ error: 'Invalid path' });

    try {
      await fs.promises.access(rootPath);
    } catch {
      return res.status(404).json({ error: 'Path not found' });
    }

    const files = await fs.promises.readdir(rootPath, { withFileTypes: true });

    files.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    const tree = [];
    for (const f of files) {
      if (['node_modules', '.git', 'dist', 'build', '.DS_Store'].includes(f.name)) continue;

      const fullPath = path.join(rootPath, f.name);
      const isDir = f.isDirectory();
      tree.push({
        name: f.name,
        path: fullPath,
        type: isDir ? 'directory' : 'file',
        // children: undefined (Frontend will fetch looking at type)
        hasChildren: isDir
      });
    }

    res.json({ root: rootPath, tree });
  } catch (e) {
    res.status(500).json({ error: 'Tree generation failed' });
  }
});

// Smart Search Endpoint
router.get('/search', authenticate as any, async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.json({ results: [] });
    if (query.startsWith('-') || query.length > 200) return res.json({ results: [] });

    const workspaceId =
      (typeof req.headers['x-workspace-id'] === 'string' && req.headers['x-workspace-id'].trim())
        ? req.headers['x-workspace-id'].trim()
        : (req.query && typeof (req.query as any).workspaceId === 'string' && String((req.query as any).workspaceId).trim())
          ? String((req.query as any).workspaceId).trim()
          : '';
    const activeRoot = workspaceService.getActiveRoot(workspaceId || undefined);
    const results: SearchResult[] = [];
    await searchInDir(activeRoot, query, results, 100, ['node_modules', '.git', 'dist', 'build', '.DS_Store']);
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// File Content Endpoint (Read)
router.get('/content', authenticate as any, async (req: Request, res: Response) => {
  try {
    const workspaceId =
      (typeof req.headers['x-workspace-id'] === 'string' && req.headers['x-workspace-id'].trim())
        ? req.headers['x-workspace-id'].trim()
        : (req.query && typeof (req.query as any).workspaceId === 'string' && String((req.query as any).workspaceId).trim())
          ? String((req.query as any).workspaceId).trim()
          : '';
    const filePathRaw = String(req.query.path || '');
    const filePath = await resolvePathInsideWorkspace(filePathRaw, workspaceId || undefined);
    if (!filePath) {
      return res.status(404).json({ error: 'File not found' });
    }
    try {
      await fs.promises.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    const content = await fs.promises.readFile(filePath, 'utf-8');
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: 'Read failed' });
  }
});

// Rename File/Folder
router.post('/file/rename', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { oldPath: oldRaw, newPath: newRaw } = req.body;
    const workspaceId =
      (typeof req.headers['x-workspace-id'] === 'string' && req.headers['x-workspace-id'].trim())
        ? req.headers['x-workspace-id'].trim()
        : (req.body && typeof (req.body as any).workspaceId === 'string' && String((req.body as any).workspaceId).trim())
          ? String((req.body as any).workspaceId).trim()
          : '';
    const oldPath = await resolvePathInsideWorkspace(oldRaw, workspaceId || undefined);
    const newPath = await resolvePathInsideWorkspace(newRaw, workspaceId || undefined);

    if (!oldPath || !newPath) return res.status(400).json({ error: 'Invalid paths' });

    try {
      await fs.promises.access(oldPath);
    } catch {
      return res.status(404).json({ error: 'Source not found' });
    }

    await fs.promises.rename(oldPath, newPath);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Rename failed' });
  }
});

// Delete File/Folder
router.post('/file/delete', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { path: rawPath } = req.body;
    const workspaceId =
      (typeof req.headers['x-workspace-id'] === 'string' && req.headers['x-workspace-id'].trim())
        ? req.headers['x-workspace-id'].trim()
        : (req.body && typeof (req.body as any).workspaceId === 'string' && String((req.body as any).workspaceId).trim())
          ? String((req.body as any).workspaceId).trim()
          : '';
    const itemPath = await resolvePathInsideWorkspace(rawPath, workspaceId || undefined);
    if (!itemPath) return res.status(400).json({ error: 'Invalid path' });

    try {
      await fs.promises.access(itemPath);
    } catch {
      return res.status(404).json({ error: 'Item not found' });
    }

    const stat = await fs.promises.stat(itemPath);
    if (stat.isDirectory()) {
      await fs.promises.rm(itemPath, { recursive: true, force: true });
    } else {
      await fs.promises.unlink(itemPath);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Create Folder
router.post('/folder/create', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { path: rawPath } = req.body;
    const workspaceId =
      (typeof req.headers['x-workspace-id'] === 'string' && req.headers['x-workspace-id'].trim())
        ? req.headers['x-workspace-id'].trim()
        : (req.body && typeof (req.body as any).workspaceId === 'string' && String((req.body as any).workspaceId).trim())
          ? String((req.body as any).workspaceId).trim()
          : '';
    const activeRoot = workspaceService.getActiveRoot(workspaceId || undefined);
    const workspaceReal = await fs.promises.realpath(activeRoot).catch(() => activeRoot);
    const candidate = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(workspaceReal, rawPath);
    const rel = path.relative(workspaceReal, candidate);
    const isSafe = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));

    if (!isSafe) return res.status(400).json({ error: 'Invalid path' });

    await fs.promises.mkdir(candidate, { recursive: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Folder creation failed' });
  }
});

// File Content Endpoint (Write - Improved for creation)
router.post('/content', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { path: filePathRaw, content } = req.body;
    const workspaceId =
      (typeof req.headers['x-workspace-id'] === 'string' && req.headers['x-workspace-id'].trim())
        ? req.headers['x-workspace-id'].trim()
        : (req.body && typeof (req.body as any).workspaceId === 'string' && String((req.body as any).workspaceId).trim())
          ? String((req.body as any).workspaceId).trim()
          : '';
    const activeRoot = workspaceService.getActiveRoot(workspaceId || undefined);
    const workspaceReal = await fs.promises.realpath(activeRoot).catch(() => activeRoot);
    const filePath = path.isAbsolute(filePathRaw) ? path.resolve(filePathRaw) : path.resolve(workspaceReal, filePathRaw);
    const rel = path.relative(workspaceReal, filePath);
    const isSafe = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));

    if (!isSafe) {
      return res.status(400).json({ error: 'Path outside workspace' });
    }

    // Ensure parent dir exists
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, String(content ?? ''), 'utf-8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Write failed' });
  }
});

// [NEW] Endpoint لإعادة تحميل شجرة الملفات بعد إنشاء مشروع جديد
router.post('/refresh', authenticate as any, async (req: Request, res: Response) => {
  try {
    const { path: refreshPath } = req.body;
    const workspaceId =
      (typeof req.headers['x-workspace-id'] === 'string' && req.headers['x-workspace-id'].trim())
        ? req.headers['x-workspace-id'].trim()
        : (req.body && typeof (req.body as any).workspaceId === 'string' && String((req.body as any).workspaceId).trim())
          ? String((req.body as any).workspaceId).trim()
          : '';
    const activeRoot = workspaceService.getActiveRoot(workspaceId || undefined);
    const targetPath = refreshPath || activeRoot;
    
    // التحقق من وجود المجلد
    try {
      await fs.promises.access(targetPath);
    } catch {
      return res.status(404).json({ error: 'Path not found' });
    }
    
    // تحديث الـ workspace root إذا كان المسار مختلفاً
    if (targetPath !== activeRoot) {
      await workspaceService.setActiveRoot(targetPath, workspaceId || undefined);
    }
    
    res.json({ success: true, path: targetPath, name: path.basename(targetPath) });
  } catch (e) {
    res.status(500).json({ error: 'Refresh failed' });
  }
});

export default router;
