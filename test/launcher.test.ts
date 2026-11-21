import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	launchCommand,
	pickInstaller,
	setupCommand,
	splitArgs,
	targetFor,
} from "../src/bun/launcher/command";
import { findExecutables, obviousChoice } from "../src/bun/launcher/detect";

const root = mkdtempSync(join(tmpdir(), "stault-launcher-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function tree(name: string, files: Record<string, string | Buffer>) {
	const dir = join(root, name);
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(join(dir, path, ".."), { recursive: true });
		writeFileSync(join(dir, path), content);
	}
	return dir;
}

describe("finding the program that starts a game", () => {
	test("Windows: skips installers, crash handlers and the server's ignore list", async () => {
		const dir = tree("win", {
			"Game.exe": "x".repeat(900),
			"UnityCrashHandler64.exe": "x",
			"unins000.exe": "x",
			"redist/vc_redist.x64.exe": "x",
			"tools/Editor.exe": "x".repeat(50),
			"bssndrpt.exe": "x",
		});
		const found = await findExecutables(dir, "windows-exe", ["bssndrpt"]);
		expect(found).toEqual(["Game.exe", join("tools", "Editor.exe")]);
		expect(obviousChoice(found)).toBe("Game.exe");
	});

	test("two programs at the top level leave the choice to the user", async () => {
		const dir = tree("two", { "Game.exe": "xx", "Launcher.exe": "x" });
		const found = await findExecutables(dir, "windows-exe");
		expect(found).toHaveLength(2);
		expect(obviousChoice(found)).toBeNull();
	});

	test("macOS: an app bundle is the program, and is not searched", async () => {
		const dir = tree("mac", {
			"Harbor.app/Contents/MacOS/harbor": "#!/bin/sh\n",
			"Harbor.app/Contents/Resources/Helper.app/Contents/MacOS/helper": "#!/bin/sh\n",
			"readme.txt": "hi",
		});
		expect(await findExecutables(dir, "mac-app")).toEqual(["Harbor.app"]);
	});

	test("Linux: shell scripts, AppImages and ELF binaries", async () => {
		const dir = tree("linux", {
			"start.sh": "#!/bin/sh\n",
			"bin/game": Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0]),
			"bin/notes": "plain text",
			"data/level.dat": "x",
		});
		chmodSync(join(dir, "bin/game"), 0o755);
		chmodSync(join(dir, "bin/notes"), 0o755);
		expect(await findExecutables(dir, "linux-native")).toEqual(["start.sh", join("bin", "game")]);
	});

	test("an empty folder has no candidates", async () => {
		const dir = tree("empty", { "data.bin": "x" });
		expect(obviousChoice(await findExecutables(dir, "windows-exe"))).toBeNull();
	});
});

describe("launch commands", () => {
	test("each OS only starts the builds it can run", () => {
		expect(targetFor("windows", "WINDOWS_PORTABLE")).toBe("windows-exe");
		expect(targetFor("windows", "LINUX_PORTABLE")).toBeNull();
		expect(targetFor("linux", "WINDOWS_SETUP")).toBe("windows-exe");
		expect(targetFor("linux", "LINUX_PORTABLE")).toBe("linux-native");
		expect(targetFor("macos", "UNDETECTABLE")).toBe("mac-app");
		expect(targetFor("macos", "WINDOWS_PORTABLE")).toBeNull();
	});

	test("launch parameters split on spaces but keep quoted parts whole", () => {
		expect(splitArgs('--windowed -name "My Save" \'a b\'')).toEqual(["--windowed", "-name", "My Save", "a b"]);
		expect(splitArgs('/DIR="C:\\My Games" ""')).toEqual(["/DIR=C:\\My Games", ""]);
		expect(splitArgs(null)).toEqual([]);
	});

	test("Windows runs the program directly", () => {
		expect(launchCommand("windows", "D:\\Games\\X\\Game.exe", ["-w"]).argv).toEqual(["D:\\Games\\X\\Game.exe", "-w"]);
	});

	test("Linux runs Windows programs through umu with a per-game prefix", () => {
		const command = launchCommand("linux", "/games/X/Game.exe", ["-w"], {
			umuRun: "/usr/bin/umu-run",
			prefix: "/data/prefixes/3",
			gameId: "umu-1234",
			store: "gog",
		});
		expect(command.argv).toEqual(["/usr/bin/umu-run", "/games/X/Game.exe", "-w"]);
		expect(command.cwd).toBe("/games/X");
		expect(command.env).toEqual({ WINEPREFIX: "/data/prefixes/3", GAMEID: "umu-1234", PROTONPATH: "GE-Proton", STORE: "gog" });
	});

	test("Linux without umu explains what is missing", () => {
		expect(() => launchCommand("linux", "/games/X/Game.exe", [])).toThrow("umu-launcher");
	});

	test("Linux runs its own builds natively", () => {
		expect(launchCommand("linux", "/games/X/start.sh", []).argv).toEqual(["/bin/sh", "/games/X/start.sh"]);
		expect(launchCommand("linux", "/games/X/game.x86_64", []).argv).toEqual(["/games/X/game.x86_64"]);
	});

	test.skipIf(process.platform !== "darwin")("macOS starts the program inside the app bundle", () => {
		const dir = tree("bundle", {
			"Harbor.app/Contents/Info.plist":
				'<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>harbor</string></dict></plist>',
			"Harbor.app/Contents/MacOS/harbor": "#!/bin/sh\n",
			"Harbor.app/Contents/MacOS/other": "x",
		});
		const app = join(dir, "Harbor.app");
		expect(launchCommand("macos", app, []).argv).toEqual([join(app, "Contents", "MacOS", "harbor")]);
	});
});

describe("setup builds", () => {
	test("picks the installer closest to the top, never a redistributable", () => {
		expect(pickInstaller(["redist/vc_redist.msi", "sub/setup.exe", "setup_game.exe", "data.bin", "Game.exe"])).toBe("setup_game.exe");
		expect(pickInstaller(["Game.exe"])).toBeNull();
		expect(pickInstaller(["installer.msi"])).toBe("installer.msi");
	});

	test("fills the install folder into the server's installer parameters", () => {
		const command = setupCommand("windows", "C:\\t\\setup.exe", '/SILENT /DIR="%INSTALLDIR%"', "D:\\Games\\X\\files");
		expect(command.argv).toEqual(["C:\\t\\setup.exe", "/SILENT", "/DIR=D:\\Games\\X\\files"]);
	});

	test("on Linux the installer runs through umu and sees a Windows path", () => {
		const command = setupCommand("linux", "/t/setup.exe", "/DIR=%INSTALLDIR%", "/games/X/files", { umuRun: "umu-run", prefix: "/p/3" });
		expect(command.argv).toEqual(["umu-run", "/t/setup.exe", "/DIR=Z:\\games\\X\\files"]);
		expect(command.env?.WINEPREFIX).toBe("/p/3");
	});
});
