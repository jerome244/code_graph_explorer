'use client';

import React, { useState } from 'react';
import JSZip from 'jszip';
import { basename, dirname, extOf, humanBytes, normPath } from '../lib/utils';
import type { ParsedFile } from '../lib/types';

export function ZipDrop({ onLoaded }: { onLoaded: (files: ParsedFile[]) => void }) {
  const [status, setStatus] = useState('Drop a .zip to begin');

  async function handleZip(file: File) {
    setStatus('Reading ZIP…');
    try {
      const zip = await JSZip.loadAsync(file);
      const next: ParsedFile[] = [];
      const entries = Object.values(zip.files).filter(e => !e.dir);
      const textEntries = entries.filter(e => !!extOf(e.name));

      for (const e of textEntries) {
        const p = normPath(e.name);
        const ext = extOf(p)!;
        const content = await zip.file(e.name)!.async('string');
        next.push({
          path: p,
          name: basename(p),
          dir: dirname(p),
          ext,
          content,
          size: new Blob([content]).size,
        });
      }

      setStatus(`Loaded ${next.length} file(s) · ${humanBytes(next.reduce((s,f)=>s+f.size,0))}`);
      onLoaded(next);
    } catch (err) {
      console.error(err);
      setStatus('Failed to read ZIP (is it valid?)');
    }
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleZip(f);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleZip(f);
  }
  function onDragOver(e: React.DragEvent) { e.preventDefault(); }

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      style={{
        border: '2px dashed #CBD5E1',
        borderRadius: 12,
        padding: 16,
        background: '#F8FAFC',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Upload ZIP</div>
        <div style={{ color: '#475569', fontSize: 13 }}>{status}</div>
      </div>
      <label
        style={{
          padding: '8px 12px',
          border: '1px solid #94A3B8',
          borderRadius: 8,
          cursor: 'pointer',
          background: '#fff',
        }}
      >
        Choose file
        <input type="file" accept=".zip" onChange={onFileInput} style={{ display: 'none' }} />
      </label>
    </div>
  );
}
