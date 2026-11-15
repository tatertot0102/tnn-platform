#!/bin/bash
# Started by launchd (com.zane.tnn-media-tunnel). Publishes the local server
# through Cloudflare as $MEDIA_PUBLIC_URL.
set -euo pipefail
APP_DIR="$HOME/Library/Application Support/tnn-media"
set -a; source "$APP_DIR/media.env"; set +a
CLOUDFLARED="$(command -v cloudflared || echo /opt/homebrew/bin/cloudflared)"
if [[ ! -x "$CLOUDFLARED" ]]; then
  echo "[tunnel] cloudflared is not installed (brew install cloudflared)" >&2
  exit 1
fi
if [[ -n "${TUNNEL_TOKEN:-}" ]]; then
  exec "$CLOUDFLARED" tunnel --no-autoupdate run --token "$TUNNEL_TOKEN"
fi
exec "$CLOUDFLARED" tunnel --no-autoupdate run --url "http://127.0.0.1:${MEDIA_PORT:-8090}" "${TUNNEL_NAME:-tnn-media}"
