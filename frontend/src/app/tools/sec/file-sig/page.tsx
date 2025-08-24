'use client';

import React, { useMemo, useState } from 'react';

/* ---------------- UI bits ---------------- */
type Level = 'low' | 'medium' | 'high';
const COLORS: Record<Level, string> = { low: '#2563eb', medium: '#f59e0b', high: '#ef4444' };
const mono: React.CSSProperties = { fontFamily: 'ui-monospace, Menlo, monospace' };
const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' };
const badge = (lvl: Level) => ({
  display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 12,
  background: COLORS[lvl] + '22', color: COLORS[lvl], border: '1px solid ' + COLORS[lvl] + '55'
});
const btn: React.CSSProperties = { border: '1px solid #e5e7eb', background: '#fff', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' };

/* --------------- helpers ---------------- */
function toHex(bytes: Uint8Array, n = 16) {
  const arr = Array.from(bytes.slice(0, n)).map(b => b.toString(16).padStart(2, '0').toUpperCase());
  return arr.join(' ');
}
function bytesEq(b: Uint8Array, sig: number[], offset = 0) {
  for (let i = 0; i < sig.length; i++) if (b[offset + i] !== sig[i]) return false;
  return true;
}
function findAscii(buf: Uint8Array, s: string) {
  const pat = new TextEncoder().encode(s);
  outer: for (let i = 0; i + pat.length <= buf.length; i++) {
    for (let j = 0; j < pat.length; j++) if (buf[i + j] !== pat[j]) continue outer;
    return i;
  }
  return -1;
}
function extOf(name: string) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}
async function sha256Hex(ab: ArrayBuffer) {
  const dig = await crypto.subtle.digest('SHA-256', ab);
  return Array.from(new Uint8Array(dig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* -------------- detection core -------------- */
type Detection = {
  type: string;
  mime?: string;
  level: Level;
  hints: string[];
  container?: string; // e.g. ZIP container details
};

function detectFile(bytes: Uint8Array): Detection {
  const b = bytes;
  const len = b.length;

  // Common signatures
  if (len >= 4 && bytesEq(b, [0x25,0x50,0x44,0x46])) return { type: 'PDF', mime: 'application/pdf', level: 'medium', hints: ['PDFs can contain scripts/embeds. Open with caution.'] };
  if (len >= 8 && bytesEq(b, [0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A])) return { type: 'PNG', mime: 'image/png', level: 'low', hints: [] };
  if (len >= 3 && bytesEq(b, [0xFF,0xD8,0xFF])) return { type: 'JPEG', mime: 'image/jpeg', level: 'low', hints: [] };
  if (len >= 6 && (bytesEq(b, [0x47,0x49,0x46,0x38,0x37,0x61]) || bytesEq(b, [0x47,0x49,0x46,0x38,0x39,0x61])))
    return { type: 'GIF', mime: 'image/gif', level: 'low', hints: [] };
  if (len >= 12 && bytesEq(b, [0x52,0x49,0x46,0x46]) && bytesEq(b, [0x57,0x45,0x42,0x50], 8))
    return { type: 'WebP (RIFF)', mime: 'image/webp', level: 'low', hints: [] };
  if (len >= 12 && bytesEq(b, [0x52,0x49,0x46,0x46]) && bytesEq(b, [0x57,0x41,0x56,0x45], 8))
    return { type: 'WAV (RIFF)', mime: 'audio/wav', level: 'low', hints: [] };
  if (len >= 12 && bytesEq(b, [0x52,0x49,0x46,0x46]) && bytesEq(b, [0x41,0x56,0x49,0x20], 8))
    return { type: 'AVI (RIFF)', mime: 'video/x-msvideo', level: 'low', hints: [] };
  if (len >= 3 && bytesEq(b, [0x49,0x44,0x33])) return { type: 'MP3 (ID3)', mime: 'audio/mpeg', level: 'low', hints: [] };
  if (len >= 2 && bytesEq(b, [0x1F,0x8B])) return { type: 'GZIP', mime: 'application/gzip', level: 'low', hints: ['Compressed archive.'] };
  if (len >= 3 && bytesEq(b, [0x42,0x5A,0x68])) return { type: 'BZIP2', mime: 'application/x-bzip2', level: 'low', hints: ['Compressed archive.'] };
  if (len >= 6 && bytesEq(b, [0x37,0x7A,0xBC,0xAF,0x27,0x1C])) return { type: '7-Zip', mime: 'application/x-7z-compressed', level: 'medium', hints: ['Archive can hide executables.'] };
  if (len >= 7 && bytesEq(b, [0x52,0x61,0x72,0x21,0x1A,0x07,0x00])) return { type: 'RAR v4', mime: 'application/x-rar-compressed', level: 'medium', hints: ['Archive can hide executables.'] };
  if (len >= 8 && bytesEq(b, [0x52,0x61,0x72,0x21,0x1A,0x07,0x01,0x00])) return { type: 'RAR v5', mime: 'application/x-rar-compressed', level: 'medium', hints: ['Archive can hide executables.'] };
  if (len >= 4 && bytesEq(b, [0x50,0x4B,0x03,0x04])) {
    // ZIP container; try to guess OOXML/JAR/APK by scanning names
    const text = new TextDecoder().decode(b);
    if (findAscii(b, 'AndroidManifest.xml') >= 0) return { type: 'APK (Android App Package — ZIP)', mime: 'application/vnd.android.package-archive', level: 'high', hints: ['Android app package. Sideloading can be dangerous.'], container: 'ZIP' };
    if (findAscii(b, 'META-INF/MANIFEST.MF') >= 0) return { type: 'JAR (Java archive — ZIP)', mime: 'application/java-archive', level: 'high', hints: ['May contain executable bytecode.'], container: 'ZIP' };
    if (findAscii(b, 'word/') >= 0 || findAscii(b, '[Content_Types].xml') >= 0) return { type: 'OOXML Document (DOCX?) — ZIP', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', level: 'medium', hints: ['Modern Office doc. Can be macro-enabled if .docm.'], container: 'ZIP' };
    if (findAscii(b, 'xl/') >= 0) return { type: 'OOXML Spreadsheet (XLSX?) — ZIP', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', level: 'medium', hints: ['Modern Office sheet. Can be macro-enabled if .xlsm.'], container: 'ZIP' };
    if (findAscii(b, 'ppt/') >= 0) return { type: 'OOXML Presentation (PPTX?) — ZIP', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', level: 'medium', hints: ['Modern Office presentation. Can be macro-enabled if .pptm.'], container: 'ZIP' };
    if (findAscii(b, 'mimetypeapplication/epub+zip') >= 0 || findAscii(b, 'mimetypeapplication/epub') >= 0) return { type: 'EPUB (ZIP)', mime: 'application/epub+zip', level: 'low', hints: [], container: 'ZIP' };
    return { type: 'ZIP archive', mime: 'application/zip', level: 'medium', hints: ['Archive can hide executables.'] };
  }
  if (len >= 4 && bytesEq(b, [0x7F,0x45,0x4C,0x46])) return { type: 'ELF (Unix executable)', mime: 'application/x-elf', level: 'high', hints: ['Native executable.'] };
  if (len >= 2 && bytesEq(b, [0x4D,0x5A])) return { type: 'PE (Windows EXE/DLL — MZ)', mime: 'application/x-dosexec', level: 'high', hints: ['Windows executable.'] };
  if (len >= 4 && (bytesEq(b, [0xFE,0xED,0xFA,0xCE]) || bytesEq(b, [0xFE,0xED,0xFA,0xCF]) || bytesEq(b, [0xCA,0xFE,0xBA,0xBE]) || bytesEq(b, [0xCF,0xFA,0xED,0xFE])))
    return { type: 'Mach-O (macOS executable)', mime: 'application/x-mach-binary', level: 'high', hints: ['macOS executable.'] };
  // MP4/QuickTime: look for 'ftyp' box near start (offset 4)
  for (let off = 0; off < Math.min(64, len - 8); off++) {
    if (b[off+4]===0x66 && b[off+5]===0x74 && b[off+6]===0x79 && b[off+7]===0x70) {
      return { type: 'MP4/QuickTime (ftyp)', mime: 'video/mp4', level: 'low', hints: [] };
    }
  }
  // OLE Compound (old Office: doc/xls/ppt)
  if (len >= 8 && bytesEq(b, [0xD0,0xCF,0x11,0xE0,0xA1,0xB1,0x1A,0xE1]))
    return { type: 'OLE Compound File (old Office: .doc/.xls/.ppt)', mime: 'application/vnd.ms-office', level: 'high', hints: ['Legacy Office format; can carry macros.'] };

  // TAR has "ustar" at offset 257
  if (len >= 262 && bytesEq(b, [0x75,0x73,0x74,0x61,0x72], 257)) return { type: 'TAR archive', mime: 'application/x-tar', level: 'low', hints: ['Archive.'] };

  // As a last hint, plain text?
  const textish = (() => {
    let non = 0;
    for (let i = 0; i < Math.min(512, len); i++) {
      const c = b[i];
      if (c === 0) { non++; continue; }
      if (c < 9 || (c > 13 && c < 32)) non++;
    }
    return non < 8;
  })();
  if (textish) return { type: 'Plain text (heuristic)', mime: 'text/plain', level: 'low', hints: [] };

  return { type: 'Unknown', level: 'medium', hints: ['Unrecognized signature. Treat with caution.'] };
}

/* ----------- page component ----------- */
type Result = {
  file: File;
  hex16: string;
  sha256?: string;
  detection: Detection;
  ext: string;
  mismatch: boolean;
  tips: string[];
};

export default function FileSigDetector() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);

  const onPick = async (fList: FileList | null) => {
    if (!fList) return;
    const arr = Array.from(fList).slice(0, 32); // cap
    setFiles(arr);
    setBusy(true);
    const out: Result[] = [];
    for (const file of arr) {
      const ab = await file.arrayBuffer();
      const bytes = new Uint8Array(ab);
      const det = detectFile(bytes);
      const hex16 = toHex(bytes, 16);
      const ext = extOf(file.name);
      const sha = await sha256Hex(ab);

      // simple extension expectations
      const expectedByExt: Record<string, string> = {
        pdf:'PDF', png:'PNG', jpg:'JPEG', jpeg:'JPEG', gif:'GIF', webp:'WebP (RIFF)',
        zip:'ZIP archive', rar:'RAR v4', '7z':'7-Zip', mp4:'MP4/QuickTime (ftyp)', mov:'MP4/QuickTime (ftyp)',
        doc:'OLE Compound File (old Office: .doc/.xls/.ppt)', xls:'OLE Compound File (old Office: .doc/.xls/.ppt)', ppt:'OLE Compound File (old Office: .doc/.xls/.ppt)',
        docx:'OOXML Document (DOCX?) — ZIP', xlsx:'OOXML Spreadsheet (XLSX?) — ZIP', pptx:'OOXML Presentation (PPTX?) — ZIP',
        apk:'APK (Android App Package — ZIP)', jar:'JAR (Java archive — ZIP)', exe:'PE (Windows EXE/DLL — MZ)', dll:'PE (Windows EXE/DLL — MZ)',
        gz:'GZIP', tar:'TAR archive', wav:'WAV (RIFF)', avi:'AVI (RIFF)', mp3:'MP3 (ID3)'
      };
      const expected = expectedByExt[ext];
      const mismatch = expected ? !det.type.startsWith(expected.split(' ')[0]) : false;

      const tips: string[] = [];
      if (mismatch) tips.push(`Extension ".${ext}" doesn’t match detected type "${det.type}".`);
      if (det.level === 'high') tips.push('Treat as potentially dangerous. Do not run open without scanning.');
      if (det.type.includes('OOXML') && ['docx','xlsx','pptx','docm','xlsm','pptm'].includes(ext))
        tips.push('Macro-enabled variants (.docm/.xlsm/.pptm) can execute code.');
      if (det.type === 'ZIP archive') tips.push('Archives can hide executable files inside.');
      if (ext === 'zip' && det.type !== 'ZIP archive') tips.push('A fake .zip that isn’t ZIP can be malicious.');
      if (det.type === 'PDF') tips.push('Prefer opening PDFs in a viewer with protection mode.');

      out.push({ file, hex16, sha256: sha, detection: det, ext, mismatch, tips });
    }
    setResults(out);
    setBusy(false);
  };

  // drag & drop
  const [over, setOver] = useState(false);
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setOver(false); onPick(e.dataTransfer.files); };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>File Signature (Magic Bytes) Detector</h1>
      <p style={{ margin: 0, color: '#555' }}>
        Check what a file <b>really</b> is by its bytes (no upload). Great for catching <code style={mono}>invoice.pdf.exe</code> tricks.
      </p>

      <div
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${over ? '#2563eb' : '#cbd5e1'}`,
          background: over ? '#eff6ff' : '#f8fafc',
          padding: 24, borderRadius: 12
        }}
      >
        <div style={{ marginBottom: 8, fontWeight: 600 }}>Drop files here or pick them</div>
        <input type="file" multiple onChange={e => onPick(e.target.files)} />
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
          We read locally in your browser; nothing is uploaded.
        </div>
      </div>

      {busy && <div>Analyzing…</div>}

      {results.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {results.map((r, i) => (
            <div key={i} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontWeight: 700 }}>
                  {r.file.name} <span style={{ color: '#6b7280', fontWeight: 400 }}>({(r.file.size/1024).toFixed(1)} KB)</span>
                </div>
                <span style={badge(r.detection.level)}>{r.detection.level.toUpperCase()} risk</span>
              </div>

              <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                <Row name="Detected type">{r.detection.type}{r.detection.container ? ` · container: ${r.detection.container}` : ''}</Row>
                <Row name="MIME">{r.detection.mime || '—'}</Row>
                <Row name="Extension">{r.ext || '(none)'}</Row>
                <Row name="Magic (first 16 bytes)"><code style={mono}>{r.hex16}</code></Row>
                <Row name="SHA-256"><code style={{...mono, wordBreak:'break-all'}}>{r.sha256}</code></Row>
                {r.detection.hints.length > 0 && (
                  <Row name="Notes">
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {r.detection.hints.map((h, k) => <li key={k}>{h}</li>)}
                    </ul>
                  </Row>
                )}
                {(r.mismatch || r.tips.length > 0) && (
                  <Row name="Findings">
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {r.mismatch && <li style={{ color: COLORS.high }}>Extension mismatch — likely deceptive.</li>}
                      {r.tips.map((t, k) => <li key={k} style={{ color: t.includes('dangerous') || t.includes('fake') ? COLORS.high : COLORS.medium }}>{t}</li>)}
                    </ul>
                  </Row>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: '#6b7280' }}>
        Tip: When unsure, upload to a sandbox/AV service from a non-production machine. Never run unknown executables.
      </div>
    </div>
  );
}

function Row({ name, children }: { name: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <div style={{ width: 180, fontSize: 12, color: '#6b7280' }}>{name}</div>
      <div>{children ?? '—'}</div>
    </div>
  );
}
