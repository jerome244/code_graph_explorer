// frontend/app/_components/ThemeToggle.tsx
"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  // 初期値は <html data-theme> を信頼
  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "light" || current === "dark") {
      setTheme(current);
    }
  }, []);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    // 1) DOM反映
    document.documentElement.setAttribute("data-theme", next);
    // 2) Cookie保存（1年）
    document.cookie = `theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle color theme"
      className="btn"
      style={{ minWidth: 44 }}
      title={theme === "light" ? "Switch to dark" : "Switch to light"}
    >
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}
