from urllib.parse import parse_qs
from typing import Optional
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.authentication import JWTAuthentication
from channels.db import database_sync_to_async

def _get_token_from_headers(scope) -> Optional[str]:
    for name, value in scope.get("headers", []):
        if name == b'authorization':
            v = value.decode("latin-1")
            if v.lower().startswith("bearer "):
                return v[7:]
    return None

def _get_token_from_cookies(scope) -> Optional[str]:
    # Parse raw Cookie header
    cookies = {}
    for name, value in scope.get("headers", []):
        if name == b"cookie":
            items = value.decode("latin-1").split(";")
            for it in items:
                if "=" in it:
                    k, v = it.split("=", 1)
                    cookies[k.strip()] = v.strip()
            break
    return cookies.get("access")

def _get_token_from_query(scope) -> Optional[str]:
    qs = parse_qs(scope.get("query_string", b"").decode("utf-8"))
    t = qs.get("token", [None])[0]
    return t

@database_sync_to_async
def authenticate_scope(scope):
    auth = JWTAuthentication()
    raw = _get_token_from_headers(scope) or _get_token_from_query(scope) or _get_token_from_cookies(scope)
    if not raw:
        return AnonymousUser()
    try:
        validated = auth.get_validated_token(raw)
        user = auth.get_user(validated)
        return user
    except Exception:
        return AnonymousUser()

class JWTAuthMiddleware:
    """Populate scope['user'] using DRF SimpleJWT from Authorization header, ?token=, or 'access' cookie."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        scope['user'] = await authenticate_scope(scope)
        return await self.app(scope, receive, send)
