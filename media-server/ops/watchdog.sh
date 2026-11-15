#!/bin/bash
# Run every few minutes by launchd (com.zane.tnn-media-watchdog). Makes sure the
# server and tunnel agents are loaded and healthy, restarting whichever is down.
set -uo pipefail
APP_DIR="$HOME/Library/Application Support/tnn-media"
AGENTS="$HOME/Library/LaunchAgents"
DOMAIN="gui/$(id -u)"
SERVER=com.zane.tnn-media-server
TUNNEL=com.zane.tnn-media-tunnel
set -a; source "$APP_DIR/media.env"; set +a

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

ensure_loaded() {
  launchctl print "$DOMAIN/$1" >/dev/null 2>&1 && return
  log "$1 was not loaded; loading it"
  launchctl bootstrap "$DOMAIN" "$AGENTS/$1.plist"
}

# Retry once so a service that is mid-start isn't restarted for nothing.
healthy() {
  curl -fsS -m "$2" -o /dev/null "$1/health" && return 0
  sleep 10
  curl -fsS -m "$2" -o /dev/null "$1/health"
}

ensure_loaded "$SERVER"
ensure_loaded com.zane.tnn-media-awake
if ! healthy "http://127.0.0.1:${MEDIA_PORT:-8090}" 5; then
  log "local server not answering; restarting it"
  launchctl kickstart -k "$DOMAIN/$SERVER"
  exit 0
fi

[[ -f "$AGENTS/$TUNNEL.plist" ]] || exit 0
ensure_loaded "$TUNNEL"
if ! healthy "$MEDIA_PUBLIC_URL" 15; then
  log "$MEDIA_PUBLIC_URL not reachable; restarting the tunnel"
  launchctl kickstart -k "$DOMAIN/$TUNNEL"
fi
