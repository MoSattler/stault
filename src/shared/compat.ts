import type { GameType, Platform } from "./model";

/**
 * Whether a build of this type can run on this OS.
 * "maybe" means the server could not tell what the archive holds, so we only
 * know after extracting it (this is how Mac builds show up).
 */
export function canRun(platform: Platform, type: GameType): "yes" | "maybe" | "no" {
	if (type === "UNDETECTABLE") return "maybe";
	const windowsBuild = type.startsWith("WINDOWS");
	if (platform === "windows") return windowsBuild ? "yes" : "no";
	// Linux runs its own builds natively and Windows builds through Proton.
	if (platform === "linux") return "yes";
	// macOS: Windows builds would need Wine, which Stault does not drive yet.
	return "no";
}

export function typeLabel(type: GameType): { os: string; kind: string } {
	switch (type) {
		case "WINDOWS_SETUP":
			return { os: "Windows", kind: "setup" };
		case "WINDOWS_PORTABLE":
			return { os: "Windows", kind: "portable" };
		case "WINDOWS_SOFTWARE":
			return { os: "Windows", kind: "software" };
		case "LINUX_PORTABLE":
			return { os: "Linux", kind: "portable" };
		case "LINUX_SOFTWARE":
			return { os: "Linux", kind: "software" };
		case "UNDETECTABLE":
			return { os: "Unknown", kind: "undetected" };
	}
}

export const PLATFORM_NAME: Record<Platform, string> = {
	macos: "macOS",
	windows: "Windows",
	linux: "Linux",
};
