from django.http import JsonResponse
from django.views.decorators.http import require_GET
from noise import pnoise2, pnoise3
import random
from typing import List, Dict, Tuple

# ==== WORLD GEN SETTINGS ====

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
    """Fractal Brownian motion over 2D Perlin in roughly [-1,1]."""
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
    """Terrain surface y for world coords (x,z)."""
    base = fbm2(wx, wz, scale=0.035, octaves=5, gain=0.52)
    m = max(0.0, fbm2(wx + 1000, wz - 1000, scale=0.01, octaves=3, gain=0.5))
    y = 10 + int(10 * base) + int(18 * m * m)  # gentle base + squared mountains
    return max(1, y)

def is_cave(wx: int, wy: int, wz: int) -> bool:
    """3D noise carve inside ground -> caves/tunnels."""
    n = pnoise3(wx * 0.08, wy * 0.08, wz * 0.08, base=SEED + 42)
    return n > 0.38

def climate(wx: int, wz: int) -> Tuple[float, float]:
    """Returns (temp, moist) each in ~[0,1] for desert/biome selection."""
    t = pnoise2(wx * 0.005, wz * 0.005, base=SEED + 300) * 0.5 + 0.5
    m = pnoise2(wx * 0.004, wz * 0.004, base=SEED + 700) * 0.5 + 0.5
    return (t, m)

def top_material(y_top: int, temp: float, moist: float) -> str:
    """Decide the top surface material given local climate and height."""
    if y_top >= WATER_LEVEL + 24:
        return "snow"
    if y_top >= WATER_LEVEL + 16:
        return "stone"
    if WATER_LEVEL - 2 <= y_top <= WATER_LEVEL + 1:
        return "sand"
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
    h = r.randint(2, 4)
    for yy in range(gy + 1, gy + 1 + h):
        blocks.append({"x": gx, "y": yy, "z": gz, "material": "wood"})

def flat_enough_for_structure(minx: int, minz: int, size: int) -> Tuple[bool, int]:
    heights = []
    step = max(1, size // 4)
    for sx in range(minx, minx + size, step):
        for sz in range(minz, minz + size, step):
            heights.append(height_at(sx, sz))
    if not heights:
        return (False, 0)
    if max(heights) - min(heights) <= 2:
        return (True, int(round(sum(heights) / len(heights))))
    return (False, 0)

def build_hut(blocks: List[Dict], wx: int, wy: int, wz: int):
    w = 5
    h = 4
    for x in range(w):
        for z in range(w):
            blocks.append({"x": wx + x, "y": wy, "z": wz + z, "material": "planks"})
    for y in range(1, h + 1):
        for x in range(w):
            for z in range(w):
                if not (x in (0, w - 1) or z in (0, w - 1)):
                    continue
                if x == w // 2 and z == 0 and y in (1, 2):  # door
                    continue
                blocks.append({"x": wx + x, "y": wy + y, "z": wz + z, "material": "wood"})
    for x in range(-1, w + 1):
        for z in range(-1, w + 1):
            blocks.append({"x": wx + x, "y": wy + h + 1, "z": wz + z, "material": "planks"})
    return (wx + w // 2, wy + 1, wz + w // 2)

def build_castle(blocks: List[Dict], minx: int, minz: int, base_y: int):
    size = 12
    for x in range(minx, minx + size):
        for z in range(minz, minz + size):
            is_wall = (x in (minx, minx + size - 1)) or (z in (minz, minz + size - 1))
            if is_wall:
                for yy in range(base_y, base_y + 3):
                    blocks.append({"x": x, "y": yy, "z": z, "material": "stone"})
    for (tx, tz) in [(minx, minz), (minx + size - 2, minz),
                     (minx, minz + size - 2), (minx + size - 2, minz + size - 2)]:
        for x in range(tx, tx + 2):
            for z in range(tz, tz + 2):
                for yy in range(base_y + 3, base_y + 6):
                    blocks.append({"x": x, "y": yy, "z": z, "material": "stone"})
        blocks.append({"x": tx + 1, "y": base_y + 6, "z": tz + 1, "material": "wood"})
    for x in range(minx + 4, minx + 8):
        for z in range(minz + 4, minz + 8):
            for yy in range(base_y, base_y + 4):
                blocks.append({"x": x, "y": yy, "z": z, "material": "planks"})

# ---- endpoints ----
@require_GET
def chunk(request):
    """
    Procedural chunk. Query: cx, cy, cz (chunk coords), size (default 16)
    """
    try:
        size = int(request.GET.get("size", CHUNK_SIZE_DEFAULT))
        cx = int(request.GET.get("cx", 0))
        cy = int(request.GET.get("cy", 0))
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

            for wy in range(1, top_y):
                if 5 < wy < top_y - 3 and is_cave(wx, wy, wz):
                    continue
                mat = "stone" if wy < top_y - 3 else "dirt"
                blocks.append({"x": wx, "y": wy, "z": wz, "material": mat})

            top_mat = top_material(top_y, temp, moist)
            blocks.append({"x": wx, "y": top_y, "z": wz, "material": top_mat})

            if top_y < WATER_LEVEL:
                for wy in range(top_y + 1, WATER_LEVEL + 1):
                    blocks.append({"x": wx, "y": wy, "z": wz, "material": "water"})

            if top_mat == "grass" and top_y >= WATER_LEVEL + 1:
                if (h2(wx, wz) % 73) == 0 and r.random() < 0.14:
                    place_tree(blocks, wx, top_y, wz, r)
            elif top_mat == "sand" and top_y >= WATER_LEVEL + 1:
                if r.random() < 0.02:
                    place_cactus(blocks, wx, top_y, wz, r)

    if r.random() < 0.20:
        vx, vz = base_x + size // 2 - 2, base_z + size // 2 - 2
        ok, vy = flat_enough_for_structure(vx - 6, vz - 6, 12)
        if ok and vy >= WATER_LEVEL + 1:
            center = build_hut(blocks, vx, vy + 1, vz)
            for dx in range(-6, 7):
                for dz in (-6, 6):
                    blocks.append({"x": center[0] + dx, "y": vy + 2, "z": center[2] + dz, "material": "stone"})
            for dz in range(-6, 7):
                for sx in (-6, 6):
                    blocks.append({"x": center[0] + sx, "y": vy + 2, "z": center[2] + dz, "material": "stone"})

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
    ?cx=?&cz=?&size=16 — Returns simple NPCs/animals for this chunk.
    """
    try:
        cx = int(request.GET.get("cx", 0))
        cz = int(request.GET.get("cz", 0))
        size = int(request.GET.get("size", CHUNK_SIZE_DEFAULT))
    except (TypeError, ValueError):
        return JsonResponse({"error": "bad params"}, status=400)

    r = rng_for(cx, cz)
    ents: List[Dict] = []

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

    if r.random() < 0.60:
        count = r.randint(0, 2)
        for i in range(count):
            ax = cx * size + r.randint(0, size - 1)
            az = cz * size + r.randint(0, size - 1)
            ay = height_at(ax, az)
            if ay >= WATER_LEVEL + 1:
                kind = r.choice(["sheep", "cow", "pig"])
                ents.append({
                    "id": f"a-{cx}-{cz}-{i}",
                    "type": kind,
                    "x": ax + 0.5, "y": ay + 1.05, "z": az + 0.5
                })

    return JsonResponse({"entities": ents})


# ==== AUTH (JWT) ====

from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import viewsets, status
from django.contrib.auth import get_user_model
from django.db.models import Q

from .models import Project, ProjectCollaborator
from .serializers import (
    ProjectSerializer,
    ProjectCollaboratorSerializer,
    UserPublicSerializer,
)
from .permissions import IsOwnerOrCollaboratorCanEdit

User = get_user_model()

@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def register_user(request):
    """Create a new user and return JWT tokens: { id, username, email, access, refresh }."""
    data = request.data or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return Response({"detail": "username and password are required"}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(username__iexact=username).exists():
        return Response({"detail": "username already exists"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_password(password)
    except DjangoValidationError as e:
        return Response({"detail": " ".join(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_user(username=username, email=email or None, password=password)
    user.save()

    from rest_framework_simplejwt.tokens import RefreshToken
    refresh = RefreshToken.for_user(user)
    return Response({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "access": str(refresh.access_token),
        "refresh": str(refresh),
    }, status=status.HTTP_201_CREATED)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def whoami(request):
    u = request.user
    return Response({"id": u.id, "username": u.username, "email": u.email})


class ProjectViewSet(viewsets.ModelViewSet):
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated, IsOwnerOrCollaboratorCanEdit]

    def get_queryset(self):
        u = self.request.user
        return Project.objects.filter(
            Q(owner=u) | Q(collab_links__user=u)
        ).distinct().order_by("-updated_at")

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        if obj.owner_id != request.user.id:
            return Response({"detail": "Only the owner can delete."}, status=403)
        return super().destroy(request, *args, **kwargs)

    # ----- SHARE LINK (read-only) -----
    @action(detail=True, methods=["post"], url_path="share-link")
    def create_share_link(self, request, pk=None):
        proj = self.get_object()
        if proj.owner_id != request.user.id:
            return Response({"detail": "Only owner can create share link."}, status=403)
        proj.ensure_share_token()
        return Response({"token": proj.share_token})

    @action(detail=True, methods=["delete"], url_path="share-link")
    def revoke_share_link(self, request, pk=None):
        proj = self.get_object()
        if proj.owner_id != request.user.id:
            return Response({"detail": "Only owner can revoke share link."}, status=403)
        proj.share_token = None
        proj.save(update_fields=["share_token"])
        return Response(status=204)

    # ----- COLLABORATORS (add/remove/toggle) -----
    @action(detail=True, methods=["get", "post", "patch", "delete"], url_path="collaborators")
    def collaborators(self, request, pk=None):
        proj = self.get_object()
        if request.method == "GET":
            ser = ProjectCollaboratorSerializer(proj.collab_links.select_related("user"), many=True)
            return Response(ser.data)

        # Only owner can manage collaborators
        if proj.owner_id != request.user.id:
            return Response({"detail": "Only owner can manage collaborators."}, status=403)

        if request.method == "POST":
            # Accept user_id OR username OR email
            user_id = request.data.get("user_id")
            username = (request.data.get("username") or "").strip()
            email = (request.data.get("email") or "").strip().lower()
            can_edit = bool(request.data.get("can_edit"))

            try:
                if user_id:
                    user = User.objects.get(id=user_id)
                elif username:
                    user = User.objects.get(username__iexact=username)
                elif email:
                    user = User.objects.get(email__iexact=email)
                else:
                    return Response({"detail": "Provide user_id, username, or email."}, status=400)
            except User.DoesNotExist:
                return Response({"detail": "User not found."}, status=404)

            link, _ = ProjectCollaborator.objects.get_or_create(project=proj, user=user)
            if can_edit != link.can_edit:
                link.can_edit = can_edit
                link.save(update_fields=["can_edit"])
            return Response(ProjectCollaboratorSerializer(link).data, status=201)

        if request.method == "PATCH":
            user_id = request.data.get("user_id")
            can_edit = bool(request.data.get("can_edit"))
            try:
                link = ProjectCollaborator.objects.get(project=proj, user_id=user_id)
            except ProjectCollaborator.DoesNotExist:
                return Response({"detail": "Collaborator not found."}, status=404)
            link.can_edit = can_edit
            link.save(update_fields=["can_edit"])
            return Response(ProjectCollaboratorSerializer(link).data)

        if request.method == "DELETE":
            user_id = request.data.get("user_id")
            ProjectCollaborator.objects.filter(project=proj, user_id=user_id).delete()
            return Response(status=204)

# ----- Public read via share token -----
from rest_framework.permissions import AllowAny

@api_view(["GET"])
@permission_classes([AllowAny])
def project_by_token(request, token: str):
    try:
        proj = Project.objects.get(share_token=token)
    except Project.DoesNotExist:
        return Response({"detail": "Not found."}, status=404)
    return Response({
        "name": proj.name,
        "data": proj.data,
        "updated_at": proj.updated_at,
    })

# ----- User search for invitations -----
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def user_search(request):
    q = (request.query_params.get("q") or request.query_params.get("query") or "").strip()
    if not q:
        return Response([])
    qs = User.objects.filter(Q(username__icontains=q) | Q(email__icontains=q)).order_by("username")[:10]
    return Response(UserPublicSerializer(qs, many=True).data)
