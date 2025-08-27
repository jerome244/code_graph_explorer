"use client";
import { useRef, useState } from "react";

type Props = {
  onResult: (data: { nodes: any[]; edges: any[]; tree: any }) => void;
};

export default function UploadDropzone({ onResult }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>("Drop a .zip or choose a file");

  async function handleFile(file: File) {
    if (!file || !file.name.toLowerCase().endsWith(".zip")) {
      setStatus("Please provide a .zip file");
      return;
    }
    setStatus("Uploading…");
    const form = new FormData();
    form.append("file", file);

    const r = await fetch("/api/graph/upload", {
      method: "POST",
      body: form, // let browser set multipart boundary
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      setStatus(typeof data?.error === "string" ? data.error : "Failed to parse zip");
      return;
    }
    setStatus(`Parsed ${data.nodes?.length ?? 0} files ✅`);
    onResult(data);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  return (
    <div
      className="card dropzone"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="dz-left">
        <p className="dz-title">Upload project .zip</p>
        <p className="dz-sub">{status}</p>
      </div>
      <div className="dz-actions">
        <button
          className="btn"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          Choose file
        </button>
        {/* hide the native input properly */}
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          style={{ display: "none" }}
          onChange={(e) => e.target.files && handleFile(e.target.files[0])}
        />
      </div>
    </div>
  );
}
