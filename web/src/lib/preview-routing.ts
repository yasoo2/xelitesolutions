export interface PreviewReadyEvent {
    type?: string;
    data?: {
        url?: unknown;
        previewUrl?: unknown;
        partial?: unknown;
    };
}

/**
 * A preview becomes the active workspace only when it is a complete, internal
 * preview. Partial events still update the URL in Joe.tsx, but must not steal
 * the Logs tab while the build is streaming.
 */
export function shouldOpenPreviewOnReady(event: PreviewReadyEvent): boolean {
    if (event?.type !== 'preview_ready') return false;
    const url = typeof event.data?.url === 'string'
        ? event.data.url
        : typeof event.data?.previewUrl === 'string'
            ? event.data.previewUrl
            : '';
    if (!url) return false;
    const isInternal = url.includes('localhost')
        || url.includes('127.0.0.1')
        || url.includes('xelitesolutions.com/preview/')
        || url.includes('http://api:');
    return isInternal && event.data?.partial !== true;
}
