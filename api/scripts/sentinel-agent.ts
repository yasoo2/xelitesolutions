#!/usr/bin/env node

/**
 * Joe Sentinel Agent
 * Lightweight zero-dependency daemon for Server Telemetry, FIM, Process Monitoring, and Actions.
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
    API_URL: process.env.SENTINEL_API_URL || 'http://localhost:5001/api/admin/sentinel/telemetry',
    API_KEY: process.env.SENTINEL_API_KEY || 'default-secret-key',
    SERVER_ID: process.env.SENTINEL_SERVER_ID || 'UNREGISTERED',
    POLL_INTERVAL_MS: process.env.NODE_ENV === 'development' ? 5000 : 10000,
    FIM_PATHS: [
        '/etc/ssh/sshd_config',
        '/root/.ssh/authorized_keys',
        '/usr/local/bin',
        '/etc/systemd/system'
    ]
};

let baselineChecksums = new Map<string, string>();

function log(level: 'INFO' | 'WARN' | 'ERROR', msg: string) {
    console.log(`[${new Date().toISOString()}] [${level}] ${msg}`);
}

// 1. Actions Executor
function executeAction(action: any) {
    log('INFO', `Executing remote action: ${action.type} -> ${action.target}`);
    try {
        if (action.type === 'KILL_PROCESS') {
            execSync(`kill -9 ${action.target}`);
        } else if (action.type === 'BLOCK_IP') {
            execSync(`iptables -A INPUT -s ${action.target} -j DROP`);
        } else if (action.type === 'STOP_SERVICE') {
            execSync(`systemctl stop ${action.target} && systemctl disable ${action.target}`);
        }
    } catch(e: any) {
        log('ERROR', `Action execution failed: ${e.message}`);
    }
}

// 2. Telemetry Collection
function collectMetrics() {
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMemPercent = ((totalMem - freeMem) / totalMem) * 100;

    let diskUsedPercent = 0;
    try {
        const dfOut = execSync("df -k / | tail -1 | awk '{print $5}'").toString().trim();
        diskUsedPercent = parseInt(dfOut.replace('%', ''), 10);
    } catch (e) { }

    return {
        timestamp: Date.now(),
        hostname: os.hostname(),
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

function collectProcesses() {
    try {
        const isMac = os.platform() === 'darwin';
        const psCpuCmd = isMac ? 'ps -eo pid,ppid,user,%cpu,%mem,command -r | head -n 11' : 'ps -eo pid,ppid,user,%cpu,%mem,cmd --sort=-%cpu | head -n 11';
        const psMemCmd = isMac ? 'ps -eo pid,ppid,user,%cpu,%mem,command -m | head -n 11' : 'ps -eo pid,ppid,user,%cpu,%mem,cmd --sort=-%mem | head -n 11';

        const psCpu = execSync(psCpuCmd).toString();
        const psMem = execSync(psMemCmd).toString();
        
        const parsePs = (out: string) => out.trim().split('\n').slice(1).map(line => {
            const parts = line.trim().split(/\s+/);
            return {
                pid: parts[0], ppid: parts[1], user: parts[2],
                cpu: parseFloat(parts[3]), mem: parseFloat(parts[4]), cmd: parts.slice(5).join(' ')
            };
        });

        const topCpu = parsePs(psCpu);
        const topMem = parsePs(psMem);

        const suspiciousKeywords = ['miner', 'xmrig', 'systemp', 'free_proc.sh', 'nc -e', 'bash -i', 'nmap'];
        // Unique suspicious found
        const allProcs = [...topCpu, ...topMem];
        const uniqueProcs = Array.from(new Map(allProcs.map(item => [item.pid, item])).values());
        
        const suspiciousFound = uniqueProcs.filter(p => 
            suspiciousKeywords.some(k => p.cmd.toLowerCase().includes(k))
        );

        return { topCpu, topMem, suspiciousFound };
    } catch (e: any) {
        return { topCpu: [], topMem: [], suspiciousFound: [] };
    }
}

function collectUsers() {
    try {
        const whoOut = execSync('who').toString().trim();
        if (!whoOut) return [];
        return whoOut.split('\n').map(line => {
            const parts = line.trim().split(/\s+/);
            return {
                user: parts[0],
                terminal: parts[1],
                time: `${parts[2] || ''} ${parts[3] || ''}`.trim(),
                ip: parts[4] ? parts[4].replace(/[()]/g, '') : 'local'
            };
        });
    } catch (e) {
        return [];
    }
}

// 3. File Integrity Monitoring (FIM)
function hashFile(filePath: string): string | null {
    try {
        if (!fs.existsSync(filePath)) return null;
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) return 'DIR';
        const fileBuffer = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(fileBuffer).digest('hex');
    } catch (e) { return null; }
}

function scanFIMPaths() {
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
                for (const file of files) scanDir(path.join(dir, file));
            }
        } catch (e) { }
    };

    for (const p of CONFIG.FIM_PATHS) scanDir(p);

    if (baselineChecksums.size > 0) {
        for (const [filepath, hash] of currentHashes.entries()) {
            if (!baselineChecksums.has(filepath)) changes.push({ path: filepath, event: 'CREATED' });
            else if (baselineChecksums.get(filepath) !== hash) changes.push({ path: filepath, event: 'MODIFIED' });
        }
        for (const filepath of baselineChecksums.keys()) {
            if (!currentHashes.has(filepath)) changes.push({ path: filepath, event: 'DELETED' });
        }
    }

    baselineChecksums = currentHashes;
    return { changesDetected: changes };
}

function collectNetwork() {
    try {
        const ssOut = execSync('ss -tulpn').toString();
        return { rawPortsSnapshot: ssOut.length > 1000 ? ssOut.substring(0, 1000) + '...' : ssOut };
    } catch (e) {
        return { rawPortsSnapshot: '' };
    }
}

// 4. Dispatch and Receive Actions
async function dispatchTelemetry() {
    const payload = {
        serverId: CONFIG.SERVER_ID,
        metrics: collectMetrics(),
        processes: collectProcesses(),
        users: collectUsers(), // New Explicit Users Array
        fim: scanFIMPaths(),
        network: collectNetwork()
    };

    const payloadString = JSON.stringify(payload);
    const lib = CONFIG.API_URL.startsWith('https') ? https : http;
    const urlObj = new URL(CONFIG.API_URL);

    const options = {
        hostname: urlObj.hostname, port: urlObj.port, path: urlObj.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payloadString),
            'X-Sentinel-Api-Key': CONFIG.API_KEY
        }
    };

    const req = lib.request(options, (res) => {
        let responseBody = '';
        res.on('data', d => responseBody += d);
        res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                try {
                    const data = JSON.parse(responseBody);
                    if (data && data.actions && Array.isArray(data.actions)) {
                        for (const action of data.actions) {
                           executeAction(action);
                        }
                    }
                } catch(e) { }
            } else {
                log('WARN', `Core rejected telemetry: ${res.statusCode}`);
            }
        });
    });

    req.on('error', (e) => log('ERROR', `Connection to Core failed: ${e.message}`));
    req.write(payloadString);
    req.end();
}

async function start() {
    log('INFO', 'Joe Sentinel Agent Starting...');
    log('INFO', `Target API: ${CONFIG.API_URL}`);
    log('INFO', `Server ID: ${CONFIG.SERVER_ID}`);
    
    scanFIMPaths();
    log('INFO', `FIM Baseline established.`);

    setInterval(() => {
        dispatchTelemetry().catch(err => log('ERROR', `Loop error: ${err}`));
    }, CONFIG.POLL_INTERVAL_MS);
    
    dispatchTelemetry();
}

start();
