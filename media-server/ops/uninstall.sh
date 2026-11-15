#!/bin/bash
# Stops and removes the media server LaunchAgents. Leaves media files and settings alone.
set -uo pipefail
DOMAIN="gui/$(id -u)"
for label in com.zane.tnn-media-{watchdog,tunnel,server,awake}; do
  launchctl bootout "$DOMAIN/$label" 2>/dev/null && echo "Stopped $label"
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
done
