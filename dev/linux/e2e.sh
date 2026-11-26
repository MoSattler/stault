#!/bin/sh
# Runs the end-to-end tests (e2e/) against this checkout's code on Linux, in a
# container of their own, "stault-e2e". Start the test server first with
# ./dev/seed.sh. Arguments go to WebdriverIO:
#
#   ./dev/linux/e2e.sh --spec specs/sign-in.e2e.ts
#
# As in run.sh, the app's JavaScript is built here and put into the latest
# released Linux app. The result is marked as a dev build: WebdriverIO runs a
# copy of the app from a temporary folder, and a release build refuses to start
# anywhere but where it was installed.
set -eu
cd "$(dirname "$0")/../.."
in_linux() { docker exec stault-e2e sh -c "$1"; }
# Without macOS's extra file attributes, which Linux's tar warns about.
pack() { COPYFILE_DISABLE=1 tar --no-xattrs -c "$@"; }

hutch run build:dev
BUILT=$(echo build/dev-*/*.app/Contents/Resources/app)

# The same image as the Linux desktop's. A new image means a new container.
docker build -q --platform linux/amd64 -t stault-linux dev/linux >/dev/null
if [ "$(docker inspect -f '{{.Image}}' stault-e2e 2>/dev/null)" != "$(docker image inspect -f '{{.Id}}' stault-linux)" ]; then
	docker rm -f stault-e2e >/dev/null 2>&1 || true
	docker run -d --init --name stault-e2e --platform linux/amd64 \
		--network dev_default \
		--security-opt seccomp=unconfined \
		--shm-size 1g \
		stault-linux sleep infinity >/dev/null
fi

# Kept between runs: the released app and the tests' packages.
in_linux 'test -x ~/release/Stault/bin/launcher || { mkdir -p ~/release && curl -fsSL \
	https://github.com/MoSattler/stault/releases/latest/download/stable-linux-x64-Stault.tar.zst \
	| tar --zstd -x -C ~/release; }'

# Made anew for each run: the app, the tests and everything they leave behind.
in_linux 'pkill -x WebKitWebDriver; pkill -x launcher; pkill -x Xvfb; pkill -x node; rm -rf /tmp/e2e
	mkdir -p /tmp/e2e/repo /tmp/e2e/tmp ~/e2e-packages
	rsync -a --exclude /Resources/app/bun --exclude /Resources/app/views ~/release/Stault/ /tmp/e2e/app/
	sed -i "s/\"channel\":\"stable\"/\"channel\":\"dev\"/" /tmp/e2e/app/Resources/version.json
	sed -i "s/\"buildEnvironment\":\"stable\"/\"buildEnvironment\":\"dev\"/" /tmp/e2e/app/Resources/build.json'
pack -C "$BUILT" bun views | docker exec -i stault-e2e tar -x -C /tmp/e2e/app/Resources/app
pack --exclude node_modules --exclude failures e2e dev/seed.sh | docker exec -i stault-e2e tar -x -C /tmp/e2e/repo

in_linux 'cd ~/e2e-packages && ln -s ~/e2e-packages/node_modules /tmp/e2e/repo/e2e/node_modules
	cmp -s /tmp/e2e/repo/e2e/package-lock.json installed.json && exit
	cp /tmp/e2e/repo/e2e/package.json /tmp/e2e/repo/e2e/package-lock.json . \
		&& npm ci --no-audit --no-fund --no-update-notifier && cp package-lock.json installed.json'

# In here the test server and its identity provider go by other names. With
# their ports forwarded, the tests reach them at the addresses they have on
# the Docker host and on CI, which is where single sign-on's redirects lead.
docker exec -d stault-e2e node -e '
const net = require("node:net");
for (const [port, host] of [[18080, "gamevault"], [18081, "sso"]]) {
	net.createServer((client) => {
		const server = net.connect(8080, host);
		client.pipe(server).pipe(client);
		client.on("error", () => server.destroy());
		server.on("error", () => client.destroy());
	}).listen(port, "127.0.0.1");
}'

status=0
docker exec -w /tmp/e2e/repo/e2e \
	-e TMPDIR=/tmp/e2e/tmp \
	-e STAULT_APP=/tmp/e2e/app/bin/launcher \
	stault-e2e npx wdio run wdio.conf.ts "$@" || status=$?

# Pictures of the window at each failed check.
rm -rf e2e/failures
if in_linux 'test -d /tmp/e2e/repo/e2e/failures'; then
	docker cp -q stault-e2e:/tmp/e2e/repo/e2e/failures e2e/failures
	echo "Screenshots of the failures: e2e/failures/"
fi
exit $status
