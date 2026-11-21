import { readdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import type { GameType, Platform } from "../../shared/model";
import type { Target } from "./detect";

/** A program to start: what to run, where, and with which environment. */
export interface Command {
	argv: string[];
	cwd: string;
	env?: Record<string, string>;
}

export interface UmuOptions {
	/** Path of umu-run. */
	umuRun: string;
	/** Wine prefix for this game. */
	prefix: string;
	gameId?: string | null;
	store?: string | null;
	protonPath?: string | null;
}

/** Which kind of program a build of this type starts with on this OS, or null if it can't run. */
export function targetFor(platform: Platform, type: GameType): Target | null {
	if (platform === "macos") return type === "UNDETECTABLE" ? "mac-app" : null;
	if (platform === "windows") return type.startsWith("LINUX") ? null : "windows-exe";
	return type.startsWith("LINUX") ? "linux-native" : "windows-exe";
}

/** Splits `--windowed /DIR="C:\\My Games"` into arguments; quotes group, and are dropped. */
export function splitArgs(text: string | null | undefined): string[] {
	const args: string[] = [];
	let current = "";
	let quote = "";
	let open = false;
	for (const char of text ?? "") {
		if (quote) {
			if (char === quote) quote = "";
			else current += char;
		} else if (char === '"' || char === "'") {
			quote = char;
			open = true;
		} else if (/\s/.test(char)) {
			if (open) args.push(current);
			current = "";
			open = false;
		} else {
			current += char;
			open = true;
		}
	}
	if (open) args.push(current);
	return args;
}

function umuEnv(umu: UmuOptions): Record<string, string> {
	const env: Record<string, string> = {
		WINEPREFIX: umu.prefix,
		// umu applies per-game fixes by id; "umu-default" means none.
		GAMEID: umu.gameId || "umu-default",
		// A named build that umu downloads and keeps current when none is installed.
		PROTONPATH: umu.protonPath || "GE-Proton",
	};
	if (umu.store) env.STORE = umu.store;
	return env;
}

/** The executable inside a macOS .app bundle. */
export function macAppBinary(app: string): string {
	const dir = join(app, "Contents", "MacOS");
	const info = Bun.spawnSync(
		["plutil", "-extract", "CFBundleExecutable", "raw", "-o", "-", join(app, "Contents", "Info.plist")],
		{ stderr: "ignore" },
	);
	const name = info.success ? info.stdout.toString().trim() : "";
	if (name) return join(dir, name);
	const [only, ...rest] = readdirSync(dir);
	if (!only || rest.length) throw new Error("This app bundle has no clear program to start.");
	return join(dir, only);
}

/** How to start `executable` (absolute path) on this OS. */
export function launchCommand(
	platform: Platform,
	executable: string,
	args: string[],
	umu?: UmuOptions,
): Command {
	const ext = extname(executable).toLowerCase();
	if (platform === "macos" && ext === ".app") {
		return { argv: [macAppBinary(executable), ...args], cwd: dirname(executable) };
	}
	const cwd = dirname(executable);
	if (platform === "linux" && ext === ".exe") {
		if (!umu) throw new Error("umu-launcher is needed to run Windows games.");
		return { argv: [umu.umuRun, executable, ...args], cwd, env: umuEnv(umu) };
	}
	if (platform === "linux" && ext === ".sh") {
		return { argv: ["/bin/sh", executable, ...args], cwd };
	}
	return { argv: [executable, ...args], cwd };
}

/** Wine sees the Linux filesystem as drive Z:. */
const winePath = (path: string) => `Z:${path.replaceAll("/", "\\")}`;

/** How to run a setup build's installer so that it installs into `installTo`. */
export function setupCommand(
	platform: Platform,
	installer: string,
	parameters: string | null | undefined,
	installTo: string,
	umu?: UmuOptions,
): Command {
	const target = platform === "linux" ? winePath(installTo) : installTo;
	const args = splitArgs(parameters).map((a) => a.replaceAll("%INSTALLDIR%", target));
	const cwd = dirname(installer);
	const isMsi = extname(installer).toLowerCase() === ".msi";
	const program = isMsi ? ["msiexec", "/i", platform === "linux" ? winePath(installer) : installer] : [installer];
	if (platform === "linux") {
		if (!umu) throw new Error("umu-launcher is needed to run Windows installers.");
		return { argv: [umu.umuRun, ...program, ...args], cwd, env: umuEnv(umu) };
	}
	return { argv: [...program, ...args], cwd };
}

const INSTALLER = /^(setup|install|autorun)[^/\\]*\.exe$|\.msi$/i;

/** Picks the installer among a setup build's extracted files (paths relative to its root). */
export function pickInstaller(files: string[]): string | null {
	const top = files
		.filter((f) => INSTALLER.test(f.split(/[\\/]/).at(-1)!) && !/redist/i.test(f))
		.sort((a, b) => a.split(/[\\/]/).length - b.split(/[\\/]/).length || a.localeCompare(b));
	return top[0] ?? null;
}
