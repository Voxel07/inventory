#!/bin/sh
set -eu

VITE_API_URL="${VITE_API_URL:-http://127.0.0.1:8080}"
VITE_OIDC_AUTHORITY="${VITE_OIDC_AUTHORITY:-}"
VITE_OIDC_CLIENT_ID="${VITE_OIDC_CLIENT_ID:-}"
VITE_OIDC_REDIRECT_URI="${VITE_OIDC_REDIRECT_URI:-}"
VITE_OIDC_SCOPE="${VITE_OIDC_SCOPE:-openid profile email offline_access}"
# Local Docker development without OIDC only; the prod API profile refuses dev authentication anyway.
VITE_DEV_LOGIN="${VITE_DEV_LOGIN:-false}"
CONFIG_PATH="${CONFIG_PATH:-/usr/share/nginx/html/config.js}"
SECURITY_HEADERS_PATH="${SECURITY_HEADERS_PATH:-/etc/nginx/snippets/security-headers.conf}"

validate_url() {
  name="$1"
  candidate="$2"
  [ -z "$candidate" ] && return 0
  case "$candidate" in
    http://*|https://*) ;;
    *)
      echo "$name must be an absolute HTTP(S) URL" >&2
      exit 1
      ;;
  esac
  if printf '%s' "$candidate" | grep -Eq '[[:space:]"]'; then
    echo "$name must not contain whitespace or quotes" >&2
    exit 1
  fi
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

validate_url VITE_API_URL "$VITE_API_URL"
validate_url VITE_OIDC_AUTHORITY "$VITE_OIDC_AUTHORITY"
validate_url VITE_OIDC_REDIRECT_URI "$VITE_OIDC_REDIRECT_URI"
if { [ -n "$VITE_OIDC_AUTHORITY" ] && [ -z "$VITE_OIDC_CLIENT_ID" ]; } \
  || { [ -z "$VITE_OIDC_AUTHORITY" ] && [ -n "$VITE_OIDC_CLIENT_ID" ]; }; then
  echo "VITE_OIDC_AUTHORITY and VITE_OIDC_CLIENT_ID must be configured together" >&2
  exit 1
fi
if ! printf '%s' "$VITE_OIDC_SCOPE" | grep -Eq '^[A-Za-z0-9._:-]+( [A-Za-z0-9._:-]+)*$'; then
  echo "VITE_OIDC_SCOPE must be a space-separated list of scope names" >&2
  exit 1
fi

# scheme://host[:port] of an absolute URL; empty for an empty value.
origin() {
  printf '%s' "$1" | sed -E 's|^(https?://[^/?#]+).*$|\1|'
}

API_ORIGIN="$(origin "$VITE_API_URL")"
OIDC_ORIGIN="$(origin "$VITE_OIDC_AUTHORITY")"
CONNECT_SRC="'self' $API_ORIGIN${OIDC_ORIGIN:+ $OIDC_ORIGIN}"

mkdir -p "$(dirname "$SECURITY_HEADERS_PATH")"
cat <<EOF > "$SECURITY_HEADERS_PATH"
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src $CONNECT_SRC" always;
EOF

cat <<EOF > "$CONFIG_PATH"
window.__ENV__ = {
  API_URL: "$(json_escape "$VITE_API_URL")",
  OIDC_AUTHORITY: "$(json_escape "$VITE_OIDC_AUTHORITY")",
  OIDC_CLIENT_ID: "$(json_escape "$VITE_OIDC_CLIENT_ID")",
  OIDC_REDIRECT_URI: "$(json_escape "$VITE_OIDC_REDIRECT_URI")",
  OIDC_SCOPE: "$(json_escape "$VITE_OIDC_SCOPE")",
  DEV_LOGIN: "$(json_escape "$VITE_DEV_LOGIN")"
};
EOF

exec "$@"
