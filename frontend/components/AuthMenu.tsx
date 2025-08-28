// frontend/components/AuthMenu.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import LoginForm from "@/components/LoginForm";
import RegisterForm from "@/components/RegisterForm";

export default function AuthMenu() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"login" | "register">("login");
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const check = async () => {
    try {
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      setAuthed(r.ok);
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    // initial check
    check();

    // close popover on outside click
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);

    // re-check on auth changes and when tab regains focus
    const onAuthChanged = () => check();
    const onFocus = () => check();
    const onVisible = () => { if (!document.hidden) check(); };

    window.addEventListener("auth:changed", onAuthChanged);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("auth:changed", onAuthChanged);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    // notify app immediately
    window.dispatchEvent(new Event("auth:changed"));
    setOpen(false);
  }

  if (!ready) return null;

  if (authed) {
    return (
      <div className="auth" ref={ref}>
        <Link href="/projects" className="btn">My Projects</Link>
        <button className="btn" type="button" onClick={handleLogout}>
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="auth" ref={ref}>
      <button
        className="btn primary"
        onClick={() => {
          setTab("login");
          setOpen((v) => !v);
        }}
        type="button"
      >
        Sign in
      </button>

      {open && (
        <div className="auth-popover card">
          <div className="auth-tabs">
            <button
              className={`auth-tab ${tab === "login" ? "active" : ""}`}
              onClick={() => setTab("login")}
              type="button"
            >
              Login
            </button>
            <button
              className={`auth-tab ${tab === "register" ? "active" : ""}`}
              onClick={() => setTab("register")}
              type="button"
            >
              Register
            </button>
          </div>
          <div className="auth-content">
            {tab === "login" ? <LoginForm /> : <RegisterForm />}
          </div>
        </div>
      )}
    </div>
  );
}
