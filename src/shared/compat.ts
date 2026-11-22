import type { GameType, Platform } from "./model";

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
