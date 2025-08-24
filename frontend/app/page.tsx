import Game from "@/components/Game";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <h1 className="text-3xl font-bold mb-4">Pong (Django + Next.js)</h1>
        <Game />
        <p className="text-sm text-gray-500 mt-4">
          Open this page in a second browser/window, join the same room, and play!
        </p>
      </div>
    </main>
  );
}
