from django.http import JsonResponse
from django.views.decorators.http import require_GET
from noise import pnoise2, pnoise3
import random

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
    """Fractal Brownian motion over 2D Perlin in [-1,1]."""
    amp = 1.0
    freq = 1.0
    value = 0.0
    for _ in range(octaves):
        value += amp * pnoise2(x * scale * freq, z * scale * freq,
                               repeatx=1_000_000, repeaty=1_000_000, base=seed)
        amp *= gain
        freq *= lacunarity
    return value

def height_at(wx: int, wz: int) -> int:
    """Terrain surface y for world coords (x,z)."""
    h = fbm2(wx, wz, scale=0.035, octaves=5, gain=0.52)          # rolling
    m = max(0.0, fbm2(wx + 1000, wz - 1000, scale=0.01, octaves=3, gain=0.5))  # mountains
    y = 10 + int(10 * h) + int(18 * m * m)  # gentle base + squared mountains
    return max(1, y)

def is_cave(wx: int, wy: int, wz: int) -> bool:
    """3D noise carve inside ground."""
    n = pnoise3(wx * 0.08, wy * 0.08, wz * 0.08, base=SEED + 42)
    return n > 0.38

def place_tree(blocks: list, gx: int, gy: int, gz: int, r: random.Random) -> None:
    trunk_h = r.randint(4, 6)
    for h in range(1, trunk_h + 1):
        blocks.append({"x": gx, "y": gy + h, "z": gz, "material": "wood"})
    top = gy + trunk_h
    for dx in range(-2, 3):
        for dy in range(-2, 3):
            for dz in range(-2, 3):
                if abs(dx) + abs(dy) + abs(dz) <= 4 and not (dx == 0 and dz == 0 and dy <= 0):
                    blocks.append({"x": gx + dx, "y": top + dy, "z": gz + dz, "material": "leaves"})

def flat_enough_for_village(cx: int, cz: int, size: int) -> bool:
    v = pnoise2(cx * 0.1, cz * 0.1, base=SEED + 7)
    return v > 0.35

def build_hut(blocks: list, wx: int, wy: int, wz: int):
    """Tiny 5x5 hut with doorway."""
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

# ---- endpoints ----
@require_GET
def chunk(request):
    """
    Procedural chunk with water, sand beaches, dirt/grass, stone, snow,
    mountains, caves, trees, and occasional tiny villages.
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
    blocks = []
    r = rng_for(cx, cz)

    for lx in range(size):
        for lz in range(size):
            wx, wz = base_x + lx, base_z + lz
            top_y = height_at(wx, wz)

            # solid interior up to top_y
            for wy in range(1, top_y):
                mat = "dirt"
                if wy < top_y - 3:
                    mat = "stone"
                if is_cave(wx, wy, wz):
                    continue  # carve cave
                blocks.append({"x": wx, "y": wy, "z": wz, "material": mat})

            # surface material
            top_mat = "grass"
            if top_y <= WATER_LEVEL + 1 and top_y >= WATER_LEVEL - 2:
                top_mat = "sand"
            if top_y >= WATER_LEVEL + 16:
                top_mat = "stone"
            if top_y >= WATER_LEVEL + 24:
                top_mat = "snow"
            blocks.append({"x": wx, "y": top_y, "z": wz, "material": top_mat})

            # water fill up to sea level
            if top_y < WATER_LEVEL:
                for wy in range(top_y + 1, WATER_LEVEL + 1):
                    blocks.append({"x": wx, "y": wy, "z": wz, "material": "water"})

            # trees on grass above water
            if top_mat == "grass" and top_y >= WATER_LEVEL + 1:
                if (h2(wx, wz) % 47) == 0 and r.random() < 0.18:
                    place_tree(blocks, wx, top_y, wz, r)

    # small chance of a mini-village
    if flat_enough_for_village(cx, cz, size) and r.random() < 0.25:
        vx, vz = base_x + size // 2 - 2, base_z + size // 2 - 2
        vy = height_at(vx, vz)
        if vy >= WATER_LEVEL + 1:
            center = build_hut(blocks, vx, vy + 1, vz)
            # decorative low wall
            for dx in range(-6, 7):
                for dz in (-6, 6):
                    blocks.append({"x": center[0] + dx, "y": vy + 2, "z": center[2] + dz, "material": "stone"})
            for dz in range(-6, 7):
                for sx in (-6, 6):
                    blocks.append({"x": center[0] + sx, "y": vy + 2, "z": center[2] + dz, "material": "stone"})

    return JsonResponse({"size": size, "origin": [base_x, base_y, base_z], "blocks": blocks})

@require_GET
def entities(request):
    """
    Lightweight entities (villagers with home/square; animals).
    Query: cx, cz, size
    """
    try:
        size = int(request.GET.get("size", CHUNK_SIZE_DEFAULT))
        cx = int(request.GET.get("cx", 0))
        cz = int(request.GET.get("cz", 0))
    except (TypeError, ValueError):
        return JsonResponse({"error": "bad params"}, status=400)

    r = rng_for(cx, cz)
    ents = []
    village_center = None

    # Villagers near center when village likely exists
    if flat_enough_for_village(cx, cz, size) and r.random() < 0.25:
        vx, vz = cx * size + size // 2, cz * size + size // 2
        vy = height_at(vx, vz)
        if vy >= WATER_LEVEL + 1:
            village_center = (vx + 0.5, vy + 2, vz + 0.5)
            for i in range(r.randint(2, 5)):
                hx = vx + r.randint(-4, 4)
                hz = vz + r.randint(-4, 4)
                hy = height_at(hx, hz) + 2
                ents.append({
                    "id": f"v-{cx}-{cz}-{i}",
                    "type": "villager",
                    "x": hx + 0.5, "y": hy, "z": hz + 0.5,
                    "home": [hx + 0.5, hy, hz + 0.5],
                    "square": list(village_center),
                    "role": r.choice(["farmer", "guard", "merchant"])
                })

    # Animals on grass above water
    for i in range(r.randint(0, 3)):
        x = cx * size + r.randint(0, size - 1)
        z = cz * size + r.randint(0, size - 1)
        y_top = height_at(x, z)
        if y_top >= WATER_LEVEL + 1:
            kind = r.choice(["sheep", "cow", "pig"])
            ents.append({
                "id": f"a-{cx}-{cz}-{i}",
                "type": kind,
                "x": x + 0.5, "y": y_top + 1, "z": z + 0.5
            })

    return JsonResponse({"entities": ents, "center": village_center})
