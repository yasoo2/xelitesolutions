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
  static async generateGraph(rootDir: string): Promise<{ nodes: Node[], links: Link[] }> {
    const nodes: Node[] = [];
    const links: Link[] = [];
    const idMap = new Map<string, string>();

    const files = await this.getFiles(rootDir);

    // Pass 1: Create Nodes
    files.forEach(file => {
      const relPath = path.relative(rootDir, file);
      const id = relPath;
      idMap.set(file, id);

      let group = 4;
      if (relPath.includes('api/') || relPath.includes('routes/')) group = 1;
      else if (relPath.includes('services/')) group = 2;
      else if (relPath.includes('components/')) group = 3;

      // Use a simple line count approximation without reading entire file if possible, or just read async
      // For simplicity in this graph generation, we'll skip accurate line count or do it in Pass 2
      
      nodes.push({
        id,
        name: path.basename(file),
        group,
        val: 1 // Default size
      });
    });

    // Pass 2: Create Links (Imports) & Update Node Sizes
    await Promise.all(files.map(async (file) => {
        try {
            const content = await fs.promises.readFile(file, 'utf-8');
            const lines = content.split('\n').length;
            const nodeId = idMap.get(file);
            const node = nodes.find(n => n.id === nodeId);
            if (node) {
                node.val = Math.min(lines / 10, 20);
            }

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
                            // Avoid self-loops and duplicates
                            if (idMap.get(cand)! !== nodeId) {
                                links.push({ source: nodeId!, target: idMap.get(cand)! });
                            }
                            break;
                        }
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {
            // Ignore read errors
        }
    }));

    return { nodes, links };
  }

  private static async getFiles(dir: string): Promise<string[]> {
    let results: string[] = [];
    try {
        const list = await fs.promises.readdir(dir);
        for (const file of list) {
            const filePath = path.join(dir, file);
            try {
                const stat = await fs.promises.stat(filePath);
                if (stat && stat.isDirectory()) {
                    if (!file.startsWith('.') && file !== 'node_modules' && file !== 'dist' && file !== 'build') {
                        const subResults = await this.getFiles(filePath);
                        results = results.concat(subResults);
                    }
                } else {
                    if (/\.(ts|tsx|js|jsx)$/.test(file)) {
                        results.push(filePath);
                    }
                }
            } catch (e) {}
        }
    } catch (e) {}
    return results;
  }
}
