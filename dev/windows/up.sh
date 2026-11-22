#!/bin/sh
# Creates the Windows test VM "Stault Windows" in UTM and installs Windows 11
# in it without questions (about 10 minutes). For an Apple Silicon Mac: the VM
# runs Windows 11 for Arm, which runs Stault's x64 build through emulation.
#
#   ./dev/windows/up.sh <Windows 11 Arm64 ISO>
#
# Needs UTM (brew install --cask utm) and the ISO from
# https://www.microsoft.com/software-download/windows11arm64 (8.5 GB; the VM
# then takes about 16 GB). The answer file accepts Microsoft's licence terms.
# Afterwards: ./dev/windows/run.sh, and ./dev/windows/vm.sh to look and click.
set -eu
ISO=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=$(dirname "$ISO")/stault-unattend

# UTM's guest tools: drivers, and the agent that vm.sh runs commands through.
# UTM fetches them into a VM's empty CD drive, so a throwaway VM asks for them.
TOOLS=$(osascript <<'APPLESCRIPT'
with timeout of 900 seconds
	tell application "UTM"
		set probe to make new virtual machine with properties {backend:qemu, configuration:{name:"Stault guest tools", architecture:"aarch64", drives:{{removable:true, interface:USB}}}}
		install guest tools probe
		set config to configuration of probe
		set tools to POSIX path of (source of item 1 of drives of config)
		delete probe
		return tools
	end tell
end timeout
APPLESCRIPT
)

# A second CD for Windows Setup: the answer file and the guest tools' installer.
# The guest tools CD itself can't be used: it carries an answer file of its own.
rm -rf "$WORK" "$WORK.iso"
mkdir -p "$WORK"
cp "$HERE/autounattend.xml" "$WORK/"
MOUNT=$(hdiutil attach -nobrowse -readonly "$TOOLS" | tail -1 | awk -F'\t' '{print $NF}')
cp "$MOUNT/utm-guest-tools.exe" "$WORK/"
hdiutil detach -quiet "$MOUNT"
hdiutil makehybrid -quiet -iso -joliet -default-volume-name UNATTEND -o "$WORK.iso" "$WORK"
rm -rf "$WORK"

# Emulated networking: the VM reaches this Mac's localhost as 10.0.2.2.
osascript - "$ISO" "$WORK.iso" <<'APPLESCRIPT'
on run argv
	tell application "UTM"
		set vm to make new virtual machine with properties {backend:qemu, configuration:{name:"Stault Windows", architecture:"aarch64", memory:6144, cpu cores:4, tpm:true, uefi:true, drives:{{removable:true, interface:USB, source:POSIX file (item 1 of argv)}, {removable:true, interface:USB, source:POSIX file (item 2 of argv)}, {guest size:40960, interface:NVMe}}, displays:{{hardware:"virtio-ramfb", dynamic resolution:false, native resolution:false}}, network interfaces:{{mode:emulated}}}}
		start vm
	end tell
end run
APPLESCRIPT

# "Press any key to boot from CD": only now. Setup's first page has Cancel in
# focus, and later restarts must boot from the disk.
for _ in 1 2 3 4 5; do
	sleep 1
	"$HERE/vm.sh" scan "57, 185"
done

printf "Installing Windows"
until utmctl exec "Stault Windows" --cmd cmd.exe /c ver >/dev/null 2>&1; do printf "."; sleep 15; done
echo " done."
"$HERE/vm.sh" screen
