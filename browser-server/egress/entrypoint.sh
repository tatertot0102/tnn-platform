#!/bin/sh
# Runs the egress proxy (browser -> internet) and the ingress forwarder
# (gate -> browser web UI) side by side. If either stops, exit so Docker
# restarts the whole container.
set -eu

# A restarted container keeps its old /tmp, and a leftover PID file makes Squid
# refuse to start ("already running"), which left the browser behind a bad
# gateway after every reboot.
rm -f /tmp/squid.pid

squid -N -f /etc/squid/squid.conf &
squid_pid=$!

socat TCP-LISTEN:3000,fork,reuseaddr TCP:tnn-browser:3000 &
socat_pid=$!

while kill -0 "$squid_pid" 2>/dev/null && kill -0 "$socat_pid" 2>/dev/null; do
  sleep 2
done
exit 1
