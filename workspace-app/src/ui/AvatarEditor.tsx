import { useEffect, useRef, useState } from "react";

import { Modal } from "../components/Modal";

import {
  clampOffset,
  clampZoom,
  coverScale,
  MAX_ZOOM,
  MIN_ZOOM,
  sourceRect,
} from "./cropMath";

import type { KeyboardEvent, PointerEvent } from "react";

const BOX = 280; // on-screen crop viewport (px)
const OUT = 256; // saved image size (px)

export const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/**
 * "Adjust photo" dialog: drag to reposition, slider / wheel / pinch-free
 * zoom, then export a square 256px image (so uploads are tiny and fast).
 */
export const AvatarEditor = ({
  file,
  onCancel,
  onSave,
}: {
  file: File;
  onCancel: () => void;
  onSave: (blob: Blob) => Promise<void>;
}) => {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{
    px: number;
    py: number;
    ox: number;
    oy: number;
  } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () =>
      setError("That file couldn't be read as an image. Try a JPG or PNG.");
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const dims = img && { w: img.naturalWidth, h: img.naturalHeight };

  const moveTo = (z: number, x: number, y: number) => {
    if (!dims) {
      return;
    }
    const nz = clampZoom(z);
    setZoom(nz);
    setOff(clampOffset(dims.w, dims.h, BOX, nz, x, y));
  };

  // wheel zoom needs a non-passive listener so the dialog doesn't scroll
  useEffect(() => {
    const el = viewport.current;
    if (!el) {
      return;
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.06 : 1 / 1.06)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [img]);

  // zoom changes (slider / wheel) must re-clamp the pan
  useEffect(() => {
    if (dims) {
      setOff((o) => clampOffset(dims.w, dims.h, BOX, zoom, o.x, o.y));
    }
  }, [zoom, dims?.w, dims?.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: off.x, oy: off.y };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) {
      moveTo(zoom, d.ox + e.clientX - d.px, d.oy + e.clientY - d.py);
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = e.shiftKey ? 24 : 8;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [s, 0],
      ArrowRight: [-s, 0],
      ArrowUp: [0, s],
      ArrowDown: [0, -s],
    };
    const v = d[e.key];
    if (v) {
      e.preventDefault();
      moveTo(zoom, off.x + v[0], off.y + v[1]);
    }
  };

  const save = async () => {
    if (!img || !dims) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      const r = sourceRect(dims.w, dims.h, BOX, zoom, off.x, off.y);
      ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, OUT, OUT);
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/webp", 0.92),
      );
      if (!blob) {
        throw new Error("encode failed");
      }
      await onSave(blob);
    } catch (e: any) {
      setError(e?.message || "Couldn't save the photo. Please try again.");
      setBusy(false);
    }
  };

  const s = dims ? coverScale(dims.w, dims.h, BOX) * zoom : 1;

  return (
    <Modal title="Adjust photo" onClose={onCancel}>
      <div className="avatar-editor">
        {error && !img ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : (
          <>
            <div
              ref={viewport}
              className="avatar-editor__view"
              style={{ width: BOX, height: BOX }}
              tabIndex={0}
              role="group"
              aria-label="Photo position. Drag, or use the arrow keys, to move."
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={onKeyDown}
            >
              {img && dims ? (
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  style={{
                    width: dims.w * s,
                    height: dims.h * s,
                    left: BOX / 2 + off.x - (dims.w * s) / 2,
                    top: BOX / 2 + off.y - (dims.h * s) / 2,
                  }}
                />
              ) : (
                <div className="avatar-editor__loading">Loading…</div>
              )}
              <div className="avatar-editor__mask" aria-hidden="true" />
            </div>
            <label className="avatar-editor__zoom">
              <span>Zoom</span>
              <input
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(clampZoom(Number(e.target.value)))}
                aria-label="Zoom"
              />
            </label>
          </>
        )}
        {error && img && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!img || busy}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save photo"}
          </button>
        </div>
      </div>
    </Modal>
  );
};
