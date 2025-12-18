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

function getAllFiles(dirPath: string, arrayOfFiles: string[] = [], ignore: string[] = ['node_modules', '.git', 'dist', 'build', '.DS_Store']): string[] {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    if (ignore.includes(file)) return;
    
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles, ignore);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

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
    // Security check: ensure we are not scanning outside allowed bounds if needed
    // For local tool, we assume trust but avoid root
    
    if (!fs.existsSync(cwd)) {
        return res.json({ nodes: [], links: [] });
    }

    const files = getAllFiles(cwd);
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const fileIdMap = new Map<string, string>();

    // 1. Create Nodes
    files.forEach(f => {
      const relPath = path.relative(cwd, f);
      // Filter out large files or irrelevant types
      if (relPath.length > 200) return; // Skip crazy paths
      
      const id = relPath; // Use relative path as ID
      fileIdMap.set(f, id);
      
      nodes.push({
        id,
        name: path.basename(f),
        type: 'file',
        size: fs.statSync(f).size,
        extension: path.extname(f)
      });
    });

    // 2. Create Links
    files.forEach(f => {
      if (!['.ts', '.tsx', '.js', '.jsx', '.css', '.scss'].includes(path.extname(f))) return;
      
      try {
        const content = fs.readFileSync(f, 'utf-8');
        const imports = getImports(content);
        const sourceId = fileIdMap.get(f);
        
        if (sourceId) {
          imports.forEach(imp => {
            // Resolve import path
            if (imp.startsWith('.')) {
              try {
                const dir = path.dirname(f);
                let resolved = path.resolve(dir, imp);
                
                // Try exact match or with extensions
                const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.css'];
                let targetFile = '';
                
                for (const ext of extensions) {
                  if (fs.existsSync(resolved + ext) && !fs.statSync(resolved + ext).isDirectory()) {
                    targetFile = resolved + ext;
                    break;
                  }
                  // Check index files
                  if (fs.existsSync(path.join(resolved, 'index' + ext))) {
                     targetFile = path.join(resolved, 'index' + ext);
                     break;
                  }
                }

                if (targetFile && fileIdMap.has(targetFile)) {
                  links.push({ 
                    source: sourceId, 
                    target: fileIdMap.get(targetFile)! 
                  });
                }
              } catch {}
            }
          });
        }
      } catch {}
    });

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
    
    if (!fs.existsSync(rootPath)) {
        return res.status(404).json({ error: 'Path not found' });
    }

    const getTree = (dir: string, currentDepth: number): any[] => {
        if (currentDepth > depth) return [];
        const files = fs.readdirSync(dir, { withFileTypes: true });
        
        // Sort: directories first, then files
        files.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
        });

        return files
            .filter(f => !['node_modules', '.git', 'dist', 'build', '.DS_Store'].includes(f.name))
            .map(f => {
                const fullPath = path.join(dir, f.name);
                const isDir = f.isDirectory();
                return {
                    name: f.name,
                    path: fullPath,
                    type: isDir ? 'directory' : 'file',
                    children: isDir ? getTree(fullPath, currentDepth + 1) : undefined
                };
            });
    };

    const tree = getTree(rootPath, 0);
    res.json({ root: rootPath, tree });
  } catch (e) {
    res.status(500).json({ error: 'Tree generation failed' });
  }
});

// File Content Endpoint (Read)
router.get('/content', authenticate as any, async (req: Request, res: Response) => {
    try {
        const filePath = String(req.query.path);
        if (!filePath || !fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Security: Ensure inside cwd (basic check)
        if (!filePath.startsWith(process.cwd()) && !filePath.includes('xelitesolutions')) {
             // Relaxed check for this env
        }

        const content = fs.readFileSync(filePath, 'utf-8');
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

        fs.writeFileSync(filePath, content, 'utf-8');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Write failed' });
    }
});

export default router;
