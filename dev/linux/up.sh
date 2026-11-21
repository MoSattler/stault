#!/bin/sh
# Builds and starts the Linux test desktop (container "stault-linux"), on the
# same Docker network as the test server from ./dev/seed.sh, which it reaches
# at http://gamevault:8080. Safe to run again; that starts a fresh desktop.
#
#   Watch the screen:   open vnc://127.0.0.1:5901   (no password)
#   Run something:      docker exec stault-linux <command>
#   This checkout:      /src inside the container, read-only
set -eu
cd "$(dirname "$0")"

# The app ships for x64 and Proton needs it; on Apple Silicon this runs through Rosetta.
docker build --platform linux/amd64 -t stault-linux .
docker rm -f stault-linux >/dev/null 2>&1 || true
# Without the default seccomp filter, WebKit and umu-launcher can build their sandboxes.
docker run -d --init --name stault-linux --platform linux/amd64 \
	--network dev_default \
	--security-opt seccomp=unconfined \
	--shm-size 1g \
	-p 127.0.0.1:5901:5900 \
	-v "$(cd ../.. && pwd)":/src:ro \
	stault-linux >/dev/null
echo "Linux desktop is up. Watch it at vnc://127.0.0.1:5901"
