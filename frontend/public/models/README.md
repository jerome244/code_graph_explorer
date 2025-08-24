frontend/
  public/
    models/              # (optional, if you add GLB/PNG assets later)
  src/
    app/
      layout.tsx
      page.tsx           # Home
      games/
        page.tsx         # Redirects to /games/minecraft
        minecraft/
          page.tsx       # Join-party UI + <VoxelApp />
          VoxelApp.tsx
          FPSControls.tsx
          EntitiesSim.tsx
          Interactions.tsx
          DayNight.tsx
          SkySunClouds.tsx
          VoxelModels.tsx
          PlayerGhosts.tsx
          multiplayer.ts  # the hook (exports useMultiplayer)
