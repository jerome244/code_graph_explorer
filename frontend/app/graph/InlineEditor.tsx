import React, { useEffect, useMemo, useRef } from "react";
import { highlightWithFunctions, htmlEscape } from "./utils"; // Import utility functions

export interface EditorError {
  line: number;
  col?: number;
  message: string;
}

interface InlineEditorProps {
  path: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  funcIndex: any;
  colorize: boolean;
  error?: EditorError | null; // ✅ new optional prop for inline error highlight
}

export default function InlineEditor({
  path,
  value,
  onChange,
  onBlur,
  funcIndex,
  colorize,
  error,
}: InlineEditorProps) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);

  // Generate highlighted HTML, and overlay an error line if provided
  const html = useMemo(() => {
    let base = colorize
      ? highlightWithFunctions(path, value, funcIndex)
      : htmlEscape(value);

    if (error && Number.isFinite(error.line)) {
      const lines = base.split("\n");
      const idx = Math.min(
        Math.max(0, (error.line || 1) - 1),
        lines.length - 1
      );
      const msg = htmlEscape(error.message || "Error");
      // add a small red badge and red background for the failing line
      lines[idx] =
        `<span class="__errbadge" title="${msg}">●</span>` +
        `<span class="__errline" title="${msg}">` +
        lines[idx] +
        `</span>`;
      base = lines.join("\n");
    }
    return base;
  }, [colorize, path, value, funcIndex, error]);

  // Sync scroll position between textarea and pre
  const onScroll = () => {
    const ta = taRef.current;
    const pre = preRef.current;
    if (ta && pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
  };

  // Keep pre element height in sync with textarea
  useEffect(() => {
    const ta = taRef.current;
    const pre = preRef.current;
    if (!ta || !pre) return;
    const sync = () => {
      pre.style.height = `${ta.clientHeight}px`;
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(ta);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      data-popup-path={path}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <pre
        ref={preRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          margin: 0,
          padding: 8,
          overflow: "auto",
          whiteSpace: "pre",
          pointerEvents: "none",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 11,
          lineHeight: 1.35,
          visibility: colorize ? "visible" : "hidden",
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <textarea
        ref={taRef}
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onScroll={onScroll}
        style={{
          position: "absolute",
          inset: 0,
          padding: 8,
          border: 0,
          outline: "none",
          resize: "none",
          background: "transparent",
          color: colorize ? "transparent" : "#111827",
          caretColor: "#111827",
          whiteSpace: "pre",
          overflow: "auto",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 11,
          lineHeight: 1.35,
        }}
      />
      {/* local styles for error line */}
      <style jsx>{`
        .__errline {
          background: #fee2e2; /* red-100 */
          outline: 1px solid #fecaca; /* red-200 */
        }
        .__errbadge {
          display: inline-block;
          color: #ef4444; /* red-500 */
          margin-right: 6px;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
