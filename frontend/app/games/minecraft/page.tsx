import Link from "next/link";
import dynamic from "next/dynamic";

// Avoid SSR issues by loading the 3D canvas on the client only
const Minecraft3D = dynamic(() => import("./Minecraft3D"), { ssr: false });

export default function MinecraftPage() {
  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 16px" }}>
      <nav style={{ marginBottom: 16 }}>
        <Link href="/games" style={{ textDecoration: "none", color: "#2563eb" }}>
          ← Back to Games
        </Link>
      </nav>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        Minecraft-like (3D)
      </h1>
      <p style={{ marginBottom: 16, color: "#6b7280" }}>
        Left-click a block face to place; right-click (or hold <kbd>Shift</kbd>) to remove.
        Use mouse to orbit/zoom. Keys <kbd>1–7</kbd> to switch block type.
        Save/Load uses your browser storage.
      </p>

      <Minecraft3D />
    </main>
  );
}
