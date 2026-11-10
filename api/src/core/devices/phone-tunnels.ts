/**
 * THE PHONES JOE OPENED A PRIVATE TUNNEL TO.
 *
 * The owner, 2026-11-08, for now on his laptop: Joe listens on this computer
 * alone, and a phone paired by Wireless debugging (or on the cable) reaches
 * it through «adb reverse»: the phone's own 127.0.0.1:<port> is Joe, and
 * nothing opens on the network. A tunnel lasts as long as adb's line to the
 * phone; when the phone comes back (Wi-Fi, a restart), the keeper
 * (modules/services/PhoneTunnelService.ts) opens it again, for the phones
 * listed here only: those Joe put his app on at the owner's request
 * (EngineAndroidTool installJoeAppOverAdb), known by their own serial
 * number, which stays the same whatever address adb gives them.
 *
 * Kept in data/phone-tunnels.json (JOE_PHONE_TUNNELS_FILE).
 */
import fs from 'fs';
import path from 'path';

export type TunnelPhone = { serial: string; model: string; since: number };

function file(): string {
    return process.env.JOE_PHONE_TUNNELS_FILE || path.join(process.cwd(), 'data', 'phone-tunnels.json');
}

export function tunnelPhones(): TunnelPhone[] {
    try {
        const rows = JSON.parse(fs.readFileSync(file(), 'utf8'));
        return Array.isArray(rows) ? rows.filter((r: any) => r && typeof r.serial === 'string' && r.serial) : [];
    } catch { return []; }
}

export function isTunnelPhone(serial: string): boolean {
    return !!serial && tunnelPhones().some(p => p.serial === serial);
}

export function keepTunnelFor(serial: string, model: string, now = Date.now()): void {
    if (!serial) return;
    const rows = tunnelPhones().filter(p => p.serial !== serial);
    rows.push({ serial, model: String(model || '').slice(0, 80), since: now });
    const f = file();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(rows, null, 2));
}

export function dropTunnelFor(serial: string): void {
    const rows = tunnelPhones();
    const left = rows.filter(p => p.serial !== serial);
    if (left.length !== rows.length) fs.writeFileSync(file(), JSON.stringify(left, null, 2));
}
