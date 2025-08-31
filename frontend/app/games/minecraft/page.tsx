import Link from "next/link";
import dynamic from "next/dynamic";

const Game = dynamic(() => import("./Game"), { ssr: false });

export default function MinecraftPage() {
  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 16px" }}>
      <nav style={{ marginBottom: 16 }}>
        <Link href="/games" style={{ textDecoration: "none", color: "#2563eb" }}>
          ← Back to Games
        </Link>
      </nav>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Minecraft-like (3D)</h1>
      <p style={{ marginBottom: 16, color: "#6b7280" }}>
        Loads in <strong>Play</strong>: click once to start mouse-look.
        Move with <kbd>ZQSD</kbd>/<kbd>WASD</kbd>, jump with <kbd>Space</kbd>, <kbd>Esc</kbd> to release the mouse.
        Switch back to Build with the button.
        In <strong>Build</strong>: Left-click place, Right-click / <kbd>Shift</kbd> remove, 1–7 to change block.
      </p>

      <Game />
    </main>
  );
}
