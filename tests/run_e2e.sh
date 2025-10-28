#!/usr/bin/env bash
set -euo pipefail
[ "${DEBUG:-0}" = "1" ] && set -x

# ---------- Paths ----------
SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$REPO_ROOT/backend}"

if [ ! -d "$BACKEND_DIR" ] || [ ! -f "$BACKEND_DIR/manage.py" ]; then
  echo "❌ Could not find backend. Looked for manage.py in: $BACKEND_DIR"
  echo "   Set BACKEND_DIR=/absolute/path/to/backend and re-run."
  exit 1
fi

# ---------- Docker Postgres (idempotent) ----------
CONTAINER_NAME="${CGX_PG_NAME:-cgx-pg}"

if [ "${CLEAN:-0}" = "1" ]; then
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME")" != "true" ]; then
    docker start "$CONTAINER_NAME" >/dev/null
  fi
else
  docker run --name "$CONTAINER_NAME" \
    -e POSTGRES_DB=code_graph_explorer \
    -e POSTGRES_USER=codegraph \
    -e POSTGRES_PASSWORD=007 \
    -p 5432:5432 -d postgres:16 >/dev/null
fi

echo "Waiting for Postgres to be ready..."
for i in {1..40}; do
  if docker exec "$CONTAINER_NAME" pg_isready -U codegraph -d code_graph_explorer -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    echo "Postgres is ready."
    break
  fi
  sleep 1
  if [ "$i" = "40" ]; then
    echo "❌ Postgres did not become ready in time."
    exit 1
  fi
done

# ---------- Backend env ----------
export DB_NAME='code_graph_explorer'
export DB_USER='codegraph'
export DB_PASSWORD='007'
export DB_HOST='127.0.0.1'
export DB_PORT='5432'

# ---------- API base & curl defaults ----------
BASE_URL="${BASE_URL:-http://127.0.0.1:8000}"
CURL_COMMON=(-sS --fail --connect-timeout 5 --max-time 30)

# ---------- Python & venv ----------
pushd "$BACKEND_DIR" >/dev/null

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  PYTHON_BIN=python
fi

if ! "$PYTHON_BIN" -c "import venv" >/dev/null 2>&1; then
  echo "❌ Python venv module not available."
  echo "   On Debian/Ubuntu: sudo apt-get install -y python3-venv"
  exit 1
fi

VENV_DIR="${VENV_DIR:-$BACKEND_DIR/.venv}"
if [ ! -d "$VENV_DIR" ]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

VENV_PY="$VENV_DIR/bin/python"
VENV_PIP="$VENV_DIR/bin/pip"

"$VENV_PIP" install --upgrade pip setuptools wheel
"$VENV_PIP" install -r requirements.txt

# ---------- Django setup & run ----------
"$VENV_PY" manage.py migrate

# Free up port 8000 if needed
if lsof -i :8000 >/dev/null 2>&1; then
  echo "Port 8000 in use; attempting to stop old server..."
  pkill -f "manage.py runserver 0.0.0.0:8000" >/dev/null 2>&1 || true
  sleep 1
fi

( "$VENV_PY" manage.py runserver 0.0.0.0:8000 > /tmp/django.out 2>&1 & )
sleep 3
popd >/dev/null

# ---------- Wait for API ----------
echo "Waiting for Django API to respond..."
for i in {1..40}; do
  code=$(curl "${CURL_COMMON[@]}" -o /dev/null -w "%{http_code}" \
    -H "Accept: application/json" "$BASE_URL/api/projects/" || true)
  if [[ "$code" =~ ^(200|401)$ ]]; then
    echo "Django API is up."
    break
  fi
  sleep 1
  if [ "$i" = "40" ]; then
    echo "❌ API did not respond in time."
    exit 1
  fi
done

# ---------- Test user (User1) ----------
USER="alice_$RANDOM"
EMAIL="${USER}@example.com"
PASS="S3cur3P@ss!"

echo "Registering user: $USER <$EMAIL>"
curl "${CURL_COMMON[@]}" -X POST "$BASE_URL/api/auth/register/" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
  | "$VENV_PY" -m json.tool || true

# ---------- Robust login & token capture (access + refresh if available) ----------
get_tokens() {
  local USERNAME="$1" PASSWORD="$2"
  local endpoints=(
    "/api/auth/token/"
    "/api/token/"
    "/api/auth/jwt/create/"
  )
  local ACCESS="" REFRESH=""
  for ep in "${endpoints[@]}"; do
    RESP=$(curl "${CURL_COMMON[@]}" -w '\n%{http_code}' -X POST "$BASE_URL$ep" \
      -H "Content-Type: application/json" \
      -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" || true)
    BODY="${RESP%$'\n'*}"
    CODE="${RESP##*$'\n'}"

    read -r ACCESS REFRESH <<EOF
$(
  printf '%s' "$BODY" | "$VENV_PY" -c '
import sys, json
try:
    d = json.load(sys.stdin)
    a = d.get("access") or d.get("token") or d.get("jwt") or ""
    r = d.get("refresh") or ""
    print((a or "") + " " + (r or ""))
except Exception:
    print(" ")
' 2>/dev/null
)
EOF

    if [ -n "${ACCESS:-}" ]; then
      echo "$ACCESS" "$REFRESH"
      return 0
    fi

    if [ "$CODE" = "200" ]; then
      echo "⚠️  $ep returned 200 but no token. Body:" >&2
      echo "$BODY" >&2
    else
      echo "ℹ️  $ep returned HTTP $CODE; trying next..." >&2
    fi
  done

  echo "" ""   # no tokens
  return 1
}

read -r ACCESS REFRESH <<<"$(get_tokens "$USER" "$PASS")"
if [ -z "$ACCESS" ]; then
  echo "❌ Could not login to obtain access token."
  exit 1
fi

echo "Logged in as $USER"
echo "ACCESS=${ACCESS:0:20}..."
[ -n "${REFRESH:-}" ] && echo "Has refresh token."

# ---------- List projects (before) ----------
echo "Listing projects (before):"
curl "${CURL_COMMON[@]}" "$BASE_URL/api/projects/" \
  -H "Authorization: Bearer $ACCESS" | "$VENV_PY" -m json.tool || true

# ---------- Create project A (update target) ----------
PID_A=$(
  curl "${CURL_COMMON[@]}" -X POST "$BASE_URL/api/projects/" \
    -H "Authorization: Bearer $ACCESS" \
    -H "Content-Type: application/json" \
    -d '{"name":"Project A"}' \
  | "$VENV_PY" -c '
import sys, json
d = json.load(sys.stdin)
print(d.get("id") or d.get("pk") or d.get("uuid") or d.get("project_id") or "")
'
)
echo "PID_A=${PID_A}"
[ -n "$PID_A" ] || { echo "❌ Could not capture PID_A"; exit 1; }

# ---------- Project detail (GET) ----------
echo "GET detail for Project A:"
curl "${CURL_COMMON[@]}" "$BASE_URL/api/projects/$PID_A/" \
  -H "Authorization: Bearer $ACCESS" | "$VENV_PY" -m json.tool || true

# ---------- Project update (PATCH -> fallback PUT) ----------
echo "PATCH name for Project A:"
PATCH_CODE=$(curl "${CURL_COMMON[@]}" -o /dev/null -w "%{http_code}" -X PATCH \
  "$BASE_URL/api/projects/$PID_A/" \
  -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" \
  -d '{"name":"Project A (patched)"}' || true)

if [ "$PATCH_CODE" != "200" ] && [ "$PATCH_CODE" != "202" ]; then
  echo "PATCH returned $PATCH_CODE, trying PUT…"
  curl "${CURL_COMMON[@]}" -X PUT "$BASE_URL/api/projects/$PID_A/" \
    -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" \
    -d '{"name":"Project A (put)"}' | "$VENV_PY" -m json.tool || true
else
  curl "${CURL_COMMON[@]}" "$BASE_URL/api/projects/$PID_A/" \
    -H "Authorization: Bearer $ACCESS" | "$VENV_PY" -m json.tool || true
fi

# ---------- Create a file in Project A ----------
echo "Create README.md in Project A:"
curl "${CURL_COMMON[@]}" -X POST "$BASE_URL/api/projects/$PID_A/file/" \
  -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" \
  -d '{"path":"README.md","content":"# hello from curl (A)"}' \
  | "$VENV_PY" -m json.tool || true

# ---------- Update same file in Project A (idempotency check) ----------
echo "Update README.md in Project A:"
curl "${CURL_COMMON[@]}" -X POST "$BASE_URL/api/projects/$PID_A/file/" \
  -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" \
  -d '{"path":"README.md","content":"# updated via curl (A)"}' \
  | "$VENV_PY" -m json.tool || true

# ---------- Create project B (delete target) ----------
PID_B=$(
  curl "${CURL_COMMON[@]}" -X POST "$BASE_URL/api/projects/" \
    -H "Authorization: Bearer $ACCESS" \
    -H "Content-Type: application/json" \
    -d '{"name":"Project B (to delete)"}' \
  | "$VENV_PY" -c '
import sys, json
d = json.load(sys.stdin)
print(d.get("id") or d.get("pk") or d.get("uuid") or d.get("project_id") or "")
'
)
echo "PID_B=${PID_B}"
[ -n "$PID_B" ] || { echo "❌ Could not capture PID_B"; exit 1; }

# ---------- Delete Project B and verify ----------
echo "DELETE Project B:"
DEL_CODE=$(curl "${CURL_COMMON[@]}" -o /dev/null -w "%{http_code}" -X DELETE \
  "$BASE_URL/api/projects/$PID_B/" -H "Authorization: Bearer $ACCESS" || true)
echo "Delete returned HTTP $DEL_CODE (expect 204/200)"

echo "GET detail for deleted Project B (expect 404):"
curl -i -sS "$BASE_URL/api/projects/$PID_B/" -H "Authorization: Bearer $ACCESS" | sed -n '1,10p' || true

# ---------- Cross-user isolation (User2) ----------
USER2="bob_$RANDOM"; EMAIL2="${USER2}@example.com"; PASS2="S3cur3P@ss!"
echo "Registering second user: $USER2 <$EMAIL2>"
curl "${CURL_COMMON[@]}" -X POST "$BASE_URL/api/auth/register/" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER2\",\"email\":\"$EMAIL2\",\"password\":\"$PASS2\"}" \
  | "$VENV_PY" -m json.tool || true

read -r ACCESS2 REFRESH2 <<<"$(get_tokens "$USER2" "$PASS2")"
[ -n "$ACCESS2" ] || { echo "❌ User2 login failed"; exit 1; }

echo "User2 lists projects (should not show User1's Project A):"
curl "${CURL_COMMON[@]}" "$BASE_URL/api/projects/" -H "Authorization: Bearer $ACCESS2" \
  | "$VENV_PY" -m json.tool || true

echo "User2 tries to write file into User1's Project A (expect 403/404):"
curl -i -sS -X POST "$BASE_URL/api/projects/$PID_A/file/" \
  -H "Authorization: Bearer $ACCESS2" -H "Content-Type: application/json" \
  -d '{"path":"hack.md","content":"nope"}' | sed -n '1,12p' || true

echo "User2 tries to GET detail of Project A (expect 403/404):"
curl -i -sS "$BASE_URL/api/projects/$PID_A/" \
  -H "Authorization: Bearer $ACCESS2" | sed -n '1,12p' || true

# ---------- Optional: Sharing attempts (skip cleanly if not supported) ----------
share_attempted=""
share_success=""

try_share() {
  # try a few common share endpoints and payloads
  local endpoints=(
    "/api/projects/$PID_A/share/"
    "/api/projects/$PID_A/shares/"
    "/api/projects/$PID_A/collaborators/"
    "/api/projects/$PID_A/editors/"
  )
  local payloads=(
    "{\"username\":\"$USER2\",\"role\":\"editor\"}"
    "{\"user\":\"$USER2\",\"role\":\"editor\"}"
    "{\"username\":\"$USER2\"}"
    "{\"email\":\"$EMAIL2\",\"role\":\"editor\"}"
  )
  for ep in "${endpoints[@]}"; do
    for data in "${payloads[@]}"; do
      code=$(curl -o /dev/null -w "%{http_code}" -sS -X POST "$BASE_URL$ep" \
        -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" \
        -d "$data" || true)
      if [[ "$code" =~ ^(200|201|204)$ ]]; then
        echo "Sharing succeeded via $ep"
        share_success="1"
        return 0
      elif [[ "$code" =~ ^(400|403|404|405)$ ]]; then
        share_attempted="1"
        # continue trying others
        :
      fi
    done
  done
  return 1
}

echo "Attempting to share Project A with User2 (best-effort)…"
if try_share; then
  echo "Re-try write as User2 (should succeed if editor):"
  curl -i -sS -X POST "$BASE_URL/api/projects/$PID_A/file/" \
    -H "Authorization: Bearer $ACCESS2" -H "Content-Type: application/json" \
    -d '{"path":"collab.md","content":"hello from user2"}' | sed -n '1,12p' || true
else
  if [ -n "$share_attempted" ]; then
    echo "Sharing endpoints tried but none succeeded; skipping collaborator write test."
  else
    echo "No recognizable sharing endpoints; skipping."
  fi
fi

# ---------- Optional: JWT refresh ----------
if [ -n "${REFRESH:-}" ]; then
  echo "Refreshing access token…"
  RESP=$(curl -sS -w '\n%{http_code}' -X POST "$BASE_URL/api/auth/token/refresh/" \
    -H "Content-Type: application/json" -d "{\"refresh\":\"$REFRESH\"}" || true)
  BODY="${RESP%$'\n'*}"; CODE="${RESP##*$'\n'}"
  NEW_ACCESS=$(printf '%s' "$BODY" | "$VENV_PY" -c 'import sys,json; d=json.load(sys.stdin); print(d.get("access",""))' 2>/dev/null || true)
  if [ "$CODE" = "200" ] && [ -n "$NEW_ACCESS" ]; then
    ACCESS="$NEW_ACCESS"
    echo "Refresh OK; new ACCESS=${ACCESS:0:20}..."
    # small check with new token
    curl "${CURL_COMMON[@]}" "$BASE_URL/api/projects/" -H "Authorization: Bearer $ACCESS" \
      | "$VENV_PY" -m json.tool >/dev/null || true
  else
    echo "Token refresh not available (HTTP $CODE)."
  fi
else
  echo "No refresh token provided by login; skipping refresh test."
fi

# ---------- Final project list ----------
echo "Final project list for User1:"
curl "${CURL_COMMON[@]}" "$BASE_URL/api/projects/" \
  -H "Authorization: Bearer $ACCESS" | "$VENV_PY" -m json.tool || true

# ---------- Export useful vars ----------
ENV_FILE="$SCRIPT_DIR/.e2e.env"
{
  echo "ACCESS='$ACCESS'"
  echo "REFRESH='${REFRESH:-}'"
  echo "USER='$USER'"
  echo "EMAIL='$EMAIL'"
  echo "USER2='$USER2'"
  echo "EMAIL2='$EMAIL2'"
  echo "ACCESS2='${ACCESS2:-}'"
  echo "PID_A='$PID_A'"
  echo "PID_B='${PID_B:-}'"
  echo "BASE_URL='$BASE_URL'"
} > "$ENV_FILE"
echo "✅ Done. Saved env to $ENV_FILE"
