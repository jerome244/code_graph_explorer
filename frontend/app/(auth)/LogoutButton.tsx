// frontend/app/(auth)/LogoutButton.tsx
"use client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.refresh();
    router.replace("/login"); // was "/"
  }
  return <button onClick={onLogout}>Logout</button>;
}
