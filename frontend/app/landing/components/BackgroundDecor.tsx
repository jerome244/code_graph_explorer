// app/landing/components/BackgroundDecor.tsx
export default function BackgroundDecor() {
    return (
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        {/* 微細グリッド（質感） */}
        <div className="absolute inset-0 bg-grid opacity-40" />
        {/* 放射グロー（上方の光） */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.18),transparent_60%)]" />
        {/* 斜めグラデーション */}
        <div
          className="absolute -left-1/3 -top-[10%] h-[60vh] w-[85vw] rotate-12 rounded-full
                     bg-gradient-to-br from-cyan-400/10 to-fuchsia-500/10 blur-3xl"
        />
        {/* 可読性向上の薄い暗幕（強すぎたら /70→/60 に） */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0f1a]/70 via-[#0a0f1a]/30 to-transparent" />
      </div>
    );
  }
  
  
  
  