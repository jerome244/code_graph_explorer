from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import viewsets
from .models import World, Block
from .serializers import WorldSerializer, BlockSerializer

@api_view(["GET"])
def hello(request):
    return Response({"message": "Hello from Django 👋"})

class WorldViewSet(viewsets.ModelViewSet):
    queryset = World.objects.all()
    serializer_class = WorldSerializer

class BlockViewSet(viewsets.ModelViewSet):
    serializer_class = BlockSerializer
    def get_queryset(self):
        qs = Block.objects.all()
        world = self.request.query_params.get("world")
        z = self.request.query_params.get("z")
        if world: qs = qs.filter(world_id=world)
        if z is not None: qs = qs.filter(z=z)
        return qs.order_by("y", "x")

# backend/api/views.py
from django.http import JsonResponse
from django.views.decorators.http import require_GET
import random

@require_GET
def chunk(request):
    """
    Flat ground + a few trees (deterministic per chunk).
    y is UP. Dirt y=0..2, grass y=3.
    """
    try:
        size = int(request.GET.get("size", 16))
        cx = int(request.GET.get("cx", 0))
        cy = int(request.GET.get("cy", 0))
        cz = int(request.GET.get("cz", 0))
        _world = int(request.GET.get("world", 1))
    except (TypeError, ValueError):
        return JsonResponse({"error": "bad params"}, status=400)

    base_x = cx * size
    base_y = cy * size
    base_z = cz * size

    blocks = []
    ground_top = 3  # 0..2 dirt, 3 grass

    # --- flat ground ---
    for x in range(size):
        for z in range(size):
            for y in range(ground_top):
                blocks.append({"x": base_x + x, "y": base_y + y, "z": base_z + z, "material": "dirt"})
            blocks.append({"x": base_x + x, "y": base_y + ground_top, "z": base_z + z, "material": "grass"})

    # --- deterministic RNG per (cx,cz) so it remains stable ---
    rng = random.Random((cx * 73856093) ^ (cz * 19349663))

    # 2..4 trees per chunk, keep away from edges so leaves don't spill out
    tree_count = rng.randint(2, 4)
    placed = []
    for _ in range(tree_count):
        for _try in range(10):
            tx = base_x + rng.randint(2, size - 3)
            tz = base_z + rng.randint(2, size - 3)
            if all(abs(tx - px) + abs(tz - pz) >= 6 for px, pz in placed):
                placed.append((tx, tz))
                break

    for (tx, tz) in placed:
        trunk_h = rng.randint(4, 6)
        # trunk above grass
        for h in range(1, trunk_h + 1):
            blocks.append({"x": tx, "y": base_y + ground_top + h, "z": tz, "material": "wood"})
        # leaves blob
        top_y = base_y + ground_top + trunk_h
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                for dz in range(-2, 3):
                    if abs(dx) + abs(dy) + abs(dz) <= 4:
                        if not (dx == 0 and dz == 0 and dy <= 0):  # keep trunk visible
                            blocks.append({"x": tx + dx, "y": top_y + dy, "z": tz + dz, "material": "leaves"})

    return JsonResponse({"size": size, "origin": [base_x, base_y, base_z], "blocks": blocks})
