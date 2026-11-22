#!/bin/sh
# Drives the Windows test VM ("Stault Windows" in UTM, made by ./dev/windows/up.sh).
#
#   vm.sh shot                 save a screenshot and print its path
#   vm.sh click X Y [right]    click at a position in that screenshot
#   vm.sh key "<text>" [mods]  type text; mods as in AppleScript, e.g. "control"
#   vm.sh scan "<codes>"       press keys by scan code, e.g. "28, 156" for Enter
#   vm.sh sys '<cmd lines>'    run a batch script as SYSTEM and print its output
#   vm.sh user '<cmd lines>'   run a batch script on the signed-in user's desktop
#   vm.sh ulog                 print the output of the last "user" script
#   vm.sh screen [W H]         set the screen size (default 1440x900) and recalibrate clicks
set -eu
VM="Stault Windows"
HERE=$(cd "$(dirname "$0")" && pwd)
STATE="${TMPDIR:-/tmp}/stault-windows"
mkdir -p "$STATE"
utm() { osascript -e "tell application \"UTM\" to $1"; }
push() { utmctl file push "$VM" "$1"; }
guest() { utmctl exec "$VM" --cmd cmd.exe /c "$1"; }

case "$1" in
shot)
	utm "capture screen (virtual machine named \"$VM\") to (POSIX file \"$STATE/screen.png\")"
	echo "$STATE/screen.png" ;;
click)
	# UTM scales positions against a screen size of its own, so "screen" measures the factor.
	[ -f "$STATE/scale" ] || "$0" screen >/dev/null
	read -r FX FY < "$STATE/scale"
	X=$(echo "$2 * 1000 / $FX" | bc); Y=$(echo "$3 * 1000 / $FY" | bc)
	utm "input mouse click (virtual machine named \"$VM\") at {$X, $Y}${4:+ with mouse button $4}" ;;
key)
	MODS=""; [ -z "${3:-}" ] || MODS=" with modifiers {$3}"
	utm "input keystroke (virtual machine named \"$VM\") text \"$2\"$MODS" ;;
scan) utm "input scan code (virtual machine named \"$VM\") codes {$2}" ;;
sys)
	guest 'mkdir C:\t 2>nul & icacls C:\t /grant *S-1-5-32-545:(OI)(CI)F /Q >nul' >/dev/null
	printf '@echo off\r\n%s\r\n' "$2" | push 'C:\t\sys.cmd'
	guest 'C:\t\sys.cmd' ;;
user)
	# Only a scheduled task reaches the desktop session; each run gets its own, so a
	# program that keeps running does not hold up the next one.
	N="u$(date +%s)"; echo "$N" > "$STATE/last"
	printf '@echo off\r\n%s\r\n' "$2" | push "C:\\t\\$N.cmd"
	printf '@echo off\r\ncall C:\\t\\%s.cmd > C:\\t\\%s.log 2>&1\r\n' "$N" "$N" | push "C:\\t\\run$N.cmd"
	"$0" sys "schtasks /create /f /tn $N /tr C:\\t\\run$N.cmd /sc once /st 00:00 /ru stault /it >nul 2>&1
schtasks /run /tn $N >nul" ;;
ulog) guest "type C:\\t\\$(cat "$STATE/last").log" ;;
screen)
	W=${2:-1440}; H=${3:-900}
	push 'C:\t\screen.ps1' < "$HERE/screen.ps1"
	"$0" user "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\t\\screen.ps1 $W $H"
	sleep 6
	# Click at a known spot, then ask Windows where the pointer went.
	utm "input mouse click (virtual machine named \"$VM\") at {400, 300}"
	"$0" user 'powershell -NoProfile -ExecutionPolicy Bypass -File C:\t\screen.ps1'
	sleep 6
	"$0" ulog | tr -d '\r' | awk '/^pointer/ { printf "%d %d\n", $2 * 1000 / 400, $3 * 1000 / 300 }' > "$STATE/scale"
	[ -s "$STATE/scale" ] || { rm -f "$STATE/scale"; echo "Could not calibrate clicks." >&2; exit 1; }
	echo "Screen ${W}x${H}; click scale $(cat "$STATE/scale") per thousand." ;;
*) sed -n '2,12p' "$0"; exit 1 ;;
esac
