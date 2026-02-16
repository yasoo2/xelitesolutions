import fs from 'fs';
import path from 'path';

export class Analyst {
  static analyze(rootPath: string) {
    if (!fs.existsSync(rootPath)) {
      return { status: 'error', message: 'Path does not exist' };
    }

    const pkgPath = path.join(rootPath, 'package.json');
    const isNode = fs.existsSync(pkgPath);
    const hasDocker = fs.existsSync(path.join(rootPath, 'Dockerfile')) || fs.existsSync(path.join(rootPath, 'docker-compose.yml'));
    
    let techStack = [];
    let dependencies: Record<string, string> = {};
    
    if (isNode) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
        if (dependencies['react']) techStack.push('React');
        if (dependencies['next']) techStack.push('Next.js');
        if (dependencies['express']) techStack.push('Express');
        if (dependencies['vue']) techStack.push('Vue');
        if (dependencies['tailwindcss']) techStack.push('TailwindCSS');
        if (dependencies['typescript']) techStack.push('TypeScript');
      } catch (e) {}
    }

    // Deep structure scan
    const structure = this.scanDir(rootPath, 0, 3);

    return {
      status: 'success',
      type: isNode ? 'Node.js Project' : 'Unknown',
      techStack,
      hasDocker,
      structure,
      suggestions: this.generateSuggestions(techStack, hasDocker)
    };
  }

  private static scanDir(dir: string, depth: number, maxDepth: number): any {
    if (depth > maxDepth) return '...';
    const items = fs.readdirSync(dir, { withFileTypes: true });
    const result: any = {};
    
    for (const item of items) {
      if (item.name === 'node_modules' || item.name === '.git') continue;
      if (item.isDirectory()) {
        result[item.name] = this.scanDir(path.join(dir, item.name), depth + 1, maxDepth);
      } else {
        result[item.name] = 'file';
      }
    }
    return result;
  }

  private static generateSuggestions(stack: string[], hasDocker: boolean) {
    const suggs = [];
    if (!hasDocker) suggs.push('Consider adding Docker for containerization.');
    if (stack.includes('React') && !stack.includes('tailwindcss')) suggs.push('Consider TailwindCSS for styling.');
    if (!stack.includes('typescript')) suggs.push('Migrating to TypeScript is recommended for better maintainability.');
    return suggs;
  }
}
