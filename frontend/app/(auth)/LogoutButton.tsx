"use client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.refresh();       // re-render server components (header)
    router.push("/");       // back to home
  }
  return <button onClick={onLogout}>Logout</button>;
}
