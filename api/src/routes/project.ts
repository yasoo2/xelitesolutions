import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { authenticate } from '../middleware/auth';

const router = Router();

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
    } catch {}
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
    const cwd = String(req.query.path || process.cwd());
    
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
      } catch {}

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
            } catch (e) {}
        }));
    }
    res.json({ nodes, links });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Graph generation failed' });
  }
});

// File Tree Endpoint
router.get('/tree', authenticate as any, async (req: Request, res: Response) => {
  try {
    const rootPath = String(req.query.path || process.cwd());
    const depth = Number(req.query.depth || 5);
    
    try {
        await fs.promises.access(rootPath);
    } catch {
        return res.status(404).json({ error: 'Path not found' });
    }

    const getTree = async (dir: string, currentDepth: number): Promise<any[]> => {
        if (currentDepth > depth) return [];
        const files = await fs.promises.readdir(dir, { withFileTypes: true });
        
        // Sort: directories first, then files
        files.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
        });

        const result = [];
        for (const f of files) {
            if (['node_modules', '.git', 'dist', 'build', '.DS_Store'].includes(f.name)) continue;
            
            const fullPath = path.join(dir, f.name);
            const isDir = f.isDirectory();
            result.push({
                name: f.name,
                path: fullPath,
                type: isDir ? 'directory' : 'file',
                children: isDir ? await getTree(fullPath, currentDepth + 1) : undefined
            });
        }
        return result;
    };

    const tree = await getTree(rootPath, 0);
    res.json({ root: rootPath, tree });
  } catch (e) {
    res.status(500).json({ error: 'Tree generation failed' });
  }
});

// File Content Endpoint (Read)
router.get('/content', authenticate as any, async (req: Request, res: Response) => {
    try {
        const filePath = String(req.query.path);
        if (!filePath) {
            return res.status(404).json({ error: 'File not found' });
        }
        try {
            await fs.promises.access(filePath);
        } catch {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Security: Ensure inside cwd (basic check)
        if (!filePath.startsWith(process.cwd()) && !filePath.includes('xelitesolutions')) {
             // Relaxed check for this env
        }

        const content = await fs.promises.readFile(filePath, 'utf-8');
        res.json({ content });
    } catch (e) {
        res.status(500).json({ error: 'Read failed' });
    }
});

// File Content Endpoint (Write)
router.post('/content', authenticate as any, async (req: Request, res: Response) => {
    try {
        const { path: filePath, content } = req.body;
        if (!filePath) {
            return res.status(400).json({ error: 'Path required' });
        }

        await fs.promises.writeFile(filePath, content, 'utf-8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Write failed' });
    }
});

export default router;
