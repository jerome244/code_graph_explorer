from django.http import JsonResponse
from django.views.decorators.http import require_GET
from noise import pnoise2, pnoise3
import random
import math
from typing import List, Dict, Tuple

# ---- world knobs ----
SEED = 1337
WATER_LEVEL = 8
CHUNK_SIZE_DEFAULT = 16

# ---- helpers ----
def h2(x: int, z: int, seed: int = SEED) -> int:
    """Stable hash for (x,z)."""
    return (x * 73856093) ^ (z * 19349663) ^ (seed * 83492791)

def rng_for(cx: int, cz: int) -> random.Random:
    return random.Random(h2(cx, cz))

def fbm2(x: float, z: float, scale=0.035, octaves=5, lacunarity=2.0, gain=0.52, seed=SEED) -> float:
    """
    Fractal Brownian motion over 2D Perlin in roughly [-1,1].
    """
    amp = 1.0
    freq = 1.0
    value = 0.0
    for _ in range(octaves):
        value += amp * pnoise2(
            x * scale * freq,
            z * scale * freq,
            repeatx=1_000_000,
            repeaty=1_000_000,
            base=seed,
        )
        amp *= gain
        freq *= lacunarity
    return value

def height_at(wx: int, wz: int) -> int:
    """
    Terrain surface y for world coords (x,z).
    Rolling base + mountain mask; beaches & snow handled by top_material().
    """
    # rolling base hills
    base = fbm2(wx, wz, scale=0.035, octaves=5, gain=0.52)
    # mountain mask (positive-only fbm)
    m = max(0.0, fbm2(wx + 1000, wz - 1000, scale=0.01, octaves=3, gain=0.5))
    y = 10 + int(10 * base) + int(18 * m * m)  # gentle base + squared mountains
    return max(1, y)

def is_cave(wx: int, wy: int, wz: int) -> bool:
    """
    3D noise carve inside ground -> caves/tunnels.
    """
    n = pnoise3(wx * 0.08, wy * 0.08, wz * 0.08, base=SEED + 42)
    return n > 0.38

def climate(wx: int, wz: int) -> Tuple[float, float]:
    """
    Returns (temp, moist) each in ~[0,1] for desert/biome selection.
    """
    t = pnoise2(wx * 0.005, wz * 0.005, base=SEED + 300) * 0.5 + 0.5
    m = pnoise2(wx * 0.004, wz * 0.004, base=SEED + 700) * 0.5 + 0.5
    return (t, m)

def top_material(y_top: int, temp: float, moist: float) -> str:
    """
    Decide the top surface material given local climate and height.
    - Desert: hot & dry
    - Beaches: near sea level
    - Snow: high altitudes
    - Grass elsewhere
    """
    # snow caps
    if y_top >= WATER_LEVEL + 24:
        return "snow"
    if y_top >= WATER_LEVEL + 16:
        return "stone"
    # beaches
    if WATER_LEVEL - 2 <= y_top <= WATER_LEVEL + 1:
        return "sand"
    # desert away from water
    if temp > 0.6 and moist < 0.42:
        return "sand"
    return "grass"

def place_tree(blocks: List[Dict], gx: int, gy: int, gz: int, r: random.Random) -> None:
    trunk_h = r.randint(4, 6)
    for h in range(1, trunk_h + 1):
        blocks.append({"x": gx, "y": gy + h, "z": gz, "material": "wood"})
    top = gy + trunk_h
    for dx in range(-2, 3):
        for dy in range(-2, 3):
            for dz in range(-2, 3):
                if abs(dx) + abs(dy) + abs(dz) <= 4 and not (dx == 0 and dz == 0 and dy <= 0):
                    blocks.append({"x": gx + dx, "y": top + dy, "z": gz + dz, "material": "leaves"})

def place_cactus(blocks: List[Dict], gx: int, gy: int, gz: int, r: random.Random) -> None:
    """
    Simple desert cactus (use 'wood' as placeholder block).
    """
    h = r.randint(2, 4)
    for yy in range(gy + 1, gy + 1 + h):
        blocks.append({"x": gx, "y": yy, "z": gz, "material": "wood"})

def flat_enough_for_structure(minx: int, minz: int, size: int) -> Tuple[bool, int]:
    """
    Check a patch for flatness; returns (ok, avg_height).
    """
    heights = []
    for sx in range(minx, minx + size, max(1, size // 4)):
        for sz in range(minz, minz + size, max(1, size // 4)):
            heights.append(height_at(sx, sz))
    if not heights:
        return (False, 0)
    if max(heights) - min(heights) <= 2:
        return (True, int(round(sum(heights) / len(heights))))
    return (False, 0)

def build_hut(blocks: List[Dict], wx: int, wy: int, wz: int):
    """
    Tiny 5x5 hut with doorway.
    Returns the approx center for optional decorations.
    """
    w = 5
    h = 4
    # floor
    for x in range(w):
        for z in range(w):
            blocks.append({"x": wx + x, "y": wy, "z": wz + z, "material": "planks"})
    # walls
    for y in range(1, h + 1):
        for x in range(w):
            for z in range(w):
                if not (x in (0, w - 1) or z in (0, w - 1)):
                    continue
                if x == w // 2 and z == 0 and y in (1, 2):  # door
                    continue
                blocks.append({"x": wx + x, "y": wy + y, "z": wz + z, "material": "wood"})
    # roof
    for x in range(-1, w + 1):
        for z in range(-1, w + 1):
            blocks.append({"x": wx + x, "y": wy + h + 1, "z": wz + z, "material": "planks"})
    return (wx + w // 2, wy + 1, wz + w // 2)

def build_castle(blocks: List[Dict], minx: int, minz: int, base_y: int):
    """
    Small 12x12 stone castle with 2x2 corner towers and a central keep.
    """
    size = 12
    # outer wall 3 high
    for x in range(minx, minx + size):
        for z in range(minz, minz + size):
            is_wall = (x in (minx, minx + size - 1)) or (z in (minz, minz + size - 1))
            if is_wall:
                for yy in range(base_y, base_y + 3):
                    blocks.append({"x": x, "y": yy, "z": z, "material": "stone"})
    # towers
    for (tx, tz) in [(minx, minz), (minx + size - 2, minz),
                     (minx, minz + size - 2), (minx + size - 2, minz + size - 2)]:
        for x in range(tx, tx + 2):
            for z in range(tz, tz + 2):
                for yy in range(base_y + 3, base_y + 6):
                    blocks.append({"x": x, "y": yy, "z": z, "material": "stone"})
        # flag
        blocks.append({"x": tx + 1, "y": base_y + 6, "z": tz + 1, "material": "wood"})
    # central keep 4 high
    for x in range(minx + 4, minx + 8):
        for z in range(minz + 4, minz + 8):
            for yy in range(base_y, base_y + 4):
                blocks.append({"x": x, "y": yy, "z": z, "material": "planks"})

# ---- endpoints ----
@require_GET
def chunk(request):
    """
    Procedural chunk with water, sand beaches, desert, dirt/grass, stone, snow,
    mountains, caves, trees/cactus, and occasional tiny village or castle.
    Query: cx, cy, cz (chunk coords), size (default 16)
    """
    try:
        size = int(request.GET.get("size", CHUNK_SIZE_DEFAULT))
        cx = int(request.GET.get("cx", 0))
        cy = int(request.GET.get("cy", 0))  # currently unused; vertical layering possible later
        cz = int(request.GET.get("cz", 0))
    except (TypeError, ValueError):
        return JsonResponse({"error": "bad params"}, status=400)

    base_x, base_y, base_z = cx * size, cy * size, cz * size
    blocks: List[Dict] = []
    r = rng_for(cx, cz)

    for lx in range(size):
        for lz in range(size):
            wx, wz = base_x + lx, base_z + lz
            top_y = height_at(wx, wz)
            temp, moist = climate(wx, wz)

            # solid interior up to top_y
            for wy in range(1, top_y):
                # caves: carve voids in the medium layers
                if 5 < wy < top_y - 3 and is_cave(wx, wy, wz):
                    continue
                mat = "stone" if wy < top_y - 3 else "dirt"
                blocks.append({"x": wx, "y": wy, "z": wz, "material": mat})

            # surface material by biome/height
            top_mat = top_material(top_y, temp, moist)
            blocks.append({"x": wx, "y": top_y, "z": wz, "material": top_mat})

            # water fill up to sea level
            if top_y < WATER_LEVEL:
                for wy in range(top_y + 1, WATER_LEVEL + 1):
                    blocks.append({"x": wx, "y": wy, "z": wz, "material": "water"})

            # decorations
            if top_mat == "grass" and top_y >= WATER_LEVEL + 1:
                # trees on grass (sparse)
                if (h2(wx, wz) % 73) == 0 and r.random() < 0.14:
                    place_tree(blocks, wx, top_y, wz, r)
            elif top_mat == "sand" and top_y >= WATER_LEVEL + 1:
                # cactus in desert (very sparse)
                if r.random() < 0.02:
                    place_cactus(blocks, wx, top_y, wz, r)

    # Small chance of a mini-village (1 hut + low wall) on flat, dry land
    if r.random() < 0.20:
        vx, vz = base_x + size // 2 - 2, base_z + size // 2 - 2
        ok, vy = flat_enough_for_structure(vx - 6, vz - 6, 12)
        if ok and vy >= WATER_LEVEL + 1:
            center = build_hut(blocks, vx, vy + 1, vz)
            # decorative low wall
            for dx in range(-6, 7):
                for dz in (-6, 6):
                    blocks.append({"x": center[0] + dx, "y": vy + 2, "z": center[2] + dz, "material": "stone"})
            for dz in range(-6, 7):
                for sx in (-6, 6):
                    blocks.append({"x": center[0] + sx, "y": vy + 2, "z": center[2] + dz, "material": "stone"})

    # Occasional small castle on flat, non-coastal land
    if r.random() < 0.04:
        minx, minz = base_x + 2, base_z + 2
        if minx + 12 <= base_x + size - 1 and minz + 12 <= base_z + size - 1:
            ok, by = flat_enough_for_structure(minx, minz, 12)
            if ok and by >= WATER_LEVEL + 1:
                build_castle(blocks, minx, minz, by)

    return JsonResponse({"size": size, "origin": [base_x, base_y, base_z], "blocks": blocks})

@require_GET
def entities(request):
    """
    ?cx=?&cz=?&size=16
    Returns simple NPCs/animals for this chunk (deterministic by chunk seed).
    Lower density animals than before.
    """
    try:
        cx = int(request.GET.get("cx", 0))
        cz = int(request.GET.get("cz", 0))
        size = int(request.GET.get("size", CHUNK_SIZE_DEFAULT))
    except (TypeError, ValueError):
        return JsonResponse({"error": "bad params"}, status=400)

    r = rng_for(cx, cz)
    ents: List[Dict] = []

    # a couple villagers near “square” for flavor (some chunks)
    if r.random() < 0.15:
        vx = cx * size + r.randint(3, size - 4)
        vz = cz * size + r.randint(3, size - 4)
        vy = height_at(vx, vz) + 1
        ents.append({
            "id": f"v-{cx}-{cz}-0",
            "type": "villager",
            "role": r.choice(["farmer", "merchant", "guard"]),
            "x": vx + 0.5, "y": vy + 0.02, "z": vz + 0.5,
            "square": [vx + 0.5, vy, vz + 0.5]
        })

    # Animals: lower density — 0..2 per chunk, ~60% of chunks have any
    if r.random() < 0.60:
        count = r.randint(0, 2)
        for i in range(count):
            ax = cx * size + r.randint(0, size - 1)
            az = cz * size + r.randint(0, size - 1)
            ay = height_at(ax, az)
            if ay >= WATER_LEVEL + 1:  # avoid water
                kind = r.choice(["sheep", "cow", "pig"])
                ents.append({
                    "id": f"a-{cx}-{cz}-{i}",
                    "type": kind,
                    "x": ax + 0.5, "y": ay + 1.05, "z": az + 0.5
                })

    return JsonResponse({"entities": ents})
