#!/bin/sh
set -e

# Generate runtime config from environment variables
cat <<EOF > /usr/share/nginx/html/config.js
window.__ENV__ = {
  API_URL: "${API_URL:-http://127.0.0.1:8080}",
  OIDC_LOGIN_URL: "${OIDC_LOGIN_URL:-}"
};
EOF

exec "$@"
