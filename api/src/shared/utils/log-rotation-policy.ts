/** Retain verification artifacts; application logging defaults remain unchanged. */
export function logRotationPolicy(mode: string | undefined): {
    zippedArchive: boolean;
    maxFiles: '14d' | undefined;
} {
    return mode === 'test'
        ? { zippedArchive: false, maxFiles: undefined }
        : { zippedArchive: true, maxFiles: '14d' };
}
