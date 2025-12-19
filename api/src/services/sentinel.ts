import fs from 'fs';
import path from 'path';
import { broadcast } from '../ws';

interface SentinelAlert {
  id: string;
  type: 'security' | 'quality' | 'maintenance';
  severity: 'low' | 'medium' | 'high';
  file: string;
  message: string;
  timestamp: string;
}

export class SentinelService {
  private static isRunning = false;
  private static alerts: SentinelAlert[] = [];

  static start(rootPath: string) {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🛡️ Sentinel Active: Monitoring codebase...');
    
    // Initial Scan
    this.scan(rootPath);

    // Periodic Scan (every 5 minutes)
    setInterval(() => this.scan(rootPath), 5 * 60 * 1000);
  }

  static async scan(dir: string) {
    try {
      const files = this.getFiles(dir);
      const newAlerts: SentinelAlert[] = [];

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        
        // 1. Check for Secrets
        if (content.match(/['"][a-zA-Z0-9]{20,}['"]/)) {
             // Heuristic for potential keys, ignoring common false positives involves more complex regex
             if (content.includes('sk-') || content.includes('Bearer ')) {
                 newAlerts.push(this.createAlert('security', 'high', file, 'Potential API Key or Secret detected'));
             }
        }

        // 2. Check for Console Logs in production code (not scripts/tests)
        if (!file.includes('test') && !file.includes('script') && content.includes('console.log')) {
            newAlerts.push(this.createAlert('quality', 'low', file, 'Console.log statement found in production code'));
        }

        // 3. Check for TODOs
        if (content.includes('TODO') || content.includes('FIXME')) {
            newAlerts.push(this.createAlert('maintenance', 'medium', file, 'Pending TODO/FIXME detected'));
        }
      }

      // Broadcast only new alerts
      if (newAlerts.length > 0) {
        this.alerts = [...newAlerts, ...this.alerts].slice(0, 50); // Keep last 50
        broadcast({ type: 'sentinel:alert', data: newAlerts });
      }

    } catch (e) {
      console.error('Sentinel Scan Error:', e);
    }
  }

  private static createAlert(type: any, severity: any, file: string, message: string): SentinelAlert {
    return {
      id: Math.random().toString(36).substring(7),
      type,
      severity,
      file: path.basename(file),
      message,
      timestamp: new Date().toISOString()
    };
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
