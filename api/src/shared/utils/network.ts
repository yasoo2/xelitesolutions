import net from 'net';
import os from 'os';

/**
 * The one address the server's nginx dials for `/preview/<port>/`
 * (infra/nginx/conf.d/app.conf, `proxy_pass http://172.18.0.1:$p_port`): the
 * host's side of the Docker bridge, which only this host and its containers
 * reach.
 */
export const PREVIEW_PROXY_DIALS = '172.18.0.1';

/**
 * WHERE A DEV SERVER LISTENS: THIS MACHINE ONLY.
 *
 * dev_server_start used to listen on 0.0.0.0, every interface: on a server
 * that publishes a generated app, unauthenticated, to the whole network. A
 * preview is opened from this machine, so it listens on 127.0.0.1 like every
 * other preview Joe starts. The one exception follows the proxy: on the
 * production Linux host, nginx runs in a container and reaches the preview
 * at the Docker bridge address, which loopback would not answer; when this
 * host owns that address the server listens there — still not on a public
 * interface. It never answers 0.0.0.0.
 */
export function previewBindHost(
    production: boolean,
    platform: string = process.platform,
    interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces(),
): string {
    if (!production || platform !== 'linux') return '127.0.0.1';
    const onBridge = Object.values(interfaces).some(list => (list || []).some(i => i.address === PREVIEW_PROXY_DIALS));
    return onBridge ? PREVIEW_PROXY_DIALS : '127.0.0.1';
}

export function isPortOpen(host: string, port: number, timeoutMs: number = 2000): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeoutMs);

        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });

        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });

        socket.connect(port, host);
    });
}

/**
 * Parses a URL and returns true if it points to a local/internal service.
 */
export function isLocalOrInternalUrl(urlStr: string): boolean {
    try {
        const u = new URL(urlStr);
        const host = u.hostname.toLowerCase();
        return (
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host === 'api' ||
            host === 'web' ||
            /^192\.168\./.test(host) ||
            /^10\./.test(host) ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
        );
    } catch {
        return false;
    }
}
