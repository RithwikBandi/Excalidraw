import { describe, expect, it } from "vitest";

import {
  clampOffset,
  clampZoom,
  coverScale,
  MAX_ZOOM,
  sourceRect,
} from "./cropMath";

describe("cropMath", () => {
  it("covers the viewport using the smaller image side", () => {
    expect(coverScale(200, 100, 100)).toBe(1);
    expect(coverScale(100, 400, 100)).toBe(1);
    expect(coverScale(50, 50, 100)).toBe(2);
  });

  it("shows the whole image for a centred square at zoom 1", () => {
    expect(sourceRect(100, 100, 100, 1, 0, 0)).toEqual({
      sx: 0,
      sy: 0,
      sw: 100,
      sh: 100,
    });
  });

  it("maps a pan of a wide image to the matching source region", () => {
    // 200×100 image in a 100 box: panning fully left shows the right half
    expect(sourceRect(200, 100, 100, 1, -50, 0)).toEqual({
      sx: 100,
      sy: 0,
      sw: 100,
      sh: 100,
    });
  });

  it("zooming in shrinks the visible source region", () => {
    const r = sourceRect(100, 100, 100, 2, 0, 0);
    expect(r.sw).toBe(50);
    expect(r.sx).toBe(25);
  });

  it("never lets the image leave the viewport", () => {
    // square image at zoom 1 has no slack at all
    expect(clampOffset(100, 100, 100, 1, 40, -40)).toEqual({ x: 0, y: 0 });
    // at zoom 2 there are 50px of slack each way
    expect(clampOffset(100, 100, 100, 2, 999, -999)).toEqual({
      x: 50,
      y: -50,
    });
  });

  it("clamps zoom into range", () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
  });
});
