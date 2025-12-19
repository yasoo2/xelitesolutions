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
      const files = await this.getFiles(dir);
      const newAlerts: SentinelAlert[] = [];

      await Promise.all(files.map(async (file) => {
        try {
            const content = await fs.promises.readFile(file, 'utf-8');
            
            // 1. Check for Secrets
            // Heuristic for potential keys, ignoring common false positives involves more complex regex
            if (content.match(/['"][a-zA-Z0-9]{32,}['"]/) || 
                content.includes('sk-') || 
                content.includes('Bearer ') ||
                content.includes('aws_access_key_id') ||
                content.includes('ghp_')) {
                    // Refine to avoid false positives (like imports or hashes)
                    if (!content.includes('import ') && !content.includes('sha256')) {
                         newAlerts.push(this.createAlert('security', 'high', file, 'Potential API Key or Secret detected'));
                    }
            }

            // 2. Check for Console Logs in production code (not scripts/tests)
            if (!file.includes('test') && !file.includes('script') && !file.includes('dev') && content.includes('console.log')) {
                newAlerts.push(this.createAlert('quality', 'low', file, 'Console.log statement found in production code'));
            }

            // 3. Check for TODOs
            if (content.includes('TODO') || content.includes('FIXME')) {
                newAlerts.push(this.createAlert('maintenance', 'medium', file, 'Pending TODO/FIXME detected'));
            }
        } catch (e) {
            // Ignore file read errors (permissions, etc)
        }
      }));

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
            } catch (e) {
                // Ignore stat errors
            }
        }
    } catch (e) {
        // Ignore readdir errors
    }
    return results;
  }
}
