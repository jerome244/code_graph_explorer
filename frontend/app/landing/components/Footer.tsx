// app/landing/components/Footer.tsx
export default function Footer() {
    return (
    <footer className="mt-20 border-t border-slate-800/60">
    <div className="mx-auto max-w-7xl px-6 py-10 text-sm text-slate-400">
    <p>© {new Date().getFullYear()} Code Graph Explorer. All rights reserved.</p>
    </div>
    </footer>
    );
    }