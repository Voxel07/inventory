#!/bin/sh
set -e

# Generate runtime config from environment variables
cat <<EOF > /usr/share/nginx/html/config.js
window.__ENV__ = {
  POCKETBASE_URL: "${POCKETBASE_URL:-http://127.0.0.1:8090}"
};
EOF

exec "$@"
