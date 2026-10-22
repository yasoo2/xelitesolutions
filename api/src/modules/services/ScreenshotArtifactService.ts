import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { workspaceService } from './WorkspaceService';
import { isWithinRoot } from '../tools/path-containment';

type CaptureContext = { sessionId: string; workspaceId: string; userId: string };
export type ScreenshotRecord = {
    id: string; filename: string; mimeType: string; width: number; height: number;
    bytes: number; createdAt: string;
};
const MAX_BYTES = 8 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const unavailable = (): never => { throw new Error('screenshot_unavailable'); };

function safeFilename(name: unknown): name is string {
    if (typeof name !== 'string' || !name || name.length > 128
        || /[<>:"/\\|?*\x00-\x1f\x7f]/.test(name) || /[. ]$/.test(name)
        || !/\.(png|jpe?g|webp)$/i.test(name) || !name.slice(0, name.lastIndexOf('.')).trim()) return false;
    return !/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/i.test(name.split('.')[0].trimEnd());
}
function checkedChild(root: string, ...parts: string[]): string {
    let current = root;
    for (const part of parts) {
        current = path.join(current, part);
        if (!isWithinRoot(current, root) || fs.lstatSync(current).isSymbolicLink()
            || !isWithinRoot(fs.realpathSync(current), root)) return unavailable();
    }
    return current;
}
function readCheckedFile(file: string, root: string, maximum: number): Buffer {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || stat.size <= 0 || stat.size > maximum) return unavailable();
    const fd = fs.openSync(file, 'r');
    try {
        const opened = fs.fstatSync(fd);
        if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size !== stat.size
            || opened.nlink !== 1 || !isWithinRoot(fs.realpathSync(file), root)) return unavailable();
        const bytes = Buffer.alloc(opened.size);
        let offset = 0;
        while (offset < bytes.length) {
            const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
            if (!count) return unavailable();
            offset += count;
        }
        const after = fs.lstatSync(file);
        if (after.isSymbolicLink() || after.ino !== opened.ino || after.dev !== opened.dev || after.size !== bytes.length
            || after.nlink !== 1 || !isWithinRoot(fs.realpathSync(file), root)) return unavailable();
        return bytes;
    } finally { fs.closeSync(fd); }
}
async function ownedDirectory(context: CaptureContext): Promise<{ root: string; directory: string }> {
    const ids = [context.sessionId, context.workspaceId, context.userId];
    if (ids.some(id => typeof id !== 'string' || !id.trim() || id.length > 180)) return unavailable();
    if (!await workspaceService.canAccessAutonomousFiles(context.workspaceId, context.userId, false)) return unavailable();
    const active = workspaceService.getActiveRoot(context.workspaceId);
    if (!path.isAbsolute(active) || !fs.lstatSync(active).isDirectory()) return unavailable();
    const root = fs.realpathSync(active);
    const key = createHash('sha256').update(context.sessionId).digest('hex').slice(0, 32);
    const directory = checkedChild(root, 'screenshots', key);
    if (!fs.lstatSync(directory).isDirectory()) return unavailable();
    return { root, directory };
}
function readRecord(root: string, directory: string, id: string, context: CaptureContext): ScreenshotRecord & { sha256: string } {
    if (!UUID.test(id)) return unavailable();
    const capture = checkedChild(root, 'screenshots', path.basename(directory), id);
    const manifest = checkedChild(root, 'screenshots', path.basename(directory), id, '.joe-capture.json');
    const record = JSON.parse(readCheckedFile(manifest, root, 4096).toString('utf8'));
    if (record.version !== 1 || record.id !== id || record.sessionId !== context.sessionId
        || record.workspaceId !== context.workspaceId || record.userId !== context.userId
        || !safeFilename(record.filename) || !Number.isInteger(record.width) || !Number.isInteger(record.height)
        || record.width < 1 || record.height < 1 || record.width * record.height > 16 * 1024 * 1024
        || !Number.isInteger(record.bytes) || record.bytes < 1 || record.bytes > MAX_BYTES
        || typeof record.createdAt !== 'string' || record.createdAt.length > 64 || !Number.isFinite(Date.parse(record.createdAt))
        || !/^[a-f0-9]{64}$/.test(record.sha256)) return unavailable();
    const mimeType = /\.png$/i.test(record.filename) ? 'image/png' : /\.webp$/i.test(record.filename) ? 'image/webp' : 'image/jpeg';
    if (record.mimeType !== mimeType || !fs.lstatSync(capture).isDirectory()) return unavailable();
    return { id, filename: record.filename, mimeType, width: record.width, height: record.height,
        bytes: record.bytes, createdAt: record.createdAt, sha256: record.sha256 };
}
class ScreenshotCaptureError extends Error { constructor(readonly code: string) { super(code); } }
const captureFailure = (code: string): never => { throw new ScreenshotCaptureError(code); };
const SCREENSHOT_BYTES = MAX_BYTES;
const SCREENSHOT_PIXELS = 16 * 1024 * 1024;
function screenshotPngDimensions(bytes: Buffer): { width: number; height: number } {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (!Buffer.isBuffer(bytes) || bytes.length < 45 || bytes.length > SCREENSHOT_BYTES
        || !bytes.subarray(0, 8).equals(signature) || bytes.readUInt32BE(8) !== 13
        || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.toString('ascii', bytes.length - 8, bytes.length - 4) !== 'IEND') return captureFailure('invalid_capture_png');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (!width || !height || width * height > SCREENSHOT_PIXELS) return captureFailure('capture_resource_limit');
    return { width, height };
}

function screenshotImageDimensions(bytes: Buffer, type: 'png' | 'jpeg' | 'webp'): { width: number; height: number } {
    if (type === 'png') return screenshotPngDimensions(bytes);
    if (!Buffer.isBuffer(bytes) || bytes.length > SCREENSHOT_BYTES || bytes.length < 12) return captureFailure('invalid_capture_image');
    const boundedDimensions = (width: number, height: number) => {
        if (!width || !height || width * height > SCREENSHOT_PIXELS) return captureFailure('capture_resource_limit');
        return { width, height };
    };
    if (type === 'jpeg') {
        if (bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) return captureFailure('invalid_capture_image');
        let offset = 2;
        for (let segments = 0; segments < 1024 && offset + 4 <= bytes.length; segments++) {
            if (bytes[offset] !== 0xff) return captureFailure('invalid_capture_image');
            while (offset < bytes.length && bytes[offset] === 0xff) offset++;
            if (offset >= bytes.length) break;
            const marker = bytes[offset++];
            if (marker === 0xd9 || marker === 0xda) break;
            if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
            if (offset + 2 > bytes.length) break;
            const length = bytes.readUInt16BE(offset);
            if (length < 2 || offset + length > bytes.length) return captureFailure('invalid_capture_image');
            if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
                if (length < 8) return captureFailure('invalid_capture_image');
                return boundedDimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
            }
            offset += length;
        }
    } else {
        if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) + 8 !== bytes.length) return captureFailure('invalid_capture_image');
        let offset = 12;
        for (let chunks = 0; chunks < 4096 && offset + 8 <= bytes.length; chunks++) {
            const name = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4), data = offset + 8;
            if (data + length > bytes.length) return captureFailure('invalid_capture_image');
            if (name === 'VP8X' && length >= 10) return boundedDimensions(bytes.readUIntLE(data + 4, 3) + 1, bytes.readUIntLE(data + 7, 3) + 1);
            if (name === 'VP8L' && length >= 5 && bytes[data] === 0x2f) {
                const packed = bytes.readUInt32LE(data + 1);
                return boundedDimensions((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
            }
            if (name === 'VP8 ' && length >= 10 && (bytes[data] & 1) === 0 && bytes.subarray(data + 3, data + 6).equals(Buffer.from([0x9d, 1, 0x2a]))) return boundedDimensions(bytes.readUInt16LE(data + 6) & 0x3fff, bytes.readUInt16LE(data + 8) & 0x3fff);
            offset = data + length + (length & 1);
        }
    }
    return captureFailure('invalid_capture_image');
}

function stableRoot(context: CaptureContext, root: string): void {
    if (fs.realpathSync(workspaceService.getActiveRoot(context.workspaceId)) !== root) unavailable();
}

export async function listScreenshots(context: CaptureContext): Promise<ScreenshotRecord[]> {
    let location: { root: string; directory: string };
    context = { ...context };
    try { location = await ownedDirectory(context); } catch (error: any) { if (error?.code === 'ENOENT') return []; throw error; }
    const { root, directory } = location;
    const records: ScreenshotRecord[] = [];
    const dir = fs.opendirSync(directory);
    try {
        for (let scanned = 0; scanned < 512; scanned++) {
            const entry = dir.readSync();
            if (!entry) break;
            if (!UUID.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) continue;
            try { const { sha256, ...record } = readRecord(root, directory, entry.name, context); records.push(record); } catch { /* Orphaned/rejected captures are not delivery evidence. */ }
        }
        if (dir.readSync()) return unavailable(); // Never label an incomplete scan as the latest captures.
    } finally { dir.closeSync(); }
    stableRoot(context, root);
    if (!await workspaceService.canAccessAutonomousFiles(context.workspaceId, context.userId, false)) return unavailable();
    stableRoot(context, root);
    return records.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
}

export async function readScreenshot(context: CaptureContext, id: string): Promise<{ capture: ScreenshotRecord; imageDataUrl: string }> {
    context = { ...context };
    if (!UUID.test(id)) return unavailable();
    const { root, directory } = await ownedDirectory(context);
    const { sha256, ...capture } = readRecord(root, directory, id, context);
    const file = checkedChild(root, 'screenshots', path.basename(directory), id, capture.filename);
    const bytes = readCheckedFile(file, root, MAX_BYTES);
    const type = capture.mimeType === 'image/png' ? 'png' : capture.mimeType === 'image/jpeg' ? 'jpeg' : 'webp';
    const dimensions = screenshotImageDimensions(bytes, type);
    if (bytes.length !== capture.bytes || createHash('sha256').update(bytes).digest('hex') !== sha256
        || dimensions.width !== capture.width || dimensions.height !== capture.height) return unavailable();
    stableRoot(context, root);
    if (!await workspaceService.canAccessAutonomousFiles(context.workspaceId, context.userId, false)) return unavailable();
    stableRoot(context, root);
    return { capture, imageDataUrl: `data:${capture.mimeType};base64,${bytes.toString('base64')}` };
}
