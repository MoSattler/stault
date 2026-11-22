#!/bin/sh
# Runs this checkout's code in the Linux test desktop (start that first with
# ./dev/linux/up.sh). The app's log is /tmp/stault.log in the container.
#
# On an Apple Silicon host Hutch can't build inside the container: Rosetta
# refuses to start its toolchain. The app's JavaScript is the same on every
# OS, so it is built here and put into the latest released Linux app instead.
set -eu
cd "$(dirname "$0")/../.."
APP=/home/deck/.local/share/com.mosattler.stault/stable/app
RES=$APP/Resources/app
in_linux() { docker exec stault-linux sh -c "$1"; }

hutch run build:dev
BUILT=$(echo build/dev-*/*.app/Contents/Resources/app)

if ! in_linux "test -x $APP/bin/launcher"; then
	in_linux 'mkdir -p /tmp/release && cd /tmp/release \
		&& curl -fsSL https://github.com/MoSattler/stault/releases/latest/download/linux-x64-Stault-Setup.tar.gz | tar -xz \
		&& ./installer >/dev/null'
	# The installer starts the app once it is done.
	sleep 3
fi

in_linux 'pkill -f "[s]tault/stable/app/bin" || true'
# docker cp keeps this machine's file owner, so root tidies up around it.
docker exec -u root stault-linux rm -rf "$RES/bun" "$RES/views"
docker cp -q "$BUILT/bun" "stault-linux:$RES/bun"
docker cp -q "$BUILT/views" "stault-linux:$RES/views"
docker exec -u root stault-linux chown -R deck:deck "$RES"
# The bundled programs differ by OS, and the released app may predate one of
# them; the app's own Bun fetches the Linux ones.
if ! in_linux "test -x $RES/ludusavi/ludusavi && test -x $RES/umu/umu-run"; then
	in_linux "rm -rf /tmp/fetch && mkdir -p /tmp/fetch/dev"
	docker exec -i stault-linux sh -c "cat > /tmp/fetch/dev/fetch-vendor.ts" < dev/fetch-vendor.ts
	in_linux "$APP/bin/bun /tmp/fetch/dev/fetch-vendor.ts && rm -rf $RES/ludusavi $RES/umu \
		&& cp -r /tmp/fetch/vendor/ludusavi /tmp/fetch/vendor/umu $RES/"
fi

docker exec -d stault-linux sh -c "$APP/bin/launcher > /tmp/stault.log 2>&1"
echo "Stault is starting in the Linux desktop. Log: docker exec stault-linux cat /tmp/stault.log"
