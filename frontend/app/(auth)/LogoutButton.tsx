"use client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // send them to the homepage (and re-render server components like the header)
    router.replace("/");
    router.refresh(); // ensures the header re-reads cleared cookies
  }
  return <button onClick={onLogout}>Logout</button>;
}
