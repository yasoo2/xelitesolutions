/**
 * THE PRIVATE TUNNEL TO THE OWNER'S PHONE COMES BACK BY ITSELF.
 *
 * The owner, 2026-11-08: his phone reaches this Joe through a tunnel adb
 * holds (the phone's own 127.0.0.1:<port> is Joe; nothing opens on the
 * network), set up when Joe put his app on it (EngineAndroidTool
 * installJoeAppOverAdb). adb's line to a phone on Wireless debugging drops
 * with the Wi-Fi or a restart, and the tunnel with it; when the phone is back,
 * this keeper opens the tunnel again, for the phones Joe put his app on only
 * (core/devices/phone-tunnels.ts). It reads «adb devices» every 20 seconds —
 * a fixed read, run as the owner's own system task, no model paid — and does
 * nothing at all while no such phone is kept.
 *
 * JOE_PHONE_TUNNEL=off turns it off.
 */
import { executionFirewall } from '../../orchestration/AgentExecutionFirewall';

export class PhoneTunnelService {
    private timer: ReturnType<typeof setInterval> | null = null;
    private running = false;
    private readonly seen = new Map<string, { at: number; phone: string }>();

    start(port: number): void {
        if (this.timer || process.env.JOE_PHONE_TUNNEL === 'off') return;
        this.timer = setInterval(() => { void this.tick(port); }, 20_000);
        this.timer.unref?.();
        setTimeout(() => { void this.tick(port); }, 5_000).unref?.();
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    async tick(port: number): Promise<string[]> {
        if (this.running) return [];
        this.running = true;
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { keepJoeAppTunnels } = require('../tools/definitions/EngineAndroidTool');
            const opened: string[] = await executionFirewall.runAsSystem(() => keepJoeAppTunnels(this.seen, port));
            for (const s of opened) console.log(`[PhoneTunnel] the private tunnel to the phone ${s} is open again (its 127.0.0.1:${port} is this Joe)`);
            return opened;
        } catch (e: any) {
            console.warn('[PhoneTunnel] look failed:', e?.message || e);
            return [];
        } finally {
            this.running = false;
        }
    }
}

export const phoneTunnelService = new PhoneTunnelService();
