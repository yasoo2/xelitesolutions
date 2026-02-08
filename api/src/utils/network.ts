import net from 'net';

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
