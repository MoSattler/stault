#!/bin/sh
# Builds a few tiny sample games, starts the local GameVault server and
# registers a test user. Safe to run again.
set -eu
cd "$(dirname "$0")"

SERVER=http://127.0.0.1:18080
# Test-only account on the local server. Not a real credential.
DEV_USER=stault
DEV_PASSWORD=stault-dev-only

FILES=.data/files
WORK=.data/work
rm -rf "$WORK"
mkdir -p "$FILES" "$WORK" .data/media .data/db .data/savefiles

# pack <archive name> <folder>: zip the folder's contents without compression.
pack() {
	rm -f "$FILES/$1"
	(cd "$2" && zip -q -0 -r "../../files/$1" .)
}

# A real, launchable Mac app: shows a dialog and stays open until dismissed.
# Each run adds a line to save.txt beside the app, so save sync has something to move.
APP="$WORK/mac/Stault Sample.app/Contents"
mkdir -p "$APP/MacOS"
cat > "$APP/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>sample</string>
<key>CFBundleIdentifier</key><string>dev.stault.sample</string>
<key>CFBundleName</key><string>Stault Sample</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
PLIST
cat > "$APP/MacOS/sample" <<'SH'
#!/bin/sh
date >> "$(dirname "$0")/../../../save.txt"
osascript -e 'display dialog "Stault Sample is running. Quit to end the session." buttons {"Quit"} default button 1 with title "Stault Sample"' >/dev/null 2>&1
SH
chmod +x "$APP/MacOS/sample"

# The same app with 200 MB of ballast: a download long enough to pause and resume.
# (Copied before Harbor Lights gets its save description, so this one has no synced saves.)
BIG="Deep Current (v0.9.0) (2022).zip"
if [ ! -f "$FILES/$BIG" ]; then
	mkdir -p "$WORK/mac-big"
	cp -R "$WORK/mac/Stault Sample.app" "$WORK/mac-big/Deep Current.app"
	head -c 209715200 /dev/urandom > "$WORK/mac-big/assets.bin"
	pack "$BIG" "$WORK/mac-big"
fi

# Ludusavi has never heard of Harbor Lights, so the game says itself where its save is.
cat > "$WORK/mac/.ludusavi.yaml" <<'YAML'
Harbor Lights:
  files:
    <base>/save.txt: {}
YAML
pack "Harbor Lights (v1.0.0) (2024).zip" "$WORK/mac"


# Real Windows programs where a compiler is at hand: mingw on this machine, or
# the one in the Linux test image (dev/linux/up.sh). Otherwise placeholders that can't run.
if command -v x86_64-w64-mingw32-gcc >/dev/null 2>&1; then
	mingw() { x86_64-w64-mingw32-gcc "$@"; }
elif docker image inspect stault-linux >/dev/null 2>&1; then
	mingw() { docker run --rm --platform linux/amd64 -v "$PWD:/seed" -w /seed stault-linux x86_64-w64-mingw32-gcc "$@"; }
else
	mingw() { return 1; }
fi
# winexe <game|setup> <output>
winexe() {
	mingw -O1 -mwindows -o "$2" "samples/$1.c" 2>/dev/null || echo "not a real program" > "$2"
}

mkdir -p "$WORK/portable/Pixel_Data" "$WORK/portable-old" "$WORK/setup" "$WORK/linux" "$WORK/big"
winexe game "$WORK/portable/Pixel.exe"
echo "data" > "$WORK/portable/Pixel_Data/level0"
cat > "$WORK/portable/.ludusavi.yaml" <<'YAML'
Pixel Drift:
  files:
    <base>/save.txt: {}
YAML
winexe game "$WORK/portable-old/Pixel.exe"
# The installer copies game.exe to wherever it is told to install.
winexe setup "$WORK/setup/setup.exe"
winexe game "$WORK/setup/game.exe"
printf '#!/bin/sh\necho "Tin Kettle running"; sleep 600\n' > "$WORK/linux/start.sh"
chmod +x "$WORK/linux/start.sh"
echo "not a real program" > "$WORK/big/Longhaul.exe"
[ -f "$FILES/Longhaul (v3.1.4) (W_P) (2020).zip" ] || head -c 209715200 /dev/urandom > "$WORK/big/assets.bin"

pack "Pixel Drift (v1.2.0) (W_P) (2023).zip" "$WORK/portable"
pack "Pixel Drift (v1.1.0) (W_P) (2023).zip" "$WORK/portable-old"
pack "Setup Quest (v2.0.1) (W_S) (2021).zip" "$WORK/setup"
pack "Tin Kettle (v1.1.0) (L_P) (2022).zip" "$WORK/linux"
[ -f "$FILES/Longhaul (v3.1.4) (W_P) (2020).zip" ] || pack "Longhaul (v3.1.4) (W_P) (2020).zip" "$WORK/big"
rm -rf "$WORK"

docker compose up -d

printf "Waiting for the server"
until curl -fs "$SERVER/api/status" >/dev/null 2>&1; do printf "."; sleep 1; done
echo " up."

# The first registered user becomes the admin. A second run gets a harmless conflict.
curl -s -o /dev/null -X POST "$SERVER/api/auth/basic/register" \
	-H "Content-Type: application/json" \
	-d "{\"username\":\"$DEV_USER\",\"password\":\"$DEV_PASSWORD\"}" || true

# Have the server pick up new files now instead of at its next scheduled scan.
TOKEN=$(curl -s -u "$DEV_USER:$DEV_PASSWORD" "$SERVER/api/auth/basic/login" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
curl -s -o /dev/null -X PUT -H "Authorization: Bearer $TOKEN" "$SERVER/api/games/reindex" || true

echo "Server:   $SERVER"
echo "Username: $DEV_USER"
echo "Password: see DEV_PASSWORD in dev/seed.sh"
