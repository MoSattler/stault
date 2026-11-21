#!/bin/sh
# The container's desktop session: a virtual screen, a window manager, a
# keyring, and VNC on port 5900 so the screen can be watched from the host.
set -eu

Xvfb :0 -screen 0 1440x900x24 -nolisten tcp &
until xdpyinfo >/dev/null 2>&1; do sleep 0.2; done

# One D-Bus session for everything started later with `docker exec`.
dbus-daemon --session --address=unix:path=/tmp/dbus-session --fork
export DBUS_SESSION_BUS_ADDRESS=unix:path=/tmp/dbus-session

# An unlocked keyring, as after a desktop login. An empty password creates none.
printf 'desktop' | gnome-keyring-daemon --unlock --components=secrets >/dev/null

openbox &
x11vnc -display :0 -forever -shared -nopw -quiet -bg >/dev/null 2>&1

exec sleep infinity
