import type { GameType, GameVersion, Platform } from "./model";

export type BuildOs = "windows" | "linux" | "macos" | "unknown";
export type KnownOs = Exclude<BuildOs, "unknown">;

/**
 * Which OS a build is for. The server only knows Windows and Linux builds;
 * anything else is "undetectable". For those, a version label that names
 * macOS ("v1.6 · macOS Intel") is taken at its word.
 */
export function buildOs(type: GameType, versionLabel?: string | null): BuildOs {
	if (type.startsWith("WINDOWS")) return "windows";
	if (type.startsWith("LINUX")) return "linux";
	return /\b(mac\s?os|os\s?x|mac)\b/i.test(versionLabel ?? "") ? "macos" : "unknown";
}

/**
 * Whether a build can run on this OS. "maybe" means nothing says what the
 * archive holds, so we only know after extracting it.
 */
export function canRun(
	platform: Platform,
	type: GameType,
	versionLabel?: string | null,
): "yes" | "maybe" | "no" {
	const os = buildOs(type, versionLabel);
	if (os === "unknown") return "maybe";
	if (os === "macos") return platform === "macos" ? "yes" : "no";
	if (platform === "windows") return os === "windows" ? "yes" : "no";
	// Linux runs its own builds natively and Windows builds through Proton.
	if (platform === "linux") return "yes";
	// macOS: Windows builds would need Wine, which Stault does not drive yet.
	return "no";
}

/**
 * When none of a game's builds can run on this OS, the systems they are for;
 * otherwise null. Only the full list of builds can tell: a game summary has it
 * once the library fetched it, and until then a default that can't run here
 * proves nothing.
 */
export function cantRunHere(
	platform: Platform,
	versions: Pick<GameVersion, "type" | "version">[] | undefined,
): KnownOs[] | null {
	if (!versions || versions.some((v) => canRun(platform, v.type, v.version) !== "no")) return null;
	// A build for an unknown system counts as runnable, so every one here is known.
	return [...new Set(versions.map((v) => buildOs(v.type, v.version)))].filter((os) => os !== "unknown");
}

/** The builds this OS can run, then the rest, each group in the order given. */
export function runnableFirst<T extends Pick<GameVersion, "type" | "version">>(
	platform: Platform,
	versions: T[],
): T[] {
	const runs = (v: T) => canRun(platform, v.type, v.version) !== "no";
	return [...versions.filter(runs), ...versions.filter((v) => !runs(v))];
}

export const OS_NAME: Record<BuildOs, string> = {
	windows: "Windows",
	linux: "Linux",
	macos: "macOS",
	unknown: "Unknown",
};

/** "Windows · setup", "macOS · app", "Unknown · undetected". */
export function typeLabel(
	type: GameType,
	versionLabel?: string | null,
): { os: string; kind: string } {
	const os = OS_NAME[buildOs(type, versionLabel)];
	if (type === "UNDETECTABLE") return { os, kind: os === "macOS" ? "app" : "undetected" };
	return { os, kind: type.split("_")[1].toLowerCase() };
}

export const PLATFORM_NAME: Record<Platform, string> = {
	macos: "macOS",
	windows: "Windows",
	linux: "Linux",
};
