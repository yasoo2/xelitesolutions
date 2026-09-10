export type BrowserViewportStamp = {
  viewportWidth?: number;
  viewportHeight?: number;
};

/** Preserve older browser events by stamping them with the current frame. */
export function viewportStampOrFallback(
  stamp: BrowserViewportStamp,
  fallbackWidth: number,
  fallbackHeight: number,
): Required<BrowserViewportStamp> {
  const width = Number(stamp.viewportWidth);
  const height = Number(stamp.viewportHeight);
  return {
    viewportWidth: Number.isFinite(width) && width > 0 ? width : fallbackWidth,
    viewportHeight: Number.isFinite(height) && height > 0 ? height : fallbackHeight,
  };
}

/** Only paint coordinates on the viewport that produced them. */
export function projectionMatchesFrame(
  frameWidth: number,
  frameHeight: number,
  stamp: BrowserViewportStamp,
): boolean {
  const sourceWidth = Number(stamp.viewportWidth);
  const sourceHeight = Number(stamp.viewportHeight);
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)) return false;
  if (sourceWidth <= 0 || sourceHeight <= 0) return false;
  return Math.round(frameWidth) === Math.round(sourceWidth)
    && Math.round(frameHeight) === Math.round(sourceHeight);
}
