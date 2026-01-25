import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { authenticate } from '../middleware/auth';

const router = Router();

function findWorkspaceRootFrom(startDir: string): string {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 10; i += 1) {
    const hasApi = fs.existsSync(path.join(dir, 'api'));
    const hasWeb = fs.existsSync(path.join(dir, 'web'));
    if (hasApi && hasWeb) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT
  ? path.resolve(String(process.env.WORKSPACE_ROOT))
  : findWorkspaceRootFrom(process.cwd());

async function resolvePathInsideWorkspace(inputPath: string): Promise<string | null> {
  const raw = String(inputPath || '').trim();
  if (!raw) return null;

  const workspaceReal =
    (await fs.promises.realpath(WORKSPACE_ROOT).catch(() => null)) || WORKSPACE_ROOT;

  const candidate = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(workspaceReal, raw);
  const candidateReal =
    (await fs.promises.realpath(candidate).catch(() => null)) || candidate;

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

router.get('/graph', authenticate as any, async (req: Request, res: Response) => {
  try {
    const cwdRaw = req.query.path ? String(req.query.path) : WORKSPACE_ROOT;
    const cwd = (await resolvePathInsideWorkspace(cwdRaw)) || WORKSPACE_ROOT;

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
    // We can run stat in parallel with a limit, or just trust the previous scan if we returned objects
    // But getAllFiles returns strings. Let's do a loop.
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
    // Process files in chunks to avoid opening too many at once
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
            // Resolve import to a likely file
            // This is a heuristic, real resolution is complex
            let targetFile = imp;
            if (imp.startsWith('.')) {
              targetFile = path.resolve(path.dirname(f), imp);
            }
            // Try to find matching node
            // We need to match it back to one of our nodes
            // Check strict match or with extensions
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
    const rootPathRaw = req.query.path ? String(req.query.path) : WORKSPACE_ROOT;
    const rootPath = await resolvePathInsideWorkspace(rootPathRaw);
    if (!rootPath) return res.status(400).json({ error: 'Invalid path' });

    // Default to depth 1 for lazy loading
    // But initially we might want depth 1 to show root

    try {
      await fs.promises.access(rootPath);
    } catch {
      return res.status(404).json({ error: 'Path not found' });
    }

    const files = await fs.promises.readdir(rootPath, { withFileTypes: true });

    // Sort: directories first, then files
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
        hasChildren: isDir // Hint for UI to show arrow
      });
    }

    res.json({ root: rootPath, tree });
  } catch (e) {
    res.status(500).json({ error: 'Tree generation failed' });
  }
});

// Smart Search Endpoint
import { exec } from 'child_process';
import util from 'util';
const execAsync = util.promisify(exec);

router.get('/search', authenticate as any, async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.json({ results: [] });

    // Use grep to search recursively
    // Limit 100 results, max depth 5 to prevent overload, ignore hidden
    const cmd = `grep -rnI "${query.replace(/"/g, '\\"')}" "${WORKSPACE_ROOT}" --exclude-dir={node_modules,.git,dist,build} | head -n 100`;

    const { stdout } = await execAsync(cmd).catch(() => ({ stdout: '' }));

    const results = stdout.split('\n').filter(Boolean).map(line => {
      const parts = line.split(':');
      if (parts.length < 3) return null;
      const filePath = parts[0];
      const lineNum = parts[1];
      const content = parts.slice(2).join(':');
      return {
        path: filePath,
        line: parseInt(lineNum),
        preview: content.trim()
      };
    }).filter(Boolean);

    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// File Content Endpoint (Read)
router.get('/content', authenticate as any, async (req: Request, res: Response) => {
  try {
    const filePathRaw = String(req.query.path || '');
    const filePath = await resolvePathInsideWorkspace(filePathRaw);
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
    const oldPath = await resolvePathInsideWorkspace(oldRaw);
    const newPath = await resolvePathInsideWorkspace(newRaw);

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
    const itemPath = await resolvePathInsideWorkspace(rawPath);
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
    const folderPath = await resolvePathInsideWorkspace(rawPath);
    // For new folder, resolvePath might return null if it strictly checks existence, 
    // but our implementation checks if it's INSIDE workspace.
    // However, resolvePathInsideWorkspace uses realpath on the candidate which fails if it doesn't exist.

    // We need a looser path resolver for creation
    const workspaceReal = await fs.promises.realpath(WORKSPACE_ROOT).catch(() => WORKSPACE_ROOT);
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

    // Allow creating new files: check path safety without requiring existence
    const workspaceReal = await fs.promises.realpath(WORKSPACE_ROOT).catch(() => WORKSPACE_ROOT);
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

export default router;
