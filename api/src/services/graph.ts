import fs from 'fs';
import path from 'path';

interface Node {
  id: string;
  name: string;
  group: number; // 1: API, 2: Service, 3: Component, 4: Util
  val: number;   // Size based on lines of code or connections
}

interface Link {
  source: string;
  target: string;
}

export class CodeGraphService {
  static generateGraph(rootDir: string): { nodes: Node[], links: Link[] } {
    const nodes: Node[] = [];
    const links: Link[] = [];
    const idMap = new Map<string, string>();

    const files = this.getFiles(rootDir);

    // Pass 1: Create Nodes
    files.forEach(file => {
      const relPath = path.relative(rootDir, file);
      const id = relPath;
      idMap.set(file, id);

      let group = 4;
      if (relPath.includes('api/') || relPath.includes('routes/')) group = 1;
      else if (relPath.includes('services/')) group = 2;
      else if (relPath.includes('components/')) group = 3;

      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n').length;

      nodes.push({
        id,
        name: path.basename(file),
        group,
        val: Math.min(lines / 10, 20) // Cap size
      });
    });

    // Pass 2: Create Links (Imports)
    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf-8');
      const sourceId = idMap.get(file);
      if (!sourceId) return;

      const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];
        if (importPath.startsWith('.')) {
          try {
            const resolvedPath = path.resolve(path.dirname(file), importPath);
            // Try extensions
            const candidates = [
              resolvedPath,
              resolvedPath + '.ts',
              resolvedPath + '.tsx',
              resolvedPath + '.js',
              resolvedPath + '/index.ts'
            ];
            
            for (const cand of candidates) {
              if (idMap.has(cand)) {
                links.push({ source: sourceId, target: idMap.get(cand)! });
                break;
              }
            }
          } catch (e) {}
        }
      }
    });

    return { nodes, links };
  }

  private static getFiles(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        if (!file.startsWith('.') && file !== 'node_modules' && file !== 'dist') {
          results = results.concat(this.getFiles(filePath));
        }
      } else {
        if (/\.(ts|tsx|js|jsx)$/.test(file)) {
          results.push(filePath);
        }
      }
    });
    return results;
  }
}
