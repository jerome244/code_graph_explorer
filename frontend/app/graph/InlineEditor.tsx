import React, { useEffect, useMemo, useRef } from "react";
import { highlightWithFunctions, htmlEscape } from "./utils"; // Import utility functions

interface InlineEditorProps {
  path: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  funcIndex: any;
  colorize: boolean;
}

export default function InlineEditor({
  path,
  value,
  onChange,
  onBlur,
  funcIndex,
  colorize,
}: InlineEditorProps) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);

  const html = useMemo(
    () => (colorize ? highlightWithFunctions(path, value, funcIndex) : htmlEscape(value)),
    [colorize, path, value, funcIndex]
  );

  const onScroll = () => {
    const ta = taRef.current;
    const pre = preRef.current;
    if (ta && pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
  };

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
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
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
    </div>
  );
}
