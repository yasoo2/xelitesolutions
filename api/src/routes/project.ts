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
        
        if (!sourceId) return;

        imports.forEach(imp => {
          // Resolve import path relative to current file
          if (imp.startsWith('.')) {
            try {
                const absoluteImportPath = path.resolve(path.dirname(f), imp);
                // Try to find exact match or with extensions
                const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
                let foundTarget = null;
                
                for (const ext of extensions) {
                    const testPath = absoluteImportPath + ext;
                    if (fileIdMap.has(testPath)) {
                        foundTarget = fileIdMap.get(testPath);
                        break;
                    }
                }

                if (foundTarget) {
                    links.push({ source: sourceId, target: foundTarget });
                }
            } catch (err) {}
          }
        });
      } catch (err) {
        // Ignore read errors
      }
    });

    res.json({ nodes, links });
  } catch (error) {
    console.error('Graph error:', error);
    res.status(500).json({ error: 'Failed to generate graph' });
  }
});

export default router;
