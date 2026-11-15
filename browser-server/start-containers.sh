#!/bin/bash
# (Re)creates the remote browser on the Mac. Safe to run again.
#
#   tnn-browser       Chromium. Lives on an *internal* Docker network: no route
#                     to the Mac, the home network or the internet. Its only way
#                     out is the proxy below. Chromium is told to use it, and the
#                     proxy variables make installers (apt, curl, the Apps panel)
#                     use it too. /config is a volume, so installed apps and the
#                     profile survive restarts.
#   tnn-browser-edge  Squid egress proxy that refuses private addresses, plus a
#                     forwarder that carries the gate's connection to Chromium's
#                     web UI. Published on 127.0.0.1:3100 only.
set -euo pipefail

DIR="$HOME/.tnn-browser"
PASSWORD="$(cat "$DIR/container-password")"
TZ_NAME="${TZ_NAME:-America/New_York}"

docker build -q -t tnn-browser-egress:1 "$DIR/egress" >/dev/null

docker network inspect tnn-browser-int >/dev/null 2>&1 || docker network create --internal tnn-browser-int >/dev/null
docker network inspect tnn-browser-ext >/dev/null 2>&1 || docker network create tnn-browser-ext >/dev/null

docker rm -f tnn-browser tnn-browser-edge >/dev/null 2>&1 || true

docker run -d --name tnn-browser-edge --restart unless-stopped \
  --network tnn-browser-ext \
  -p 127.0.0.1:3100:3000 \
  --security-opt no-new-privileges \
  --memory 256m \
  tnn-browser-egress:1 >/dev/null
docker network connect --alias edge tnn-browser-int tnn-browser-edge

docker run -d --name tnn-browser --restart unless-stopped \
  --network tnn-browser-int \
  -e CUSTOM_USER=browser -e PASSWORD="$PASSWORD" -e TZ="$TZ_NAME" \
  -e CHROME_CLI="--proxy-server=http://edge:3128" \
  -e HTTP_PROXY=http://edge:3128 -e HTTPS_PROXY=http://edge:3128 \
  -e http_proxy=http://edge:3128 -e https_proxy=http://edge:3128 \
  -e NO_PROXY=localhost,127.0.0.1,edge -e no_proxy=localhost,127.0.0.1,edge \
  -v tnn-browser-config:/config \
  --shm-size 1gb --memory 3g --cpus 3 --pids-limit 1024 \
  lscr.io/linuxserver/chromium:latest >/dev/null

echo "remote browser started"
