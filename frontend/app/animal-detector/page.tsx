"use client";

import { useEffect, useRef, useState } from "react";

type Detection = {
  class: string;
  score: number;
  bbox: [number, number, number, number]; // [x, y, w, h] in natural px
};

const ANIMAL_CLASSES = new Set([
  // remove "person" if you only want animals
  "person",
  "cat",
  "dog",
  "bird",
  "horse",
  "sheep",
  "cow",
  "elephant",
  "bear",
  "zebra",
  "giraffe",
]);

export default function AnimalDetectorPage() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loadingModel, setLoadingModel] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [preds, setPreds] = useState<Detection[]>([]);

  // Off-DOM image for detection/drawing
  const imgMemRef = useRef<HTMLImageElement | null>(null);
  // Only visible element
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modelRef = useRef<any>(null);

  // Load model (client-only)
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const tf = await import("@tensorflow/tfjs");
        try { /* @ts-ignore */ await tf.setBackend("webgpu"); } catch {}
        if (tf.getBackend() !== "webgpu") {
          try { await tf.setBackend("webgl"); } catch {}
        }
        await tf.ready();

        const coco = await import("@tensorflow-models/coco-ssd");
        const model = await coco.load({ base: "lite_mobilenet_v2" });
        if (!cancel) {
          modelRef.current = model;
          setLoadingModel(false);
        } else {
          model.dispose?.();
        }
      } catch (e) {
        console.error("Failed to load model", e);
        if (!cancel) setLoadingModel(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  // Load an image off-DOM into memory
  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      // No need for crossOrigin with blob: URLs, but harmless for others
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  const onFile = async (file: File) => {
    const url = URL.createObjectURL(file);
    // Revoke old URL
    setFileUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setPreds([]);

    // Preload off-DOM image then draw it immediately
    try {
      const img = await loadImage(url);
      imgMemRef.current = img;
      drawBaseImage();
    } catch (e) {
      console.error("Image load failed", e);
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
  };

  /** Draw just the base image to the visible canvas. */
  const drawBaseImage = () => {
    const img = imgMemRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Canvas buffer = natural size; CSS scales it for layout
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };

  const runDetect = async () => {
    if (!modelRef.current || !imgMemRef.current || !canvasRef.current) return;
    setDetecting(true);
    try {
      const model = modelRef.current;
      const img = imgMemRef.current; // off-DOM image
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Redraw base image first (ensures clean overlay)
      drawBaseImage();

      // Detect — bboxes are in natural px, matching our canvas buffer
      const results = await model.detect(img);
      const filtered: Detection[] = results
        .filter((r: any) => ANIMAL_CLASSES.has(r.class))
        .map((r: any) => ({ class: r.class, score: r.score, bbox: r.bbox }));

      // Draw boxes + labels
      ctx.lineWidth = 3;
      ctx.font =
        "18px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
      ctx.textBaseline = "top";

      filtered.forEach((det) => {
        const [x, y, w, h] = det.bbox;

        // Box
        ctx.strokeStyle = "#22c55e";
        ctx.strokeRect(x, y, w, h);

        // Label bg + text (kept inside)
        const label = `${det.class} ${(det.score * 100).toFixed(0)}%`;
        const padX = 6;
        const padY = 3;
        const tw = ctx.measureText(label).width;
        const lw = tw + padX * 2;
        const lh = 22;
        const ly = Math.max(0, y - lh);

        ctx.fillStyle = "rgba(34,197,94,0.85)";
        ctx.fillRect(x, ly, lw, lh);

        ctx.fillStyle = "#fff";
        ctx.fillText(label, x + padX, ly + padY);
      });

      setPreds(filtered);
    } finally {
      setDetecting(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Animal Detector (on-device)</h1>
      <p className="text-sm text-neutral-600">
        Upload an image and I’ll highlight detected animals using a lightweight COCO-SSD model running in your browser.
      </p>

      <div className="flex items-center gap-3">
        <label className="inline-flex cursor-pointer items-center rounded-lg border px-4 py-2 hover:bg-neutral-50">
          <input type="file" accept="image/*" onChange={onChange} className="hidden" />
          <span>Choose image</span>
        </label>

        <button
          disabled={!fileUrl || loadingModel || detecting}
          onClick={runDetect}
          className="rounded-lg border px-4 py-2 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingModel ? "Loading model…" : detecting ? "Detecting…" : "Detect animals"}
        </button>
      </div>

      {/* Single visible element: the CANVAS (image drawn into it) */}
      <div className="rounded-lg border p-3">
        {!fileUrl ? (
          <div className="p-8 text-center text-neutral-500">No image selected</div>
        ) : (
          <div className="w-full flex justify-center">
            <canvas
              ref={canvasRef}
              // Responsive, centered, and constrained
              style={{
                display: "block",
                width: "min(100%, 900px)", // cap width
                height: "auto",
                maxHeight: "60vh",         // cap on-screen height
                margin: "0 auto",          // center
              }}
            />
          </div>
        )}
      </div>

      {!!preds.length && (
        <div className="rounded-lg border p-4">
          <h2 className="mb-2 font-medium">Detections</h2>
          <ul className="space-y-1 text-sm">
            {preds.map((p, i) => (
              <li key={i}>
                {p.class} — {(p.score * 100).toFixed(1)}%
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
