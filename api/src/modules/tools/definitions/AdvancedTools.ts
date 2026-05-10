import { BaseTool } from './base';
import { ToolPermission } from './types';
import fs from 'fs';
import path from 'path';

/**
 * Pattern Recognition Tool - أداة التعرف على الأنماط
 */
export class PatternRecognitionTool extends BaseTool {
  name = 'pattern_recognize';
  description = 'Analyze code patterns and suggest improvements using static analysis';
  version = '2.0.0';
  tags = ['analysis', 'pattern', 'code-quality'];
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      code: { type: 'string' },
      filePath: { type: 'string' },
      language: { type: 'string', enum: ['typescript', 'javascript', 'python', 'java', 'go'] }
    },
    required: ['code', 'language']
  };

  permissions: ToolPermission[] = ['read'];

  private patterns = {
    typescript: [
      { name: 'Singleton', regex: /private\s+static\s+instance|getInstance\(\)/, description: 'Singleton pattern detected' },
      { name: 'Factory', regex: /create[A-Z]\w+\s*\(|factory|Factory/, description: 'Factory pattern detected' },
      { name: 'Observer', regex: /subscribe|unsubscribe|emit|on\s*\(/, description: 'Observer pattern detected' },
      { name: 'Strategy', regex: /strategy|Strategy|execute\s*\(.*strategy/, description: 'Strategy pattern detected' },
      { name: 'Decorator', regex: /@\w+|decorator|Decorator/, description: 'Decorator pattern detected' }
    ],
    javascript: [
      { name: 'Module Pattern', regex: /module\.exports|exports\.|require\s*\(/, description: 'Module pattern detected' },
      { name: 'Closure', regex: /function\s*\([^)]*\)\s*{[^}]*return\s+function/, description: 'Closure pattern detected' },
      { name: 'Promise Chain', regex: /\.then\s*\([^)]*\)\s*\.then|\.catch\s*\(/, description: 'Promise chaining detected' }
    ]
  };

  async execute(input: any) {
    const { code, language, filePath } = input;
    const detectedPatterns: Array<{ name: string; confidence: number; line: number }> = [];
    const suggestions: string[] = [];
    const antiPatterns: Array<{ name: string; severity: 'high' | 'medium' | 'low'; suggestion: string }> = [];

    const lines = code.split('\n');
    const languagePatterns = this.patterns[language as keyof typeof this.patterns] || [];

    // Detect patterns
    lines.forEach((line, index) => {
      languagePatterns.forEach(pattern => {
        if (pattern.regex.test(line)) {
          detectedPatterns.push({
            name: pattern.name,
            confidence: 0.85,
            line: index + 1
          });
        }
      });
    });

    // Detect anti-patterns
    this.detectAntiPatterns(code, language, antiPatterns);

    // Generate suggestions
    this.generateSuggestions(code, language, suggestions, detectedPatterns);

    return {
      ok: true,
      output: {
        patterns: detectedPatterns,
        antiPatterns,
        suggestions,
        complexity: this.calculateComplexity(code),
        maintainability: this.calculateMaintainability(code),
        metrics: {
          linesOfCode: lines.length,
          functions: (code.match(/function|=>/g) || []).length,
          classes: (code.match(/class\s+\w+/g) || []).length
        }
      }
    };
  }

  private detectAntiPatterns(code: string, language: string, antiPatterns: any[]) {
    // God Object
    if ((code.match(/class\s+\w+/g) || []).length === 1 && code.length > 5000) {
      antiPatterns.push({
        name: 'God Object',
        severity: 'high',
        suggestion: 'Consider breaking down the class into smaller, focused classes'
      });
    }

    // Deep Nesting
    const maxNesting = this.calculateMaxNesting(code);
    if (maxNesting > 4) {
      antiPatterns.push({
        name: 'Deep Nesting',
        severity: 'medium',
        suggestion: 'Refactor to reduce nesting depth, consider early returns'
      });
    }

    // Magic Numbers
    const magicNumbers = (code.match(/[^\w](\d{3,})[^\w]/g) || []);
    if (magicNumbers.length > 5) {
      antiPatterns.push({
        name: 'Magic Numbers',
        severity: 'low',
        suggestion: 'Replace magic numbers with named constants'
      });
    }

    // Long Functions
    const longFunctions = this.detectLongFunctions(code);
    if (longFunctions.length > 0) {
      antiPatterns.push({
        name: 'Long Functions',
        severity: 'medium',
        suggestion: `Break down ${longFunctions.length} long functions into smaller ones`
      });
    }
  }

  private calculateMaxNesting(code: string): number {
    let maxNesting = 0;
    let currentNesting = 0;
    
    for (const char of code) {
      if (char === '{') {
        currentNesting++;
        maxNesting = Math.max(maxNesting, currentNesting);
      } else if (char === '}') {
        currentNesting--;
      }
    }
    
    return maxNesting;
  }

  private detectLongFunctions(code: string): Array<{ name: string; lines: number }> {
    const longFunctions: Array<{ name: string; lines: number }> = [];
    const functionMatches = code.matchAll(/(?:function|const|let|var)\s+(\w+)\s*[=(].*{/g);
    
    for (const match of functionMatches) {
      const startIndex = match.index || 0;
      let braceCount = 0;
      let lineCount = 0;
      let started = false;
      
      for (let i = startIndex; i < code.length; i++) {
        if (code[i] === '{') {
          braceCount++;
          started = true;
        } else if (code[i] === '}') {
          braceCount--;
        }
        
        if (code[i] === '\n') lineCount++;
        
        if (started && braceCount === 0) break;
      }
      
      if (lineCount > 50) {
        longFunctions.push({ name: match[1], lines: lineCount });
      }
    }
    
    return longFunctions;
  }

  private calculateComplexity(code: string): number {
    const complexityIndicators = [
      /if\s*\(/g,
      /else\s+if/g,
      /for\s*\(/g,
      /while\s*\(/g,
      /switch\s*\(/g,
      /catch\s*\(/g,
      /\?\s*:/g
    ];
    
    let complexity = 1;
    complexityIndicators.forEach(pattern => {
      const matches = code.match(pattern);
      if (matches) complexity += matches.length;
    });
    
    return complexity;
  }

  private calculateMaintainability(code: string): number {
    const lines = code.split('\n').length;
    const comments = (code.match(/\/\/|\/\*/g) || []).length;
    const commentRatio = comments / lines;
    
    let score = 100;
    
    // Penalize long files
    if (lines > 500) score -= 20;
    if (lines > 1000) score -= 30;
    
    // Penalize low comment ratio
    if (commentRatio < 0.1) score -= 15;
    
    // Penalize high complexity
    const complexity = this.calculateComplexity(code);
    if (complexity > 20) score -= 20;
    
    return Math.max(0, Math.min(100, score));
  }

  private generateSuggestions(code: string, language: string, suggestions: string[], patterns: any[]) {
    if (patterns.some(p => p.name === 'Singleton')) {
      suggestions.push('Consider using dependency injection instead of Singleton for better testability');
    }
    
    if (!patterns.some(p => p.name === 'Observer') && code.includes('event')) {
      suggestions.push('Consider using Observer pattern for event handling');
    }
    
    if (code.includes('async') && !code.includes('try') && !code.includes('catch')) {
      suggestions.push('Add error handling for async operations');
    }
  }
}

/**
 * Auto Refactor Tool - أداة إعادة الهيكلة التلقائية
 */
export class AutoRefactorTool extends BaseTool {
  name = 'auto_refactor';
  description = 'Automatically refactor code based on best practices';
  version = '2.0.0';
  tags = ['refactor', 'code-quality', 'automation'];
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      filePath: { type: 'string' },
      refactorType: { type: 'string', enum: ['extract-function', 'rename', 'simplify', 'optimize-imports', 'all'] }
    },
    required: ['filePath']
  };

  permissions: ToolPermission[] = ['read', 'write'];

  async execute(input: any) {
    const { filePath, refactorType = 'all' } = input;
    
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: `File not found: ${filePath}` };
    }

    const originalCode = fs.readFileSync(filePath, 'utf-8');
    let refactoredCode = originalCode;
    const changes: Array<{ type: string; description: string }> = [];

    try {
      if (refactorType === 'all' || refactorType === 'optimize-imports') {
        const result = this.optimizeImports(refactoredCode);
        if (result.changed) {
          refactoredCode = result.code;
          changes.push({ type: 'optimize-imports', description: 'Organized and deduplicated imports' });
        }
      }

      if (refactorType === 'all' || refactorType === 'simplify') {
        const result = this.simplifyCode(refactoredCode);
        if (result.changed) {
          refactoredCode = result.code;
          changes.push({ type: 'simplify', description: 'Simplified expressions and removed dead code' });
        }
      }

      if (refactorType === 'all' || refactorType === 'extract-function') {
        const result = this.extractFunctions(refactoredCode);
        if (result.changed) {
          refactoredCode = result.code;
          changes.push({ type: 'extract-function', description: `Extracted ${result.extractedCount} functions` });
        }
      }

      // Write changes
      if (refactoredCode !== originalCode) {
        fs.writeFileSync(filePath, refactoredCode);
      }

      return {
        ok: true,
        output: {
          changes,
          originalLength: originalCode.length,
          newLength: refactoredCode.length,
          diff: refactoredCode.length - originalCode.length
        }
      };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  }

  private optimizeImports(code: string): { code: string; changed: boolean } {
    const importRegex = /^(import\s+.*?from\s+['"].*?['"];?)$/gm;
    const imports: string[] = [];
    let match;
    
    while ((match = importRegex.exec(code)) !== null) {
      imports.push(match[1]);
    }

    if (imports.length === 0) return { code, changed: false };

    // Remove duplicates and sort
    const uniqueImports = [...new Set(imports)].sort((a, b) => {
      const aIsRelative = a.includes("'./") || a.includes("'../");
      const bIsRelative = b.includes("'./") || b.includes("'../");
      
      if (aIsRelative && !bIsRelative) return 1;
      if (!aIsRelative && bIsRelative) return -1;
      return a.localeCompare(b);
    });

    const newImportSection = uniqueImports.join('\n');
    const codeWithoutImports = code.replace(importRegex, '').trim();
    
    return {
      code: newImportSection + '\n\n' + codeWithoutImports,
      changed: imports.length !== uniqueImports.length
    };
  }

  private simplifyCode(code: string): { code: string; changed: boolean } {
    let simplified = code;
    let changed = false;

    // Simplify if/else with early return
    simplified = simplified.replace(
      /if\s*\(([^)]+)\)\s*{\s*return\s+([^;]+);?\s*}\s*else\s*{\s*return\s+([^;]+);?\s*}/g,
      (match, condition, trueVal, falseVal) => {
        changed = true;
        return `return (${condition}) ? ${trueVal} : ${falseVal};`;
      }
    );

    // Remove console.log statements
    const originalLength = simplified.length;
    simplified = simplified.replace(/console\.(log|debug|info)\s*\([^)]*\);?\s*\n?/g, '');
    if (simplified.length !== originalLength) changed = true;

    return { code: simplified, changed };
  }

  private extractFunctions(code: string): { code: string; changed: boolean; extractedCount: number } {
    // This is a simplified version - full implementation would use AST parsing
    return { code, changed: false, extractedCount: 0 };
  }
}

/**
 * Test Generator Tool - أداة توليد الاختبارات
 */
export class TestGeneratorTool extends BaseTool {
  name = 'test_generator';
  description = 'Generate comprehensive test suites for code';
  version = '2.0.0';
  tags = ['testing', 'automation', 'quality'];
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      filePath: { type: 'string' },
      testType: { type: 'string', enum: ['unit', 'integration', 'e2e', 'all'] }
    },
    required: ['filePath']
  };

  permissions: ToolPermission[] = ['read', 'write'];

  async execute(input: any) {
    const { filePath, testType = 'unit' } = input;
    
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: `File not found: ${filePath}` };
    }

    const code = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath, path.extname(filePath));
    const testFileName = `${fileName}.test.ts`;
    const testFilePath = path.join(path.dirname(filePath), '__tests__', testFileName);

    const tests = this.generateTests(code, fileName, testType);

    // Ensure test directory exists
    const testDir = path.dirname(testFilePath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    fs.writeFileSync(testFilePath, tests);

    return {
      ok: true,
      output: {
        testFilePath,
        testCount: (tests.match(/it\s*\(/g) || []).length,
        coverage: this.estimateCoverage(code, tests)
      }
    };
  }

  private generateTests(code: string, fileName: string, testType: string): string {
    const imports = `import { describe, it, expect, beforeEach, jest } from '@jest/globals';\nimport * as subject from './${fileName}';\n\n`;

    const describeBlock = `describe('${fileName}', () => {\n`;
    
    const tests: string[] = [];
    
    // Extract functions from code
    const functionMatches = code.matchAll(/(?:export\s+)?(?:function|const|let)\s+(\w+)\s*[=(]/g);
    
    for (const match of functionMatches) {
      const funcName = match[1];
      
      tests.push(`  describe('${funcName}', () => {`);
      tests.push(`    it('should handle normal case', async () => {`);
      tests.push(`      // Arrange`);
      tests.push(`      const input = {};`);
      tests.push(`      `);
      tests.push(`      // Act`);
      tests.push(`      const result = await subject.${funcName}(input);`);
      tests.push(`      `);
      tests.push(`      // Assert`);
      tests.push(`      expect(result).toBeDefined();`);
      tests.push(`    });`);
      tests.push(`    `);
      tests.push(`    it('should handle error case', async () => {`);
      tests.push(`      // Arrange`);
      tests.push(`      const input = null;`);
      tests.push(`      `);
      tests.push(`      // Act & Assert`);
      tests.push(`      await expect(subject.${funcName}(input)).rejects.toThrow();`);
      tests.push(`    });`);
      tests.push(`  });`);
      tests.push(`  `);
    }

    return imports + describeBlock + tests.join('\n') + '\n});';
  }

  private estimateCoverage(code: string, tests: string): number {
    const codeLines = code.split('\n').length;
    const testLines = tests.split('\n').length;
    
    // Rough estimate based on test-to-code ratio
    const ratio = testLines / codeLines;
    return Math.min(100, Math.round(ratio * 50));
  }
}

/**
 * Performance Profiler Tool - أداة تحليل الأداء
 */
export class PerformanceProfilerTool extends BaseTool {
  name = 'performance_profile';
  description = 'Profile code performance and identify bottlenecks';
  version = '2.0.0';
  tags = ['performance', 'profiling', 'optimization'];
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      filePath: { type: 'string' },
      functionName: { type: 'string' },
      iterations: { type: 'number' }
    },
    required: ['filePath']
  };

  permissions: ToolPermission[] = ['read', 'execute'];

  async execute(input: any) {
    const { filePath, functionName, iterations = 1000 } = input;
    
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: `File not found: ${filePath}` };
    }

    const code = fs.readFileSync(filePath, 'utf-8');
    
    // Static analysis for performance issues
    const issues = this.analyzePerformance(code);
    
    // Memory usage estimation
    const memoryEstimate = this.estimateMemoryUsage(code);
    
    // Complexity analysis
    const complexity = this.analyzeComplexity(code);

    return {
      ok: true,
      output: {
        issues,
        memoryEstimate,
        complexity,
        recommendations: this.generatePerformanceRecommendations(issues, complexity)
      }
    };
  }

  private analyzePerformance(code: string): Array<{ type: string; line: number; issue: string; severity: 'high' | 'medium' | 'low' }> {
    const issues: Array<{ type: string; line: number; issue: string; severity: 'high' | 'medium' | 'low' }> = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
      // Detect nested loops
      if (/for\s*\([^)]*\)\s*{[^}]*for\s*\(/.test(line)) {
        issues.push({
          type: 'nested-loop',
          line: index + 1,
          issue: 'Nested loops detected - O(n²) complexity',
          severity: 'high'
        });
      }

      // Detect synchronous file operations
      if (/readFileSync|writeFileSync/.test(line)) {
        issues.push({
          type: 'sync-io',
          line: index + 1,
          issue: 'Synchronous I/O operation blocks event loop',
          severity: 'medium'
        });
      }

      // Detect memory leaks
      if (/setInterval|setTimeout.*\{[^}]*\}.*\)/.test(line) && !line.includes('clear')) {
        issues.push({
          type: 'potential-leak',
          line: index + 1,
          issue: 'Potential memory leak - interval/timeout without cleanup',
          severity: 'medium'
        });
      }

      // Detect inefficient regex
      if (/\(\?\.\*\)|\(\?\.\+\)/.test(line)) {
        issues.push({
          type: 'regex',
          line: index + 1,
          issue: 'Inefficient regex pattern may cause catastrophic backtracking',
          severity: 'high'
        });
      }
    });

    return issues;
  }

  private estimateMemoryUsage(code: string): { estimatedMB: number; warnings: string[] } {
    const warnings: string[] = [];
    let estimatedMB = 10; // Base

    // Large arrays
    const largeArrays = (code.match(/new\s+Array\s*\(\s*(\d{4,})\s*\)/g) || []);
    if (largeArrays.length > 0) {
      estimatedMB += largeArrays.length * 50;
      warnings.push('Large array allocations detected');
    }

    // String concatenation in loops
    if (/for\s*\([^)]*\)\s*[^}]*\+\s*=/.test(code)) {
      warnings.push('String concatenation in loop - consider using array join');
    }

    return { estimatedMB, warnings };
  }

  private analyzeComplexity(code: string): { time: string; space: string; score: number } {
    let timeComplexity = 'O(1)';
    let spaceComplexity = 'O(1)';
    let score = 100;

    // Check for loops
    const loopCount = (code.match(/for\s*\(|while\s*\(/g) || []).length;
    
    if (loopCount === 1) {
      timeComplexity = 'O(n)';
      score -= 10;
    } else if (loopCount === 2) {
      timeComplexity = 'O(n²)';
      score -= 30;
    } else if (loopCount > 2) {
      timeComplexity = 'O(n^k)';
      score -= 50;
    }

    // Check for recursion
    if (/function\s+\w+\s*\([^)]*\)\s*{[^}]*\w+\s*\(/.test(code)) {
      const recursionPattern = new RegExp('function\\s+(\\w+)');
      const match = code.match(recursionPattern);
      if (match && code.includes(match[1] + '(')) {
        timeComplexity = 'O(2^n) or O(n!)';
        score -= 40;
      }
    }

    return { time: timeComplexity, space: spaceComplexity, score };
  }

  private generatePerformanceRecommendations(issues: any[], complexity: any): string[] {
    const recommendations: string[] = [];

    if (issues.some(i => i.type === 'nested-loop')) {
      recommendations.push('Consider using Map/Set for O(1) lookups instead of nested loops');
    }

    if (issues.some(i => i.type === 'sync-io')) {
      recommendations.push('Convert synchronous I/O to async/await for better concurrency');
    }

    if (complexity.score < 70) {
      recommendations.push('Consider algorithmic improvements - current complexity is suboptimal');
    }

    if (issues.some(i => i.type === 'potential-leak')) {
      recommendations.push('Implement cleanup for intervals/timeouts to prevent memory leaks');
    }

    return recommendations;
  }
}

/**
 * Documentation Generator Tool - أداة توليد التوثيق
 */
export class DocumentationGeneratorTool extends BaseTool {
  name = 'doc_generator';
  description = 'Generate comprehensive documentation from code';
  version = '2.0.0';
  tags = ['documentation', 'automation'];
  
  inputSchema = {
    type: 'object' as const,
    properties: {
      filePath: { type: 'string' },
      outputFormat: { type: 'string', enum: ['markdown', 'html', 'json'] }
    },
    required: ['filePath']
  };

  permissions: ToolPermission[] = ['read', 'write'];

  async execute(input: any) {
    const { filePath, outputFormat = 'markdown' } = input;
    
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: `File not found: ${filePath}` };
    }

    const code = fs.readFileSync(filePath, 'utf-8');
    const docs = this.generateDocumentation(code, filePath);

    const outputPath = filePath.replace(/\.\w+$/, `.${outputFormat === 'markdown' ? 'md' : outputFormat}`);
    fs.writeFileSync(outputPath, docs);

    return {
      ok: true,
      output: {
        outputPath,
        functions: docs.match(/###\s+Function/g)?.length || 0,
        classes: docs.match(/##\s+Class/g)?.length || 0
      }
    };
  }

  private generateDocumentation(code: string, filePath: string): string {
    const fileName = path.basename(filePath);
    let docs = `# ${fileName}\n\n`;
    docs += `## Overview\n\n`;
    docs += `Auto-generated documentation for ${fileName}.\n\n`;

    // Extract and document functions
    const functionMatches = code.matchAll(/(?:\/\*\*[\s\S]*?\*\/)?\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)/g);
    
    docs += `## Functions\n\n`;
    
    for (const match of functionMatches) {
      const jsdoc = match[0].match(/\/\*\*([\s\S]*?)\*\//);
      const funcName = match[1];
      
      docs += `### ${funcName}\n\n`;
      
      if (jsdoc) {
        docs += jsdoc[1].replace(/\s*\*\s*/g, ' ').trim() + '\n\n';
      } else {
        docs += `Function ${funcName}.\n\n`;
      }
    }

    // Extract and document classes
    const classMatches = code.matchAll(/(?:\/\*\*[\s\S]*?\*\/)?\s*(?:export\s+)?class\s+(\w+)/g);
    
    if (classMatches) {
      docs += `## Classes\n\n`;
      
      for (const match of classMatches) {
        const className = match[1];
        docs += `### ${className}\n\n`;
        docs += `Class ${className}.\n\n`;
      }
    }

    docs += `---\n\n`;
    docs += `*Generated on ${new Date().toISOString()}*`;

    return docs;
  }
}

// Export all tools
export const AdvancedTools = [
  PatternRecognitionTool,
  AutoRefactorTool,
  TestGeneratorTool,
  PerformanceProfilerTool,
  DocumentationGeneratorTool
];
