/**
 * Owned raster-download helper: lifecycle-safe Blob objectURL export.
 *
 * Scope: decode only already-validated PNG/JPEG/WebP data URLs (private
 * API bytes) into an actual ArrayBuffer-backed Blob, then expose a
 * same-origin opaque object URL for the download anchor. No network fetch,
 * no public routes/query tokens/cookies/localStorage, no untrusted
 * HTML/SVG/JS/external URLs.
 *
 * Bounds: at most 6 images, each at most 8 MiB decoded. Callers revoke
 * every created URL on replacement/unmount/session change/error.
 */

export const RASTER_MAX_CAPTURES = 6;
export const RASTER_MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
export const RASTER_MAX_BASE64_BODY_LENGTH = Math.ceil(RASTER_MAX_CAPTURE_BYTES / 3) * 4;

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

function mimeToDataPrefix(mimeType: string): string | null {
  if (mimeType === 'image/png') return 'data:image/png;base64,';
  if (mimeType === 'image/jpeg') return 'data:image/jpeg;base64,';
  if (mimeType === 'image/webp') return 'data:image/webp;base64,';
  return null;
}

export function isRasterMimeType(value: unknown): value is string {
  return (
    value === 'image/png' || value === 'image/jpeg' || value === 'image/webp'
  );
}

export function isBlobDownloadSupported(): boolean {
  try {
    const g = globalThis as Record<string, unknown>;
    const URLImpl = g.URL as
      | { createObjectURL?: unknown; revokeObjectURL?: unknown }
      | undefined;
    const BlobImpl = g.Blob;
    if (typeof BlobImpl !== 'function') return false;
    if (!URLImpl) return false;
    if (typeof URLImpl.createObjectURL !== 'function') return false;
    if (typeof URLImpl.revokeObjectURL !== 'function') return false;
    return true;
  } catch {
    return false;
  }
}

function decodeBase64Body(body: string): Uint8Array | null {
  if (body.length === 0 || body.length > RASTER_MAX_BASE64_BODY_LENGTH) return null;
  if (body.length % 4 !== 0) return null;
  if (!BASE64_RE.test(body)) return null;
  try {
    const g = globalThis as Record<string, unknown>;
    const atobFn = g.atob as ((s: string) => string) | undefined;
    if (typeof atobFn === 'function') {
      const bin = atobFn.call(g, body);
      if (bin.length > RASTER_MAX_CAPTURE_BYTES) return null;
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i) & 0xff;
      return out;
    }
    const BufferImpl = g.Buffer as
      | { from?: (s: string, enc: string) => { length: number; copy(t: Uint8Array): void } }
      | undefined;
    if (BufferImpl && typeof BufferImpl.from === 'function') {
      const buf = BufferImpl.from(body, 'base64');
      if (buf.length > RASTER_MAX_CAPTURE_BYTES) return null;
      const out = new Uint8Array(buf.length);
      buf.copy(out);
      return out;
    }
    return null;
  } catch {
    return null;
  }
}

/** Decode an already allow-listed raster data URL to bytes. Null when invalid. */
export function decodeRasterDataUrl(dataUrl: unknown, mimeType: string): Uint8Array | null {
  if (!isRasterMimeType(mimeType)) return null;
  if (typeof dataUrl !== 'string') return null;
  const prefix = mimeToDataPrefix(mimeType);
  if (!prefix) return null;
  if (!dataUrl.startsWith(prefix)) return null;
  const body = dataUrl.slice(prefix.length);
  return decodeBase64Body(body);
}

/**
 * Build a Blob object URL from validated raster bytes. Returns null when the
 * URL/Blob API is unavailable, bytes are invalid/oversize, or creation fails.
 * The returned ArrayBuffer is freshly allocated (never a shared view), so the
 * TS BlobPart ArrayBufferLike mismatch is avoided.
 */
export function createRasterBlobUrl(dataUrl: unknown, mimeType: string): string | null {
  if (!isBlobDownloadSupported()) return null;
  const bytes = decodeRasterDataUrl(dataUrl, mimeType);
  if (!bytes) return null;
  if (bytes.length < 1 || bytes.length > RASTER_MAX_CAPTURE_BYTES) return null;
  try {
    // Fresh ArrayBuffer copy: avoids SharedArrayBuffer / ArrayBufferLike typing.
    const owned = new ArrayBuffer(bytes.length);
    new Uint8Array(owned).set(bytes);
    const blob = new Blob([owned], { type: mimeType });
    const URLImpl = (globalThis as unknown as { URL: { createObjectURL(b: Blob): string } }).URL;
    const url = URLImpl.createObjectURL(blob);
    if (typeof url !== 'string' || !url.startsWith('blob:')) {
      try {
        if (typeof url === 'string' && url.length > 0) (globalThis as unknown as { URL: { revokeObjectURL?: (u: string) => void } }).URL.revokeObjectURL?.(url);
      } catch {
        // ignore cleanup failure
      }
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

/** Best-effort revoke; never throws. */
export function revokeRasterBlobUrl(url: unknown): void {
  try {
    if (typeof url !== 'string' || url.length === 0) return;
    const g = globalThis as Record<string, unknown>;
    const URLImpl = g.URL as { revokeObjectURL?: (u: string) => void } | undefined;
    if (!URLImpl || typeof URLImpl.revokeObjectURL !== 'function') return;
    URLImpl.revokeObjectURL(url);
  } catch {
    // Intentionally silent: revoke is best-effort cleanup.
  }
}
