#!/bin/bash
# Run this ON THE MACBOOK PRO. Installs the media server as always-on LaunchAgents:
#   com.zane.tnn-media-server    node server, restarted by launchd whenever it exits
#   com.zane.tnn-media-awake     keeps the Mac from sleeping while on power
#   com.zane.tnn-media-tunnel    Cloudflare tunnel (once cloudflared is set up)
#   com.zane.tnn-media-watchdog  checks everything every 2 minutes, restarts what's down
# Safe to re-run: updates the installed code and keeps existing settings.
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$HOME/Library/Application Support/tnn-media"
LOG_DIR="$HOME/Library/Logs/tnn-media"
AGENTS="$HOME/Library/LaunchAgents"
ENV_FILE="$APP_DIR/media.env"
DOMAIN="gui/$(id -u)"
WATCHDOG_INTERVAL_S=120

mkdir -p "$APP_DIR/bin" "$LOG_DIR" "$AGENTS"

# Code lives outside ~/Documents so launchd can run it without privacy prompts.
rsync -a --delete --exclude test --exclude ops --exclude node_modules "$SRC_DIR/" "$APP_DIR/server/"
cp "$SRC_DIR"/ops/{run-tunnel,watchdog,uninstall}.sh "$APP_DIR/bin/"
chmod +x "$APP_DIR"/bin/*.sh

platform_env() { grep -E "^$1=" "$SRC_DIR/../.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true; }

if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<CONF
NODE_BIN="$(command -v node)"
MEDIA_ROOT="$HOME/Documents/Zane Server Public"
MEDIA_PUBLIC_URL=https://media.bthstnn.org
MEDIA_ALLOWED_ORIGINS=https://platform.bthstnn.org,http://platform.bthstnn.org
MEDIA_SIGNING_SECRET=$(openssl rand -hex 32)
SUPABASE_URL=$(platform_env VITE_SUPABASE_URL)
SUPABASE_ANON_KEY=$(platform_env VITE_SUPABASE_ANON_KEY)
MEDIA_PORT=8090
TUNNEL_NAME=tnn-media
# Or paste a Cloudflare dashboard tunnel token instead of using TUNNEL_NAME:
TUNNEL_TOKEN=
CONF
  chmod 600 "$ENV_FILE"
  echo "Wrote settings to $ENV_FILE"
fi
set -a; source "$ENV_FILE"; set +a
for name in NODE_BIN SUPABASE_URL SUPABASE_ANON_KEY; do
  if [[ -z "${!name:-}" ]]; then
    echo "$name is empty in $ENV_FILE. Fill it in and re-run." >&2
    exit 1
  fi
done
mkdir -p "$MEDIA_ROOT"

# write_agent <label> <keepalive|interval> <program> [args...]
write_agent() {
  local label=$1 mode=$2; shift 2
  local args="" arg schedule
  for arg in "$@"; do args+="<string>$arg</string>"; done
  if [[ $mode == keepalive ]]; then
    schedule="<key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer>"
  else
    schedule="<key>StartInterval</key><integer>$WATCHDOG_INTERVAL_S</integer>"
  fi
  cat > "$AGENTS/$label.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array>$args</array>
  <key>WorkingDirectory</key><string>$APP_DIR/server</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  $schedule
  <key>StandardOutPath</key><string>$LOG_DIR/${label#com.zane.}.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/${label#com.zane.}.log</string>
</dict></plist>
PLIST
  launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
  # bootout returns before the old job is gone; bootstrapping too early fails.
  for _ in {1..20}; do launchctl print "$DOMAIN/$label" >/dev/null 2>&1 || break; sleep 0.25; done
  launchctl bootstrap "$DOMAIN" "$AGENTS/$label.plist"
  echo "Loaded $label"
}

tunnel_ready() {
  command -v cloudflared >/dev/null || return 1
  [[ -n "${TUNNEL_TOKEN:-}" ]] && return 0
  ls "$HOME"/.cloudflared/*.json >/dev/null 2>&1
}

# node runs directly (not through a shell) so only node needs Full Disk Access.
write_agent com.zane.tnn-media-server keepalive "$NODE_BIN" "--env-file=$ENV_FILE" server.js
write_agent com.zane.tnn-media-awake keepalive /usr/bin/caffeinate -is
if tunnel_ready; then
  write_agent com.zane.tnn-media-tunnel keepalive /bin/bash "$APP_DIR/bin/run-tunnel.sh"
else
  echo "Tunnel not set up yet (see media-server/README.md). Re-run this afterwards."
fi
write_agent com.zane.tnn-media-watchdog interval /bin/bash "$APP_DIR/bin/watchdog.sh"

for _ in {1..10}; do
  curl -fsS -m 2 -o /dev/null "http://127.0.0.1:${MEDIA_PORT:-8090}/health" 2>/dev/null && break
  sleep 1
done
if ! curl -fsS -m 5 -o /dev/null "http://127.0.0.1:${MEDIA_PORT:-8090}/health"; then
  echo "Server did not answer. Check $LOG_DIR/tnn-media-server.log" >&2
  exit 1
fi
echo "Media server is up locally. Logs: $LOG_DIR"
echo "Last step: System Settings > Privacy & Security > Full Disk Access > + > add $NODE_BIN"
echo "(press Cmd+Shift+G in the picker and paste the path), so it can read $MEDIA_ROOT."
