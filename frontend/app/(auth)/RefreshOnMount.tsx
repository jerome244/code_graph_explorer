"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RefreshOnMount() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      await fetch("/api/auth/refresh", { method: "POST" }).catch(() => {});
      router.refresh();
    })();
  }, [router]);
  return null;
}
