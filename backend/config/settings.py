# config/settings.py
from pathlib import Path
from datetime import timedelta
import os

BASE_DIR = Path(__file__).resolve().parent.parent

# --- Core ---
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-insecure")
DEBUG = os.environ.get("DEBUG", "1") == "1"

# Keep permissive by default so WS sync isn’t blocked in dev; allow override via env
# Example to tighten later: ALLOWED_HOSTS="localhost,127.0.0.1,app.example.com"
ALLOWED_HOSTS = [h.strip() for h in os.getenv("ALLOWED_HOSTS", "*").split(",") if h.strip()]

# Tell Django about the proxy chain (Cloudflare -> Caddy)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

# Cookie security: opt-in via env so HTTP dev isn't broken
# set COOKIE_SECURE=1 in env when serving via HTTPS at Cloudflare
_cookie_secure_env = os.getenv("COOKIE_SECURE", "0").lower()
COOKIE_SECURE = _cookie_secure_env in ("1", "true", "yes")
SESSION_COOKIE_SECURE = COOKIE_SECURE
CSRF_COOKIE_SECURE = COOKIE_SECURE
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# CSRF trusted origins:
# dev origins + optional PUBLIC_ORIGIN (e.g. https://app.example.com) + optional trycloudflare
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
PUBLIC_ORIGIN = os.getenv("PUBLIC_ORIGIN")  # e.g. "https://app.example.com"
if PUBLIC_ORIGIN:
    CSRF_TRUSTED_ORIGINS.append(PUBLIC_ORIGIN)
if os.getenv("ALLOW_TRYCLOUDFLARE", "0") in ("1", "true", "yes"):
    # Django supports wildcard subdomains here
    CSRF_TRUSTED_ORIGINS.append("https://*.trycloudflare.com")

# --- Apps ---
INSTALLED_APPS = [
    # Realtime
    "channels",
    "realtime",

    # Django & third-party
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",

    # Project apps
    "users",
    "projects",
    "game",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# WSGI is fine to keep; ASGI is used for websockets
WSGI_APPLICATION = "config.wsgi.application"

# --- Database ---
if os.environ.get("DB_NAME"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ["DB_NAME"],
            "USER": os.environ.get("DB_USER", "postgres"),
            "PASSWORD": os.environ.get("DB_PASSWORD", ""),
            "HOST": os.environ.get("DB_HOST", "localhost"),
            "PORT": os.environ.get("DB_PORT", "5432"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

# --- Auth ---
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# --- Static & Media ---
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"  # optional: for collectstatic in prod
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# --- DRF / JWT ---
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
}
from rest_framework.settings import api_settings  # noqa

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": False,
    "BLACKLIST_AFTER_ROTATION": False,
}

# --- CORS ---
# Keep permissive in dev to match your current behavior; tighten later if you split origins
if DEBUG or os.getenv("CORS_ALLOW_ALL", "1") in ("1", "true", "yes"):
    CORS_ALLOW_ALL_ORIGINS = True
else:
    CORS_ALLOW_ALL_ORIGINS = False
    # If needed, allow your public origin explicitly
    if PUBLIC_ORIGIN:
        CORS_ALLOWED_ORIGINS = [PUBLIC_ORIGIN]

# --- Channels / ASGI ---
ASGI_APPLICATION = "config.asgi.application"

# In-memory layer is perfect for dev; auto-switch to Redis if REDIS_URL is set
if os.getenv("REDIS_URL"):
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [os.getenv("REDIS_URL")]},
        }
    }
else:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        }
    }

# Django 3.2+ default primary key type
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
