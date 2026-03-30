#!/usr/bin/env node

/**
 * Joe Sentinel Agent
 * Lightweight zero-dependency daemon for Server Telemetry, FIM, and Process Monitoring.
 * Designed to run on target VPS instances.
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import https from 'https';
import http from 'http';

// Configuration injected via ENV or config file
const CONFIG = {
    API_URL: process.env.SENTINEL_API_URL || 'http://localhost:5000/api/super-admin/sentinel/telemetry',
    API_KEY: process.env.SENTINEL_API_KEY || 'default-secret-key',
    SERVER_ID: process.env.SENTINEL_SERVER_ID || 'UNREGISTERED',
    POLL_INTERVAL_MS: 30000, // 30 seconds
    FIM_PATHS: [
        '/etc/ssh/sshd_config',
        '/root/.ssh/authorized_keys',
        '/usr/local/bin',
        '/etc/systemd/system'
    ]
};

// Internal State
let baselineChecksums = new Map<string, string>();

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string) {
    console.log(`[${new Date().toISOString()}] [${level}] ${msg}`);
}

// 1. Telemetry Collection
function collectMetrics() {
    log('INFO', 'Collecting system metrics...');
    
    // CPU Load
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    
    // Memory
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMemPercent = ((totalMem - freeMem) / totalMem) * 100;

    // Disk Space
    let diskUsedPercent = 0;
    try {
        const dfOut = execSync("df -k / | tail -1 | awk '{print $5}'").toString().trim();
        diskUsedPercent = parseInt(dfOut.replace('%', ''), 10);
    } catch (e) {
        log('ERROR', 'Failed to collect disk metrics');
    }

    return {
        timestamp: Date.now(),
        os: {
            platform: os.platform(),
            release: os.release(),
            uptime: os.uptime()
        },
        cpu: {
            cores: cpus.length,
            load1m: loadAvg[0],
            load5m: loadAvg[1],
            load15m: loadAvg[2]
        },
        memory: {
            totalMB: Math.round(totalMem / 1024 / 1024),
            freeMB: Math.round(freeMem / 1024 / 1024),
            usedPercent: usedMemPercent.toFixed(2)
        },
        disk: {
            usedPercent: diskUsedPercent
        }
    };
}

// 2. Process Monitoring
function collectProcesses() {
    log('INFO', 'Collecting process data...');
    try {
        // Get top 10 CPU consuming processes
        const psOut = execSync('ps -eo pid,ppid,user,%cpu,%mem,cmd --sort=-%cpu | head -n 11').toString();
        const lines = psOut.trim().split('\n').slice(1); // skip header
        
        const processes = lines.map(line => {
            const parts = line.trim().split(/\s+/);
            return {
                pid: parts[0],
                ppid: parts[1],
                user: parts[2],
                cpu: parseFloat(parts[3]),
                mem: parseFloat(parts[4]),
                cmd: parts.slice(5).join(' ')
            };
        });

        // Scan for explicitly suspicious keywords
        const suspiciousKeywords = ['miner', 'xmrig', 'systemp', 'free_proc.sh', 'nc -e', 'bash -i'];
        const suspiciousProcesses = processes.filter(p => 
            suspiciousKeywords.some(keyword => p.cmd.toLowerCase().includes(keyword))
        );

        return {
            topProcesses: processes,
            suspiciousFound: suspiciousProcesses
        };
    } catch (e: any) {
        log('ERROR', `Failed to collect process data: ${e.message}`);
        return { topProcesses: [], suspiciousFound: [] };
    }
}

// 3. File Integrity Monitoring (FIM)
function hashFile(filePath: string): string | null {
    try {
        if (!fs.existsSync(filePath)) return null;
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) return 'DIR'; // simplified for directories

        const fileBuffer = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(fileBuffer).digest('hex');
    } catch (e) {
        return null;
    }
}

function scanFIMPaths() {
    log('INFO', 'Running FIM scan...');
    const currentHashes = new Map<string, string>();
    const changes: Array<{ path: string, event: string }> = [];

    const scanDir = (dir: string) => {
        try {
            if (!fs.existsSync(dir)) return;
            const stat = fs.statSync(dir);
            if (stat.isFile()) {
                const hash = hashFile(dir);
                if (hash) currentHashes.set(dir, hash);
            } else if (stat.isDirectory()) {
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    scanDir(path.join(dir, file));
                }
            }
        } catch (e) {
            // Ignore access errors
        }
    };

    for (const p of CONFIG.FIM_PATHS) {
        scanDir(p);
    }

    // Compare with baseline
    if (baselineChecksums.size > 0) {
        for (const [filepath, hash] of currentHashes.entries()) {
            if (!baselineChecksums.has(filepath)) {
                changes.push({ path: filepath, event: 'CREATED' });
            } else if (baselineChecksums.get(filepath) !== hash) {
                changes.push({ path: filepath, event: 'MODIFIED' });
            }
        }
        for (const filepath of baselineChecksums.keys()) {
            if (!currentHashes.has(filepath)) {
                changes.push({ path: filepath, event: 'DELETED' });
            }
        }
    }

    // Update baseline
    baselineChecksums = currentHashes;

    return {
        totalFilesScanned: currentHashes.size,
        changesDetected: changes
    };
}

// 4. SSH / Network Connections
function collectNetwork() {
    log('INFO', 'Collecting network data...');
    try {
        // Active listening ports
        const ssOut = execSync('ss -tulpn').toString();
        // Just extract count and raw snapshot for now to send to core for parsing
        return {
            rawPortsSnapshot: ssOut.length > 1000 ? ssOut.substring(0, 1000) + '...' : ssOut
        };
    } catch (e) {
        return { rawPortsSnapshot: '' };
    }
}

// 5. Build and Send Payload
async function dispatchTelemetry() {
    const payload = {
        serverId: CONFIG.SERVER_ID,
        metrics: collectMetrics(),
        processes: collectProcesses(),
        fim: scanFIMPaths(),
        network: collectNetwork()
    };

    const payloadString = JSON.stringify(payload);
    
    // Choose adapter based on API_URL
    const lib = CONFIG.API_URL.startsWith('https') ? https : http;
    const urlObj = new URL(CONFIG.API_URL);

    const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payloadString),
            'X-Sentinel-Api-Key': CONFIG.API_KEY
        }
    };

    log('INFO', `Dispatching telemetry to ${CONFIG.API_URL}`);

    const req = lib.request(options, (res) => {
        let responseBody = '';
        res.on('data', d => responseBody += d);
        res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                log('INFO', 'Telemetry successfully ingested by Core.');
            } else {
                log('WARN', `Core rejected telemetry: ${res.statusCode} - ${responseBody}`);
            }
        });
    });

    req.on('error', (e) => {
        log('ERROR', `Connection to Core failed: ${e.message}`);
    });

    req.write(payloadString);
    req.end();
}

// Orchestrator
async function start() {
    log('INFO', 'Joe Sentinel Agent Starting...');
    log('INFO', `Target API: ${CONFIG.API_URL}`);
    log('INFO', `Server ID: ${CONFIG.SERVER_ID}`);
    
    // Initial baseline pass (does not report changes on boot)
    scanFIMPaths();
    log('INFO', `FIM Baseline established with ${baselineChecksums.size} paths.`);

    // Start loop
    setInterval(() => {
        dispatchTelemetry().catch(err => log('ERROR', `Loop error: ${err}`));
    }, CONFIG.POLL_INTERVAL_MS);
    
    // Run first explicitly
    dispatchTelemetry();
}

start();
