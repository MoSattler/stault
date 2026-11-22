#!/bin/sh
# Runs this checkout's code in the Windows test VM (start that first; see
# ./dev/windows/up.sh). Inside the VM the test server from ./dev/seed.sh is
# http://10.0.2.2:18080.
#
# Hutch builds only for the OS it runs on. The app's JavaScript is the same on
# every OS, so it is built here and put into the latest released Windows app.
set -eu
cd "$(dirname "$0")/../.."
VM=./dev/windows/vm.sh
APP='C:\Users\stault\AppData\Local\com.mosattler.stault\stable\app'
ZIP="${TMPDIR:-/tmp}/stault-windows/app.zip"

hutch electrobun prepare
hutch pm exec -- vite build
hutch electrobun build --env=dev
BUILT=$(echo build/dev-*/*.app/Contents/Resources/app)
mkdir -p "$(dirname "$ZIP")"
rm -f "$ZIP"
(cd "$BUILT" && zip -q -r "$ZIP" bun views)

if ! $VM sys "if exist $APP\\bin\\launcher.exe echo installed" | grep -q installed; then
	$VM sys 'cd /d C:\t
curl.exe -sL -o setup.zip https://github.com/MoSattler/stault/releases/latest/download/win-x64-Stault-Setup.zip
tar -xf setup.zip' >/dev/null
	$VM user 'C:\t\Stault-Setup.exe'
	until $VM sys "if exist $APP\\..\\uninstall.exe echo installed" | grep -q installed; do sleep 3; done
	# The installer waits on its last page and starts the app when that is closed.
	sleep 5
	$VM sys 'taskkill /f /im Stault-Setup.exe' >/dev/null
fi

utmctl file push "Stault Windows" 'C:\t\app.zip' < "$ZIP"
$VM sys "taskkill /f /im launcher.exe >nul 2>&1
taskkill /f /im bun.exe >nul 2>&1
ping -n 3 127.0.0.1 >nul
cd /d $APP\\Resources\\app
rmdir /s /q bun views
tar -xf C:\\t\\app.zip" >/dev/null
$VM user "cd /d $APP\\bin
launcher.exe"
echo "Stault is starting in the Windows VM. Look with: ./dev/windows/vm.sh shot"
