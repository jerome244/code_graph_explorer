// frontend/app/profile/AvatarPicker.tsx
"use client";
import { useRef, useState } from "react";

type Props = { name?: string };

export default function AvatarPicker({ name = "avatar" }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        name={name}
        onChange={(e) => {
          const file = e.target.files?.[0];
          setFilename(file?.name || "");
          if (file) setPreview(URL.createObjectURL(file));
          else setPreview(null);
        }}
        style={{ display: "none" }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", fontWeight: 600, cursor: "pointer" }}
        >
          Choose image…
        </button>
        {filename && <span style={{ color: "#6b7280" }}>{filename}</span>}
      </div>

      {preview && (
        <div
          style={{
            marginTop: 12,
            width: 120,
            height: 120,
            borderRadius: "50%",
            overflow: "hidden",
            border: "1px solid #e5e7eb",
            background: "#f3f4f6",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview" width={120} height={120} />
        </div>
      )}
    </div>
  );
}
