/**
 * Geometry for the square profile-photo cropper. The image is "cover"-fitted
 * into a `box`×`box` viewport, scaled by `zoom` (≥ 1) and panned by (ox, oy)
 * viewport pixels from centred.
 */
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export const clampZoom = (z: number) => clamp(z, MIN_ZOOM, MAX_ZOOM);

/** Scale at which the image exactly covers the viewport. */
export const coverScale = (imgW: number, imgH: number, box: number) =>
  Math.max(box / imgW, box / imgH);

export const clampOffset = (
  imgW: number,
  imgH: number,
  box: number,
  zoom: number,
  ox: number,
  oy: number,
) => {
  const s = coverScale(imgW, imgH, box) * zoom;
  const maxX = Math.max(0, (imgW * s - box) / 2);
  const maxY = Math.max(0, (imgH * s - box) / 2);
  // `+ 0` turns -0 into 0 when there is no slack
  return { x: clamp(ox, -maxX, maxX) + 0, y: clamp(oy, -maxY, maxY) + 0 };
};

/** The region of the source image that is visible in the viewport. */
export const sourceRect = (
  imgW: number,
  imgH: number,
  box: number,
  zoom: number,
  ox: number,
  oy: number,
) => {
  const s = coverScale(imgW, imgH, box) * zoom;
  const sw = box / s;
  const sh = box / s;
  const cx = imgW / 2 - ox / s;
  const cy = imgH / 2 - oy / s;
  return { sx: cx - sw / 2, sy: cy - sh / 2, sw, sh };
};
