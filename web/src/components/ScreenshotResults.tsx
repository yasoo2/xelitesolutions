import { useEffect, useRef, useState } from 'react';
import { api } from '../services/apiClient';
import { createRasterBlobUrl, revokeRasterBlobUrl } from '../lib/raster-download';

export const MAX_CAPTURES = 6;
export const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
export const MAX_PIXELS = 16 * 1024 * 1024;
export const MAX_BASE64_BODY_LENGTH = Math.ceil(MAX_CAPTURE_BYTES / 3) * 4;
export const MAX_DECODED_TOTAL_BYTES = MAX_CAPTURES * MAX_CAPTURE_BYTES;

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const SUPPORTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
const RESERVED_STEM_RE =
  /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const SUPERSCRIPT_DIGITS = new Set(['¹', '²', '³']);

function isReservedStem(stem: string): boolean {
  const s = stem.split('.')[0].trimEnd();
  if (RESERVED_STEM_RE.test(s)) return true;
  const upper = s.toUpperCase();
  if ((upper.startsWith('COM') || upper.startsWith('LPT')) && s.length === 4) {
    if (SUPERSCRIPT_DIGITS.has(s.charAt(3))) return true;
  }
  return false;
}

type ApiGetFn = (
  endpoint: string,
  query?: Record<string, string>,
  options?: { signal?: AbortSignal },
) => Promise<unknown>;

export interface ScreenshotCaptureMeta {
  id: string;
  filename: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
}

export interface ScreenshotItem {
  meta: ScreenshotCaptureMeta;
  dataUrl: string;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_RE.test(value);
}

export function isSafeFilename(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length < 1 || value.length > 128) return false;
  if (value.indexOf('/') >= 0 || value.indexOf('\\') >= 0) return false;
  if (/[<>:"|?*]/.test(value)) return false;
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code <= 31 || code === 127) return false;
  }
  if (value.endsWith('.') || value.endsWith(' ')) return false;
  const dot = value.lastIndexOf('.');
  if (dot < 1 || dot === value.length - 1) return false;
  const stem = value.slice(0, dot);
  const ext = value.slice(dot + 1).toLowerCase();
  if (stem.length === 0 || stem.trim().length === 0) return false;
  if (ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg' && ext !== 'webp') return false;
  if (isReservedStem(stem)) return false;
  return true;
}

export function isSupportedMimeType(value: unknown): value is string {
  return typeof value === 'string' && SUPPORTED_MIME.has(value);
}

export function mimeToDataPrefix(mimeType: string): string | null {
  if (mimeType === 'image/png') return 'data:image/png;base64,';
  if (mimeType === 'image/jpeg') return 'data:image/jpeg;base64,';
  if (mimeType === 'image/webp') return 'data:image/webp;base64,';
  return null;
}

export function filenameExtensionMatchesMime(filename: string, mimeType: string): boolean {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = filename.slice(dot + 1).toLowerCase();
  if (ext === 'png') return mimeType === 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return mimeType === 'image/jpeg';
  if (ext === 'webp') return mimeType === 'image/webp';
  return false;
}

export function decodedBase64ByteCount(body: string): number {
  const pad = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return (body.length * 3) / 4 - pad;
}

export function isSafeScreenshotDataUrl(dataUrl: unknown, mimeType: string): boolean {
  if (typeof dataUrl !== 'string') return false;
  const prefix = mimeToDataPrefix(mimeType);
  if (!prefix) return false;
  if (!dataUrl.startsWith(prefix)) return false;
  const body = dataUrl.slice(prefix.length);
  if (body.length === 0 || body.length > MAX_BASE64_BODY_LENGTH) return false;
  if (body.length % 4 !== 0) return false;
  if (!BASE64_RE.test(body)) return false;
  return true;
}

export function isValidCaptureMeta(value: unknown): value is ScreenshotCaptureMeta {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isUuid(v.id)) return false;
  if (!isSafeFilename(v.filename)) return false;
  if (!isSupportedMimeType(v.mimeType)) return false;
  if (!filenameExtensionMatchesMime(v.filename as string, v.mimeType as string)) return false;
  if (!Number.isInteger(v.width) || !Number.isFinite(v.width as number) || (v.width as number) < 1) return false;
  if (!Number.isInteger(v.height) || !Number.isFinite(v.height as number) || (v.height as number) < 1) return false;
  if ((v.width as number) * (v.height as number) > MAX_PIXELS) return false;
  if (!Number.isInteger(v.bytes) || (v.bytes as number) < 1 || (v.bytes as number) > MAX_CAPTURE_BYTES) return false;
  if (typeof v.createdAt !== 'string' || v.createdAt.length < 1 || v.createdAt.length > 64) return false;
  if (Number.isNaN(Date.parse(v.createdAt))) return false;
  return true;
}

export function buildScreenshotsPath(sessionId: string): string {
  return `/sessions/${encodeURIComponent(sessionId)}/screenshots`;
}

export function buildCapturePath(sessionId: string, captureId: string): string {
  return `/sessions/${encodeURIComponent(sessionId)}/screenshots/${encodeURIComponent(captureId)}`;
}

function isAbortError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null) {
    const name = (err as { name?: unknown }).name;
    if (name === 'AbortError') return true;
  }
  return err instanceof DOMException && err.name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
}

/**
 * Owned loader behind the view: list (max 6, validated) then bounded
 * detail fetches with max 2 concurrent requests on the same signal.
 */
export async function fetchScreenshotResults(
  apiGet: ApiGetFn,
  sessionId: string,
  signal?: AbortSignal,
): Promise<{ items: ScreenshotItem[] }> {
  if (!sessionId) return { items: [] };
  throwIfAborted(signal);
  const listRaw = (await apiGet(buildScreenshotsPath(sessionId), undefined, { signal })) as {
    captures?: unknown;
  };
  throwIfAborted(signal);
  const rawCaptures = Array.isArray(listRaw?.captures) ? (listRaw.captures as unknown[]) : [];
  const metas = rawCaptures.slice(0, MAX_CAPTURES).filter(isValidCaptureMeta);
  if (metas.length === 0) return { items: [] };

  const results: ScreenshotItem[] = [];
  let cursor = 0;
  const workerCount = Math.min(2, metas.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < metas.length) {
      throwIfAborted(signal);
      const meta = metas[cursor];
      cursor += 1;
      const detail = (await apiGet(buildCapturePath(sessionId, meta.id), undefined, {
        signal,
      })) as { capture?: unknown; imageDataUrl?: unknown };
      throwIfAborted(signal);
      const capture = detail?.capture;
      const dataUrl = detail?.imageDataUrl;
      if (!isValidCaptureMeta(capture)) continue;
      const c = capture as ScreenshotCaptureMeta;
      if (c.id !== meta.id) continue;
      if (c.filename !== meta.filename) continue;
      if (c.mimeType !== meta.mimeType) continue;
      if (c.width !== meta.width) continue;
      if (c.height !== meta.height) continue;
      if (c.bytes !== meta.bytes) continue;
      if (c.createdAt !== meta.createdAt) continue;
      if (typeof dataUrl !== 'string') continue;
      if (!isSafeScreenshotDataUrl(dataUrl, c.mimeType)) continue;
      const prefix = mimeToDataPrefix(c.mimeType) as string;
      const body = (dataUrl as string).slice(prefix.length);
      if (decodedBase64ByteCount(body) !== c.bytes) continue;
      results.push({ meta: c, dataUrl });
    }
  });
  await Promise.all(workers);
  throwIfAborted(signal);
  results.sort((a, b) => +new Date(b.meta.createdAt) - +new Date(a.meta.createdAt));
  let decodedTotal = 0;
  const bounded: ScreenshotItem[] = [];
  for (const item of results.slice(0, MAX_CAPTURES)) {
    const bodyLen = item.dataUrl.split(',', 2)[1]?.length ?? 0;
    decodedTotal += Math.floor((bodyLen * 3) / 4);
    if (decodedTotal > MAX_DECODED_TOTAL_BYTES) break;
    bounded.push(item);
  }
  return { items: bounded };
}

interface ScreenshotResultsProps {
  sessionId?: string;
  refreshKey?: number;
}

export default function ScreenshotResults({ sessionId, refreshKey }: ScreenshotResultsProps) {
  const [ownerSid, setOwnerSid] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [items, setItems] = useState<ScreenshotItem[]>([]);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [downloadState, setDownloadState] = useState<{ sid: string; items: ScreenshotItem[]; urls: Record<string, string> } | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!sessionId) {
      setOwnerSid(null);
      setItems([]);
      setFailed({});
      setStatus('idle');
      return;
    }
    const sid = sessionId;
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    const controller = new AbortController();
    let disposed = false;
    const timeout = setTimeout(() => {
      if (!disposed && seqRef.current === seq) { controller.abort(); setStatus('error'); }
    }, 30000);
    setOwnerSid(sid);
    setStatus('loading');
    setItems([]);
    setFailed({});
    (async () => {
      try {
        const apiGet = api.get.bind(api) as unknown as ApiGetFn;
        const result = await fetchScreenshotResults(apiGet, sid, controller.signal);
        if (controller.signal.aborted || seqRef.current !== seq) return;
        setItems(result.items);
        clearTimeout(timeout);
        setStatus('ready');
      } catch (err) {
        if (controller.signal.aborted || seqRef.current !== seq) return;
        if (isAbortError(err)) return;
        clearTimeout(timeout);
        setStatus('error');
      }
    })();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [sessionId, refreshKey]);

  useEffect(() => {
    const urls: Record<string, string> = {};
    if (sessionId && ownerSid === sessionId && status === 'ready') {
      for (const item of items.slice(0, MAX_CAPTURES)) {
        if (failed[item.meta.id]) continue;
        const url = createRasterBlobUrl(item.dataUrl, item.meta.mimeType);
        if (url) urls[item.meta.id] = url;
      }
      setDownloadState({ sid: sessionId, items, urls });
    } else {
      setDownloadState(null);
    }
    return () => { for (const url of Object.values(urls)) revokeRasterBlobUrl(url); };
  }, [sessionId, ownerSid, status, items, failed]);

  if (!sessionId) return null;
  if (ownerSid !== null && ownerSid !== sessionId) return null;
  if (status === 'loading') {
    return (
      <div role="status" aria-live="polite">
        Loading screenshots…
      </div>
    );
  }
  if (status === 'error') {
    return <div role="status">Screenshots unavailable.</div>;
  }
  if (status !== 'ready') return null;
  if (items.length === 0) return null;

  const markFailed = (id: string) => {
    setFailed((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  return (
    <section aria-label="Screenshots" style={{ marginTop: 12 }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((item) => (
          <li key={item.meta.id} style={{ marginBottom: 12 }}>
            <figure style={{ margin: 0 }}>
              {failed[item.meta.id] ? (
                <div role="img" aria-label={`${item.meta.filename} – image unavailable`}>
                  Image unavailable
                </div>
              ) : (
                <img
                  src={item.dataUrl}
                  alt={item.meta.filename}
                  style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
                  onError={() => markFailed(item.meta.id)}
                />
              )}
              <figcaption>
                {item.meta.filename} · {item.meta.width}×{item.meta.height}
              </figcaption>
            </figure>
            {downloadState?.sid === sessionId && downloadState.items === items && downloadState.urls[item.meta.id] && !failed[item.meta.id] ? (
              <a href={downloadState.urls[item.meta.id]} download={item.meta.filename}>
                Download {item.meta.filename}
              </a>
            ) : (
              <span role="status">Export unavailable.</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
