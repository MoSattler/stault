# A Linux desktop in a container, for running and testing Stault on Linux.
# Start it with ./dev/linux/up.sh.
#
# Debian 13 rather than Arch (which SteamOS is built on): current Arch loads
# GTK's icons through a sandbox that fails under Rosetta on an Apple Silicon
# host, and GTK then aborts the app as soon as it opens a file dialog.
FROM debian:trixie-slim

# There is no GPU, so Mesa's software drivers render everything.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		libwebkit2gtk-4.1-0 libgtk-3-0 libayatana-appindicator3-1 \
		xvfb xauth openbox xdotool x11vnc x11-utils imagemagick \
		webkitgtk-webdriver \
		dbus dbus-x11 gnome-keyring libsecret-tools \
		adwaita-icon-theme librsvg2-common fonts-dejavu fonts-noto-core \
		libgl1-mesa-dri mesa-vulkan-drivers \
		gcc-mingw-w64-x86-64 \
		ca-certificates curl git zip unzip zstd xz-utils rsync sudo procps python3 \
	&& rm -rf /var/lib/apt/lists/*

# Windows games run through the umu-launcher that comes with Stault, on the
# python3 above. Proton wants 32-bit graphics libraries as well.
RUN dpkg --add-architecture i386 \
	&& apt-get update \
	&& apt-get install -y --no-install-recommends libgl1-mesa-dri:i386 libglx-mesa0:i386 \
	&& rm -rf /var/lib/apt/lists/*

# The end-to-end tests (e2e.sh) run on Node, and need a newer one than Debian's.
ARG NODE_VERSION=24.22.3
RUN curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" \
	| tar -xJ -C /usr/local --strip-components=1

# Same user name and id as on a Steam Deck. umu-launcher refuses to run as root.
RUN useradd -m -u 1000 -s /bin/bash deck \
	&& echo 'deck ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/deck
USER deck
WORKDIR /home/deck

# Keep in step with the "@hutch cli=" pragma at the top of hutch.config.ts.
ARG HUTCH_VERSION=0.30.0
RUN curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh -s -- --version "$HUTCH_VERSION" --no-modify-path
ENV PATH=/home/deck/.hutch/bin:/home/deck/.local/bin:$PATH \
	DISPLAY=:0 \
	DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/dbus-session

COPY --chown=deck:deck session.sh /home/deck/session.sh
CMD ["/home/deck/session.sh"]
