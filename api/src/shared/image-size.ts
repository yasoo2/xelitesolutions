/** Read intrinsic dimensions without decoding image pixels. */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
    try {
        if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
            return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
        }
        if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') {
            return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
        }
        if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
            const fmt = buf.toString('ascii', 12, 16);
            if (fmt === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
            if (fmt === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
            if (fmt === 'VP8L') {
                const b = buf.readUInt32LE(21);
                return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
            }
        }
        if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
            let i = 2;
            while (i < buf.length - 9) {
                if (buf[i] !== 0xff) { i++; continue; }
                const marker = buf[i + 1];
                if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                    return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
                }
                i += 2 + buf.readUInt16BE(i + 2);
            }
        }
    } catch { /* Unreadable headers have no trustworthy dimensions. */ }
    return null;
}
